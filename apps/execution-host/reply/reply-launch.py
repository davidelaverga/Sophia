"""Reply-home setup helpers and bounded check/sweep commands.

Inventory and prepared files are not process settlement or erasure proof. Parent
binding, alarm and diagnostic transfer belong only in a dedicated launcher;
local tests inject those process-wide operations. Parent/child execution and
settlement source is assembled, but native execution remains disabled. Check
observes and sweep settles recorded processes; neither grants retirement authority.
Native execution, conversation-content input and home deletion remain unqualified.
"""

import contextlib
import ctypes
import errno
import hashlib
import json
import os
import platform
import posixpath
import re
import resource
import select
import signal
import socket
import stat
import sys
import time
from dataclasses import dataclass
from typing import Optional

try:
    import fcntl
except ImportError:
    fcntl = None


class InventoryError(Exception):
    """A filesystem observation could not be completed safely."""


@dataclass(frozen=True)
class HomeObservation:
    root: str
    present: bool


@dataclass(frozen=True)
class ProcessIdentity:
    pid: int
    start_time: str
    boot_id: str
    executable: str
    nonce: str


@dataclass(frozen=True)
class LeaseRecords:
    launcher: ProcessIdentity
    fork_record: bool
    child: Optional[ProcessIdentity]
    tail: str


@dataclass(frozen=True)
class ProcessObservation:
    state: str
    reason: str


LEASE_LIMIT = 65_536
NONCE = re.compile(r"[a-f0-9]{64}")
BOOT_ID = re.compile(r"[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}")


def _identity(info):
    return info.st_dev, info.st_ino


def _private_directory(fd):
    info = os.fstat(fd)
    if info.st_uid != os.geteuid() or stat.S_IMODE(info.st_mode) != 0o700:
        raise InventoryError("directory_permissions")


@contextlib.contextmanager
def _directory(name, parent=None):
    flags = os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC
    fd = os.open(name, flags, dir_fd=parent)
    try:
        yield fd
    finally:
        os.close(fd)


@contextlib.contextmanager
def _absolute_directory(path):
    if (not isinstance(path, str) or not path.startswith("/") or
            path == "/" or any(p in ("", ".", "..") for p in path[1:].split("/"))):
        raise InventoryError("invalid_replies_path")
    with contextlib.ExitStack() as stack:
        fd = stack.enter_context(_directory("/"))
        for part in path[1:].split("/"):
            fd = stack.enter_context(_directory(part, fd))
        _private_directory(fd)
        yield fd


def _root_names(fd):
    names = []
    with os.scandir(fd) as entries:
        for entry in entries:
            if len(names) == 256:
                raise InventoryError("inventory_limit")
            if re.fullmatch(r"(?:gen|sealed)-[A-Za-z0-9_-]{1,100}", entry.name) is None:
                raise InventoryError("unexpected_reply_root")
            names.append(entry.name)
    return sorted(names)


def _home_identity(root_fd, attempt):
    try:
        with _directory(attempt, root_fd) as fd:
            _private_directory(fd)
            return _identity(os.fstat(fd))
    except FileNotFoundError:
        return None


def _observe_roots(fd, names, attempt):
    observations = []
    for name in names:
        with _directory(name, fd) as root_fd:
            _private_directory(root_fd)
            observations.append((name, _identity(os.fstat(root_fd)),
                                 _home_identity(root_fd, attempt)))
    if sum(home is not None for _, _, home in observations) > 1:
        raise InventoryError("duplicate_home")
    return observations


def inventory_attempt(replies, attempt):
    """Observe every root without following links; no stable absence is claimed.

    Revalidation detects namespace changes observed during the scan. It is not a
    lock: subsequent callers still need Q7 admission/life locks and spawn fences.
    Unknown root names fail closed rather than hiding an unexamined home.
    Component grammar permits synthetic IDs; serving boundaries still require
    the authenticated attempt UUID. No operational caller is installed here.
    """
    if not isinstance(attempt, str) or re.fullmatch(r"[A-Za-z0-9_-]{1,100}", attempt) is None:
        raise InventoryError("invalid_attempt")
    try:
        with _absolute_directory(replies) as fd:
            names = _root_names(fd)
            observations = _observe_roots(fd, names, attempt)
            with _absolute_directory(replies) as current:
                if (_identity(os.fstat(fd)) != _identity(os.fstat(current)) or
                        names != _root_names(current) or
                        observations != _observe_roots(current, names, attempt)):
                    raise InventoryError("namespace_changed")
            return tuple(HomeObservation(replies + "/" + name, home is not None)
                         for name, _, home in observations)
    except (OSError, ValueError) as error:
        raise InventoryError("filesystem_unconfirmed") from error


@contextlib.contextmanager
def _admission_file(root_fd):
    flags = os.O_RDONLY | os.O_NOFOLLOW | os.O_CLOEXEC | os.O_NONBLOCK
    fd = os.open(".admit", flags, dir_fd=root_fd)
    try:
        info = os.fstat(fd)
        if (not stat.S_ISREG(info.st_mode) or info.st_uid != os.geteuid() or
                stat.S_IMODE(info.st_mode) != 0o600 or info.st_nlink != 1 or info.st_size != 0):
            raise InventoryError("admission_metadata")
        yield fd
    finally:
        os.close(fd)


def _acquire_drain(fd, deadline):
    if fcntl is None or not callable(getattr(fcntl, "flock", None)):
        raise InventoryError("flock_unavailable")
    while time.monotonic() < deadline:
        try:
            fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
            if time.monotonic() >= deadline:
                raise InventoryError("admission_open")
            return
        except OSError as error:
            if error.errno not in (errno.EAGAIN, errno.EACCES):
                raise
        time.sleep(max(0, min(0.01, deadline - time.monotonic())))
    raise InventoryError("admission_open")


def _verify_drain_path(root, root_fd, lock_fd):
    with _absolute_directory(root) as current:
        with _admission_file(current) as named:
            if (_identity(os.fstat(current)) != _identity(os.fstat(root_fd)) or
                    _identity(os.fstat(named)) != _identity(os.fstat(lock_fd))):
                raise InventoryError("namespace_changed")


@contextlib.contextmanager
def _locked_generation(root, wait_ms=500):
    """Hold the generation's admission drain while the caller observes its files.

    This is not process settlement. A gen root still permits future admissions;
    a sealed name requires the supervisor's one-way, never-reused seal protocol.
    Both yielded descriptors are valid only inside this context. No source writer
    may use it to admit a launch through a renamed generation. The deadline
    covers lock acquisition/revalidation, not arbitrary caller work or a stuck
    filesystem syscall; a late syscall result is never a successful acquisition.
    """
    if type(wait_ms) is not int or not 1 <= wait_ms <= 500:
        raise InventoryError("invalid_drain_wait")
    if not isinstance(root, str) or re.fullmatch(r"(?:gen|sealed)-[A-Za-z0-9_-]{1,100}",
                                               root.rsplit("/", 1)[-1]) is None:
        raise InventoryError("invalid_generation")
    deadline = time.monotonic() + wait_ms / 1000
    try:
        with _absolute_directory(root) as root_fd:
            with _admission_file(root_fd) as lock_fd:
                _acquire_drain(lock_fd, deadline)
                _verify_drain_path(root, root_fd, lock_fd)
                if time.monotonic() >= deadline:
                    raise InventoryError("admission_open")
                yield root_fd, lock_fd
                _verify_drain_path(root, root_fd, lock_fd)
    except (OSError, ValueError) as error:
        raise InventoryError("admission_unconfirmed") from error


@contextlib.contextmanager
def drain_generation(root, wait_ms=500):
    """Borrow only the root descriptor from the retained generation drain."""
    with _locked_generation(root, wait_ms) as held:
        yield held[0]


