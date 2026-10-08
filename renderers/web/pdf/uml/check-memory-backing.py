"""Test the actual patched upstream RAM backing function on the build host."""

import pathlib
import subprocess
import sys
import tempfile

source = pathlib.Path(sys.argv[1]).read_text()
start = source.index("int __init create_mem_file(")
end = source.index("\nvoid __init check_tmpexec", start)
implementation = source[start:end]
template = pathlib.Path(__file__).with_name("memory-backing-test.c").read_text()
marker = "/* UML_MEMORY_IMPLEMENTATION */"
if template.count(marker) != 1:
    raise RuntimeError("memory control template changed")
with tempfile.TemporaryDirectory(prefix="uml-memory-controls-") as work:
    work = pathlib.Path(work)
    program = work / "controls.c"
    binary = work / "controls"
    program.write_text(template.replace(marker, implementation))
    subprocess.run(
        ["cc", "-std=gnu11", "-Wall", "-Wextra", "-Werror", "-O2", str(program), "-o", str(binary)],
        check=True,
    )
    subprocess.run([str(binary)], check=True, timeout=30)
