"""The CI adapter exits only after the original fixture verdict is settled."""

import ast, json, os, pathlib, subprocess, sys, tempfile, unittest

source = pathlib.Path(__file__).with_name("ci-once.py")
function = next(
    node
    for node in ast.parse(source.read_text()).body
    if isinstance(node, ast.FunctionDef) and node.name == "finished"
)


class CIAdapter(unittest.TestCase):
    def test_settled_verdict_is_preserved_and_unsettled_is_refused(self):
        with tempfile.TemporaryDirectory() as directory:
            latch = pathlib.Path(directory) / "latch.json"

            class Paths:
                @staticmethod
                def Path(value):
                    return latch

            world = {"json": json, "pathlib": Paths}
            exec(compile(ast.Module(body=[function], type_ignores=[]), str(source), "exec"), world)
            for status in [0, 1]:
                latch.write_text(json.dumps({"event": "UML_QA_EXIT", "qualification": False, "status": status}))
                with self.assertRaises(SystemExit) as raised:
                    world["finished"]()
                self.assertEqual(raised.exception.code, status)
            for record in [{"event": "started"}, {"event": "UML_QA_EXIT", "qualification": True, "status": 0}]:
                latch.write_text(json.dumps(record))
                with self.assertRaises(RuntimeError):
                    world["finished"]()

    def test_render_use_is_refused_before_driver_runs(self):
        result = subprocess.run(
            [sys.executable, str(source)],
            env={**os.environ, "RENDER_SERVICE_ID": "synthetic-service"},
            capture_output=True,
            timeout=2,
        )
        self.assertNotEqual(result.returncode, 0)
        self.assertIn(b"CI idle adapter must not run on Render", result.stderr)


if __name__ == "__main__":
    unittest.main()