def _closed_object(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise InventoryError("lease_duplicate_key")
        result[key] = value
    return result


def _invalid_constant(_value):
    raise InventoryError("lease_malformed")


def _lease_json(line):
    malformed = False
    try:
        value = json.loads(line.decode("utf-8"), object_pairs_hook=_closed_object,
                           parse_constant=_invalid_constant)
    except (UnicodeError, ValueError, RecursionError):
        # Decode exceptions retain the input. Leave the handler before raising
        # the public token so neither cause nor context exposes that exception.
        malformed = True
    if malformed:
        raise InventoryError("lease_malformed")
    if not isinstance(value, dict) or type(value.get("version")) is not int or value["version"] != 1:
        raise InventoryError("lease_version")
    return value


def _process_identity(value):
    fields = {"pid", "startTime", "bootId", "executable", "nonce"}
    if not isinstance(value, dict) or set(value) != fields:
        raise InventoryError("lease_identity")
    pid, start, boot, executable, nonce = (value[k] for k in
                                         ("pid", "startTime", "bootId", "executable", "nonce"))
    if type(pid) is not int or not 1 <= pid <= 2_147_483_647:
        raise InventoryError("lease_identity")
    if (not isinstance(start, str) or re.fullmatch(r"0|[1-9][0-9]{0,19}", start) is None or
            int(start) > 18_446_744_073_709_551_615):
        raise InventoryError("lease_identity")
    if (not isinstance(boot, str) or BOOT_ID.fullmatch(boot) is None or
            not isinstance(nonce, str) or NONCE.fullmatch(nonce) is None):
        raise InventoryError("lease_identity")
    if (not isinstance(executable, str) or len(executable) > 4096 or
            not executable.startswith("/") or "\x00" in executable or
            any(part in ("", ".", "..") for part in executable[1:].split("/"))):
        raise InventoryError("lease_identity")
    encoded_size = None
    try:
        encoded_size = len(executable.encode("utf-8"))
    except UnicodeError:
        # The Unicode exception itself contains the rejected string.
        pass
    if encoded_size is None or encoded_size > 4096:
        raise InventoryError("lease_identity")
    return ProcessIdentity(pid, start, boot, executable, nonce)


def _process_record(line, kind):
    value = _lease_json(line)
    if set(value) != {"version", "kind", "identity"} or value["kind"] != kind:
        raise InventoryError("lease_record_order")
    return _process_identity(value["identity"])


def parse_lease(data):
    """Strict local v1 JSONL metadata; partial records never imply settlement.

    Future writers must fsync launcher+fork records before forking and a complete
    child line before opening the exec gate. The operational writer is not enabled. A whole
    launcher plus partial fork is retained for Q7's separately owned live proof;
    it is not a whole lease for recovery. No raw partial bytes leave this parser.
    """
    if not isinstance(data, bytes) or len(data) > LEASE_LIMIT:
        raise InventoryError("lease_limit")
    lines = data.split(b"\n")
    if len(lines) < 2:
        raise InventoryError("lease_incomplete")
    if len(lines) > 4 or (len(lines) == 4 and lines[-1]):
        raise InventoryError("lease_record_count")
    launcher = _process_record(lines[0], "launcher")
    if len(lines) == 2:
        return LeaseRecords(launcher, False, None, "partial_fork" if lines[1] else "none")
    fork = _lease_json(lines[1])
    if fork != {"version": 1, "kind": "fork", "nonce": launcher.nonce}:
        raise InventoryError("lease_fork")
    if len(lines) == 3:
        return LeaseRecords(launcher, True, None, "partial_child" if lines[2] else "none")
    child = _process_record(lines[2], "child")
    if child.nonce != launcher.nonce or child.boot_id != launcher.boot_id or child.pid == launcher.pid:
        raise InventoryError("lease_child_identity")
    return LeaseRecords(launcher, True, child, "none")


@contextlib.contextmanager
def _lease_file(home_fd):
    fd = os.open("lease.json", os.O_RDONLY | os.O_NOFOLLOW | os.O_CLOEXEC | os.O_NONBLOCK,
                 dir_fd=home_fd)
    try:
        _lease_signature(fd)
        yield fd
    finally:
        os.close(fd)


def _lease_signature(fd):
    info = os.fstat(fd)
    if (not stat.S_ISREG(info.st_mode) or info.st_uid != os.geteuid() or
            stat.S_IMODE(info.st_mode) != 0o600 or info.st_nlink != 1 or info.st_size > LEASE_LIMIT):
        raise InventoryError("lease_metadata")
    return (_identity(info), info.st_size, info.st_mtime_ns, info.st_ctime_ns)


def _life_lock(fd):
    if fcntl is None or not callable(getattr(fcntl, "flock", None)):
        raise InventoryError("flock_unavailable")
    try:
        fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except OSError as error:
        if error.errno in (errno.EAGAIN, errno.EACCES):
            raise InventoryError("life_lock_held") from error
        raise


def _verify_lease_path(home, root_fd, home_fd, signature):
    with _absolute_directory(os.path.dirname(home)) as current_root:
        if _identity(os.fstat(current_root)) != _identity(os.fstat(root_fd)):
            raise InventoryError("lease_changed")
        _verify_home_lease(current_root, home, home_fd, signature)


def _verify_home_lease(root_fd, home, home_fd, signature):
    with _directory(os.path.basename(home), root_fd) as current:
        _private_directory(current)
        with _lease_file(current) as named:
            if (_identity(os.fstat(current)) != _identity(os.fstat(home_fd)) or
                    _lease_signature(named) != signature):
                raise InventoryError("lease_changed")


@contextlib.contextmanager
def locked_lease(home):
    """Read bounded identity metadata while retaining its exclusive life lock.

    No process lookup, signal, gone/settled verdict or deletion follows. The
    caller still owes admission drain and the trusted generation/attempt scope.
    Missing files and busy locks are distinct refusals, never absence proof.
    """
    if not isinstance(home, str):
        raise InventoryError("invalid_home")
    try:
        with _absolute_directory(os.path.dirname(home)) as root_fd, _absolute_directory(home) as home_fd:
            with _lease_file(home_fd) as fd:
                _life_lock(fd)
                signature = _lease_signature(fd)
                data = os.pread(fd, LEASE_LIMIT + 1, 0)
                if len(data) != signature[1] or _lease_signature(fd) != signature:
                    raise InventoryError("lease_changed")
                records = parse_lease(data)
                _verify_lease_path(home, root_fd, home_fd, signature)
                yield records
                _verify_lease_path(home, root_fd, home_fd, signature)
                if os.pread(fd, LEASE_LIMIT + 1, 0) != data:
                    raise InventoryError("lease_changed")
    except FileNotFoundError as error:
        raise InventoryError("lease_missing") from error
    except (OSError, ValueError) as error:
        raise InventoryError("lease_unconfirmed") from error


def _process_support():
    return (sys.platform == "linux" and platform.machine() == "x86_64" and
            callable(getattr(os, "pidfd_open", None)) and
            callable(getattr(signal, "pidfd_send_signal", None)))


def _bounded_proc_read(parent, name, limit):
    fd = os.open(name, os.O_RDONLY | os.O_NOFOLLOW | os.O_CLOEXEC | os.O_NONBLOCK, dir_fd=parent)
    try:
        if not stat.S_ISREG(os.fstat(fd).st_mode):
            raise InventoryError("process_file")
        data = bytearray()
        while len(data) <= limit:
            chunk = os.read(fd, min(4096, limit + 1 - len(data)))
            if not chunk:
                return bytes(data)
            data.extend(chunk)
        raise InventoryError("process_limit")
    finally:
        os.close(fd)


def _stat_start(data, pid):
    prefix, delimiter, tail = data.rpartition(b") ")
    fields = tail.split()
    if not delimiter or not prefix.startswith(str(pid).encode() + b" (") or len(fields) < 20:
        raise InventoryError("process_stat")
    return fields[19].decode("ascii")


def _process_nonce(data, kind):
    if not data.endswith(b"\x00"):
        raise InventoryError("process_nonce")
    parts = data[:-1].split(b"\x00")
    if kind == "launcher":
        # The approved launcher argv uses paired options only. Its future
        # parser must enforce this too, with abbreviation disabled.
        if b"--" in parts or any(item.startswith(b"--nonce=") for item in parts):
            raise InventoryError("process_nonce")
        positions = [i for i, item in enumerate(parts) if item == b"--nonce"]
        if len(positions) != 1 or positions[0] + 1 >= len(parts):
            raise InventoryError("process_nonce")
        return parts[positions[0] + 1].decode("ascii")
    matches = [item[len(b"SOPHIA_REPLY_NONCE="):] for item in parts
               if item.startswith(b"SOPHIA_REPLY_NONCE=")]
    if len(matches) != 1:
        raise InventoryError("process_nonce")
    return matches[0].decode("ascii")


def _read_process_identity(pid, kind):
    # Environment/cmdline buffers are transient and bounded; only the nonce is
    # retained. Never put raw proc bytes or decode exceptions into a report.
    with _directory("/proc") as proc:
        boot = _read_boot_id(proc)
        with _directory(str(pid), proc) as process:
            start = _stat_start(_bounded_proc_read(process, "stat", 4096), pid)
            executable = os.readlink("exe", dir_fd=process)
            field = "cmdline" if kind == "launcher" else "environ"
            nonce = _process_nonce(_bounded_proc_read(process, field, 65_536), kind)
    return _process_identity({"pid": pid, "startTime": start, "bootId": boot,
                              "executable": executable, "nonce": nonce})


def _read_boot_id(proc):
    with _directory("sys", proc) as system, _directory("kernel", system) as kernel:
        with _directory("random", kernel) as random:
            return _bounded_proc_read(random, "boot_id", 64).decode("ascii").removesuffix("\n")


def _observe_pidfd(identity, kind, fd):
    observed = _read_process_identity(identity.pid, kind)
    if observed != identity:
        return ProcessObservation("unresolved", "process_identity_mismatch")
    try:
        signal.pidfd_send_signal(fd, 0, None, 0)
    except OSError as error:
        if error.errno == errno.ESRCH:
            return ProcessObservation("gone", "pidfd_gone")
        raise
    return ProcessObservation("live", "process_live")


def _inspect_process(identity, kind):
    try:
        fd = os.pidfd_open(identity.pid, 0)
    except OSError as error:
        if error.errno == errno.ESRCH:
            return ProcessObservation("gone", "pidfd_gone")
        raise
    try:
        return _observe_pidfd(identity, kind, fd)
    finally:
        os.close(fd)


def inspect_process(identity, kind):
    """Observe one identity through a pidfd; never signal by number or terminate.

    A result applies to this one process only, not to a home or its descendants.
    Lease, life-lock, admission and spawn-fence proofs remain separate. The check
    command reports observations only. Unsupported hosts refuse before opening
    proc or a pidfd.
    """
    if not _process_support():
        return ProcessObservation("unresolved", "process_capability_unavailable")
    if not isinstance(identity, ProcessIdentity) or kind not in ("launcher", "child"):
        return ProcessObservation("unresolved", "process_identity_invalid")
    try:
        _process_identity({"pid": identity.pid, "startTime": identity.start_time,
                           "bootId": identity.boot_id, "executable": identity.executable,
                           "nonce": identity.nonce})
        return _inspect_process(identity, kind)
    except (OSError, ValueError, InventoryError):
        return ProcessObservation("unresolved", "process_unconfirmed")



@dataclass(frozen=True)
class CheckObservation:
    attempt_id: str
    root: str
    state: str
    reason: str


def _lease_process_state(records):
    if not records.fork_record:
        return ProcessObservation("unresolved", "lease_incomplete")
    entries = [(records.launcher, "launcher")]
    if records.child is not None:
        entries.append((records.child, "child"))
    observations = [inspect_process(identity, kind) for identity, kind in entries]
    if any(item.state == "unresolved" for item in observations):
        return ProcessObservation("unresolved", "process_unconfirmed")
    if any(item.state != "gone" for item in observations):
        return ProcessObservation("unsettled", "process_live")
    return ProcessObservation("gone", "recorded_processes_gone")


def _empty_directory(fd):
    with os.scandir(fd) as entries:
        return next(entries, None) is None


def _verify_empty(fd):
    if not _empty_directory(fd):
        raise InventoryError("home_changed")


def _observe_home(stack, root_fd, root, attempt):
    home_identity = _home_identity(root_fd, attempt)
    if home_identity is None:
        return ProcessObservation("absent", "home_absent")
    home_fd = stack.enter_context(_directory(attempt, root_fd))
    _private_directory(home_fd)
    if _identity(os.fstat(home_fd)) != home_identity:
        raise InventoryError("home_changed")
    if _empty_directory(home_fd):
        stack.callback(_verify_empty, home_fd)
        return ProcessObservation("empty", "home_empty")
    records = stack.enter_context(locked_lease(root + "/" + attempt))
    return _lease_process_state(records)


def _observe_generation(stack, root, attempt, deadline):
    remaining = int((deadline - time.monotonic()) * 1000)
    if remaining < 1:
        raise InventoryError("check_deadline")
    try:
        root_fd = stack.enter_context(drain_generation(root, min(500, remaining)))
        result = _observe_home(stack, root_fd, root, attempt)
    except InventoryError as error:
        # Public reports contain only fixed tokens, never exception objects.
        token = str(error)
        if token in ("admission_open", "life_lock_held"):
            result = ProcessObservation("unsettled", token)
        else:
            result = ProcessObservation("unresolved", "home_unconfirmed")
    return CheckObservation(attempt, root, result.state, result.reason)


def _verify_check_snapshot(replies, fd, names, snapshot, attempt):
    with _absolute_directory(replies) as current:
        if (_identity(os.fstat(fd)) != _identity(os.fstat(current)) or
                names != _root_names(current) or
                snapshot != _observe_roots(current, names, attempt)):
            raise InventoryError("namespace_changed")


def check_attempt(replies, attempt, current_root, wait_ms=500):
    """Compose read-only observations, retaining drains/life locks until return.

    This is not a retirement capability. Current-root absent/empty observations
    require the bridge's separate spawn fence; sealed roots require the installed
    supervisor's one-way seal protocol. Neither protocol is installed here.
    Namespace failure raises instead of returning partial success. The deadline
    bounds admitted observations, not a stuck OS call. The CLI caller must also
    enforce its external process deadline and spawn fence.
    """
    if (not isinstance(attempt, str) or
            re.fullmatch(r"[A-Za-z0-9_-]{1,100}", attempt) is None):
        raise InventoryError("invalid_attempt")
    if type(wait_ms) is not int or not 1 <= wait_ms <= 500:
        raise InventoryError("invalid_drain_wait")
    deadline = time.monotonic() + wait_ms / 1000
    with contextlib.ExitStack() as stack:
        fd = stack.enter_context(_absolute_directory(replies))
        names = _root_names(fd)
        if (not isinstance(current_root, str) or current_root not in names or
                not current_root.startswith("gen-")):
            raise InventoryError("current_root_missing")
        snapshot = _observe_roots(fd, names, attempt)
        results = []
        for name in names:
            root = replies + "/" + name
            if name.startswith("gen-") and name != current_root:
                results.append(CheckObservation(attempt, root, "unresolved", "generation_unsealed"))
            else:
                results.append(_observe_generation(stack, root, attempt, deadline))
        _verify_check_snapshot(replies, fd, names, snapshot, attempt)
        # Run all lock/path/empty revalidations before checking the final clock.
    if time.monotonic() >= deadline:
        raise InventoryError("check_deadline")
    return tuple(results)



@dataclass(frozen=True)
class RunArguments:
    root: str
    attempt: str
    parent: int
    nonce: str
    node: str
    entry: str
    runtime_dir: str
    template: str
    template_digest: str
    profile_name: str
    unit: str


RUN_OPTIONS = ("root", "attempt", "parent", "nonce", "node", "entry", "runtime-dir",
               "template", "template-digest", "profile-name", "unit")


def _canonical_path(value):
    return (isinstance(value, str) and len(value) <= 4096 and value.startswith("/") and
            "\x00" not in value and all(p not in ("", ".", "..") for p in value[1:].split("/")))


def _run_values(argv):
    if (not isinstance(argv, (tuple, list)) or len(argv) != 1 + 2 * len(RUN_OPTIONS) or
            argv[0] != "run" or any(not isinstance(item, str) for item in argv)):
        raise InventoryError("run_arguments")
    values = {}
    for option, value in zip(argv[1::2], argv[2::2]):
        name = option.removeprefix("--")
        if option != "--" + name or name not in RUN_OPTIONS or name in values:
            raise InventoryError("run_arguments")
        values[name] = value
    if set(values) != set(RUN_OPTIONS):
        raise InventoryError("run_arguments")
    return values


def parse_run_arguments(argv):
    """Closed, paired-only argv; no abbreviations, equals aliases or terminator.

    Paths are syntax-checked only. Exact installed artifact/profile identities,
    credential route and containment still require separate qualification.
    """
    v = _run_values(argv)
    if any(not _canonical_path(v[k]) for k in ("root", "node", "entry", "runtime-dir", "template")):
        raise InventoryError("run_path")
    if (re.fullmatch(r"gen-[A-Za-z0-9_-]{1,100}", v["root"].rsplit("/", 1)[-1]) is None or
            not v["entry"].startswith(v["runtime-dir"] + "/")):
        raise InventoryError("run_path")
    if BOOT_ID.fullmatch(v["attempt"]) is None or NONCE.fullmatch(v["nonce"]) is None:
        raise InventoryError("run_identity")
    if (re.fullmatch(r"[1-9][0-9]{0,9}", v["parent"]) is None or
            int(v["parent"]) > 2_147_483_647):
        raise InventoryError("run_identity")
    if (re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_-]{0,63}", v["profile-name"]) is None or
            re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]{0,159}", v["unit"]) is None or
            re.fullmatch(r"sophia-reply-tree-v1:sha256:[a-f0-9]{64}", v["template-digest"]) is None):
        raise InventoryError("run_artifact")
    return RunArguments(*(int(v[name]) if name == "parent" else v[name] for name in RUN_OPTIONS))


def _validated_run(request):
    if not isinstance(request, RunArguments):
        raise InventoryError("run_arguments")
    argv = ["run"]
    for name in RUN_OPTIONS:
        value = getattr(request, name.replace("-", "_"))
        if name == "parent" and type(value) is not int:
            raise InventoryError("run_identity")
        argv.extend(("--" + name, str(value) if name == "parent" else value))
    return parse_run_arguments(argv)


def _launcher_identity(request):
    if not _process_support():
        raise InventoryError("process_capability_unavailable")
    if os.getppid() != request.parent:
        raise InventoryError("wrong_parent")
    identity = _read_process_identity(os.getpid(), "launcher")
    if identity.nonce != request.nonce:
        raise InventoryError("launcher_identity_mismatch")
    return identity


def _setup_checkpoint(checkpoint, deadline):
    if time.monotonic() >= deadline:
        raise InventoryError("setup_deadline")
    checkpoint()  # Future channel adapter must raise on TERM/KILL/EOF.
    if time.monotonic() >= deadline:
        raise InventoryError("setup_deadline")


def _open_admission(root):
    with _absolute_directory(root) as root_fd:
        identity = _identity(os.fstat(root_fd))
        with _admission_file(root_fd) as fd:
            # Retain only the lock, not an old root-directory descriptor.
            return os.dup(fd), identity


def _verify_admission(root, fd, identity):
    with _absolute_directory(root) as root_fd:
        with _admission_file(root_fd) as named:
            if (_identity(os.fstat(root_fd)) != identity or
                    _identity(os.fstat(named)) != _identity(os.fstat(fd))):
                raise InventoryError("admission_changed")


def _shared_admission(fd, checkpoint, deadline):
    if fcntl is None or not callable(getattr(fcntl, "flock", None)):
        raise InventoryError("flock_unavailable")
    while True:
        _setup_checkpoint(checkpoint, deadline)
        try:
            fcntl.flock(fd, fcntl.LOCK_SH | fcntl.LOCK_NB)
            return
        except OSError as error:
            if error.errno not in (errno.EAGAIN, errno.EACCES):
                raise
        time.sleep(max(0, min(0.01, deadline - time.monotonic())))


def _new_home(request):
    with _absolute_directory(request.root) as root:
        os.mkdir(request.attempt, 0o700, dir_fd=root)


def _new_lease(home):
    with _absolute_directory(home) as fd:
        return os.open("lease.json", os.O_WRONLY | os.O_CREAT | os.O_EXCL |
                       os.O_NOFOLLOW | os.O_CLOEXEC, 0o600, dir_fd=fd)


def _launcher_records(identity):
    value = {"pid": identity.pid, "startTime": identity.start_time, "bootId": identity.boot_id,
             "executable": identity.executable, "nonce": identity.nonce}
    _process_identity(value)
    records = ({"version": 1, "kind": "launcher", "identity": value},
               {"version": 1, "kind": "fork", "nonce": identity.nonce})
    return b"".join(json.dumps(record, separators=(",", ":")).encode("utf-8") + b"\n"
                    for record in records)


def _write_records(fd, data, checkpoint, deadline):
    offset = 0
    while offset < len(data):
        _setup_checkpoint(checkpoint, deadline)
        written = os.write(fd, data[offset:])
        if written <= 0:
            raise InventoryError("lease_write_failed")
        offset += written
    _setup_checkpoint(checkpoint, deadline)
    os.fsync(fd)


def _durable_lease(request, identity, checkpoint, deadline):
    home = request.root + "/" + request.attempt
    _setup_checkpoint(checkpoint, deadline)
    _new_home(request)  # EEXIST never opens or takes ownership of the occupant.
    _setup_checkpoint(checkpoint, deadline)
    fd = _new_lease(home)
    try:
        _life_lock(fd)
        _write_records(fd, _launcher_records(identity), checkpoint, deadline)
        _setup_checkpoint(checkpoint, deadline)
        with _absolute_directory(home) as directory:
            os.fsync(directory)
        _setup_checkpoint(checkpoint, deadline)
        return fd
    except BaseException:
        os.close(fd)
        raise



def _verify_prepared_lease(request, lease, root_identity):
    with _absolute_directory(request.root) as root:
        if _identity(os.fstat(root)) != root_identity:
            raise InventoryError("admission_changed")
        with _directory(request.attempt, root) as home:
            _private_directory(home)
            with _lease_file(home) as named:
                if _lease_signature(named) != _lease_signature(lease):
                    raise InventoryError("lease_changed")


