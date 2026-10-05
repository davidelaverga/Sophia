# WBC-02: the private Paperclip service. Two steps, so that Paperclip is built by its own recipe, never a fork:
#
#   1. The pin's own build stage, from a clean checkout of paperclipai/paperclip at exactly the pin:
#        docker build --target build -t paperclip-build:5edf55d <paperclip checkout>
#      (its Dockerfile pins the rustup installer by sha256, the compiler by the runner's rust-toolchain.toml, cargo-chef
#      by version, and the dependencies by the frozen lockfile; set PAPERCLIP_BUILD_COMMIT to the pin to stamp it).
#   2. This file, whose context is the output of scripts/paperclip-build.mjs (it copies this Dockerfile, start.sh and
#      verify-manifest.mjs beside the packages and records the sha256 of each in MANIFEST.json):
#        docker build --build-arg PAPERCLIP_BUILD_IMAGE=paperclip-build:5edf55d -t sophia-paperclip:<sophia commit> \
#          <the build's --out directory>
#
# What differs from the pin's own production stage, and why: no agent CLI is installed (it installs claude-code,
# codex, gemini, kimi and opencode at @latest), because Paperclip runs no model here and the only adapter allowed to
# run is sophia_dsh; and the image carries Sophia's plugin and adapter at fixed paths, each file checked against the
# build's MANIFEST.json. The server, its loader, its entrypoint and its user are the pin's.
ARG PAPERCLIP_BUILD_IMAGE
ARG NODE_IMAGE=node:24-trixie-slim

FROM ${PAPERCLIP_BUILD_IMAGE} AS paperclip

FROM ${NODE_IMAGE} AS production
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl gosu tini \
  && rm -rf /var/lib/apt/lists/* \
  && usermod -d /paperclip node \
  && mkdir -p /paperclip \
  && chown node:node /paperclip
WORKDIR /app
COPY --chown=node:node --from=paperclip /app /app
COPY --from=paperclip /app/scripts/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh

# The verified packages, read only, at the paths the start script and the plugin install name.
COPY MANIFEST.json start.sh verify-manifest.mjs /opt/sophia/
COPY sophia-coordination-plugin /opt/sophia/sophia-coordination-plugin
COPY sophia-dsh-adapter /opt/sophia/sophia-dsh-adapter
RUN node /opt/sophia/verify-manifest.mjs /opt/sophia 5edf55d7350c7f08c9dd132c7e0f1421fa0bf2fb \
  && chmod 0755 /usr/local/bin/docker-entrypoint.sh /opt/sophia/start.sh \
  && ln -s /opt/sophia/start.sh /usr/local/bin/sophia-paperclip-start

# Authenticated, private (login always required; the host-name guard admits only the names below and loopback), the
# pin's migrations applied at start, nothing reaching the internet unless a feature asks for it, and no file backups on
# the service's disk (the managed database keeps its own). The server's heap is bounded at 1024 MB, as qualified by
# scripts/paperclip-service-probe.mjs for a 2 GB instance (the plugin worker does not inherit it: the host scrubs its
# environment; a 384 MB heap fails at start). Secrets are not
# here: DATABASE_URL, BETTER_AUTH_SECRET, PAPERCLIP_SECRETS_MASTER_KEY, PAPERCLIP_TOOL_ACTION_SIGNING_SECRET,
# PAPERCLIP_ALLOWED_HOSTNAMES, SOPHIA_COORDINATION_URL and SOPHIA_COORDINATION_TOKEN come from the service's secret
# store (deploy/paperclip/README.md).
ENV NODE_ENV=production \
  NODE_OPTIONS=--max-old-space-size=1024 \
  HOME=/paperclip \
  HOST=0.0.0.0 \
  PORT=3100 \
  SERVE_UI=true \
  PAPERCLIP_HOME=/paperclip \
  PAPERCLIP_INSTANCE_ID=default \
  PAPERCLIP_DEPLOYMENT_MODE=authenticated \
  PAPERCLIP_DEPLOYMENT_EXPOSURE=private \
  PAPERCLIP_MIGRATION_AUTO_APPLY=true \
  PAPERCLIP_DISABLE_CWD_ENV_FILE=true \
  PAPERCLIP_DISABLE_PLUGIN_AUTOBUILD=1 \
  PAPERCLIP_TELEMETRY_DISABLED=1 \
  PAPERCLIP_ANNOUNCEMENTS_ENABLED=false \
  PAPERCLIP_DB_BACKUP_ENABLED=false \
  PAPERCLIP_ADAPTERS='[{"adapterType":"sophia_dsh"}]' \
  SOPHIA_PAPERCLIP_DIR=/opt/sophia \
  PAPERCLIP_APP_DIR=/app

EXPOSE 3100
HEALTHCHECK --interval=30s --timeout=5s --start-period=120s CMD curl -fsS http://127.0.0.1:3100/api/health >/dev/null || exit 1
ENTRYPOINT ["/usr/bin/tini", "--", "docker-entrypoint.sh"]
CMD ["sophia-paperclip-start"]
