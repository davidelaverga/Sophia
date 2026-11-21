# syntax=docker/dockerfile:1.7
# The UML render host for Render (SDD-01) and its qualification fixture: one image, idle unless its command says
# otherwise. Build from repository root; ordinary Chromium confinement files are unchanged.
ARG NODE_IMAGE=node:24.21.0-bookworm-slim@sha256:0e0ff40c39bc087845bfb27465a0df4ea419520094bc35842ff83dd8cbe6f9b6
FROM ${NODE_IMAGE} AS deploy
WORKDIR /src
COPY . .
RUN corepack enable pnpm && pnpm --filter @sophia/renderer-pdf deploy --prod /out

FROM --platform=$BUILDPLATFORM ${NODE_IMAGE} AS kernel
# The size mode is a CI comparison control; native candidates use the default.
ARG UML_KERNEL_OPTIMIZATION=performance
RUN apt-get update && apt-get install -y --no-install-recommends build-essential gcc-x86-64-linux-gnu libc6-dev-amd64-cross patch xz-utils flex bison libssl-dev libelf-dev bc curl ca-certificates python3
WORKDIR /build
COPY renderers/web/pdf/uml/kernel.config renderers/web/pdf/uml/kernel-abi.patch renderers/web/pdf/uml/seccomp-abi-probe.c /build/
COPY renderers/web/pdf/uml/kernel-memory.patch renderers/web/pdf/uml/check-memory-backing.py renderers/web/pdf/uml/memory-backing-test.c /build/
RUN x86_64-linux-gnu-gcc -static -O2 /build/seccomp-abi-probe.c -o /build/abi-probe
RUN curl --fail --location --output linux.tar.xz https://cdn.kernel.org/pub/linux/kernel/v6.x/linux-6.18.64.tar.xz \
 && echo '020d45510c539972e6f14c5c71566878d3b7ef56fb082b3e09134f2ebaade562  linux.tar.xz' | sha256sum --check - \
 && tar -xf linux.tar.xz \
 && cd linux-6.18.64 \
 && cp /build/kernel.config .config \
 && patch --fuzz=0 -p1 < /build/kernel-abi.patch \
 && patch --fuzz=0 -p1 < /build/kernel-memory.patch \
 && python3 /build/check-memory-backing.py arch/um/os-Linux/mem.c \
 && scripts/config --disable DEBUG_INFO --disable DEBUG_INFO_DWARF_TOOLCHAIN_DEFAULT --enable DEBUG_INFO_NONE --disable DEBUG_INFO_BTF --disable MODULES --disable MODULE_SIG --set-str SYSTEM_TRUSTED_KEYS '' --set-str SYSTEM_REVOCATION_KEYS '' \
 && scripts/config --disable HOSTFS --disable MCONSOLE --disable UML_NET --disable UML_NET_VECTOR --disable VIRTIO_UML --disable PORT_CHAN --disable PTY_CHAN --disable TTY_CHAN --disable XTERM_CHAN --disable UML_WATCHDOG --disable UML_RANDOM --disable MMAPPER \
 && case "$UML_KERNEL_OPTIMIZATION" in \
      performance) scripts/config --disable CC_OPTIMIZE_FOR_SIZE --enable CC_OPTIMIZE_FOR_PERFORMANCE ;; \
      size) scripts/config --disable CC_OPTIMIZE_FOR_PERFORMANCE --enable CC_OPTIMIZE_FOR_SIZE ;; \
      *) echo 'unsupported UML kernel optimization' >&2; exit 1 ;; \
    esac \
 && make ARCH=um SUBARCH=x86_64 CROSS_COMPILE=x86_64-linux-gnu- olddefconfig \
 && if grep -E '^CONFIG_(HOSTFS|MCONSOLE|UML_NET[A-Z_]*|VIRTIO_UML|PORT_CHAN|PTY_CHAN|TTY_CHAN|XTERM_CHAN|UML_WATCHDOG|UML_RANDOM|MMAPPER|MODULES)=' .config; then echo 'the guest kernel keeps a host-facing option' >&2; exit 1; fi \
 && case "$UML_KERNEL_OPTIMIZATION" in \
      performance) grep -qx 'CONFIG_CC_OPTIMIZE_FOR_PERFORMANCE=y' .config ;; \
      size) grep -qx 'CONFIG_CC_OPTIMIZE_FOR_SIZE=y' .config ;; \
    esac \
 && printf 'UML_KERNEL_OPTIMIZATION %s\n' "$UML_KERNEL_OPTIMIZATION" \
 && sha256sum .config \
 && make ARCH=um SUBARCH=x86_64 CROSS_COMPILE=x86_64-linux-gnu- -j2 linux \
 && cp linux /build/linux.uml