@contextlib.contextmanager
def prepare_lease(request, checkpoint):
    """Pre-fork source helper; retain the life lock for the caller's lifetime.

    No fork, exec, signal or deletion. The future launcher must retain this
    context until its child is settled, and first establish parent-death/channel
    setup. Partial homes stay for governed recovery. No CLI caller is installed.
    Only the admission lock and lease remain open across by-name setup steps.
    """
    request = _validated_run(request)
    if not callable(checkpoint):
        raise InventoryError("setup_control_missing")
    deadline = time.monotonic() + 30
    _setup_checkpoint(checkpoint, deadline)
    identity = _launcher_identity(request)
    _setup_checkpoint(checkpoint, deadline)
    lease = None
    admission, root_identity = _open_admission(request.root)
    try:
        try:
            _shared_admission(admission, checkpoint, deadline)
            _verify_admission(request.root, admission, root_identity)
            _setup_checkpoint(checkpoint, deadline)
            lease = _durable_lease(request, identity, checkpoint, deadline)
            _verify_prepared_lease(request, lease, root_identity)
            _verify_admission(request.root, admission, root_identity)
            _setup_checkpoint(checkpoint, deadline)
        finally:
            os.close(admission)
    except BaseException:
        # Only this setup's failure releases its lease; a caller may itself be
        # handling an unrelated exception when it enters this context.
        if lease is not None:
            os.close(lease)
        raise
    try:
        yield lease
    finally:
        os.close(lease)



def _set_parent_death():
    libc = ctypes.CDLL(None, use_errno=True)
    prctl = libc.prctl
    prctl.argtypes = (ctypes.c_int, ctypes.c_ulong, ctypes.c_ulong, ctypes.c_ulong, ctypes.c_ulong)
    prctl.restype = ctypes.c_int
    if prctl(1, int(signal.SIGKILL), 0, 0, 0) != 0:
        raise InventoryError("parent_death_unavailable")


def bind_launcher_parent(parent):
    """Bind this dedicated launcher process; never signal a numeric pid.

    Process-wide signal changes are for the standalone launcher only. No CLI
    caller exists yet. Tests inject these operations; Linux needs qualification.
    """
    if type(parent) is not int or not 1 <= parent <= 2_147_483_647:
        raise InventoryError("wrong_parent")
    if not _process_support():
        raise InventoryError("process_capability_unavailable")
    try:
        _set_parent_death()
        if os.getppid() != parent:
            raise InventoryError("wrong_parent")
        signal.signal(signal.SIGCHLD, signal.SIG_DFL)
    except (OSError, ValueError, AttributeError):
        raise InventoryError("parent_binding_failed") from None


def _unix_stream(fd):
    if type(fd) is not int or fd < 0:
        raise InventoryError("setup_channel_invalid")
    # A timeout-mode wrapper mutates the shared OFD's flags at construction.
    # The dedicated single-threaded launcher requires Python's default None.
    if socket.getdefaulttimeout() is not None:
        raise InventoryError("setup_socket_default")
    duplicate = os.dup(fd)
    try:
        stream = socket.socket(fileno=duplicate)
    except BaseException:
        os.close(duplicate)
        raise
    try:
        if stream.family != socket.AF_UNIX or stream.getsockopt(socket.SOL_SOCKET, socket.SO_TYPE) != socket.SOCK_STREAM:
            raise InventoryError("setup_channel_invalid")
        stream.getpeername()  # A listening or unconnected socket is not a channel.
        return stream
    except BaseException:
        stream.close()
        raise


class SetupControl:
    """Bounded control-only reader; never reads fd3 or changes shared fd flags.

    Cancellation/refusal is sticky. The original setup deadline is checked on
    each call, including no-data polls. Closing releases only this owned socket
    duplicate; it does not disarm the launcher's last-resort alarm.
    """
    def __init__(self, stream, deadline):
        self.stream = stream
        self.deadline = deadline
        self.pending = b""
        self.refusal = None

    def close(self):
        self.stream.close()
        if self.refusal is None:
            self.refusal = "control_closed"

    def _stop(self, reason):
        self.pending = b""
        self.refusal = reason
        raise InventoryError(reason)

    def poll(self):
        if self.refusal is not None:
            raise InventoryError(self.refusal)
        if time.monotonic() >= self.deadline:
            self._stop("setup_deadline")
        try:
            data = self.stream.recv(16, socket.MSG_DONTWAIT)
        except BlockingIOError:
            if time.monotonic() >= self.deadline:
                self._stop("setup_deadline")
            return
        except OSError:
            self._stop("control_unconfirmed")
        if time.monotonic() >= self.deadline:
            self._stop("setup_deadline")
        if not data:
            self._stop("cancelled")
        self.pending += data
        if b"\n" in self.pending:
            command = self.pending.split(b"\n", 1)[0]
            self._stop("cancelled" if command in (b"TERM", b"KILL") else "control_invalid")
        if not any(command.startswith(self.pending) for command in (b"TERM", b"KILL")):
            self._stop("control_invalid")


def _arm_setup_alarm():
    signal.signal(signal.SIGALRM, signal.SIG_DFL)
    signal.pthread_sigmask(signal.SIG_UNBLOCK, {signal.SIGALRM, signal.SIGCHLD})
    signal.alarm(30)


def initialize_setup(request, control_fd=0, relay_fd=3):
    """Parent binding, channel validation and setup alarm for one launcher.

    Return poll() for prepare_lease and later copy/setup steps. The independent
    absolute deadline prevents a later helper from resetting setup time. Only
    future confirmed exec/settlement logic may disarm the alarm. No fork or CLI.
    """
    request = _validated_run(request)
    bind_launcher_parent(request.parent)
    control = _unix_stream(control_fd)
    try:
        relay = _unix_stream(relay_fd)
        try:
            if _identity(os.fstat(control.fileno())) == _identity(os.fstat(relay.fileno())):
                raise InventoryError("setup_channel_alias")
        finally:
            relay.close()  # Validation only: relay bytes belong to the bridge/child.
        deadline = time.monotonic() + 30
        _arm_setup_alarm()
        result = SetupControl(control, deadline)
        result.poll()
        return result
    except BaseException:
        control.close()
        raise



@dataclass(frozen=True)
class TemplateEntry:
    path: str
    kind: str
    executable: bool
    payload: bytes
    signature: tuple


@dataclass
class TemplateScan:
    checkpoint: object
    readonly: bool
    entries: list
    total: int = 0


TEMPLATE_ENTRIES = 16_384
TEMPLATE_FILE_BYTES = 128 * 1024 * 1024
TEMPLATE_TOTAL_BYTES = 512 * 1024 * 1024


@contextlib.contextmanager
def _tree_directory(path):
    if not _canonical_path(path):
        raise InventoryError("template_path")
    with contextlib.ExitStack() as stack:
        fd = stack.enter_context(_directory("/"))
        for part in path[1:].split("/"):
            fd = stack.enter_context(_directory(part, fd))
        yield fd


def _template_signature(info):
    return (info.st_dev, info.st_ino, info.st_mode, info.st_size, info.st_mtime_ns, info.st_ctime_ns)


def _template_name(path):
    if (len(os.fsencode(path)) > 4096 or path.count("/") >= 64 or
            "\n" in path or "\r" in path):
        raise InventoryError("template_name")


def _template_mode(info, readonly):
    if readonly and not stat.S_ISLNK(info.st_mode) and info.st_mode & 0o222:
        raise InventoryError("template_not_readonly")


def _hash_template_file(parent, name, info, scan):
    if info.st_size > TEMPLATE_FILE_BYTES:
        raise InventoryError("template_file_limit")
    fd = os.open(name, os.O_RDONLY | os.O_NOFOLLOW | os.O_CLOEXEC | os.O_NONBLOCK, dir_fd=parent)
    try:
        if _template_signature(os.fstat(fd)) != _template_signature(info):
            raise InventoryError("template_changed")
        digest = hashlib.sha256()
        size = 0
        while True:
            scan.checkpoint()
            data = os.read(fd, 65_536)
            if not data:
                break
            size += len(data); scan.total += len(data)
            if size > TEMPLATE_FILE_BYTES or scan.total > TEMPLATE_TOTAL_BYTES:
                raise InventoryError("template_byte_limit")
            digest.update(data)
        if size != info.st_size or _template_signature(os.fstat(fd)) != _template_signature(info):
            raise InventoryError("template_changed")
        return digest.hexdigest().encode("ascii")
    finally:
        os.close(fd)


def _scan_template_entry(parent, name, path, scan):
    scan.checkpoint()
    _template_name(path)
    info = os.stat(name, dir_fd=parent, follow_symlinks=False)
    _template_mode(info, scan.readonly)
    signature = _template_signature(info)
    if stat.S_ISDIR(info.st_mode):
        entry = TemplateEntry(path, "d", False, b"", signature)
        scan.entries.append(entry)
        with _directory(name, parent) as child:
            if _template_signature(os.fstat(child)) != signature:
                raise InventoryError("template_changed")
            _scan_template_directory(child, path, scan)
        return
    if stat.S_ISREG(info.st_mode):
        entry = TemplateEntry(path, "f", bool(info.st_mode & 0o111),
                              _hash_template_file(parent, name, info, scan), signature)
    elif stat.S_ISLNK(info.st_mode):
        target = os.fsencode(os.readlink(name, dir_fd=parent))
        if not target or len(target) > 4096:
            raise InventoryError("template_link")
        entry = TemplateEntry(path, "l", False, target, signature)
    else:
        raise InventoryError("template_special_file")
    if _template_signature(os.stat(name, dir_fd=parent, follow_symlinks=False)) != signature:
        raise InventoryError("template_changed")
    scan.entries.append(entry)


def _scan_template_directory(fd, prefix, scan):
    before = os.fstat(fd)
    _template_mode(before, scan.readonly)
    with os.scandir(fd) as children:
        for child in children:
            if len(scan.entries) >= TEMPLATE_ENTRIES:
                raise InventoryError("template_entry_limit")
            path = prefix + "/" + child.name if prefix else child.name
            _scan_template_entry(fd, child.name, path, scan)
    if _template_signature(os.fstat(fd)) != _template_signature(before):
        raise InventoryError("template_changed")


def _bounded_link(path, target, runtime):
    if target.startswith("/"):
        result = posixpath.normpath(target)
        if not result.startswith(runtime + "/"):
            raise InventoryError("template_link_escape")
        return result
    result = posixpath.normpath(posixpath.join(posixpath.dirname(path), target))
    if result == ".." or result.startswith("../"):
        raise InventoryError("template_link_escape")
    return result


def _expand_template_link(item, pending, resolved, runtime, hops):
    if hops > 40:
        raise InventoryError("template_link_cycle")
    target = os.fsdecode(item.payload)
    bounded = _bounded_link(item.path, target, runtime)
    if target.startswith("/"):
        _bounded_link(item.path, posixpath.join(bounded, *pending), runtime)
        return None
    return resolved + target.split("/") + pending


def _resolve_template_link(entry, lookup, runtime, checkpoint):
    target = os.fsdecode(entry.payload)
    _bounded_link(entry.path, target, runtime)
    if target.startswith("/"):
        return
    pending = (posixpath.dirname(entry.path) + "/" + target).split("/")
    resolved = []
    hops = 0
    steps = 0
    while pending:
        checkpoint(); steps += 1
        if steps > 4096:
            raise InventoryError("template_link_limit")
        part = pending.pop(0)
        if part in ("", "."):
            continue
        if part == "..":
            if not resolved:
                raise InventoryError("template_link_escape")
            resolved.pop(); continue
        path = "/".join(resolved + [part])
        item = lookup.get(path)
        if item is None:
            raise InventoryError("template_link_dangling")
        if item.kind == "l":
            hops += 1
            pending = _expand_template_link(item, pending, resolved, runtime, hops)
            if pending is None:
                return
            resolved = []
        else:
            if pending and item.kind != "d":
                raise InventoryError("template_link_dangling")
            resolved.append(part)


def _template_lines(entries):
    lines = []
    for entry in entries:
        prefix = entry.kind.encode() + b" " + os.fsencode(entry.path)
        if entry.kind == "f":
            prefix += (b" x " if entry.executable else b" - ") + entry.payload
        elif entry.kind == "l":
            prefix += b" " + entry.payload.hex().encode("ascii")
        lines.append(prefix)
    return b"\n".join(lines)


def template_inventory(path, runtime, checkpoint, readonly=True):
    """Closed bounded tree recipe; no symlink target is opened or read.

    Source is a frozen template; writable destination scans are internal copy
    verification only. Absolute links are lexically runtime-bound, not resolved
    against external files. Installed runtime/link compatibility remains P1.
    """
    if not _canonical_path(runtime) or not callable(checkpoint):
        raise InventoryError("template_scope")
    scan = TemplateScan(checkpoint, readonly, [])
    checkpoint()
    with _tree_directory(path) as fd:
        _scan_template_directory(fd, "", scan)
    entries = tuple(sorted(scan.entries, key=lambda entry: os.fsencode(entry.path)))
    lookup = {entry.path: entry for entry in entries}
    for entry in entries:
        if entry.kind == "l":
            _resolve_template_link(entry, lookup, runtime, checkpoint)
    checkpoint()
    digest = "sophia-reply-tree-v1:sha256:" + hashlib.sha256(_template_lines(entries)).hexdigest()
    checkpoint()
    return entries, digest


@contextlib.contextmanager
def _relative_parent(root, path):
    with contextlib.ExitStack() as stack:
        fd = root
        for part in path.split("/")[:-1]:
            fd = stack.enter_context(_directory(part, fd))
        yield fd, path.rsplit("/", 1)[-1]


def _copy_template_file(source, destination, entry, checkpoint):
    with _relative_parent(source, entry.path) as (parent, name):
        fd = os.open(name, os.O_RDONLY | os.O_NOFOLLOW | os.O_CLOEXEC | os.O_NONBLOCK, dir_fd=parent)
    try:
        if _template_signature(os.fstat(fd)) != entry.signature:
            raise InventoryError("template_changed")
        with _relative_parent(destination, entry.path) as (parent, name):
            output = os.open(name, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW | os.O_CLOEXEC,
                             0o700 if entry.executable else 0o600, dir_fd=parent)
        try:
            _copy_template_bytes(fd, output, entry, checkpoint)
        finally:
            os.close(output)
    finally:
        os.close(fd)


def _copy_template_bytes(source, destination, entry, checkpoint):
    digest = hashlib.sha256(); size = 0
    while True:
        checkpoint()
        data = os.read(source, 65_536)
        if not data:
            break
        size += len(data)
        if size > entry.signature[3] or size > TEMPLATE_FILE_BYTES:
            raise InventoryError("template_changed")
        digest.update(data)
        while data:
            checkpoint()
            count = os.write(destination, data)
            if count <= 0:
                raise InventoryError("template_write_failed")
            data = data[count:]
    if (digest.hexdigest().encode() != entry.payload or size != entry.signature[3] or
            _template_signature(os.fstat(source)) != entry.signature):
        raise InventoryError("template_changed")
    os.fsync(destination)


