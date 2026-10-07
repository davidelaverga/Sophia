"""Deterministic, fresh initramfs with only trusted fixture code and static tools."""

import gzip, pathlib, stat, sys

root = pathlib.Path(sys.argv[1])
output = pathlib.Path(sys.argv[2])
entries = [
    (d, stat.S_IFDIR | 0o755, b"")
    for d in ["bin", "proc", "sys", "dev", "tmp", "target"]
]
for name, path, mode in [
    ("bin/busybox", "/bin/busybox", 0o755),
    ("init", str(root / "guest-init"), 0o755),
    ("guest-run", str(root / "guest-run"), 0o755),
    ("diagnostic.mjs", str(root / "diagnostic.mjs"), 0o644),
    ("abi-probe", "/opt/uml/abi-probe", 0o755),
]:
    entries.append((name, stat.S_IFREG | mode, pathlib.Path(path).read_bytes()))
out = bytearray()
for inode, (name, mode, data) in enumerate(entries + [("TRAILER!!!", 0, b"")], 1):
    n = name.encode() + b"\0"
    fields = [inode, mode, 0, 0, 1, 0, len(data), 0, 0, 0, 0, len(n), 0]
    out.extend(b"070701" + "".join(f"{v:08x}" for v in fields).encode())
    out.extend(n)
    out.extend(b"\0" * (-len(out) % 4))
    out.extend(data)
    out.extend(b"\0" * (-len(out) % 4))
output.write_bytes(gzip.compress(bytes(out), mtime=0))
output.chmod(0o444)
