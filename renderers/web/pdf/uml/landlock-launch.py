"""Private experimental UML launcher. Linux x86_64, ABI4 required; no degraded path.
Run only inside a fresh user/network/PID namespace, after real UID separation.
The pinned guest is an untrusted component behind this host policy.
"""

import ctypes, errno, json, os, platform, resource, socket, stat, sys

if platform.system() != "Linux" or platform.machine() != "x86_64":
    raise RuntimeError("Linux x86_64 required")
if os.getuid() == 0 or os.geteuid() == 0 or os.getgroups():
    raise RuntimeError("nonroot with cleared supplementary groups required")
# The fixture (host-qa.py) passes four paths. The render supervisor (SDD-01) adds `job` and the paths the job must be
# refused (the runner capability's file, the supervisor's environment): the guest then reads its job from a read-only
# input disk and writes its output to a fixed-size output disk, both in the job directory.
if len(sys.argv) < 5 or (len(sys.argv) > 5 and (sys.argv[5] != "job" or len(sys.argv) < 7)):
    raise RuntimeError("launcher kernel initrd job-dir read-only-guest-root [job refused-path...]")
kernel, initrd, job, guest = (os.path.realpath(x) for x in sys.argv[1:5])
job_mode = len(sys.argv) > 5
refused = sys.argv[6:] if job_mode else ["/root/sophia-uml-private-secret", "/opt/uml-other/control"]
extra = ["mem=768M", "ubd0r=" + guest]
if job_mode:
    disks = []
    for name in ["input.tar", "output.img"]:
        disk = os.path.join(job, name)
        st = os.lstat(disk)
        if not stat.S_ISREG(st.st_mode) or st.st_nlink != 1:
            raise RuntimeError("job disks must be single regular files in the job directory")
        disks.append(disk)
    extra += ["ubd1r=" + disks[0], "ubd2=" + disks[1], "sophia_job=1"]
for artifact in [kernel, initrd, guest]:
    st = os.stat(artifact)
    if not os.path.isfile(artifact) or st.st_uid == os.geteuid() or st.st_mode & 0o022:
        raise RuntimeError("input is writable by the render identity")
with open("/proc/self/status") as f:
    status = f.read()
fields = {
    line.split(":", 1)[0]: line.split(":", 1)[1].strip()
    for line in status.splitlines()
    if ":" in line
}
if (
    fields.get("NoNewPrivs") != "1"
    or int(fields.get("CapEff", "1"), 16) != 0
    or len(fields.get("NSpid", "").split()) < 2
):
    raise RuntimeError("NNP, zero host caps and nested host PID namespace required")
libc = ctypes.CDLL(None, use_errno=True)


class Ruleset(ctypes.Structure):
    _fields_ = [("fs", ctypes.c_uint64), ("net", ctypes.c_uint64)]


class Beneath(ctypes.Structure):
    _pack_ = 1
    _fields_ = [("access", ctypes.c_uint64), ("parent", ctypes.c_int32)]


class Filter(ctypes.Structure):
    _fields_ = [
        ("code", ctypes.c_ushort),
        ("jt", ctypes.c_ubyte),
        ("jf", ctypes.c_ubyte),
        ("k", ctypes.c_uint),
    ]


class Program(ctypes.Structure):
    _fields_ = [("length", ctypes.c_ushort), ("filter", ctypes.POINTER(Filter))]


def call(n, *args):
    ctypes.set_errno(0)
    v = libc.syscall(ctypes.c_long(n), *args)
    if v < 0:
        raise OSError(ctypes.get_errno(), os.strerror(ctypes.get_errno()))
    return v


def pin_cpu():
    # UML has one virtual CPU. Keep its kernel and traced userspace on the same
    # allowed host CPU, avoiding migration/wakeup overhead between its tasks.
    # This affects only this owned process and the children it creates.
    allowed = os.sched_getaffinity(0)
    if not allowed:
        raise RuntimeError("no allowed host CPU")
    selected = {min(allowed)}
    os.sched_setaffinity(0, selected)
    if os.sched_getaffinity(0) != selected:
        raise RuntimeError("owned CPU affinity was not applied")
    return sorted(selected)


host_cpus = pin_cpu()
abi = call(444, ctypes.c_void_p(), ctypes.c_size_t(0), ctypes.c_uint(1))
if abi < 4:
    raise RuntimeError("Landlock ABI4 mandatory")
resource.setrlimit(resource.RLIMIT_CORE, (0, 0))
resource.setrlimit(resource.RLIMIT_NOFILE, (4096, 4096))
resource.setrlimit(
    resource.RLIMIT_FSIZE, (2 * 1024 * 1024 * 1024, 2 * 1024 * 1024 * 1024)
)
resource.setrlimit(resource.RLIMIT_CPU, (240, 240))
with open("/etc/hostname", "rb") as f:
    baseline_excluded = bool(f.read(256))
