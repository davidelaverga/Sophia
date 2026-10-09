"""Verify actual owned-task affinity survives fork/exec without changing the caller."""

import ast, os, pathlib, subprocess, sys, unittest

source = pathlib.Path(__file__).with_name("landlock-launch.py")
function = next(
    node
    for node in ast.parse(source.read_text()).body
    if isinstance(node, ast.FunctionDef) and node.name == "pin_cpu"
)
definition = ast.unparse(function)


@unittest.skipUnless(hasattr(os, "sched_getaffinity"), "Linux affinity API required")
class Affinity(unittest.TestCase):
    def test_owned_child_inherits_across_exec_and_caller_is_unchanged(self):
        original = os.sched_getaffinity(0)
        code = (
            "import os,subprocess,sys,json\n"
            + definition
            + "\nselected=pin_cpu()\n"
            + "got=subprocess.check_output([sys.executable,'-c','import os,json;print(json.dumps(sorted(os.sched_getaffinity(0))))'])\n"
            + "assert json.loads(got)==selected\nassert len(selected)==1\n"
        )
        subprocess.run([sys.executable, "-c", code], check=True, timeout=3)
        self.assertEqual(os.sched_getaffinity(0), original)

    def test_denied_affinity_has_no_unpinned_fallback(self):
        code = (
            "import os\n"
            + definition
            + "\ndef denied(*args): raise PermissionError('synthetic denial')\n"
            + "os.sched_setaffinity=denied\npin_cpu()\n"
        )
        result = subprocess.run([sys.executable, "-c", code], capture_output=True, timeout=3)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn(b"synthetic denial", result.stderr)


if __name__ == "__main__":
    unittest.main()