def copy_template(template, destination, runtime, expected, checkpoint):
    """Copy a frozen validated tree to a fresh destination; never remove partials.

    Five arguments bind paths/digest/control only. The caller still owes the
    retained lease, namespace and artifact authority; no installed CLI exists.
    Its checkpoint must fence the original generation and lease as well as
    control/deadline between writes; a control-only callback is not that fence.
    """
    if (not _canonical_path(destination) or not _canonical_path(template) or
            destination == template or destination.startswith(template + "/") or
            template.startswith(destination + "/")):
        raise InventoryError("template_destination")
    entries, digest = template_inventory(template, runtime, checkpoint)
    if digest != expected:
        raise InventoryError("template_digest_mismatch")
    checkpoint()
    with _tree_directory(os.path.dirname(destination)) as parent:
        os.mkdir(os.path.basename(destination), 0o700, dir_fd=parent)
    with _tree_directory(template) as source, _absolute_directory(destination) as output:
        for entry in entries:
            checkpoint()
            if entry.kind == "f":
                _copy_template_file(source, output, entry, checkpoint)
            else:
                with _relative_parent(output, entry.path) as (parent, name):
                    if entry.kind == "d":
                        os.mkdir(name, 0o700, dir_fd=parent)
                    else:
                        os.symlink(os.fsdecode(entry.payload), name, dir_fd=parent)
        os.fsync(output)
    _, copied = template_inventory(destination, runtime, checkpoint, readonly=False)
    if copied != expected:
        raise InventoryError("template_digest_mismatch")
    checkpoint()
    return copied


def prepare_layout(request, lease, checkpoint):
    """Create fresh private layout under the retained named lease, without dup2.

    Diagnostic descriptors are returned owned to the caller, which must close
    them on failure or transfer. No runtime content is written and no partial
    directory is removed. This is not a launch or cleanup capability.
    """
    request = _validated_run(request)
    if not callable(checkpoint):
        raise InventoryError("setup_control_missing")
    with _absolute_directory(request.root) as root:
        root_identity = _identity(os.fstat(root))
    _verify_prepared_lease(request, lease, root_identity)
    home = request.root + "/" + request.attempt
    outputs = []
    try:
        for relative in ("home", "home/tmp", "dsh-home", "dsh-home/profiles", "work", "diag"):
            checkpoint()
            with _absolute_directory(os.path.dirname(home + "/" + relative)) as parent:
                os.mkdir(relative.rsplit("/", 1)[-1], 0o700, dir_fd=parent)
        for name in ("stdout", "stderr"):
            checkpoint()
            with _absolute_directory(home + "/diag") as parent:
                fd = os.open(name, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW | os.O_CLOEXEC,
                             0o600, dir_fd=parent)
            outputs.append(fd)
        _verify_prepared_lease(request, lease, root_identity)
        checkpoint()
        return tuple(outputs)
    except BaseException:
        for fd in outputs:
            os.close(fd)
        raise



def _setup_root_identity(request):
    with _absolute_directory(request.root) as root:
        return _identity(os.fstat(root))


def _root_checkpoint(request, expected, control):
    control.poll()
    if _setup_root_identity(request) != expected:
        raise InventoryError("admission_changed")
    control.poll()


class PreparedReplySetup:
    """Borrowed pre-fork state, valid only inside prepared_reply_setup.

    This owns diagnostic descriptors, not stdout/stderr or the relay. The outer
    context owns control and the retained lease. No state here is settlement or
    permission to fork. All operations assume one dedicated launcher thread.
    """
    def __init__(self, request, lease, root_identity, control):
        self.request = request
        self.lease = lease
        self.root_identity = root_identity
        self.control = control
        self.lease_signature = _lease_signature(lease)
        self.diagnostics = ()
        self.refusal = None

    def checkpoint(self):
        if self.refusal is not None:
            raise InventoryError(self.refusal)
        try:
            _root_checkpoint(self.request, self.root_identity, self.control)
            _verify_prepared_lease(self.request, self.lease, self.root_identity)
            if _lease_signature(self.lease) != self.lease_signature:
                raise InventoryError("lease_changed")
            self.control.poll()
        except (OSError, InventoryError):
            self.refusal = "setup_fence_unconfirmed"
            raise

    def close(self):
        self.refusal = "setup_closed"
        descriptors, self.diagnostics = self.diagnostics, ()
        failed = False
        for fd in descriptors:
            try:
                os.close(fd)
            except OSError:
                # Do not retry close on a possibly reused descriptor number.
                failed = True
        if failed:
            raise InventoryError("diagnostic_close_unconfirmed")

    def redirect_diagnostics(self):
        """Process-wide transfer for the standalone launcher only; never undo.

        A partial dup2 failure prevents progression; already replaced standard
        descriptors stay replaced until this dedicated launcher exits. The
        owned source descriptors stay open until context exit. Tests mock dup2.
        """
        try:
            self.checkpoint()
            if len(self.diagnostics) != 2:
                raise InventoryError("diagnostics_unprepared")
            for fd, target in zip(self.diagnostics, (1, 2)):
                self.checkpoint()
                os.dup2(fd, target, inheritable=True)
            self.checkpoint()
        except (OSError, InventoryError):
            self.refusal = "diagnostic_redirect_unconfirmed"
            raise


@contextlib.contextmanager
def prepared_reply_setup(request, control_fd=0, relay_fd=3):
    """Compose pre-fork preparation under one deadline, lease and namespace.

    Retain this context through any future child settlement. Setup alarm remains
    armed. The yielded state only prepares files. Capability, containment and child
    exec/parent helpers exist; actual target execution and CLI remain unqualified.
    Partial homes stay on every refusal. Never boot or modify the template.
    """
    request = _validated_run(request)
    with contextlib.ExitStack() as stack:
        control = initialize_setup(request, control_fd, relay_fd)
        stack.callback(control.close)
        root_identity = _setup_root_identity(request)
        def admission_checkpoint():
            _root_checkpoint(request, root_identity, control)
        lease = stack.enter_context(prepare_lease(request, admission_checkpoint))
        setup = PreparedReplySetup(request, lease, root_identity, control)
        stack.callback(setup.close)
        setup.checkpoint()
        setup.diagnostics = prepare_layout(request, lease, setup.checkpoint)
        setup.checkpoint()
        destination = request.root + "/" + request.attempt + "/dsh-home/profiles/" + request.profile_name
        copy_template(request.template, destination, request.runtime_dir, request.template_digest, setup.checkpoint)
        setup.checkpoint()
        yield setup



# Linux x86_64 UAPI constants, qualified against Q7's explicit syscall policy.
# This is a pure program builder and read-only capability query, not enforcement.
AUDIT_ARCH_X86_64 = 0xC000003E
SECCOMP_ALLOW = 0x7FFF0000
SECCOMP_KILL_PROCESS = 0x80000000
SECCOMP_ERRNO = 0x00050000
LINUX_EPERM = 1
LINUX_ENOSYS = 38
CLONE_THREAD = 0x00010000
BPF_LOAD_WORD = 0x20
BPF_JUMP_EQUAL = 0x15
BPF_JUMP_SET = 0x45
BPF_JUMP_GE = 0x35
BPF_RETURN = 0x06


@dataclass(frozen=True)
class LinuxCapabilities:
    landlock_abi: int
    handled_filesystem: int


def _linux_syscall(number, arguments):
    libc = ctypes.CDLL(None, use_errno=True)
    syscall = libc.syscall
    syscall.restype = ctypes.c_long
    syscall.argtypes = (ctypes.c_long,)
    ctypes.set_errno(0)
    result = syscall(ctypes.c_long(number), *arguments)
    if result < 0:
        raise InventoryError("linux_query_unavailable")
    return result


def _landlock_filesystem_rights(abi):
    # ABI4: EXECUTE through TRUNCATE; ABI5 adds IOCTL_DEV; ABI9 adds
    # RESOLVE_UNIX. ABI6-8 and10-11 add no filesystem access flag. Unknown
    # future ABIs refuse: handling only known bits would silently omit rights.
    if type(abi) is not int or not 4 <= abi <= 11:
        raise InventoryError("landlock_abi_unqualified")
    bits = 15 if abi == 4 else (16 if abi < 9 else 17)
    return (1 << bits) - 1


def _probe_own_pidfd(checkpoint):
    checkpoint()
    fd = os.pidfd_open(os.getpid(), 0)
    try:
        checkpoint()
        signal.pidfd_send_signal(fd, 0, None, 0)
        checkpoint()
    finally:
        os.close(fd)


def query_linux_capabilities(checkpoint):
    """Read-only prerequisites, not proof a filter/domain can be installed.

    Queries Landlock version and seccomp action support and opens only this
    launcher's own pidfd with signal0. No policy, signal disposition, fork or
    limit is changed. All syscall/pidfd operations are injected in local tests.
    Actual Linux installation and the pinned Node runtime remain unqualified.
    """
    if not callable(checkpoint):
        raise InventoryError("setup_control_missing")
    checkpoint()
    if not _process_support():
        raise InventoryError("process_capability_unavailable")
    try:
        abi = _linux_syscall(444, (ctypes.c_void_p(), ctypes.c_size_t(0), ctypes.c_uint(1)))
        rights = _landlock_filesystem_rights(abi)
        checkpoint()
        action = ctypes.c_uint32(SECCOMP_KILL_PROCESS)
        result = _linux_syscall(317, (ctypes.c_uint(2), ctypes.c_uint(0), ctypes.byref(action)))
        if result != 0:
            raise InventoryError("seccomp_query_unconfirmed")
        _probe_own_pidfd(checkpoint)
        checkpoint()
        return LinuxCapabilities(abi, rights)
    except (OSError, AttributeError):
        raise InventoryError("linux_capability_unconfirmed") from None


def _filter_errno(number, error):
    return [(BPF_JUMP_EQUAL, 0, 1, number), (BPF_RETURN, 0, 0, SECCOMP_ERRNO | error)]


def _filter_argument(number, predicate):
    # seccomp_data.args[0] is offset16. These predicates consume the low32
    # bits, matching Linux int arguments; high bits cannot hide AF_UNIX or a pid.
    return [(BPF_JUMP_EQUAL, 0, len(predicate) + 1, number),
            (BPF_LOAD_WORD, 0, 0, 16)] + predicate


def reply_seccomp_program(pid):
    """Immutable classic-BPF instructions for Q7's x86_64 child policy only.

    The pid must be the post-fork child, bound by the future installer. This
    builder has no kernel effects and its result is not installed/proven policy.
    Remaining filesystem/process access rests on the separately required
    Landlock domain, descriptor closure and pinned single-threaded pre-exec path.
    """
    if type(pid) is not int or not 1 <= pid <= 2_147_483_647:
        raise InventoryError("filter_identity")
    deny = (BPF_RETURN, 0, 0, SECCOMP_ERRNO | LINUX_EPERM)
    allow = (BPF_RETURN, 0, 0, SECCOMP_ALLOW)
    instructions = [(BPF_LOAD_WORD, 0, 0, 4),
                    (BPF_JUMP_EQUAL, 1, 0, AUDIT_ARCH_X86_64),
                    (BPF_RETURN, 0, 0, SECCOMP_KILL_PROCESS),
                    (BPF_LOAD_WORD, 0, 0, 0),
                    (BPF_JUMP_SET, 0, 1, 0x40000000),
                    (BPF_RETURN, 0, 0, SECCOMP_KILL_PROCESS),
                    # Reject legacy x32 aliases even without the x32 bit.
                    (BPF_JUMP_GE, 0, 2, 512),
                    (BPF_JUMP_GE, 1, 0, 548),
                    (BPF_RETURN, 0, 0, SECCOMP_KILL_PROCESS)]
    # Process creation/signaling plus io_uring: SQE socket creation bypasses
    # socket/socketpair argument predicates. No ring descriptors may be inherited.
    for number in (57, 58, 200, 424, 425, 426, 427, 434, 438):
        instructions.extend(_filter_errno(number, LINUX_EPERM))
    instructions.extend(_filter_errno(435, LINUX_ENOSYS))  # clone3 fallback.
    instructions.extend(_filter_argument(56, [(BPF_JUMP_SET, 1, 0, CLONE_THREAD), deny, allow]))
    # kill, rt_sigqueueinfo, tgkill, rt_tgsigqueueinfo: first arg is pid/tgid.
    for number in (62, 129, 234, 297):
        instructions.extend(_filter_argument(number, [(BPF_JUMP_EQUAL, 1, 0, pid), deny, allow]))
    for number in (41, 53):  # socket, socketpair: AF_UNIX is Linux UAPI1.
        instructions.extend(_filter_argument(number, [(BPF_JUMP_EQUAL, 0, 1, 1), deny, allow]))
    instructions.append(allow)
    return tuple(instructions)



class _LandlockRuleset(ctypes.Structure):
    _fields_ = (("filesystem", ctypes.c_uint64),)


class _LandlockBeneath(ctypes.Structure):
    _pack_ = 1
    _fields_ = (("access", ctypes.c_uint64), ("parent", ctypes.c_int32))


# A selected list is supplied only after target qualification; absence is not
# permission to discover or substitute extra paths. Symlink paths fail closed.
LANDLOCK_SYSTEM_READS = {
    "/usr/lib": stat.S_IFDIR, "/lib": stat.S_IFDIR, "/lib64": stat.S_IFDIR,
    "/etc/ld.so.cache": stat.S_IFREG, "/etc/ssl": stat.S_IFDIR,
    "/etc/resolv.conf": stat.S_IFREG, "/etc/hosts": stat.S_IFREG,
    "/etc/nsswitch.conf": stat.S_IFREG, "/proc/self": stat.S_IFDIR,
    "/dev/null": stat.S_IFCHR, "/dev/urandom": stat.S_IFCHR,
}


def _landlock_read_rule(path, kind, root, node):
    if path == root or path.startswith(root + "/") or root.startswith(path + "/"):
        raise InventoryError("landlock_read_overlap")
    access = 4 | (9 if kind == stat.S_IFDIR else (1 if path == node else 0))
    return path, access, kind, False


def _validate_landlock_reads(system_reads):
    if (not isinstance(system_reads, tuple) or len(system_reads) > len(LANDLOCK_SYSTEM_READS) or
            any(not isinstance(path, str) or path not in LANDLOCK_SYSTEM_READS for path in system_reads) or
            len(set(system_reads)) != len(system_reads)):
        raise InventoryError("landlock_read_list")


def _landlock_rules(request, capabilities, system_reads):
    request = _validated_run(request)
    if (not isinstance(capabilities, LinuxCapabilities) or type(capabilities.handled_filesystem) is not int or
            capabilities.handled_filesystem != _landlock_filesystem_rights(capabilities.landlock_abi)):
        raise InventoryError("landlock_capability_binding")
    _validate_landlock_reads(system_reads)
    home = request.root + "/" + request.attempt
    rules = [(home + "/" + name, capabilities.handled_filesystem, stat.S_IFDIR, True)
             for name in ("home", "dsh-home", "work")]
    reads = [(request.runtime_dir, stat.S_IFDIR), (request.node, stat.S_IFREG)]
    reads.extend((path, LANDLOCK_SYSTEM_READS[path]) for path in system_reads)
    rules.extend(_landlock_read_rule(path, kind, request.root, request.node) for path, kind in reads)
    return tuple(rules)


