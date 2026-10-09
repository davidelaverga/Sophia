"""Private root supervisor: single UID mapping; no setuid helpers or host mounts.
The child loses real host privileges before the Landlock/seccomp launcher.
"""

import ctypes, os, signal, sys, stat, select

if os.geteuid() != 0:
    raise RuntimeError("root supervisor required for real UID10001 separation")
if len(sys.argv) < 6:
    raise RuntimeError("namespace supervisor: launcher kernel initrd job guest-root [job refused-path...]")
# Validate real host ownership here: host UID0 is deliberately unmapped in the
# child's user namespace and appears there as the overflow UID.
for artifact in [sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[5]]:
    st = os.stat(artifact, follow_symlinks=False)
    if not stat.S_ISREG(st.st_mode) or st.st_uid != 0 or st.st_mode & 0o022:
        raise RuntimeError("root-owned immutable host input required")

libc = ctypes.CDLL(None, use_errno=True)
ready_r, ready_w = os.pipe()
go_r, go_w = os.pipe()
supervisor_pid = os.getpid()
pid = os.fork()
if pid:
    os.close(ready_w)
    os.close(go_r)

    def stop(signum, frame):
        try:
            os.kill(pid, signal.SIGKILL)
        except ProcessLookupError:
            pass

    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)
    try:
        if os.read(ready_r, 1) != b"R":
            raise RuntimeError("namespace child not ready")
        for file, value in [
            ("setgroups", "deny"),
            ("uid_map", "10001 10001 1"),
            ("gid_map", "10001 10001 1"),
        ]:
            with open(f"/proc/{pid}/{file}", "w") as f:
                f.write(value + "\n")
        os.write(go_w, b"G")
        _, status = os.waitpid(pid, 0)
        sys.exit(os.waitstatus_to_exitcode(status))
    finally:
        os.close(ready_r)
        os.close(go_w)
os.close(ready_r)
os.close(go_w)
os.setgroups([])
if libc.prctl(38, 1, 0, 0, 0) != 0:
    raise OSError(ctypes.get_errno(), "NNP")
if libc.prctl(1, signal.SIGKILL, 0, 0, 0) != 0:
    raise OSError(ctypes.get_errno(), "PDEATHSIG")
if os.getppid() != supervisor_pid:
    os._exit(119)
if libc.unshare(0x10000000 | 0x40000000 | 0x20000000) != 0:
    raise OSError(ctypes.get_errno(), "unshare user/net/PID")
os.write(ready_w, b"R")
os.close(ready_w)
if os.read(go_r, 1) != b"G":
    raise RuntimeError("mapping not established")
os.close(go_r)
os.setgid(10001)
os.setuid(10001)
if libc.prctl(1, signal.SIGKILL, 0, 0, 0) != 0:
    raise OSError(ctypes.get_errno(), "PDEATHSIG after UID drop")
if os.getppid() != supervisor_pid:
    os._exit(119)
# A PID namespace's init cannot identify its outside parent with getppid().
# Open the parent's pidfd before fork, then arm PDEATHSIG and check this handle
# in the init child, closing the fork/parent-death race without PID guessing.
parent_fd = os.pidfd_open(os.getpid())
init = os.fork()
if init:
    os.close(parent_fd)
    _, status = os.waitpid(init, 0)
    os._exit(os.waitstatus_to_exitcode(status))
if libc.prctl(1, signal.SIGKILL, 0, 0, 0) != 0:
    raise OSError(ctypes.get_errno(), "init PDEATHSIG")
parent_poll = select.poll()
parent_poll.register(parent_fd, select.POLLIN)
if parent_poll.poll(0):
    os._exit(119)
os.close(parent_fd)
os.execve("/usr/bin/python3", ["python3", *sys.argv[1:]], {"PATH": "/usr/bin:/bin"})
