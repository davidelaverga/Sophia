"""One bounded fixture run; never starts/registers a production runner."""

import hashlib, json, os, pathlib, selectors, signal, subprocess, tempfile, time, shutil, sys

root = pathlib.Path("/opt/uml")
latch = pathlib.Path("/tmp/uml-qualification-started.json")
if os.getuid() != 0:
    raise RuntimeError("root supervisor required")


def emit(value):
    print(json.dumps(value), flush=True)


def idle():
    emit(
        {
            "event": "UML_QA_IDLE",
            "qualification": False,
            "action": "operator must collect evidence and suspend the worker",
        }
    )
    while True:
        signal.pause()


if latch.exists():
    emit({"event": "UML_QA_ALREADY_STARTED", "qualification": False})
    idle()
# Written before starting any child: a process restart is not another test.
with latch.open("x") as f:
    json.dump({"event": "started", "qualification": False}, f)
os.chmod(latch, 0o600)


def digest(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for block in iter(lambda: f.read(1024 * 1024), b""):
            h.update(block)
    return h.hexdigest()


def bounded_child(argv, seconds, limit):
    proc = subprocess.Popen(
        [
            sys.executable,
            str(pathlib.Path(__file__).with_name("owned-exec.py")),
            str(os.getpid()),
            *argv,
        ],
        env={"PATH": "/usr/bin:/bin"},
        stdin=subprocess.DEVNULL,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
    )

    def alarm(signum, frame):
        raise TimeoutError("owned child exceeded wall time")

    previous = signal.signal(signal.SIGALRM, alarm)
    signal.setitimer(signal.ITIMER_REAL, seconds)
    read = selectors.DefaultSelector()
    read.register(proc.stdout, selectors.EVENT_READ)
    until = time.monotonic() + seconds
    seen = 0
    pending = b""
    records = {}
    try:
        while read.get_map():
            if time.monotonic() >= until:
                raise RuntimeError("owned child exceeded wall time")
            for key, _ in read.select(min(0.1, max(0, until - time.monotonic()))):
                chunk = os.read(key.fileobj.fileno(), 65536)
                if not chunk:
                    read.unregister(key.fileobj)
                    continue
                seen += len(chunk)
                if seen > limit:
                    raise RuntimeError("owned child exceeded output cap")
                remaining = memoryview(chunk)
                while remaining:
                    written = os.write(1, remaining)
                    if written <= 0:
                        raise RuntimeError("host output sink closed")
                    remaining = remaining[written:]
                pending += chunk
                if len(pending) > 1024 * 1024:
                    raise RuntimeError("owned child exceeded line cap")
                while b"\n" in pending:
                    line, pending = pending.split(b"\n", 1)
                    if not line.startswith(b"{"):
                        continue
                    try:
                        record = json.loads(line)
                    except (ValueError, UnicodeDecodeError):
                        continue
                    if record.get("event") in [
                        "UML_FULL_DIAGNOSTIC",
                        "UML_ORIGINAL_KERNEL_SUITE",
                        "UML_HOST_ADVERSE_CONTROLS",
                        "UML_HOST_POLICY_APPLIED",
                    ]:
                        if record["event"] in records:
                            raise RuntimeError("duplicate evidence event")
                        records[record["event"]] = record

        return proc.wait(timeout=max(0.1, until - time.monotonic())), records
    finally:
        signal.setitimer(signal.ITIMER_REAL, 0)
        signal.signal(signal.SIGALRM, previous)
        read.close()
        proc.stdout.close()
        if proc.poll() is None:
            proc.terminate()
            try:
                proc.wait(timeout=3)
            except subprocess.TimeoutExpired:
                proc.kill()
                proc.wait(timeout=3)


started = time.monotonic()
job = None
result = {"event": "UML_QA_EXIT", "qualification": False}
try:
    service = os.environ.get("RENDER_SERVICE_ID")
    source = os.environ.get("RENDER_GIT_COMMIT")
    expected = os.environ.get("SOPHIA_UML_EXPECTED_SOURCE")
    if service and (
        service != "srv-db3ab3psrm7s73b8gbbg" or not expected or source != expected
    ):
        raise RuntimeError("Render target or approved source mismatch")
    emit(
        {
            "event": "UML_QA_ARTIFACTS",
            "qualification": False,
            "renderService": service,
            "renderSource": source,
            "sha256": {
                n: digest(root / n)
                for n in [
                    "linux.uml",
                    "guest.raw",
                    "initrd.gz",
                    "namespace-launch.py",
                    "landlock-launch.py",
                ]
            },
        }
    )
    if bounded_child([str(root / "abi-probe")], 10, 16384)[0]:
        raise RuntimeError("ordinary Linux seccomp ABI control failed")
    pathlib.Path("/root/sophia-uml-private-secret").write_text("synthetic-not-a-secret")
    os.chmod("/root/sophia-uml-private-secret", 0o400)
    pathlib.Path("/opt/uml-other").mkdir(exist_ok=True)
    pathlib.Path("/opt/uml-other/control").write_text("synthetic-sibling")
    os.chmod("/opt/uml-other/control", 0o644)
    pathlib.Path("/work").mkdir(exist_ok=True)
    job = tempfile.mkdtemp(prefix="uml-qa-", dir="/work")
    os.chown(job, 10001, 10001)
    os.chmod(job, 0o700)
    status, records = bounded_child(
        [
            "/usr/bin/python3",
            str(root / "namespace-launch.py"),
            str(root / "landlock-launch.py"),
            str(root / "linux.uml"),
            str(root / "initrd.gz"),
            job,
            str(root / "guest.raw"),
        ],
        240,
        8 * 1024 * 1024,
    )
    result["guestProcessStatus"] = status
    full = records.get("UML_FULL_DIAGNOSTIC", {})
    suite = records.get("UML_ORIGINAL_KERNEL_SUITE", {})
    policy = records.get("UML_HOST_POLICY_APPLIED", {})
    adverse = records.get("UML_HOST_ADVERSE_CONTROLS", {})
    result["fixtureSuitePassed"] = (
        status == 0
        and full.get("functionalPass") is True
        and full.get("releaseLaunchBudgetPass") is True
        and suite.get("passed") is True
        and policy.get("seccomp") == 2
        and policy.get("landlockABI", 0) >= 4
        and adverse.get("descendant_inherits") is True
    )
    result["status"] = 0 if result["fixtureSuitePassed"] else 1
    result["missingEvents"] = [
        name
        for name in [
            "UML_FULL_DIAGNOSTIC",
            "UML_ORIGINAL_KERNEL_SUITE",
            "UML_HOST_ADVERSE_CONTROLS",
            "UML_HOST_POLICY_APPLIED",
        ]
        if name not in records
    ]
except Exception as error:
    result["status"] = 1
    result["error"] = str(error).split("\n")[0]
finally:
    if job:
        shutil.rmtree(job)
    for sentinel in ["/root/sophia-uml-private-secret", "/opt/uml-other/control"]:
        pathlib.Path(sentinel).unlink(missing_ok=True)
result["elapsedMs"] = round((time.monotonic() - started) * 1000)
latch.write_text(json.dumps(result) + "\n")
emit(result)
# Failure also idles: no service restart loop and no weaker retry.
idle()