attrs = Ruleset((1 << 15) - 1, 3)
rules = call(
    444, ctypes.byref(attrs), ctypes.c_size_t(ctypes.sizeof(attrs)), ctypes.c_uint(0)
)
read = 1 << 2
directory = read | (1 << 3)
execute = read | 1
paths = [
    (kernel, execute),
    (initrd, read),
    (job, (1 << 15) - 1),
    ("/etc/ld.so.cache", read),
    ("/usr/lib/x86_64-linux-gnu", directory | 1),
    ("/proc/cpuinfo", read),
    ("/proc/self", directory),
    ("/proc/sys/vm/max_map_count", read),
    ("/dev/null", read | (1 << 1)),
    ("/dev/urandom", read),
]
paths.append((guest, read))
for p, access in paths:
    fd = os.open(p, os.O_PATH | os.O_CLOEXEC)
    try:
        call(
            445,
            ctypes.c_int(rules),
            ctypes.c_int(1),
            ctypes.byref(Beneath(access, fd)),
            ctypes.c_uint(0),
        )
    finally:
        os.close(fd)
if libc.prctl(38, 1, 0, 0, 0) != 0:
    raise OSError(ctypes.get_errno(), "no-new-privileges")
call(446, ctypes.c_int(rules), ctypes.c_uint(0))
os.close(rules)
# Inherited seccomp: no socket(), external endpoints, host mounts, handles,
# kernel modules, BPF, perf or userfaultfd. Internal AF_UNIX socketpair remains.
# x32/other architectures fail closed. ptrace stays only inside the namespace
# and Landlock domain; broader ptrace is denied by the OS boundary.
denied = [
    41,
    42,
    43,
    44,
    49,
    50,
    165,
    166,
    175,
    176,
    246,
    272,
    298,
    299,
    303,
    304,
    308,
    313,
    321,
    323,
    425,
    426,
    427,
    428,
    429,
    430,
    431,
    432,
    433,
    442,
]
ins = [
    (0x20, 0, 0, 4),
    (0x15, 1, 0, 0xC000003E),
    (0x06, 0, 0, 0x80000000),
    (0x20, 0, 0, 0),
    (0x45, 0, 1, 0x40000000),
    (0x06, 0, 0, 0x80000000),
]
for n in denied:
    ins.extend([(0x15, 0, 1, n), (0x06, 0, 0, 0x00050000 | errno.EPERM)])
ins.append((0x06, 0, 0, 0x7FFF0000))
array = (Filter * len(ins))(*(Filter(*i) for i in ins))
prog = Program(len(ins), array)
call(317, ctypes.c_uint(1), ctypes.c_uint(0), ctypes.byref(prog))
# Only stdio reaches the kernel. Python's descriptors are close-on-exec, and
# any inherited caller descriptors are explicitly closed here.
os.closerange(3, 4096)


def denied_read(path):
    try:
        fd = os.open(path, os.O_RDONLY)
        os.close(fd)
        return 0
    except OSError as error:
        return error.errno


checks = {path: denied_read(path) for path in ["/etc/hostname", *refused, "/proc/1/environ"]}
proof = job + "/policy-proof"
fd = os.open(proof, os.O_CREAT | os.O_EXCL | os.O_RDWR, 0o600)
os.write(fd, b"synthetic")
os.lseek(fd, 0, 0)
allowed_rw = os.read(fd, 9) == b"synthetic"
os.close(fd)
os.unlink(proof)
link = job + "/escape-link"
os.symlink("/etc/hostname", link)
escape_errno = denied_read(link)
os.unlink(link)
try:
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.close()
    socket_errno = 0
except OSError as error:
    socket_errno = error.errno
pid = os.fork()
if pid == 0:
    os._exit(
        0
        if denied_read("/etc/hostname") == errno.EACCES
        and sorted(os.sched_getaffinity(0)) == host_cpus
        else 1
    )
_, status = os.waitpid(pid, 0)
inheritance = os.waitstatus_to_exitcode(status) == 0
print(
    json.dumps(
        {
            "event": "UML_HOST_ADVERSE_CONTROLS",
            "baseline_world_readable": baseline_excluded,
            "excluded_errno": checks,
            "own_job_read_write": allowed_rw,
            "symlink_errno": escape_errno,
            "socket_errno": socket_errno,
            "descendant_inherits": inheritance,
            "hostCPUs": host_cpus,
        }
    ),
    flush=True,
)
if not (
    baseline_excluded
    and allowed_rw
    and inheritance
    and escape_errno == errno.EACCES
    and socket_errno == errno.EPERM
    and all(v in [errno.EACCES, errno.EPERM] for v in checks.values())
):
    raise RuntimeError("host policy adverse controls failed")
print(
    json.dumps(
        {
            "event": "UML_HOST_POLICY_APPLIED",
            "landlockABI": abi,
            "uid": os.getuid(),
            "seccomp": 2,
            "qualification": False,
        }
    ),
    flush=True,
)
os.execve(
    kernel,
    [
        kernel,
        "mem=64M",
        "initrd=" + initrd,
        "root=/dev/ram0",
        "rw",
        "con=null",
        "con0=fd:0,fd:1",
        "ssl=null",
        "init=/init",
        "panic=-1",
        *extra,
    ],
    {"PATH": "/usr/bin:/bin", "HOME": job, "TMPDIR": job, "LANG": "C.UTF-8"},
)
