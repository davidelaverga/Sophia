# syntax=docker/dockerfile:1.7
# SMC-M03 OP-C proposal: the PDF renderer host (the supervisor and the confined kernel), as one private service with
# no public port. Not deployed: Codex qualifies it with host-probe.mjs on the chosen host, with Davide's bound approval.
# Build from the repository root:
#   docker build -f renderers/web/pdf/Dockerfile -t sophia-renderer .
# The confinement needs unprivileged user namespaces and a fresh /proc. A container under Docker's default seccomp
# profile and masked /proc paths refuses both (SMC-M03.md §29), so a host must grant them or be a VM. Nothing here
# turns a sandbox off: there is no --no-sandbox path, and the kernel's self-test fails closed without one.
ARG NODE_IMAGE=node:24.21.0-bookworm-slim@sha256:0e0ff40c39bc087845bfb27465a0df4ea419520094bc35842ff83dd8cbe6f9b6

# The renderer package and its production dependencies, from the workspace lock (pnpm deploy, as the runtime
# artifact is built). Nothing else of the workspace reaches the image.
FROM ${NODE_IMAGE} AS deploy
WORKDIR /src
COPY . .
RUN --mount=type=secret,id=build_ca,required=false \
  if [ -f /run/secrets/build_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/build_ca; fi \
  && corepack enable pnpm \
  && pnpm --filter @sophia/renderer-pdf deploy --prod /out

FROM ${NODE_IMAGE}
COPY --from=deploy /out /opt/sophia-renderer
# util-linux (setpriv, unshare, prlimit) is in the base image. Fonts: Noto and DejaVu cover English, Italian and
# Spanish text (SIL OFL and the Bitstream Vera licence). Then the headless shell playwright-core 1.56.1 pins (its
# browsers.json), with its system libraries, readable by everyone and writable by no one but root. A build behind a
# TLS-intercepting proxy may name an HTTPS Debian mirror and pass the proxy's CA as the optional secret; neither stays
# in the image.
ENV PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers
ARG DEBIAN_MIRROR=
RUN --mount=type=secret,id=build_ca,required=false \
  if [ -n "$DEBIAN_MIRROR" ]; then sed -i "s#http://deb.debian.org#$DEBIAN_MIRROR#g" /etc/apt/sources.list.d/debian.sources; fi \
  && if [ -f /run/secrets/build_ca ]; then \
    echo 'Acquire::https::CAInfo "/run/secrets/build_ca";' > /etc/apt/apt.conf.d/99build-ca; \
    export NODE_EXTRA_CA_CERTS=/run/secrets/build_ca; \
  fi \
  && apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates fonts-noto-core fonts-dejavu-core \
  && node /opt/sophia-renderer/node_modules/playwright-core/cli.js install --with-deps chromium-headless-shell \
  && rm -f /etc/apt/apt.conf.d/99build-ca \
  && rm -rf /var/lib/apt/lists/* \
  && chmod -R a+rX,go-w /opt/pw-browsers
# The render user owns nothing and has no shell. The work directory is the supervisor's; each job directory in it is
# opened to the render user one job at a time (supervisor.mjs).
RUN groupadd --gid 10001 render \
  && useradd --uid 10001 --gid 10001 --no-create-home --home-dir /nonexistent --shell /usr/sbin/nologin render \
  && mkdir -p /work \
  && chmod 0755 /work
ENV NODE_ENV=production \
  SOPHIA_RENDER_UID=10001 \
  SOPHIA_RENDER_GID=10001 \
  SOPHIA_RENDER_WORK=/work
WORKDIR /opt/sophia-renderer
# The supervisor starts as root only to start each browser as the render user (confine-chromium). Its secrets come
# from the host at run time: SOPHIA_API_URL and SOPHIA_RENDER_RUNNER_TOKEN_FILE (a file only root can read).
USER root
CMD ["node", "supervisor.mjs"]