@contextlib.contextmanager
def _landlock_path(path, kind, private):
    # O_PATH|NOFOLLOW can open a symlink itself: every component is fstat'd.
    # Resolve only proc/self's kernel-owned alias, to this child's actual pid.
    if path == "/proc/self":
        path = "/proc/" + str(os.getpid())
    with contextlib.ExitStack() as stack:
        parent = None
        parts = ("/",) + tuple(path[1:].split("/"))
        for index, part in enumerate(parts):
            fd = os.open(part, os.O_PATH | os.O_NOFOLLOW | os.O_CLOEXEC, dir_fd=parent)
            stack.callback(os.close, fd)
            info = os.fstat(fd)
            expected = kind if index == len(parts) - 1 else stat.S_IFDIR
            if stat.S_IFMT(info.st_mode) != expected:
                raise InventoryError("landlock_path_type")
            parent = fd
        if private:
            _private_directory(fd)
        yield fd


def _add_landlock_path(ruleset, rule):
    path, access, kind, private = rule
    with _landlock_path(path, kind, private) as fd:
        attr = _LandlockBeneath(access, fd)
        result = _linux_syscall(445, (ctypes.c_int(ruleset), ctypes.c_int(1),
                                     ctypes.byref(attr), ctypes.c_uint(0)))
        if result != 0:
            raise InventoryError("landlock_rule_unconfirmed")


def _restrict_landlock(ruleset):
    args = tuple(ctypes.c_ulong(value) for value in (38, 1, 0, 0, 0))
    if _linux_syscall(157, args) != 0 or _prctl_query(39) != 1:
        raise InventoryError("landlock_privilege_unconfirmed")
    if _linux_syscall(446, (ctypes.c_int(ruleset), ctypes.c_uint(0))) != 0:
        raise InventoryError("landlock_restrict_unconfirmed")


def _landlock_denied_open(path, flags):
    try:
        fd = os.open(path, flags | os.O_NOFOLLOW | os.O_CLOEXEC, 0o600)
    except OSError as error:
        if error.errno == errno.EACCES:
            return
        raise InventoryError("landlock_denial_unconfirmed") from None
    try:
        # Unexpectedly created empty canaries stay for governed cleanup. A
        # successful open is never an isolation/deletion receipt.
        raise InventoryError("landlock_denial_failed")
    finally:
        os.close(fd)


def _landlock_self_test(request):
    canary = request.root + "/.con01-denial-" + request.nonce
    _landlock_denied_open(canary, os.O_WRONLY | os.O_CREAT | os.O_EXCL)
    _landlock_denied_open(request.root + "/" + request.attempt + "/lease.json", os.O_RDONLY)


def install_reply_landlock(request, capabilities, system_reads):
    """Irreversible owned post-gate child only; all local OS effects mocked.

    The caller owes retained namespace/lease ownership and a qualified exact
    system read list. No path discovery, symlink fallback or network policy is
    inferred here. Any error requires child exit, including uncertain close.
    This does not prove physical isolation, cleanup or process settlement.
    """
    rules = _landlock_rules(request, capabilities, system_reads)
    if not _process_support() or not hasattr(os, "O_PATH"):
        raise InventoryError("landlock_platform_unavailable")
    try:
        if os.listdir("/proc/self/task") != [str(os.getpid())]:
            raise InventoryError("landlock_thread_unconfirmed")
        resource.setrlimit(resource.RLIMIT_CORE, (0, 0))
        if resource.getrlimit(resource.RLIMIT_CORE) != (0, 0):
            raise InventoryError("landlock_core_unconfirmed")
        attrs = _LandlockRuleset(capabilities.handled_filesystem)
        ruleset = _linux_syscall(444, (ctypes.byref(attrs), ctypes.c_size_t(ctypes.sizeof(attrs)), ctypes.c_uint(0)))
        try:
            for rule in rules:
                _add_landlock_path(ruleset, rule)
            _restrict_landlock(ruleset)
        finally:
            os.close(ruleset)
        _landlock_self_test(request)
    except (OSError, AttributeError, ValueError):
        raise InventoryError("landlock_install_unconfirmed") from None


class _SockFilter(ctypes.Structure):
    _fields_ = (("code", ctypes.c_uint16), ("jt", ctypes.c_uint8),
                ("jf", ctypes.c_uint8), ("k", ctypes.c_uint32))


class _SockProgram(ctypes.Structure):
    _fields_ = (("length", ctypes.c_ushort), ("filters", ctypes.POINTER(_SockFilter)))


def _prctl_query(option):
    return _linux_syscall(157, tuple(ctypes.c_ulong(value) for value in (option, 0, 0, 0, 0)))


def _filter_install_identity():
    if not _process_support() or ctypes.sizeof(ctypes.c_void_p) != 8:
        raise InventoryError("filter_platform_unavailable")
    pid = os.getpid()
    if type(pid) is not int or not 1 <= pid <= 2_147_483_647:
        raise InventoryError("filter_identity")
    if os.listdir("/proc/self/task") != [str(pid)]:
        raise InventoryError("filter_thread_unconfirmed")
    if _prctl_query(39) != 1:  # PR_GET_NO_NEW_PRIVS; set during Landlock setup.
        raise InventoryError("filter_privilege_unconfirmed")
    return pid


def install_reply_seccomp():
    """Irreversible post-gate child operation, after Landlock and its self-test.

    Never call from a parent or test runner. Tests intercept every syscall.
    Trusted single-threaded pre-exec composition is required; this helper does
    not establish the Landlock domain, parent ownership or process settlement.
    Any failure, including after installation, requires child exit, not retry.
    """
    try:
        pid = _filter_install_identity()
        instructions = reply_seccomp_program(pid)
        filters = (_SockFilter * len(instructions))(*(_SockFilter(*row) for row in instructions))
        program = _SockProgram(len(instructions), filters)
        if os.getpid() != pid:
            raise InventoryError("filter_identity")
        result = _linux_syscall(317, (ctypes.c_uint(1), ctypes.c_uint(0), ctypes.byref(program)))
        if result != 0 or _prctl_query(21) != 2:  # PR_GET_SECCOMP / FILTER.
            raise InventoryError("filter_install_unconfirmed")
    except (OSError, AttributeError, ValueError):
        raise InventoryError("filter_install_unconfirmed") from None


def _reply_descriptor_numbers():
    names = os.listdir("/proc/self/fd")
    if len(names) > 16384:
        raise InventoryError("descriptor_inventory_limit")
    numbers = set()
    for name in names:
        if not re.fullmatch(r"0|[1-9][0-9]{0,9}", name) or int(name) > 2_147_483_647:
            raise InventoryError("descriptor_inventory_invalid")
        number = int(name)
        if number in numbers:
            raise InventoryError("descriptor_inventory_invalid")
        numbers.add(number)
    return numbers



def _close_reply_fd(fd):
    try:
        os.close(fd)
    except OSError as error:
        # listdir's own descriptor is already closed after enumeration.
        # Never retry a close that could have released a reused number.
        if error.errno != errno.EBADF:
            raise


def _assert_reply_fd_closed(fd):
    try:
        os.fstat(fd)
    except OSError as error:
        if error.errno == errno.EBADF:
            return
        raise
    raise InventoryError("descriptor_closure_unconfirmed")


def close_reply_descriptors(status_fd, lease_fd):
    """Dedicated single-threaded post-fork child only, immediately before exec.

    Caller must already bind fd0 to /dev/null, fd1/2 to diagnostics, fd3 to
    the verified relay and these two owned descriptors to status/lease. This
    helper proves no other live fd at its checkpoint, not those role identities.
    No thread or callback may allocate descriptors between this check and exec.
    Tests inject every descriptor/process operation; no CLI calls this helper.
    """
    if platform.system() != "Linux":
        raise InventoryError("descriptor_platform_unavailable")
    if any(type(fd) is not int or not 4 <= fd <= 2_147_483_647 for fd in (status_fd, lease_fd)):
        raise InventoryError("descriptor_identity")
    if status_fd == lease_fd:
        raise InventoryError("descriptor_identity")
    retained = {0, 1, 2, 3, status_fd, lease_fd}
    try:
        for fd in sorted(retained):
            os.fstat(fd)
            os.set_inheritable(fd, fd < 4)
        for fd in sorted(_reply_descriptor_numbers() - retained):
            _close_reply_fd(fd)
        for fd in sorted(_reply_descriptor_numbers() - retained):
            _assert_reply_fd_closed(fd)
        for fd in sorted(retained):
            os.fstat(fd)
            if os.get_inheritable(fd) != (fd < 4):
                raise InventoryError("descriptor_inheritance_unconfirmed")
    except OSError:
        raise InventoryError("descriptor_closure_unconfirmed") from None



def reply_child_environment(request):
    """Build the Q7 non-credential environment from validated request identity.

    Never read or forward the launcher's environment. This has no filesystem or
    process effects and supplies no provider credentials: D-4's exact route and
    credential name remain unbound. The future exec path must establish current
    admission, private home/descriptor roles and containment before using it.
    """
    request = _validated_run(request)
    home = request.root + "/" + request.attempt
    return {
        "HOME": home + "/home",
        "TMPDIR": home + "/home/tmp",
        "DSH_HOME": home + "/dsh-home",
        "SOPHIA_WORKSPACE": home + "/work",
        "DSH_TELEMETRY_DISABLED": "1",
        "LANG": "C.UTF-8",
        "PATH": "/usr/bin:/bin",
        "SOPHIA_RUNTIME_UNIT": request.unit,
        "SOPHIA_REPLY_FD": "3",
        "SOPHIA_REPLY_NONCE": request.nonce,
    }



@dataclass(frozen=True)
class ChildDescriptorRoles:
    status_fd: int
    lease_fd: int
    roles: tuple
    null_key: tuple


def _descriptor_role_key(info):
    # Exclude size/timestamps: the parent appends the child lease record and
    # diagnostics can grow. Device/inode/type/owner/mode/link count stay bound.
    return (info.st_dev, info.st_ino, info.st_mode, info.st_uid, info.st_nlink, info.st_rdev)


def _descriptor_role(fd, kind, access, private=False):
    info = os.fstat(fd)
    if stat.S_IFMT(info.st_mode) != kind or fcntl.fcntl(fd, fcntl.F_GETFL) & os.O_ACCMODE != access:
        raise InventoryError("child_descriptor_role")
    if private and (info.st_uid != os.geteuid() or stat.S_IMODE(info.st_mode) != 0o600 or info.st_nlink != 1):
        raise InventoryError("child_descriptor_role")
    return _descriptor_role_key(info)


def _named_diagnostic_role(request, name):
    path = request.root + "/" + request.attempt + "/diag"
    with _absolute_directory(path) as directory:
        _private_directory(directory)
        fd = os.open(name, os.O_RDONLY | os.O_NOFOLLOW | os.O_CLOEXEC | os.O_NONBLOCK, dir_fd=directory)
        try:
            return _descriptor_role(fd, stat.S_IFREG, os.O_RDONLY, True)
        finally:
            os.close(fd)


def _diagnostic_roles(setup):
    if len(setup.diagnostics) != 2:
        raise InventoryError("diagnostics_unprepared")
    roles = []
    for source, target, name in zip(setup.diagnostics, (1, 2), ("stdout", "stderr")):
        key = _descriptor_role(source, stat.S_IFREG, os.O_WRONLY, True)
        if key != _named_diagnostic_role(setup.request, name):
            raise InventoryError("child_descriptor_role")
        if key != _descriptor_role(target, stat.S_IFREG, os.O_WRONLY, True):
            raise InventoryError("child_descriptor_role")
        roles.append((target, key, os.O_WRONLY))
    return roles


def _verify_child_roles(binding, null_input):
    if not isinstance(binding, ChildDescriptorRoles):
        raise InventoryError("child_descriptor_binding")
    for fd, key, access in binding.roles:
        if fd == 0 and null_input:
            key, access = binding.null_key, os.O_RDONLY
        if _descriptor_role(fd, stat.S_IFMT(key[2]), access) != key:
            raise InventoryError("child_descriptor_changed")


def _validate_child_capture(setup, status_fd):
    if platform.system() != "Linux" or fcntl is None:
        raise InventoryError("descriptor_platform_unavailable")
    if not isinstance(setup, PreparedReplySetup):
        raise InventoryError("child_descriptor_binding")
    if (type(status_fd) is not int or not 4 <= status_fd <= 2_147_483_647 or
            status_fd in (setup.lease,) + setup.diagnostics):
        raise InventoryError("descriptor_identity")


def capture_child_descriptor_roles(setup, status_fd):
    """Capture pre-fork bindings after diagnostic transfer; does not fork.

    The caller owns a newly created status pipe. Setup retains all resources.
    Its frozen pre-fork lease signature must not be reused after child append;
    this binding intentionally checks stable fd identity, not lease contents.
    """
    _validate_child_capture(setup, status_fd)
    try:
        setup.checkpoint()
        roles = _diagnostic_roles(setup)
        for fd in (0, 3):
            with contextlib.closing(_unix_stream(fd)):
                roles.append((fd, _descriptor_role(fd, stat.S_IFSOCK, os.O_RDWR), os.O_RDWR))
        roles.append((status_fd, _descriptor_role(status_fd, stat.S_IFIFO, os.O_WRONLY), os.O_WRONLY))
        roles.append((setup.lease, _descriptor_role(setup.lease, stat.S_IFREG, os.O_WRONLY, True), os.O_WRONLY))
        if len({(key[0], key[1]) for _, key, _ in roles}) != 6:
            raise InventoryError("child_descriptor_alias")
        null_key = _descriptor_role_key(os.stat("/dev/null", follow_symlinks=False))
        if not stat.S_ISCHR(null_key[2]):
            raise InventoryError("child_null_device")
        binding = ChildDescriptorRoles(status_fd, setup.lease, tuple(sorted(roles)), null_key)
        setup.checkpoint()
        if _diagnostic_roles(setup) != roles[:2]:
            raise InventoryError("child_descriptor_changed")
        _verify_child_roles(binding, False)
        return binding
    except OSError:
        raise InventoryError("child_descriptor_binding") from None


def bind_child_input(binding):
    """Post-gate child only: replace control stdin with captured /dev/null.

    Never call in the parent/test runner. Failure requires child exit; partial
    transfer is never restored. Tests mock every open/dup2/close operation.
    """
    try:
        _verify_child_roles(binding, False)
        fd = os.open("/dev/null", os.O_RDONLY | os.O_NOFOLLOW | os.O_CLOEXEC)
        try:
            if _descriptor_role(fd, stat.S_IFCHR, os.O_RDONLY) != binding.null_key:
                raise InventoryError("child_null_device")
            os.dup2(fd, 0, inheritable=True)
        finally:
            os.close(fd)
        _verify_child_roles(binding, True)
    except OSError:
        raise InventoryError("child_input_unconfirmed") from None


def finalize_child_descriptors(binding):
    """Post-containment, single-threaded child only; next action must be exec.

    Role verification allocates no descriptors. No callback/thread/signal
    handler may allocate one before exec; lifetime/reaping remains caller-owned.
    """
    try:
        _verify_child_roles(binding, True)
        close_reply_descriptors(binding.status_fd, binding.lease_fd)
        _verify_child_roles(binding, True)
    except OSError:
        raise InventoryError("child_descriptor_binding") from None