# Measured fixed-name tools/configuration only; nothing is added to the guest image here.
RUN python3 - <<'PY_KERNEL_PROVENANCE'
import hashlib, json, pathlib, subprocess

def measured(args):
    try:
        result = subprocess.run(args, capture_output=True, text=True, timeout=10, check=True)
        return result.stdout.splitlines()[0][:512]
    except (OSError, subprocess.SubprocessError, IndexError):
        return None

root = pathlib.Path('/build')
config = (root/'linux-6.18.64/.config').read_bytes()
facts = {
    'declaredNodeImage': 'recipe-default node:24.21.0-bookworm-slim@sha256:0e0ff40c39bc087845bfb27465a0df4ea419520094bc35842ff83dd8cbe6f9b6',
    'declaredLinuxArchive': 'linux-6.18.64.tar.xz sha256:020d45510c539972e6f14c5c71566878d3b7ef56fb082b3e09134f2ebaade562',
    'measuredConfigSha256': hashlib.sha256(config).hexdigest(),
    'measuredSourceHashes': ';'.join(name+'='+hashlib.sha256((root/name).read_bytes()).hexdigest() for name in ['kernel.config', 'kernel-abi.patch', 'kernel-memory.patch']),
    'measuredCompiler': measured(['x86_64-linux-gnu-gcc', '--version']),
    'measuredLinker': measured(['x86_64-linux-gnu-ld', '--version']),
    'measuredOptimization': 'performance' if b'CONFIG_CC_OPTIMIZE_FOR_PERFORMANCE=y\n' in config else 'size' if b'CONFIG_CC_OPTIMIZE_FOR_SIZE=y\n' in config else None,
    'measuredPackages': measured(['dpkg-query', '-W', '-f=${Package}=${Version};', 'gcc-x86-64-linux-gnu', 'binutils-x86-64-linux-gnu', 'libc6-dev-amd64-cross']), 'measuredNode': None, 'measuredBrowser': None,
}
(root/'kernel-provenance.json').write_text(json.dumps(facts))
PY_KERNEL_PROVENANCE

FROM ${NODE_IMAGE} AS guest
COPY --from=deploy /out /opt/sophia-renderer
ENV PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates fonts-noto-core fonts-dejavu-core e2fsprogs busybox-static python3 \
 && node /opt/sophia-renderer/node_modules/playwright-core/cli.js install --with-deps chromium-headless-shell \
 && chmod -R a+rX,go-w /opt/pw-browsers
COPY renderers/web/pdf/uml /opt/uml
COPY --from=kernel /build/abi-probe /build/linux.uml /opt/uml/
RUN sh /opt/uml/make-guest.sh && python3 /opt/uml/make-initrd.py /opt/uml /opt/uml/initrd.gz \
 && chmod 0555 /opt/uml/linux.uml /opt/uml/abi-probe && chmod 0444 /opt/uml/guest.raw /opt/uml/initrd.gz

# Host-side observational facts only, after guest.raw/initrd.gz have been completed.
# No provenance file is present while either guest image is created.
FROM guest AS provenance
COPY --from=kernel /build/kernel-provenance.json /tmp/kernel-provenance.json
RUN python3 - <<'PY_PROVENANCE'
import hashlib, json, pathlib, subprocess

