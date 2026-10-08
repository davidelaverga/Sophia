# syntax=docker/dockerfile:1.7
# Experimental, fixture-only Render worker. Not a production renderer.
# Build from repository root; ordinary Chromium confinement files are unchanged.
ARG NODE_IMAGE=node:24.21.0-bookworm-slim@sha256:0e0ff40c39bc087845bfb27465a0df4ea419520094bc35842ff83dd8cbe6f9b6
FROM ${NODE_IMAGE} AS deploy
WORKDIR /src
COPY . .
RUN corepack enable pnpm && pnpm --filter @sophia/renderer-pdf deploy --prod /out

FROM --platform=$BUILDPLATFORM ${NODE_IMAGE} AS kernel
RUN apt-get update && apt-get install -y --no-install-recommends build-essential gcc-x86-64-linux-gnu libc6-dev-amd64-cross patch xz-utils flex bison libssl-dev libelf-dev bc curl ca-certificates python3
WORKDIR /build
RUN curl --fail --location --output linux.tar.xz https://cdn.kernel.org/pub/linux/kernel/v6.x/linux-6.12.101.tar.xz \
 && echo '0d21cd11933f49f7151b7c9dbb8cc3fddc8c8abe506434b850feecf41fc28a76  linux.tar.xz' | sha256sum --check - \
 && tar -xf linux.tar.xz
COPY renderers/web/pdf/uml/kernel.config /build/linux-6.12.101/.config
COPY renderers/web/pdf/uml/kernel-abi.patch /build/kernel-abi.patch
COPY renderers/web/pdf/uml/seccomp-abi-probe.c /build/seccomp-abi-probe.c
RUN x86_64-linux-gnu-gcc -static -O2 /build/seccomp-abi-probe.c -o /build/abi-probe
WORKDIR /build/linux-6.12.101
RUN patch --fuzz=0 -p1 < /build/kernel-abi.patch \
 && scripts/config --disable DEBUG_INFO --disable DEBUG_INFO_DWARF_TOOLCHAIN_DEFAULT --enable DEBUG_INFO_NONE --disable DEBUG_INFO_BTF --disable MODULES --disable MODULE_SIG --set-str SYSTEM_TRUSTED_KEYS '' --set-str SYSTEM_REVOCATION_KEYS '' \
 && make ARCH=um SUBARCH=x86_64 CROSS_COMPILE=x86_64-linux-gnu- olddefconfig \
 && make ARCH=um SUBARCH=x86_64 CROSS_COMPILE=x86_64-linux-gnu- -j2 linux

FROM ${NODE_IMAGE} AS guest
COPY --from=deploy /out /opt/sophia-renderer
ENV PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates fonts-noto-core fonts-dejavu-core e2fsprogs busybox-static python3 \
 && node /opt/sophia-renderer/node_modules/playwright-core/cli.js install --with-deps chromium-headless-shell \
 && chmod -R a+rX,go-w /opt/pw-browsers
COPY renderers/web/pdf/uml /opt/uml
COPY --from=kernel /build/abi-probe /opt/uml/abi-probe
RUN sh /opt/uml/make-guest.sh && python3 /opt/uml/make-initrd.py /opt/uml /opt/uml/initrd.gz

FROM ${NODE_IMAGE}
RUN apt-get update && apt-get install -y --no-install-recommends python3 \
 && rm -rf /var/lib/apt/lists/* \
 && groupadd --gid 10001 render \
 && useradd --uid 10001 --gid 10001 --no-create-home --home-dir /nonexistent --shell /usr/sbin/nologin render \
 && mkdir -p /work && chmod 0755 /work
COPY --from=guest /opt/uml /opt/uml
COPY --from=kernel /build/linux-6.12.101/linux /opt/uml/linux.uml
RUN chmod 0555 /opt/uml/linux.uml /opt/uml/abi-probe && chmod 0444 /opt/uml/guest.raw /opt/uml/initrd.gz
USER root
# Start idle. A Render/container restart never starts another fixture batch.
# The operator invokes host-qa.py once through the approved Shell session.
CMD ["node", "-e", "console.log(JSON.stringify({event:'uml_worker_idle',qualification:false}));setInterval(()=>{},60000)"]