def _owned_gated_identity(pid, parent):
    if type(pid) is not int or not 1 <= pid <= 2_147_483_647 or pid == parent.pid:
        raise InventoryError("child_identity_invalid")
    flags = os.WEXITED | os.WNOHANG | os.WNOWAIT
    if os.waitid(os.P_PID, pid, flags) is not None:
        raise InventoryError("child_not_live")
    child = _read_process_identity(pid, "launcher")  # Inherited pre-exec argv.
    if (child.pid != pid or child.boot_id != parent.boot_id or child.nonce != parent.nonce or
            child.executable != parent.executable):
        raise InventoryError("child_preexec_changed")
    if os.waitid(os.P_PID, pid, flags) is not None:
        raise InventoryError("child_not_live")
    return child


def _prepared_lease_bytes(setup, signature):
    _verify_prepared_lease(setup.request, setup.lease, setup.root_identity)
    home = setup.request.root + "/" + setup.request.attempt
    with _absolute_directory(home) as directory, _lease_file(directory) as named:
        if _lease_signature(named) != signature:
            raise InventoryError("lease_changed")
        data = os.pread(named, LEASE_LIMIT + 1, 0)
        if len(data) != signature[1] or _lease_signature(named) != signature:
            raise InventoryError("lease_changed")
    return data


def _recording_checkpoint(setup, inode):
    _root_checkpoint(setup.request, setup.root_identity, setup.control)
    _verify_prepared_lease(setup.request, setup.lease, setup.root_identity)
    if _lease_signature(setup.lease)[0] != inode:
        raise InventoryError("lease_changed")


@dataclass(frozen=True)
class RecordedReplyChild:
    setup: PreparedReplySetup
    gate_identity: ProcessIdentity
    identity: ProcessIdentity
    lease_signature: tuple


def _recorded_checkpoint(record):
    setup = record.setup
    if setup.refusal != "child_recorded":
        raise InventoryError("child_record_unavailable")
    try:
        _recording_checkpoint(setup, record.lease_signature[0])
        if _lease_signature(setup.lease) != record.lease_signature:
            raise InventoryError("lease_changed")
    except (OSError, InventoryError):
        setup.refusal = "child_record_fence_unconfirmed"
        raise


def _child_record_line(identity):
    value = {"pid": identity.pid, "startTime": identity.start_time, "bootId": identity.boot_id,
             "executable": identity.executable, "nonce": identity.nonce}
    _process_identity(value)
    return json.dumps({"version": 1, "kind": "child", "identity": value},
                      separators=(",", ":")).encode("utf-8") + b"\n"


def _original_child_lease(setup):
    setup.checkpoint()
    data = _prepared_lease_bytes(setup, setup.lease_signature)
    records = parse_lease(data)
    if not records.fork_record or records.child is not None or records.tail != "none":
        raise InventoryError("child_already_recorded")
    if (records.launcher.pid != os.getpid() or
            _read_process_identity(os.getpid(), "launcher") != records.launcher or
            records.launcher.nonce != setup.request.nonce):
        raise InventoryError("launcher_identity_mismatch")
    return data, records.launcher


def record_reply_child(setup, pid):
    """Append one child identity while it is still behind an unopened gate.

    The caller owns its fresh unreaped fork and retains setup/life lock through
    settlement. This neither forks nor opens a gate. Partial writes stay; the
    old setup signature is never reset or reused after recording starts.
    """
    if not isinstance(setup, PreparedReplySetup) or not _process_support():
        raise InventoryError("child_record_unavailable")
    try:
        data, parent = _original_child_lease(setup)
        observed = _owned_gated_identity(pid, parent)
        identity = ProcessIdentity(pid, observed.start_time, observed.boot_id, setup.request.node, observed.nonce)
        line = _child_record_line(identity)
        if len(data) + len(line) > LEASE_LIMIT or os.lseek(setup.lease, 0, os.SEEK_CUR) != len(data):
            raise InventoryError("lease_append_position")
        setup.checkpoint()
        setup.refusal = "child_recording"  # Sticky on all partial/uncertain failures.
        def checkpoint():
            _recording_checkpoint(setup, setup.lease_signature[0])
        _write_records(setup.lease, line, checkpoint, setup.control.deadline)
        checkpoint()
        signature = _lease_signature(setup.lease)
        if _prepared_lease_bytes(setup, signature) != data + line:
            raise InventoryError("lease_changed")
        if _owned_gated_identity(pid, parent) != observed:
            raise InventoryError("child_preexec_changed")
        setup.refusal = "child_recorded"
        record = RecordedReplyChild(setup, observed, identity, signature)
        _recorded_checkpoint(record)
        return record
    except (OSError, AttributeError, ValueError):
        raise InventoryError("child_record_unconfirmed") from None


@contextlib.contextmanager
def retained_reply_pidfd(record):
    """Retain a pidfd after durable recording; does not signal or reap.

    No gate authorization is implied by fd creation. Caller must recheck its
    namespace/control immediately before opening the gate and own settlement.
    Never use the pre-exec identity check after the child is allowed to exec.
    """
    if not isinstance(record, RecordedReplyChild) or not _process_support():
        raise InventoryError("child_record_unavailable")
    fd = None
    try:
        _recorded_checkpoint(record)
        parent = _read_process_identity(os.getpid(), "launcher")
        if _owned_gated_identity(record.identity.pid, parent) != record.gate_identity:
            raise InventoryError("child_preexec_changed")
        fd = os.pidfd_open(record.identity.pid, 0)
        _recorded_checkpoint(record)
        if _owned_gated_identity(record.identity.pid, parent) != record.gate_identity:
            raise InventoryError("child_preexec_changed")
        yield fd
    except (OSError, AttributeError, ValueError):
        raise InventoryError("child_pidfd_unconfirmed") from None
    finally:
        if fd is not None:
            try:
                os.close(fd)  # Once only; uncertain close must remain a failure.
            except OSError:
                raise InventoryError("child_pidfd_close_unconfirmed") from None


@dataclass(frozen=True)
class ChildSettlement:
    state: str
    status: Optional[int] = None


def _pidfd_child_status(result, pid):
    if result is None:
        return None
    if type(result.si_pid) is not int or result.si_pid != pid:
        raise InventoryError("child_wait_identity")
    code, status = result.si_code, result.si_status
    if type(code) is not int or type(status) is not int:
        raise InventoryError("child_wait_status")
    if code == os.CLD_EXITED and 0 <= status <= 255:
        return ChildSettlement("exited", status)
    if code in (os.CLD_KILLED, os.CLD_DUMPED) and 0 < status < signal.NSIG:
        return ChildSettlement("signalled", status)
    raise InventoryError("child_wait_status")


def _numeric_child_status(result, pid):
    observed, status = result
    if type(observed) is not int or type(status) is not int:
        raise InventoryError("child_wait_status")
    if observed == 0 and status == 0:
        return None
    if observed != pid or not 0 <= status <= 65535:
        raise InventoryError("child_wait_identity")
    if os.WIFEXITED(status):
        return ChildSettlement("exited", os.WEXITSTATUS(status))
    if os.WIFSIGNALED(status) and 0 < os.WTERMSIG(status) < signal.NSIG:
        return ChildSettlement("signalled", os.WTERMSIG(status))
    raise InventoryError("child_wait_status")


class ReplyChildReaper:
    """One fresh owned child, with an optionally borrowed retained pidfd.

    The caller owns the fork, unopened gate and descriptor lifetime. This object
    neither discovers/adopts a child nor closes its pidfd. Never construct a new
    instance to retry an uncertain or reaped child. Missing/error/late evidence
    remains unknown; only an actual terminal wait result establishes settlement.
    """
    def __init__(self, pid, pidfd=None):
        if not _process_support() or type(pid) is not int or not 1 <= pid <= 2_147_483_647:
            raise InventoryError("child_wait_unavailable")
        if pid == os.getpid():
            raise InventoryError("child_wait_identity")
        if pidfd is not None and (type(pidfd) is not int or not 4 <= pidfd <= 2_147_483_647):
            raise InventoryError("child_wait_unavailable")
        self.pid, self.pidfd = pid, pidfd
        self.outcome = None

    def poll(self):
        if self.outcome is not None:
            return self.outcome
        try:
            if self.pidfd is None:
                result = os.waitpid(self.pid, os.WNOHANG)
                outcome = _numeric_child_status(result, self.pid)
            else:
                result = os.waitid(os.P_PIDFD, self.pidfd, os.WEXITED | os.WNOHANG)
                outcome = _pidfd_child_status(result, self.pid)
            self.outcome = outcome
        except InterruptedError:
            return None  # No observation; the caller's original deadline remains.
        except (OSError, InventoryError, AttributeError, TypeError, ValueError):
            self.outcome = ChildSettlement("unknown")
        return self.outcome

    def send(self, requested):
        if (self.pidfd is None or not isinstance(requested, int) or
                requested not in (signal.SIGTERM, signal.SIGKILL)):
            raise InventoryError("child_signal_unavailable")
        if self.poll() is not None:
            return False
        try:
            signal.pidfd_send_signal(self.pidfd, requested, None, 0)
            return True
        except OSError:
            # ESRCH is no reap receipt. Never fall back to a numeric signal.
            self.outcome = ChildSettlement("unknown")
            return False

    def wait(self, deadline):
        if self.outcome is not None:
            return self.outcome
        now = time.monotonic()
        if type(deadline) not in (int, float) or not 0 <= deadline <= now + 12:
            self.outcome = ChildSettlement("unknown")
            return self.outcome
        while time.monotonic() < deadline:
            outcome = self.poll()
            if time.monotonic() >= deadline:
                break
            if outcome is not None:
                return outcome
            time.sleep(max(0, min(0.05, deadline - time.monotonic())))
        self.outcome = ChildSettlement("unknown")
        return self.outcome


def _owned_reply_pipe():
    pair = os.pipe2(os.O_CLOEXEC)
    try:
        for fd, access in zip(pair, (os.O_RDONLY, os.O_WRONLY)):
            if not 4 <= fd <= 2_147_483_647 or os.get_inheritable(fd):
                raise InventoryError("child_pipe_identity")
            _descriptor_role(fd, stat.S_IFIFO, access)
        return pair
    except BaseException:
        for fd in pair:
            try:
                os.close(fd)
            except OSError:
                pass  # Already failing; never retry an uncertain descriptor close.
        raise


def _gate_reaper(record, reaper):
    if not isinstance(record, RecordedReplyChild) or not isinstance(reaper, ReplyChildReaper):
        raise InventoryError("child_gate_binding")
    if reaper.pid != record.identity.pid or reaper.pidfd is None or reaper.poll() is not None:
        raise InventoryError("child_gate_unavailable")


def _gate_descriptors(lease_fd, binding, status_fd):
    if not isinstance(binding, ChildDescriptorRoles):
        raise InventoryError("child_gate_binding")
    if binding.lease_fd != lease_fd or binding.status_fd != status_fd:
        raise InventoryError("child_gate_binding")
    keys = [key for fd, key, _ in binding.roles if fd == 3]
    if len(keys) != 1 or _descriptor_role(3, stat.S_IFSOCK, os.O_RDWR) != keys[0]:
        raise InventoryError("child_relay_changed")


def _gate_child_binding(record, reaper, binding, status_fd):
    _gate_reaper(record, reaper)
    _gate_descriptors(record.setup.lease, binding, status_fd)
    _recorded_checkpoint(record)


class ReplyParentPipes:
    """Fresh pipe ownership across one fork; parent branch only after it.

    The child receives plain descriptor numbers and must never unwind this
    parent's cleanup. Gate state is one-shot, not process settlement evidence.
    Caller retains original child record, pidfd, lease and relay binding.
    """
    def __init__(self):
        if not _process_support():
            raise InventoryError("child_pipe_unavailable")
        self.state = "allocating"
        self.gate_read = self.gate_write = self.status_read = self.status_write = None
        try:
            self.gate_read, self.gate_write = _owned_reply_pipe()
            self.status_read, self.status_write = _owned_reply_pipe()
            self.gate_key = _descriptor_role(self.gate_write, stat.S_IFIFO, os.O_WRONLY)
            self.original_status_write = self.status_write
            os.set_blocking(self.gate_write, False)
            self.state = "fresh"
        except BaseException:
            self.close()
            raise

    def _close_end(self, name):
        fd = getattr(self, name)
        setattr(self, name, None)  # Forget before close: an uncertain fd is never retried.
        if fd is not None:
            os.close(fd)

    def close(self):
        self.state = "closed"
        failed = False
        for name in ("gate_read", "gate_write", "status_read", "status_write"):
            try:
                self._close_end(name)
            except OSError:
                failed = True
        if failed:
            raise InventoryError("child_pipe_close_unconfirmed")

    def after_fork(self):
        if self.state != "fresh":
            raise InventoryError("child_pipe_unavailable")
        self.state = "parent_failed"
        try:
            self._close_end("gate_read")
            self._close_end("status_write")
            self.state = "parent"
        except OSError:
            raise InventoryError("child_pipe_close_unconfirmed") from None

    def open_gate(self, record, reaper, binding):
        if self.state != "parent":
            raise InventoryError("child_gate_unavailable")
        self.state = "gate_attempted"
        try:
            _gate_child_binding(record, reaper, binding, self.original_status_write)
            if _descriptor_role(self.gate_write, stat.S_IFIFO, os.O_WRONLY) != self.gate_key:
                raise InventoryError("child_gate_changed")
            os.close(3)  # Original parent relay copy; the child retains its copy.
            _recorded_checkpoint(record)
            if os.write(self.gate_write, b"G") != 1:
                raise InventoryError("child_gate_write_unconfirmed")
            self.state = "opened"
        except OSError:
            raise InventoryError("child_gate_unconfirmed") from None
        finally:
            try:
                self._close_end("gate_write")
            except OSError:
                self.state = "gate_attempted"
                raise InventoryError("child_pipe_close_unconfirmed") from None


@dataclass(frozen=True)
class ReplyChildStart:
    launcher_pid: int
    gate_read: int
    gate_write: int
    status_read: int
    descriptors: ChildDescriptorRoles


def _validate_child_start(start):
    if not isinstance(start, ReplyChildStart) or not isinstance(start.descriptors, ChildDescriptorRoles):
        raise InventoryError("child_start_invalid")
    if type(start.launcher_pid) is not int or not 1 <= start.launcher_pid <= 2_147_483_647:
        raise InventoryError("child_start_invalid")
    fds = (start.gate_read, start.gate_write, start.status_read,
           start.descriptors.status_fd, start.descriptors.lease_fd)
    if any(type(fd) is not int or not 4 <= fd <= 2_147_483_647 for fd in fds) or len(set(fds)) != 5:
        raise InventoryError("child_start_invalid")


