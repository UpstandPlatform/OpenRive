# OpenRive — self-hosted image (Bun + Next.js + Drizzle/PostgreSQL)
#
#   docker compose up -d                     (OpenRive + PostgreSQL)
#   docker compose -f docker-compose.standalone.yml up -d   (embedded database)
#
# The image also carries the CLI and the MCP server:
#   docker compose exec openrive openrive list

FROM oven/bun:1.4.2-alpine AS deps
WORKDIR /app
COPY package.json bun.lock ./
COPY apps/web/package.json apps/web/
COPY apps/cli/package.json apps/cli/
COPY apps/desktop/package.json apps/desktop/
COPY packages/config/package.json packages/config/
COPY packages/db/package.json packages/db/
COPY packages/rive/package.json packages/rive/
COPY packages/shared/package.json packages/shared/
COPY packages/ui/package.json packages/ui/
RUN bun install --frozen-lockfile

FROM deps AS build
WORKDIR /app
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN bun run scripts/copy-wasm.ts && bun run --cwd apps/web build

FROM oven/bun:1.4.2-alpine AS run
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000 \
    OPENRIVE_DATA_DIR=/data
# workspace sources (the server, CLI and MCP all run from TypeScript with Bun)
COPY --from=build /app /app
RUN ln -s /app/apps/cli/src/index.ts /usr/local/bin/openrive \
    && chmod +x /app/apps/cli/src/index.ts \
    && mkdir -p /data && chown -R bun:bun /data /app
USER bun
VOLUME /data
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s \
  CMD wget -qO- "http://127.0.0.1:${PORT}/api/health" >/dev/null 2>&1 || exit 1
CMD ["bun", "run", "--cwd", "apps/web", "start"]
