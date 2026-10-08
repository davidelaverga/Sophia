"""Real Linux processes verify parent cancellation and its pre-exec race.

The child PID is observed through its output and held with a pidfd. Cleanup
signals only that owned handle, never a process name or a recycled PID.
"""

import os, pathlib, select, signal, subprocess, sys, unittest

wrapper = pathlib.Path(__file__).with_name("owned-exec.py")


@unittest.skipUnless(hasattr(os, "pidfd_open"), "Linux pidfds required")
class ParentDeathControls(unittest.TestCase):
    def test_wrong_parent_exits_before_command(self):
        result = subprocess.run(
            [sys.executable, str(wrapper), "0", sys.executable, "-c", "print('ran')"],
            capture_output=True,
            timeout=3,
        )
        self.assertEqual(result.returncode, 119)
        self.assertEqual(result.stdout, b"")

    def test_driver_cancellation_settles_child(self):
        # Exercise the actual driver helper without starting its root fixture.
        driver_source = pathlib.Path(__file__).with_name("host-qa.py")
        child_code = "import os,time; print(os.getpid(),flush=True); time.sleep(30)"
        driver_code = (
            "import ast,json,os,pathlib,selectors,signal,subprocess,sys,time; "
            "__file__=sys.argv[1]; "
            "tree=ast.parse(pathlib.Path(__file__).read_text()); "
            "fn=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='bounded_child'); "
            "exec(compile(ast.Module(body=[fn],type_ignores=[]),__file__,'exec')); "
            "bounded_child([sys.executable,'-c',sys.argv[2]],20,4096)"
        )
        for stop in [signal.SIGTERM, signal.SIGKILL]:
            with self.subTest(signal=stop):
                driver = subprocess.Popen(
                    [sys.executable, "-c", driver_code, str(driver_source), child_code],
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                )
                child_fd = None
                try:
                    readable, _, _ = select.select([driver.stdout], [], [], 3)
                    self.assertTrue(readable, "owned child never reported its PID")
                    child_fd = os.pidfd_open(int(driver.stdout.readline()), 0)
                    driver.send_signal(stop)
                    self.assertEqual(driver.wait(timeout=3), -stop)
                    ready, _, _ = select.select([child_fd], [], [], 3)
                    self.assertTrue(ready, "owned child survived driver cancellation")
                finally:
                    if child_fd is not None:
                        try:
                            signal.pidfd_send_signal(child_fd, signal.SIGKILL)
                        except ProcessLookupError:
                            pass
                        os.close(child_fd)
                    if driver.poll() is None:
                        driver.kill()
                    driver.wait(timeout=3)
                    driver.stdout.close()
                    driver.stderr.close()


if __name__ == "__main__":
    unittest.main()