def await_reply_gate(start):
    """Owned post-fork child only. No content open/write/exec before the gate.

    Parent preparation must leave SIGALRM default and unblocked across fork.
    Its unused pipe ends close here so parent death produces gate EOF. Failure
    requires immediate child exit; inherited lease/fds remain until then.
    """
    _validate_child_start(start)
    if not _process_support():
        raise InventoryError("child_platform_unavailable")
    try:
        signal.alarm(10)
        if (signal.getsignal(signal.SIGALRM) != signal.SIG_DFL or
                signal.SIGALRM in signal.pthread_sigmask(signal.SIG_BLOCK, set())):
            raise InventoryError("child_alarm_unconfirmed")
        os.close(start.gate_write)
        os.close(start.status_read)
        _set_parent_death()
        if os.getppid() != start.launcher_pid:
            raise InventoryError("child_parent_changed")
        try:
            byte = os.read(start.gate_read, 1)
        finally:
            os.close(start.gate_read)
        if byte != b"G":
            raise InventoryError("child_gate_closed")
    except (OSError, ValueError, AttributeError):
        raise InventoryError("child_gate_unconfirmed") from None


def exec_reply_child(request, capabilities, system_reads, binding):
    """Post-gate composition only; any return or exception requires child exit.

    The caller owns the durable gate decision and original captured descriptors.
    Credentials are intentionally absent until D4 is bound and authorized.
    Every process-wide operation is mocked in local tests; no CLI calls this.
    """
    request = _validated_run(request)
    environment = reply_child_environment(request)
    argv = [request.node, request.entry, "--profile", request.profile_name]
    work = request.root + "/" + request.attempt + "/work"
    bind_child_input(binding)
    install_reply_landlock(request, capabilities, system_reads)
    install_reply_seccomp()
    finalize_child_descriptors(binding)
    # No descriptor allocation or callback occurs between finalization and exec.
    os.chdir(work)
    signal.alarm(0)
    os.execve(request.node, argv, environment)
    raise InventoryError("child_exec_returned")


def _notify_child_failure(status_fd):
    # Only after gate approval. Each channel is best effort, bounded, and carries
    # no exception text. Parent must also observe/reap the actual child.
    try:
        os.set_blocking(status_fd, False)
        os.write(status_fd, b"F")
    except OSError:
        pass
    try:
        with contextlib.closing(_unix_stream(3)) as stream:
            stream.send(b'{"t":"status","s":"failed","code":"containment_unavailable"}\n',
                        socket.MSG_DONTWAIT | socket.MSG_NOSIGNAL)
    except (OSError, InventoryError, AttributeError):
        pass


def run_reply_child(request, capabilities, system_reads, start):
    """Terminal child branch only. Never unwinds parent-owned setup contexts.

    Exit does not itself establish parent-observed settlement. The calling parent
    must bind/reap its child and reconcile simultaneous status EOF/death events.
    """
    approved = False
    code = 69
    try:
        await_reply_gate(start)
        approved = True
        exec_reply_child(request, capabilities, system_reads, start.descriptors)
    except InventoryError as error:
        if not approved:
            code = {"child_gate_closed": 118, "child_parent_changed": 119}.get(str(error), 69)
    except BaseException:
        # No child-side Python cleanup may unwind borrowed parent resources.
        pass
    finally:
        try:
            if approved:
                _notify_child_failure(start.descriptors.status_fd)
        finally:
            os._exit(code)


class RuntimeReplyControl:
    """Transfer the already-owned control stream after verified exec only."""
    def __init__(self, control):
        if not isinstance(control, SetupControl) or control.refusal is not None:
            raise InventoryError("runtime_control_unavailable")
        self.stream, self.pending = control.stream, control.pending
        self.ended = False
        control.pending = b""
        control.refusal = "control_transferred"

    def _end(self):
        self.ended, self.pending = True, b""
        return signal.SIGKILL

    def _command(self):
        if b"\n" not in self.pending:
            if not any(value.startswith(self.pending) for value in (b"TERM", b"KILL")):
                return self._end()
            return None
        command, self.pending = self.pending.split(b"\n", 1)
        if command == b"TERM":
            return signal.SIGTERM
        return self._end()  # KILL or malformed input both stop, never expand authority.

    def poll(self):
        if self.ended:
            return signal.SIGKILL
        if b"\n" in self.pending:
            return self._command()
        try:
            data = self.stream.recv(16, socket.MSG_DONTWAIT)
        except BlockingIOError:
            return self._command()
        except OSError:
            return self._end()
        if not data or len(self.pending) + len(data) > 20:
            return self._end()
        self.pending += data
        return self._command()


def _settlement_exit(outcome):
    if outcome.state == "exited":
        return 0 if outcome.status == 0 else 75
    return 76 if outcome.state == "signalled" else 74


def _kill_and_settle(reaper, code=None):
    try:
        deadline = time.monotonic() + 12
        reaper.send(signal.SIGKILL)
        outcome = reaper.wait(deadline)
        if outcome.state not in ("exited", "signalled"):
            return 74
        return _settlement_exit(outcome) if code is None else code
    except (OSError, InventoryError, ValueError):
        return 74  # Never retry a signal/wait or mint another settlement deadline.


def _preexec_failure_code(error, fallback):
    if not isinstance(error, InventoryError):
        return fallback
    return {"cancelled": 72, "control_invalid": 72, "control_unconfirmed": 72,
            "setup_deadline": 73}.get(str(error), fallback)


def _exec_status(record, pipes, reaper):
    outcome = reaper.poll()
    if outcome is not None:
        return 74 if outcome.state == "unknown" else 69
    _recorded_checkpoint(record)
    try:
        byte = os.read(pipes.status_read, 1)
    except BlockingIOError:
        return None
    if byte:
        return 69
    # CLOEXEC EOF can also be process death. Require the intended live image,
    # not just a closed pipe, and reconcile any terminal result on both sides.
    if _read_process_identity(record.identity.pid, "child") != record.identity:
        return 69
    _recorded_checkpoint(record)
    outcome = reaper.poll()
    if outcome is not None:
        return 74 if outcome.state == "unknown" else 69
    return 0


def wait_reply_exec(record, pipes, reaper):
    """Post-gate only. Zero means observed exec, never provider health."""
    deadline = min(record.setup.control.deadline, time.monotonic() + 10)
    try:
        _descriptor_role(pipes.status_read, stat.S_IFIFO, os.O_RDONLY)
        os.set_blocking(pipes.status_read, False)
        while time.monotonic() < deadline:
            code = _exec_status(record, pipes, reaper)
            if time.monotonic() >= deadline:
                return 73
            if code is not None:
                return code
            time.sleep(max(0, min(0.05, deadline - time.monotonic())))
        return 73
    except InventoryError as error:
        return _preexec_failure_code(error, 69)
    except (OSError, ValueError):
        return 69


def monitor_reply_runtime(control, reaper):
    """No content reads. Bridge owns TERM/KILL timing; EOF always requests kill."""
    channel = RuntimeReplyControl(control)
    while True:
        outcome = reaper.poll()
        if outcome is not None:
            return _settlement_exit(outcome)
        command = channel.poll()
        if command is not None:
            if command == signal.SIGKILL:
                return _kill_and_settle(reaper)
            reaper.send(command)
        time.sleep(0.05)


def _settle_closed_gate(pipes, pid, code):
    failed = False
    try:
        pipes._close_end("gate_write")
    except OSError:
        failed = True
    outcome = ReplyChildReaper(pid).wait(time.monotonic() + 12)
    return code if not failed and outcome.state in ("exited", "signalled") else 74


def _bound_reply_parent(record, pipes, reaper, binding):
    try:
        pipes.open_gate(record, reaper, binding)
        code = wait_reply_exec(record, pipes, reaper)
        if code:
            return _kill_and_settle(reaper, code)
        signal.alarm(0)
        return monitor_reply_runtime(record.setup.control, reaper)
    except (OSError, InventoryError) as error:
        # Gate errors may follow a delivered G. Never treat them as no-exec.
        return _kill_and_settle(reaper, _preexec_failure_code(error, 69))


def _run_reply_parent(setup, pipes, pid, binding):
    try:
        pipes.after_fork()
        record = record_reply_child(setup, pid)
    except (OSError, InventoryError) as error:
        return _settle_closed_gate(pipes, pid, _preexec_failure_code(error, 77))
    bound = False
    try:
        with retained_reply_pidfd(record) as pidfd:
            bound = True
            reaper = ReplyChildReaper(pid, pidfd)
            return _bound_reply_parent(record, pipes, reaper, binding)
    except (OSError, InventoryError) as error:
        # After yielding, a failed pidfd close may follow execution/reaping.
        # It must not create a fresh reaper or reset any uncertain outcome.
        return 74 if bound else _settle_closed_gate(pipes, pid, _preexec_failure_code(error, 69))


def _parent_result(setup, pipes, pid, binding):
    result = 74
    try:
        result = _run_reply_parent(setup, pipes, pid, binding)
    except (OSError, InventoryError):
        pass  # A fork already happened; an uncompleted parent path is unknown.
    finally:
        try:
            pipes.close()
        except (OSError, InventoryError):
            result = 74
    return result


def run_prepared_reply(setup, system_reads):
    """Dedicated launcher only; no operational caller or target qualification.

    The outer prepared_reply_setup context must retain the original lease,
    control and diagnostics until this returns. Every process effect is mocked
    by local tests. Execution CLI remains disabled; no provider route is selected.
    """
    if not isinstance(setup, PreparedReplySetup):
        raise InventoryError("setup_unavailable")
    capabilities = query_linux_capabilities(setup.checkpoint)
    _landlock_rules(setup.request, capabilities, system_reads)
    setup.redirect_diagnostics()
    pipes = ReplyParentPipes()
    try:
        binding = capture_child_descriptor_roles(setup, pipes.status_write)
        start = ReplyChildStart(os.getpid(), pipes.gate_read, pipes.gate_write, pipes.status_read, binding)
        _validate_child_start(start)
        setup.checkpoint()
        pid = os.fork()
    except BaseException:
        pipes.close()
        raise
    if pid == 0:
        try:
            run_reply_child(setup.request, capabilities, system_reads, start)
        finally:
            os._exit(69)  # Defensive: child must never unwind parent contexts.
    return _parent_result(setup, pipes, pid, binding)


def _sweep_deadline(deadline):
    if time.monotonic() >= deadline:
        raise InventoryError("sweep_deadline")


@contextlib.contextmanager
def _sweep_lease(home, checkpoint):
    """Retain the named lease while verifying even a still-held life lock.

    A busy life lock permits verified process termination, never a settled
    verdict. Exact snapshot changes abort this pass; no append is guessed.
    """
    with _absolute_directory(posixpath.dirname(home)) as root_fd, _absolute_directory(home) as home_fd:
        with _lease_file(home_fd) as fd:
            try:
                _life_lock(fd)
            except InventoryError as error:
                if str(error) != "life_lock_held":
                    raise
            signature = _lease_signature(fd)
            data = os.pread(fd, LEASE_LIMIT + 1, 0)
            if len(data) != signature[1] or _lease_signature(fd) != signature:
                raise InventoryError("lease_changed")
            records = parse_lease(data)
            if not records.fork_record:
                raise InventoryError("lease_incomplete")

            def verify():
                checkpoint()
                _verify_lease_path(home, root_fd, home_fd, signature)
                if os.pread(fd, LEASE_LIMIT + 1, 0) != data:
                    raise InventoryError("lease_changed")
                checkpoint()

            verify()
            yield records, fd, verify
            verify()


def _open_sweep_process(stack, identity, kind, checkpoint):
    checkpoint()
    try:
        fd = os.pidfd_open(identity.pid, 0)
    except OSError as error:
        if error.errno == errno.ESRCH:
            return None
        raise
    stack.callback(os.close, fd)
    observed = _observe_pidfd(identity, kind, fd)
    checkpoint()
    if observed.state == "gone":
        return None
    if observed.state != "live":
        raise InventoryError("process_unconfirmed")
    return identity, kind, fd


def _kill_sweep_process(entry, checkpoint):
    identity, kind, fd = entry
    checkpoint()
    observed = _observe_pidfd(identity, kind, fd)
    if observed.state == "gone":
        return False
    if observed.state != "live":
        raise InventoryError("process_unconfirmed")
    checkpoint()
    try:
        signal.pidfd_send_signal(fd, signal.SIGKILL, None, 0)
    except OSError as error:
        if error.errno != errno.ESRCH:
            raise
        return False
    return True


def _wait_sweep_processes(entries, deadline, checkpoint):
    pending = {entry[2] for entry in entries}
    poller = select.poll()
    for fd in pending:
        poller.register(fd, select.POLLIN)
    while pending:
        _sweep_deadline(deadline)
        checkpoint()
        events = poller.poll(0)
        checkpoint()
        for fd, event in events:
            if fd not in pending or event & (select.POLLERR | select.POLLNVAL) or not event & select.POLLIN:
                raise InventoryError("process_wait_unconfirmed")
            pending.remove(fd)
            poller.unregister(fd)
        _sweep_deadline(deadline)
        if pending:
            time.sleep(max(0, min(0.05, deadline - time.monotonic())))


def _wait_sweep_life(fd, deadline, checkpoint):
    while True:
        _sweep_deadline(deadline)
        checkpoint()
        try:
            _life_lock(fd)
        except InventoryError as error:
            if str(error) != "life_lock_held":
                raise
            time.sleep(max(0, min(0.05, deadline - time.monotonic())))
        else:
            checkpoint()
            _sweep_deadline(deadline)
            return


def _settle_sweep_lease(lease, deadline):
    records, fd, checkpoint = lease
    if not _process_support():
        raise InventoryError("process_capability_unavailable")
    identities = [(records.launcher, "launcher")]
    if records.child is not None:
        identities.insert(0, (records.child, "child"))
    with contextlib.ExitStack() as stack:
        # Verify all entries before any kill. Keep each original pidfd until exit.
        entries = [_open_sweep_process(stack, identity, kind, checkpoint) for identity, kind in identities]
        live = [entry for entry in entries if entry is not None]
        signalled = [_kill_sweep_process(entry, checkpoint) for entry in live]
        _wait_sweep_processes(live, deadline, checkpoint)
        _wait_sweep_life(fd, deadline, checkpoint)
    checkpoint()
    return ProcessObservation("stopped", "recorded_processes_stopped") if any(signalled) else \
        ProcessObservation("gone", "recorded_processes_gone")


def _sweep_home(stack, root_fd, scope, deadline, checkpoint):
    root, attempt = scope
    identity = _home_identity(root_fd, attempt)
    if identity is None:
        return ProcessObservation("absent", "home_absent")
    home_fd = stack.enter_context(_directory(attempt, root_fd))
    _private_directory(home_fd)
    if _identity(os.fstat(home_fd)) != identity:
        raise InventoryError("home_changed")
    if _empty_directory(home_fd):
        stack.callback(_verify_empty, home_fd)
        return ProcessObservation("empty", "home_empty")
    with _sweep_lease(root + "/" + attempt, checkpoint) as lease:
        return _settle_sweep_lease(lease, deadline)


def _sweep_result(scope, operation):
    root, attempt = scope
    try:
        result = operation()
    except (OSError, ValueError, InventoryError) as error:
        token = str(error) if isinstance(error, InventoryError) else ""
        if token in ("admission_open", "life_lock_held"):
            result = ProcessObservation("unsettled", token)
        elif token == "lease_incomplete":
            result = ProcessObservation("unresolved", token)
        else:
            result = ProcessObservation("unresolved", "sweep_unconfirmed")
    return CheckObservation(attempt, root, result.state, result.reason)


