# OpenRive — self-hosted image (Bun + Next.js + Drizzle/PostgreSQL)
#
#   docker compose up -d                     (OpenRive + PostgreSQL)
#   docker compose -f docker-compose.standalone.yml up -d   (embedded database)
#
# The image also carries the CLI and the MCP server:
#   docker compose exec openrive openrive list

FROM oven/bun:1.4.2-alpine AS deps
WORKDIR /app
# bunfig.toml matters here: it selects the hoisted linker. Without it bun links
# each package's dependencies separately, and a package can no longer see one it
# does not declare — and the symlinks it leaves behind break the copied app.
COPY package.json bun.lock bunfig.toml ./
COPY apps/web/package.json apps/web/
COPY apps/cli/package.json apps/cli/
COPY apps/desktop/package.json apps/desktop/
COPY packages/auth/package.json packages/auth/
COPY packages/config/package.json packages/config/
COPY packages/db/package.json packages/db/
COPY packages/rive/package.json packages/rive/
COPY packages/redis/package.json packages/redis/
COPY packages/storage/package.json packages/storage/
COPY packages/shared/package.json packages/shared/
COPY packages/ui/package.json packages/ui/
# ^ one line per workspace, so this layer is cached until a manifest changes:
#   a new workspace needs a line here or the install fails
# --ignore-scripts: apps/web's postinstall copies the Rive runtime and needs
# scripts/, which is not in this stage. The build stage below runs it itself.
RUN bun install --frozen-lockfile --ignore-scripts

FROM deps AS build
WORKDIR /app
COPY . .
ARG OPENRIVE_VERSION=0.0.0-dev
ENV OPENRIVE_VERSION=$OPENRIVE_VERSION
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
