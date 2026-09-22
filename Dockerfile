# Self-hosted OpenRive
#   docker compose up -d        (see docker-compose.yml)
# or
#   docker build -t openrive .
#   docker run -p 3000:3000 -v rive-data:/data openrive

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY scripts/copy-wasm.js scripts/copy-wasm.js
RUN npm ci

FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1 NEXT_OUTPUT=standalone
RUN node scripts/copy-wasm.js && npm run build

FROM node:22-alpine AS run
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000 \
    OPENRIVE_DATA_DIR=/data
# web app (standalone server)
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
# CLI + MCP tools (docker exec <container> openrive list)
COPY --from=build /app/tools ./tools
COPY --from=build /app/src/lib ./src/lib
COPY --from=build /app/bin ./bin
COPY --from=build /app/node_modules ./node_modules
RUN ln -s /app/bin/openrive.cjs /usr/local/bin/openrive && mkdir -p /data && chown -R node:node /data
USER node
VOLUME /data
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- "http://127.0.0.1:${PORT}/api/health" >/dev/null 2>&1 || exit 1
CMD ["node", "server.js"]
