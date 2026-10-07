"""Exercise the real fixture driver's output and wall-time failure boundaries."""

import ast, json, os, pathlib, selectors, signal, subprocess, sys, time, unittest

source = pathlib.Path(__file__).with_name("host-qa.py")
function = next(
    node
    for node in ast.parse(source.read_text()).body
    if isinstance(node, ast.FunctionDef) and node.name == "bounded_child"
)
# Import only the helper: importing the executable would start a root fixture run.
exec(compile(ast.Module(body=[function], type_ignores=[]), str(source), "exec"))


class DriverControls(unittest.TestCase):
    def test_records_and_nonzero_exit(self):
        code = 'import json; print(json.dumps({"event":"UML_HOST_POLICY_APPLIED","seccomp":2})); raise SystemExit(7)'
        status, records = bounded_child([sys.executable, "-c", code], 2, 4096)
        self.assertEqual(status, 7)
        self.assertEqual(records["UML_HOST_POLICY_APPLIED"]["seccomp"], 2)

    def test_output_overflow_is_refused(self):
        with self.assertRaisesRegex(RuntimeError, "output cap"):
            bounded_child([sys.executable, "-c", 'print("x"*200)'], 2, 100)

    def test_wall_timeout_is_refused(self):
        with self.assertRaisesRegex((RuntimeError, TimeoutError), "wall time"):
            bounded_child(
                [sys.executable, "-c", "import time; time.sleep(5)"], 0.1, 4096
            )

    def test_duplicate_evidence_is_refused(self):
        code = 'import json; message=json.dumps({"event":"UML_HOST_POLICY_APPLIED","seccomp":2}); print(message); print(message)'
        with self.assertRaisesRegex(RuntimeError, "duplicate evidence"):
            bounded_child([sys.executable, "-c", code], 2, 4096)


if __name__ == "__main__":
    unittest.main()
