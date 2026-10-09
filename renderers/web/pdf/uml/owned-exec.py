"""Bind a fixture child to its driver across exec, including startup cancellation.

The PID comes from the spawning driver, before fork. An already-dead parent is
refused; a parent dying after the check kills this child through PDEATHSIG.
"""

import ctypes, os, signal, sys

if len(sys.argv) < 3:
    raise RuntimeError("owned exec: expected parent PID and command required")
expected_parent = int(sys.argv[1])
libc = ctypes.CDLL(None, use_errno=True)
if libc.prctl(1, signal.SIGKILL, 0, 0, 0) != 0:
    raise OSError(ctypes.get_errno(), "fixture driver PDEATHSIG")
if os.getppid() != expected_parent:
    os._exit(119)
os.execvpe(sys.argv[2], sys.argv[2:], {"PATH": "/usr/bin:/bin"})