def _sweep_generation(stack, scope, deadline, checkpoint):
    root, _attempt = scope
    remaining = int((deadline - time.monotonic()) * 1000)
    if remaining < 1:
        raise InventoryError("sweep_deadline")

    def observe():
        root_fd = stack.enter_context(drain_generation(root, min(500, remaining)))
        return _sweep_home(stack, root_fd, scope, deadline, checkpoint)

    return _sweep_result(scope, observe)


def _sweep_arguments(attempt, wait_ms):
    if (not isinstance(attempt, str) or BOOT_ID.fullmatch(attempt) is None or
            type(wait_ms) is not int or not 1 <= wait_ms <= 12_000):
        raise InventoryError("sweep_arguments")


def sweep_attempt(replies, attempt, current_root, wait_ms=12_000):
    """Internal bounded sweep; no deletion and no operational CLI activation.

    Caller supplies the trusted current generation and must fence future spawns.
    All roots are inventoried before effects; an unsealed older root refuses.
    A stopped result covers recorded pidfds plus the life lock, not provider
    accounting, delivery, erasure or permission to retire the home. An external
    caller deadline still bounds stuck syscalls. Local process effects are mocked.
    """
    _sweep_arguments(attempt, wait_ms)
    deadline = time.monotonic() + wait_ms / 1000
    with contextlib.ExitStack() as stack:
        fd = stack.enter_context(_absolute_directory(replies))
        names = _root_names(fd)
        if not isinstance(current_root, str) or current_root not in names or not current_root.startswith("gen-"):
            raise InventoryError("current_root_missing")
        snapshot = _observe_roots(fd, names, attempt)

        def checkpoint():
            _sweep_deadline(deadline)
            _verify_check_snapshot(replies, fd, names, snapshot, attempt)
            _sweep_deadline(deadline)

        if any(name.startswith("gen-") and name != current_root for name in names):
            checkpoint()
            return tuple(CheckObservation(attempt, replies + "/" + name, "unresolved", "generation_unsealed")
                         for name in names)
        results = [_sweep_generation(stack, (replies + "/" + name, attempt), deadline, checkpoint)
                   for name in names]
        checkpoint()
    _sweep_deadline(deadline)
    return tuple(results)


SWEEP_HOME_LIMIT = 256


def _sweep_home_names(root_fd):
    homes = []
    with os.scandir(root_fd) as entries:
        for entry in entries:
            if entry.name == ".admit":
                continue
            if len(homes) == SWEEP_HOME_LIMIT or BOOT_ID.fullmatch(entry.name) is None:
                raise InventoryError("sweep_inventory_invalid")
            identity = _home_identity(root_fd, entry.name)
            if identity is None:
                raise InventoryError("namespace_changed")
            homes.append((entry.name, identity))
    return tuple(sorted(homes))


def _sweep_tree_entries(roots):
    snapshot = []
    seen = set()
    for name, (root_fd, lock_fd) in roots.items():
        homes = _sweep_home_names(root_fd)
        for attempt, _identity_value in homes:
            if attempt in seen:
                raise InventoryError("duplicate_home")
            seen.add(attempt)
            if len(seen) > SWEEP_HOME_LIMIT:
                raise InventoryError("sweep_inventory_limit")
        snapshot.append((name, _identity(os.fstat(root_fd)), _identity(os.fstat(lock_fd)), homes))
    return tuple(snapshot)


def _verify_sweep_tree(replies, root_identity, snapshot):
    with contextlib.ExitStack() as stack:
        fd = stack.enter_context(_absolute_directory(replies))
        names = _root_names(fd)
        if _identity(os.fstat(fd)) != root_identity or names != [row[0] for row in snapshot]:
            raise InventoryError("namespace_changed")
        roots = {}
        for name in names:
            root_fd = stack.enter_context(_directory(name, fd))
            _private_directory(root_fd)
            lock_fd = stack.enter_context(_admission_file(root_fd))
            roots[name] = (root_fd, lock_fd)
        if _sweep_tree_entries(roots) != snapshot:
            raise InventoryError("namespace_changed")


def _sweep_capacity(replies, snapshot):
    size = 0
    for name, _root_identity, _lock_identity, homes in snapshot:
        for attempt, _home_identity_value in homes:
            # Longest emitted state/reason reserve room before the first effect.
            row = {"attemptId": attempt, "root": replies + "/" + name,
                   "state": "unresolved", "reason": "recorded_processes_stopped"}
            size += len(json.dumps(row, separators=(",", ":"), ensure_ascii=True)) + 1
            if size > 65_536:
                raise InventoryError("sweep_report_limit")


def _sweep_all_roots(stack, replies, names, deadline):
    roots = {}
    for name in names:
        remaining = int((deadline - time.monotonic()) * 1000)
        if remaining < 1:
            raise InventoryError("sweep_deadline")
        roots[name] = stack.enter_context(_locked_generation(replies + "/" + name, min(500, remaining)))
    return roots


def _sweep_all_homes(stack, prepared, deadline, checkpoint):
    replies, roots, snapshot = prepared
    results = []
    for name, _root_identity, _lock_identity, homes in snapshot:
        for attempt, _home_identity_value in homes:
            checkpoint()
            scope = (replies + "/" + name, attempt)
            observe = lambda: _sweep_home(stack, roots[name][0], scope, deadline, checkpoint)
            results.append(_sweep_result(scope, observe))
    return tuple(results)


def sweep_all(replies, current_root, wait_ms=12_000):
    """Sweep a bounded complete inventory under all drains and one deadline.

    Only present homes are reported; empty generations emit no invented attempt.
    The caller must still fence future spawns. Limits refuse before effects;
    namespace changes or late results invalidate the entire pass. A failure can
    follow earlier signals and is never proof of no effects. No supervisor activation,
    home deletion, provider accounting or physical host qualification is implied.
    """
    if type(wait_ms) is not int or not 1 <= wait_ms <= 12_000:
        raise InventoryError("sweep_arguments")
    deadline = time.monotonic() + wait_ms / 1000
    with contextlib.ExitStack() as stack:
        fd = stack.enter_context(_absolute_directory(replies))
        names = _root_names(fd)
        if not isinstance(current_root, str) or current_root not in names or not current_root.startswith("gen-"):
            raise InventoryError("current_root_missing")
        if any(name.startswith("gen-") and name != current_root for name in names):
            raise InventoryError("generation_unsealed")
        roots = _sweep_all_roots(stack, replies, names, deadline)
        snapshot = _sweep_tree_entries(roots)
        _sweep_capacity(replies, snapshot)
        root_identity = _identity(os.fstat(fd))

        def checkpoint():
            _sweep_deadline(deadline)
            _verify_sweep_tree(replies, root_identity, snapshot)
            _sweep_deadline(deadline)

        checkpoint()
        results = _sweep_all_homes(stack, (replies, roots, snapshot), deadline, checkpoint)
        checkpoint()
    _sweep_deadline(deadline)
    return results


CHECK_REASONS = {
    "gone": frozenset(("recorded_processes_gone",)),
    "absent": frozenset(("home_absent",)),
    "empty": frozenset(("home_empty",)),
    "unsettled": frozenset(("admission_open", "life_lock_held", "process_live")),
    "unresolved": frozenset(("home_unconfirmed", "process_unconfirmed", "generation_unsealed", "lease_incomplete")),
}


def parse_check_arguments(argv, current_root):
    """Use the supervisor's explicit generation, never a guessed newest root."""
    if (not isinstance(argv, (list, tuple)) or len(argv) != 5 or argv[0] != "check" or
            any(not isinstance(value, str) for value in argv)):
        raise InventoryError("check_arguments")
    values = dict(zip(argv[1::2], argv[2::2]))
    if set(values) != {"--replies", "--attempt"}:
        raise InventoryError("check_arguments")
    replies, attempt = values["--replies"], values["--attempt"]
    if (not _canonical_path(replies) or not _canonical_path(current_root) or
            posixpath.dirname(current_root) != replies or
            re.fullmatch(r"gen-[A-Za-z0-9_-]{1,100}", posixpath.basename(current_root)) is None or
            BOOT_ID.fullmatch(attempt) is None):
        raise InventoryError("check_arguments")
    return replies, attempt, posixpath.basename(current_root)


def _check_report_row(item, replies, attempt):
    if (type(item) is not CheckObservation or item.attempt_id != attempt or
            not _canonical_path(item.root) or posixpath.dirname(item.root) != replies or
            re.fullmatch(r"(?:gen|sealed)-[A-Za-z0-9_-]{1,100}", posixpath.basename(item.root)) is None or
            not isinstance(item.state, str) or item.state not in CHECK_REASONS or
            not isinstance(item.reason, str) or item.reason not in CHECK_REASONS[item.state]):
        raise InventoryError("check_report")
    return {"attemptId": attempt, "root": item.root, "state": item.state, "reason": item.reason}


def _check_report_scope(rows, replies, current_root):
    roots = {row["root"] for row in rows}
    if len(roots) != len(rows) or replies + "/" + current_root not in roots:
        raise InventoryError("check_report")
    settled = all(row["state"] in ("gone", "absent", "empty") for row in rows)
    if settled and sum(row["state"] != "absent" for row in rows) > 1:
        raise InventoryError("check_report")
    return settled


def _report_output(rows, kind):
    output = "".join(json.dumps(row, separators=(",", ":"), ensure_ascii=True) + "\n" for row in rows)
    if len(output.encode("ascii")) > 65_536:
        raise InventoryError(kind + "_report_limit")
    return output


def check_report(observations, replies, attempt, current_root):
    """Buffer the entire closed report before any stdout; nonzero is never proof."""
    if type(observations) is not tuple or not 1 <= len(observations) <= 256:
        raise InventoryError("check_report")
    rows = [_check_report_row(item, replies, attempt) for item in observations]
    settled = _check_report_scope(rows, replies, current_root)
    output = _report_output(rows, "check")
    return (0 if settled else 74), output


def _observation_command(request, observe, report, kind):
    if not _process_support() or fcntl is None:
        print("containment_unavailable", file=sys.stderr)
        return 69
    try:
        observations = observe(*request)
        code, output = report(observations, *request)
        if sys.stdout.write(output) != len(output):
            raise InventoryError(kind + "_output")
        sys.stdout.flush()
        return code
    except (OSError, InventoryError, ValueError):
        # Failure can follow effects/partial stdout; nonzero never proves no effects.
        print(kind + "_unconfirmed", file=sys.stderr)
        return 74


def _check_command(request):
    return _observation_command(request, check_attempt, check_report, "check")



SWEEP_REASONS = {
    "gone": frozenset(("recorded_processes_gone",)),
    "stopped": frozenset(("recorded_processes_stopped",)),
    "absent": frozenset(("home_absent",)),
    "empty": frozenset(("home_empty",)),
    "unsettled": frozenset(("admission_open", "life_lock_held")),
    "unresolved": frozenset(("lease_incomplete", "sweep_unconfirmed")),
}


def parse_sweep_arguments(argv, current_root):
    """The supervisor supplies the generation; callers cannot override its limit."""
    if (not isinstance(argv, (list, tuple)) or len(argv) != 3 or
            argv[0] != "sweep" or argv[1] != "--replies" or
            not _canonical_path(argv[2]) or not _canonical_path(current_root)):
        raise InventoryError("sweep_arguments")
    replies = argv[2]
    if (posixpath.dirname(current_root) != replies or
            re.fullmatch(r"gen-[A-Za-z0-9_-]{1,100}", posixpath.basename(current_root)) is None):
        raise InventoryError("sweep_arguments")
    return replies, posixpath.basename(current_root)


def _sweep_report_identity(item, replies, current_root):
    if (type(item) is not CheckObservation or not isinstance(item.attempt_id, str) or
            BOOT_ID.fullmatch(item.attempt_id) is None or not _canonical_path(item.root) or
            posixpath.dirname(item.root) != replies):
        raise InventoryError("sweep_report")
    name = posixpath.basename(item.root)
    if name != current_root and re.fullmatch(r"sealed-[A-Za-z0-9_-]{1,100}", name) is None:
        raise InventoryError("sweep_report")


def _sweep_report_row(item, replies, current_root):
    _sweep_report_identity(item, replies, current_root)
    if (not isinstance(item.state, str) or item.state not in SWEEP_REASONS or
            not isinstance(item.reason, str) or item.reason not in SWEEP_REASONS[item.state]):
        raise InventoryError("sweep_report")
    return {"attemptId": item.attempt_id, "root": item.root, "state": item.state, "reason": item.reason}


def sweep_report(observations, replies, current_root):
    """A complete sweep may be empty; duplicate logical attempts never pass."""
    if type(observations) is not tuple or len(observations) > 256:
        raise InventoryError("sweep_report")
    rows = [_sweep_report_row(item, replies, current_root) for item in observations]
    if len({row["attemptId"] for row in rows}) != len(rows):
        raise InventoryError("sweep_report")
    output = _report_output(rows, "sweep")
    settled = all(row["state"] in ("gone", "stopped", "absent", "empty") for row in rows)
    return (0 if settled else 74), output


def _sweep_command(request):
    return _observation_command(request, sweep_all, sweep_report, "sweep")



def parse_digest_arguments(argv, runtime):
    if (not isinstance(argv, (list, tuple)) or len(argv) != 2 or argv[0] != "digest" or
            not _canonical_path(argv[1]) or not _canonical_path(runtime)):
        raise InventoryError("digest_arguments")
    return argv[1], runtime


def _digest_output(request):
    deadline = time.monotonic() + 30

    def checkpoint():
        if time.monotonic() >= deadline:
            raise InventoryError("digest_deadline")

    _, digest = template_inventory(*request, checkpoint)
    checkpoint()
    if not isinstance(digest, str) or re.fullmatch(r"sophia-reply-tree-v1:sha256:[0-9a-f]{64}", digest) is None:
        raise InventoryError("digest_result")
    return digest + "\n"


def _digest_command(request):
    """Read only the explicit frozen template; syscall timeout remains external."""
    try:
        output = _digest_output(request)
        if sys.stdout.write(output) != len(output):
            raise InventoryError("digest_output")
        sys.stdout.flush()
        return 0
    except (OSError, InventoryError, ValueError):
        print("digest_unconfirmed", file=sys.stderr)
        return 74


def launcher_command(argv, current_root, runtime=None):
    commands = {"check": (parse_check_arguments, _check_command, current_root),
                "sweep": (parse_sweep_arguments, _sweep_command, current_root),
                "digest": (parse_digest_arguments, _digest_command, runtime)}
    if (not isinstance(argv, (list, tuple)) or not argv or
            not isinstance(argv[0], str) or argv[0] not in commands):
        print("reply_launcher_unimplemented: containment and settlement unqualified", file=sys.stderr)
        return 69
    parser, command, binding = commands[argv[0]]
    try:
        request = parser(argv, binding)
    except InventoryError:
        print(argv[0] + "_arguments", file=sys.stderr)
        return 64
    return command(request)


def main():
    argv = sys.argv[1:]
    if argv and argv[0] == "digest":
        return launcher_command(argv, None, os.environ.get("SOPHIA_REPLY_RUNTIME_DIR"))
    return launcher_command(argv, os.environ.get("SOPHIA_REPLY_ROOT"))


if __name__ == "__main__":
    sys.exit(main())