def measured(args):
    try:
        run = subprocess.run(args, capture_output=True, text=True, timeout=10, check=True)
        text = run.stdout.strip()
        return text if len(text) <= 2048 and all(32 <= ord(c) <= 126 or c == "\n" for c in text) else None
    except (OSError, subprocess.SubprocessError):
        return None

facts = json.loads(pathlib.Path('/tmp/kernel-provenance.json').read_text())
facts['measuredNode'] = measured(['node', '--version'])
guest_packages = measured(['dpkg-query', '-W', '-f=${Package}=${Version};', 'e2fsprogs', 'busybox-static', 'libc6', 'python3'])
facts['measuredPackages'] = 'kernel:' + facts['measuredPackages'] + ';guest:' + guest_packages if facts['measuredPackages'] is not None and guest_packages is not None else None
facts['measuredBrowser'] = measured([
    'node', '--input-type=module', '-e', '''
import { execFileSync } from 'node:child_process'
import { chromiumPath } from '/opt/sophia-renderer/confine.mjs'
process.stdout.write(execFileSync(chromiumPath(), ['--version']))
''',
])
source = ['make-guest.sh', 'make-initrd.py', 'guest-init', 'guest-job', 'namespace-launch.py', 'landlock-launch.py']
facts['measuredSourceHashes'] += ';' + ';'.join(name + '=' + hashlib.sha256((pathlib.Path('/opt/uml')/name).read_bytes()).hexdigest() for name in source)
# Facts are strings/null, with declared pins kept separate from measured build facts.
encoded = json.dumps(facts, separators=(',', ':')).encode()
if len(encoded) > 8192:
    raise RuntimeError('build provenance exceeds fixed metadata capacity')
path = pathlib.Path('/opt/uml/build-provenance.json')
path.write_bytes(encoded)
path.chmod(0o444)
PY_PROVENANCE

# The guest kernel reaches the host only through its three disks and its console (con0 on the launchers' pipes): no
# hostfs, no mconsole, no network transports, no virtio sockets, no port, pty, tty or xterm channels, no host
# watchdog, random device or mmapper (the build above fails if one is left), and its writable disk opened without
# copy-on-write headers (ubd2d=, landlock-launch.py), beside the host launchers' Landlock and seccomp, which refuse sockets, mounts, modules
# and io_uring to the guest's host processes.
FROM ${NODE_IMAGE} AS host
RUN apt-get update && apt-get install -y --no-install-recommends python3 \
 && rm -rf /var/lib/apt/lists/* \
 && groupadd --gid 10001 render \
 && useradd --uid 10001 --gid 10001 --no-create-home --home-dir /nonexistent --shell /usr/sbin/nologin render \
 && mkdir -p /work && chmod 0755 /work \
 && install -d -m 0700 -o root -g root /root/.ssh
COPY --from=guest /opt/uml /opt/uml
COPY --from=provenance /opt/uml/build-provenance.json /opt/uml/build-provenance.json
# The render supervisor (SDD-01): it holds the runner capability, talks only to the Sophia API and runs each job's
# unchanged kernel inside the guest, through the launchers in job mode (supervisor.mjs runUml). Its secrets come from
# the host at run time: SOPHIA_API_URL and SOPHIA_RENDER_RUNNER_TOKEN_FILE (a file only root can read; the launchers
# show it refused before the guest starts).
COPY --from=deploy /out /opt/sophia-renderer
ENV SOPHIA_RENDER_ISOLATION=uml \
  SOPHIA_UML_ROOT=/opt/uml \
  SOPHIA_RENDER_WORK=/work
# Render's SSH into a Docker service needs the running user's ~/.ssh at 0700: the supervisor and the fixture run as
# root, whose home holds it (WBC-02-CC-0010 §2.2).
USER root
# Idle unless the service's command says otherwise, so a restart or a deploy of a service that sets none starts
# nothing: the render host sets its command to `node /opt/sophia-renderer/supervisor.mjs`; the qualification
# fixture invokes host-qa.py once over the operator's SSH session (WBC-02-CC-0010 §2.2).
CMD ["node", "-e", "console.log(JSON.stringify({event:'uml_worker_idle',qualification:false}));setInterval(()=>{},60000)"]
