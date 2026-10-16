"""Owned local filesystem evidence only; Linux containment remains unqualified."""

import importlib.util
import contextlib
import errno
import json
import os
from pathlib import Path
import select
import socket
import subprocess
import sys
import tempfile
import threading
import time
import unittest
from unittest import mock

SOURCE = Path(__file__).with_name("reply-launch.py")
SPEC = importlib.util.spec_from_file_location("reply_launch", SOURCE)
launcher = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = launcher
SPEC.loader.exec_module(launcher)


class ScratchTests(unittest.TestCase):
    def setUp(self):
        self.scratch = tempfile.TemporaryDirectory(prefix="con01-inventory-")
        self.addCleanup(self.scratch.cleanup)
        self.base = Path(self.scratch.name).resolve()
        self.replies = self.base / "replies"
        self.replies.mkdir(mode=0o700)

    def root(self, name="gen-current", home=False):
        path = self.replies / name
        path.mkdir(mode=0o700)
        if home:
            (path / "attempt-1").mkdir(mode=0o700)
        return path

    def inventory(self):
        return launcher.inventory_attempt(str(self.replies), "attempt-1")


class InventoryTests(ScratchTests):
    def test_all_roots_including_unsealed_old_generation(self):
        self.root("gen-current")
        self.root("gen-old", True)
        self.root("sealed-older")
        result = self.inventory()
        self.assertEqual([(Path(r.root).name, r.present) for r in result],
                         [("gen-current", False), ("gen-old", True), ("sealed-older", False)])

    def test_duplicate_homes_are_unresolved(self):
        self.root("gen-current", True)
        self.root("sealed-old", True)
        with self.assertRaisesRegex(launcher.InventoryError, "duplicate_home"):
            self.inventory()

    def test_uuid_attempt_is_observed_without_reading_other_homes(self):
        attempt = "0f7089be-c571-4937-8cbb-6ee907df64cd"
        root = self.root(home=True)
        (root / attempt).mkdir(mode=0o700)
        result = launcher.inventory_attempt(str(self.replies), attempt)
        self.assertTrue(result[0].present)

    def test_missing_replies_is_not_successful_absence(self):
        self.replies.rmdir()
        with self.assertRaises(launcher.InventoryError):
            self.inventory()

    def test_empty_inventory_is_only_empty_observation(self):
        self.assertEqual(self.inventory(), ())

    def test_rejects_noncanonical_paths_and_attempts(self):
        for path in ("relative", "/", str(self.replies) + "/", str(self.replies) + "/../replies"):
            with self.subTest(path=path), self.assertRaises(launcher.InventoryError):
                launcher.inventory_attempt(path, "attempt-1")
        for attempt in ("..", "", "a/b", "/absolute", "a" * 101, "a\n", None):
            with self.subTest(attempt=attempt), self.assertRaises(launcher.InventoryError):
                launcher.inventory_attempt(str(self.replies), attempt)

    def test_root_and_home_links_are_never_followed(self):
        outside = self.base / "outside"
        outside.mkdir(mode=0o700)
        root = self.replies / "gen-link"
        root.symlink_to(outside)
        with self.assertRaises(launcher.InventoryError):
            self.inventory()
        root.unlink()
        root.mkdir(mode=0o700)
        (root / "attempt-1").symlink_to(outside)
        with self.assertRaises(launcher.InventoryError):
            self.inventory()
        self.assertEqual(list(outside.iterdir()), [])

    def test_ancestor_link_is_never_followed(self):
        alias = self.base / "alias"
        alias.symlink_to(self.base)
        with self.assertRaises(launcher.InventoryError):
            launcher.inventory_attempt(str(alias / "replies"), "attempt-1")

    def test_rejects_wrong_modes_at_each_owned_level(self):
        root = self.root(home=True)
        for path in (self.replies, root, root / "attempt-1"):
            with self.subTest(path=path):
                path.chmod(0o750)
                try:
                    with self.assertRaisesRegex(launcher.InventoryError, "directory_permissions"):
                        self.inventory()
                finally:
                    path.chmod(0o700)

    def test_rejects_wrong_owner(self):
        with mock.patch.object(launcher.os, "geteuid", return_value=os.geteuid() + 1):
            with self.assertRaisesRegex(launcher.InventoryError, "directory_permissions"):
                self.inventory()

    def test_rejects_unknown_root_and_regular_home(self):
        unknown = self.replies / "unknown"
        unknown.mkdir()
        with self.assertRaisesRegex(launcher.InventoryError, "unexpected_reply_root"):
            self.inventory()
        unknown.rmdir()
        (self.root() / "attempt-1").write_text("synthetic")
        with self.assertRaises(launcher.InventoryError):
            self.inventory()

    def test_bounded_inventory(self):
        for i in range(256):
            self.root("gen-" + str(i))
        self.assertEqual(len(self.inventory()), 256)
        self.root("gen-overflow")
        with self.assertRaisesRegex(launcher.InventoryError, "inventory_limit"):
            self.inventory()

    def test_rename_during_scan_is_unconfirmed(self):
        root = self.root()
        original = launcher._observe_roots

        def rename_after_read(fd, names, attempt):
            result = original(fd, names, attempt)
            root.rename(self.replies / "sealed-current")
            return result

        with mock.patch.object(launcher, "_observe_roots", side_effect=rename_after_read):
            with self.assertRaisesRegex(launcher.InventoryError, "namespace_changed"):
                self.inventory()

    def test_replacement_at_same_root_name_is_unconfirmed(self):
        root = self.root(home=True)
        original = launcher._observe_roots
        reads = 0

        def replace_after_read(fd, names, attempt):
            nonlocal reads
            result = original(fd, names, attempt)
            reads += 1
            if reads == 1:
                root.rename(self.base / "retained")
                self.root(home=True)
            return result

        with mock.patch.object(launcher, "_observe_roots", side_effect=replace_after_read):
            with self.assertRaisesRegex(launcher.InventoryError, "namespace_changed"):
                self.inventory()

    def test_does_not_open_lease_or_modify_content(self):
        home = self.root(home=True) / "attempt-1"
        lease = home / "lease.json"
        lease.write_bytes(b"synthetic incomplete lease")
        lease.chmod(0)
        original = os.open

        def directory_opens_only(path, flags, **kwargs):
            self.assertTrue(flags & os.O_DIRECTORY)
            return original(path, flags, **kwargs)

        try:
            with mock.patch.object(launcher.os, "open", side_effect=directory_opens_only):
                self.assertTrue(self.inventory()[0].present)
        finally:
            lease.chmod(0o600)
        self.assertEqual(lease.read_bytes(), b"synthetic incomplete lease")

    def test_replaced_replies_directory_is_unconfirmed(self):
        self.root()
        original = launcher._observe_roots

        def replace_parent(fd, names, attempt):
            result = original(fd, names, attempt)
            self.replies.rename(self.base / "retained")
            self.replies.mkdir(mode=0o700)
            self.root()
            return result

        with mock.patch.object(launcher, "_observe_roots", side_effect=replace_parent):
            with self.assertRaisesRegex(launcher.InventoryError, "namespace_changed"):
                self.inventory()

    def test_root_link_substituted_after_listing_is_rejected(self):
        root = self.root()
        outside = self.base / "outside"
        outside.mkdir(mode=0o700)
        original = launcher._root_names

        def substitute_after_listing(fd):
            names = original(fd)
            root.rmdir()
            root.symlink_to(outside)
            return names

        with mock.patch.object(launcher, "_root_names", side_effect=substitute_after_listing):
            with self.assertRaises(launcher.InventoryError):
                self.inventory()

    def test_descriptors_close_after_success_and_refusal(self):
        root = self.root(home=True)
        before = set(os.listdir("/dev/fd"))
        for _ in range(20):
            self.inventory()
            root.chmod(0o750)
            try:
                with self.assertRaises(launcher.InventoryError):
                    self.inventory()
            finally:
                root.chmod(0o700)
        self.assertEqual(set(os.listdir("/dev/fd")), before)

    def test_cli_never_claims_qualification_or_settlement(self):
        for command in ("probe", "run", "check", "sweep", "digest"):
            result = subprocess.run([sys.executable, "-I", str(SOURCE), command],
                                    capture_output=True, timeout=5)
            self.assertEqual(result.returncode, 64 if command in ("check", "sweep", "digest") else 69)
            self.assertEqual(result.stdout, b"")
            self.assertIn((command + "_arguments").encode() if command in ("check", "sweep", "digest") else b"unqualified", result.stderr)


class LockTests(ScratchTests):
    def admission(self):
        root = self.root()
        path = root / ".admit"
        path.touch(mode=0o600)
        return root, path

    def holder(self, path):
        script = ("import fcntl,os,sys; "
                  "fd=os.open(sys.argv[1],os.O_RDONLY|os.O_NOFOLLOW); "
                  "fcntl.flock(fd,fcntl.LOCK_SH); print('locked',flush=True); "
                  "sys.stdin.buffer.read(1); os.close(fd)")
        child = subprocess.Popen([sys.executable, "-I", "-u", "-c", script, str(path)],
                                 stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        self.addCleanup(self.settle_holder, child)
        ready, _, _ = select.select([child.stdout], [], [], 3)
        self.assertTrue(ready, "owned holder did not become ready")
        self.assertEqual(child.stdout.readline(), b"locked\n")
        return child

    def settle_holder(self, child):
        if child.returncode is not None and child.stdout.closed:
            return
        try:
            child.communicate(input=b"x", timeout=3)
        except subprocess.TimeoutExpired:
            child.kill()  # Only this test's own blocked subprocess, never a recorded pid.
            child.communicate(timeout=3)


class DrainTests(LockTests):
    def test_real_shared_lock_blocks_drain_until_original_deadline(self):
        root, path = self.admission()
        self.holder(path)
        before = time.monotonic()
        with self.assertRaisesRegex(launcher.InventoryError, "admission_open"):
            with launcher.drain_generation(str(root), 30):
                self.fail("live shared admission must prevent exclusive drain")
        self.assertLess(time.monotonic() - before, 1)

    def test_real_released_admission_can_be_drained(self):
        root, path = self.admission()
        child = self.holder(path)
        timer = threading.Timer(0.03, lambda: (child.stdin.write(b"x"), child.stdin.flush()))
        timer.start()
        self.addCleanup(timer.join)
        with launcher.drain_generation(str(root), 500) as fd:
            self.assertEqual(os.fstat(fd).st_ino, root.stat().st_ino)
            with self.assertRaisesRegex(launcher.InventoryError, "admission_open"):
                with launcher.drain_generation(str(root), 10):
                    self.fail("another drain cannot acquire retained exclusive lock")

    def test_body_exception_releases_lock_and_descriptors(self):
        root, _ = self.admission()
        before = set(os.listdir("/dev/fd"))
        with self.assertRaisesRegex(RuntimeError, "synthetic body error"):
            with launcher.drain_generation(str(root)):
                raise RuntimeError("synthetic body error")
        with launcher.drain_generation(str(root)):
            pass
        self.assertEqual(set(os.listdir("/dev/fd")), before)

    def test_lock_metadata_is_checked(self):
        root, path = self.admission()
        for mode, content in ((0o640, b""), (0o600, b"unexpected")):
            path.chmod(mode)
            path.write_bytes(content)
            with self.assertRaisesRegex(launcher.InventoryError, "admission_metadata"):
                with launcher.drain_generation(str(root)):
                    self.fail("invalid metadata")
        path.write_bytes(b"")
        os.link(path, self.base / "hardlink")
        with self.assertRaisesRegex(launcher.InventoryError, "admission_metadata"):
            with launcher.drain_generation(str(root)):
                self.fail("multiple lock names")

    def test_fifo_and_link_do_not_block_or_pass(self):
        root, path = self.admission()
        path.unlink()
        os.mkfifo(path, 0o600)
        with self.assertRaisesRegex(launcher.InventoryError, "admission_metadata"):
            with launcher.drain_generation(str(root)):
                self.fail("FIFO is not a lock file")
        path.unlink()
        target = self.base / "target"
        target.touch(mode=0o600)
        path.symlink_to(target)
        with self.assertRaises(launcher.InventoryError):
            with launcher.drain_generation(str(root)):
                self.fail("link must not be followed")

    def test_root_rename_while_retained_is_rejected_on_exit(self):
        root, _ = self.admission()
        with self.assertRaises(launcher.InventoryError):
            with launcher.drain_generation(str(root)):
                root.rename(self.replies / "sealed-current")

    def test_lock_replacement_while_retained_is_rejected_on_exit(self):
        root, path = self.admission()
        with self.assertRaisesRegex(launcher.InventoryError, "namespace_changed"):
            with launcher.drain_generation(str(root)):
                path.rename(root / "retained")
                path.touch(mode=0o600)

    def test_replacement_after_acquisition_never_enters_body(self):
        root, path = self.admission()
        original = launcher._acquire_drain

        def replace_after_lock(fd, deadline):
            original(fd, deadline)
            path.rename(root / "retained")
            path.touch(mode=0o600)

        with mock.patch.object(launcher, "_acquire_drain", side_effect=replace_after_lock):
            with self.assertRaisesRegex(launcher.InventoryError, "namespace_changed"):
                with launcher.drain_generation(str(root)):
                    self.fail("must validate the locked identity before caller work")

    def test_late_success_is_not_acquisition(self):
        root, _ = self.admission()
        original = launcher._verify_drain_path

        def delayed_verify(*args):
            original(*args)
            time.sleep(0.03)

        with mock.patch.object(launcher, "_verify_drain_path", side_effect=delayed_verify):
            with self.assertRaisesRegex(launcher.InventoryError, "admission_open"):
                with launcher.drain_generation(str(root), 10):
                    self.fail("elapsed deadline must be checked after filesystem validation")

    def test_unavailable_flock_and_invalid_bounds_refuse(self):
        root, _ = self.admission()
        with mock.patch.object(launcher, "fcntl", None):
            with self.assertRaisesRegex(launcher.InventoryError, "flock_unavailable"):
                with launcher.drain_generation(str(root)):
                    self.fail("missing capability")
        for wait in (0, 501, True, 1.5, "10"):
            with self.subTest(wait=wait), self.assertRaisesRegex(launcher.InventoryError, "invalid_drain_wait"):
                with launcher.drain_generation(str(root), wait):
                    self.fail("invalid bound")


class LeaseTests(LockTests):
    nonce = "ab" * 32

    def record(self, kind="launcher", **changes):
        identity = {"pid": 123 if kind == "launcher" else 124, "startTime": "234",
                    "bootId": "0f7089be-c571-4937-8cbb-6ee907df64cd",
                    "executable": "/usr/bin/python3", "nonce": self.nonce}
        identity.update(changes)
        return {"version": 1, "kind": kind, "identity": identity}

    def line(self, value):
        return json.dumps(value).encode() + b"\n"

    def whole(self):
        return (self.line(self.record()) +
                self.line({"version": 1, "kind": "fork", "nonce": self.nonce}) +
                self.line(self.record("child")))

    def lease(self, data=None):
        home = self.root(home=True) / "attempt-1"
        path = home / "lease.json"
        path.touch(mode=0o600)
        path.write_bytes(self.whole() if data is None else data)
        return home, path

    def test_whole_records_are_typed_and_immutable(self):
        value = launcher.parse_lease(self.whole())
        self.assertTrue(value.fork_record)
        self.assertEqual(value.launcher.pid, 123)
        self.assertEqual(value.child.pid, 124)
        self.assertEqual(value.tail, "none")
        with self.assertRaises(AttributeError):
            value.launcher.pid = 456

    def test_partial_stages_are_distinct_and_never_complete(self):
        first, fork, child, _ = self.whole().split(b"\n")
        for data in (b"", first, b'{"version":'):
            with self.subTest(data=data), self.assertRaises(launcher.InventoryError):
                launcher.parse_lease(data)
        values = [(first + b"\n", False, "none"),
                  (first + b"\n" + fork[:10], False, "partial_fork"),
                  (first + b"\n" + fork + b"\n", True, "none"),
                  (first + b"\n" + fork + b"\n" + child, True, "partial_child")]
        for data, complete, tail in values:
            value = launcher.parse_lease(data)
            self.assertEqual((value.fork_record, value.child, value.tail), (complete, None, tail))

    def test_order_extra_lines_and_whole_corruption_refuse(self):
        lines = self.whole().splitlines(keepends=True)
        bad = [lines[1] + lines[0], lines[0] * 2, lines[0] + lines[1] * 2,
               self.whole() + b"\n", self.whole() + b"torn", b"\xff\n",
               lines[0] + b"{}\n", lines[0] + lines[1] + b"broken\n"]
        for data in bad:
            with self.subTest(data=data), self.assertRaises(launcher.InventoryError):
                launcher.parse_lease(data)

    def test_duplicate_keys_nonfinite_and_wrong_versions_refuse(self):
        line = self.line(self.record())
        for data in (line.replace(b'"version": 1', b'"version": 1, "version": 1'),
                     line.replace(b'"pid": 123', b'"pid": 123, "pid": 123'),
                     line.replace(b'"pid": 123', b'"pid": NaN'),
                     line.replace(b'"pid": 123', b'"pid": Infinity'),
                     line.replace(b'"version": 1', b'"version": true'),
                     line.replace(b'"version": 1', b'"version": 1.0')):
            with self.subTest(data=data), self.assertRaises(launcher.InventoryError):
                launcher.parse_lease(data)

    def test_identity_closed_types_and_bounds(self):
        bad = [{"pid": True}, {"pid": 0}, {"pid": 2 ** 31}, {"pid": "123"},
               {"startTime": "01"}, {"startTime": "-1"}, {"startTime": str(2 ** 64)},
               {"startTime": 234}, {"bootId": "not-a-boot"}, {"nonce": "ab"},
               {"executable": "relative"}, {"executable": "/a/../b"},
               {"executable": "/a\x00"}, {"executable": "/\ud800"},
               {"executable": "/" + "é" * 4095}, {"extra": "not allowed"}]
        for changes in bad:
            with self.subTest(changes=changes), self.assertRaises(launcher.InventoryError):
                launcher.parse_lease(self.line(self.record(**changes)))

    def test_cross_record_identity_mismatch_refuses(self):
        first, fork, _, _ = self.whole().split(b"\n")
        for changes in ({"nonce": "cd" * 32}, {"pid": 123},
                        {"bootId": "1f7089be-c571-4937-8cbb-6ee907df64cd"}):
            with self.subTest(changes=changes), self.assertRaises(launcher.InventoryError):
                launcher.parse_lease(first + b"\n" + fork + b"\n" + self.line(self.record("child", **changes)))
        with self.assertRaises(launcher.InventoryError):
            launcher.parse_lease(first + b"\n" + fork.replace(b"abab", b"cdcd") + b"\n")

    def test_size_bound_refuses_before_parse(self):
        with self.assertRaisesRegex(launcher.InventoryError, "lease_limit"):
            launcher.parse_lease(b"x" * (launcher.LEASE_LIMIT + 1))

    def test_parser_errors_do_not_retain_raw_decode_exceptions(self):
        cases = [b'{"synthetic-private-lease-canary":invalid}\n', b"\xff\n",
                 b"[" * 1500 + b"]" * 1500 + b"\n",
                 self.line(self.record(executable="/synthetic-canary-\ud800"))]
        for data in cases:
            with self.subTest(length=len(data)):
                with self.assertRaises(launcher.InventoryError) as caught:
                    launcher.parse_lease(data)
                self.assertIsNone(caught.exception.__cause__)
                self.assertIsNone(caught.exception.__context__)
                self.assertNotIn("canary", str(caught.exception))

    def test_real_busy_life_lock_never_reads_or_yields(self):
        home, path = self.lease()
        child = self.holder(path)
        with mock.patch.object(launcher.os, "pread", side_effect=AssertionError("read while busy")):
            with self.assertRaisesRegex(launcher.InventoryError, "life_lock_held"):
                with launcher.locked_lease(str(home)):
                    self.fail("busy lease must not yield")
        self.settle_holder(child)
        with launcher.locked_lease(str(home)) as value:
            self.assertEqual(value.child.pid, 124)
            with self.assertRaisesRegex(launcher.InventoryError, "life_lock_held"):
                with launcher.locked_lease(str(home)):
                    self.fail("retained lock must exclude another observer")

    def test_missing_zero_and_torn_leases_remain_refused(self):
        home, path = self.lease(b"")
        for data in (b"", b'{"version":'):
            path.write_bytes(data)
            with self.assertRaisesRegex(launcher.InventoryError, "lease_incomplete"):
                with launcher.locked_lease(str(home)):
                    self.fail("partial lease")
        path.unlink()
        with self.assertRaisesRegex(launcher.InventoryError, "lease_missing"):
            with launcher.locked_lease(str(home)):
                self.fail("missing lease")

    def test_lease_replacement_or_mutation_on_unwind_refuses(self):
        home, path = self.lease()
        with self.assertRaisesRegex(launcher.InventoryError, "lease_changed"):
            with launcher.locked_lease(str(home)):
                path.rename(home / "retained")
                path.touch(mode=0o600)
                path.write_bytes(self.whole())
        with self.assertRaisesRegex(launcher.InventoryError, "lease_changed"):
            with launcher.locked_lease(str(home)):
                path.write_bytes(self.whole().replace(b"234", b"235"))

    def test_home_replacement_on_unwind_refuses(self):
        home, _ = self.lease()
        with self.assertRaises(launcher.InventoryError):
            with launcher.locked_lease(str(home)):
                home.rename(home.with_name("retained"))
                home.mkdir(mode=0o700)

    def test_same_home_moved_into_replaced_generation_refuses(self):
        home, _ = self.lease()
        root = home.parent
        sealed = root.with_name("sealed-current")
        with self.assertRaisesRegex(launcher.InventoryError, "lease_changed"):
            with launcher.locked_lease(str(home)):
                root.rename(sealed)
                root.mkdir(mode=0o700)
                (sealed / home.name).rename(home)

    def test_link_metadata_and_fifo_refuse_without_read(self):
        home, path = self.lease()
        path.chmod(0o640)
        with self.assertRaisesRegex(launcher.InventoryError, "lease_metadata"):
            with launcher.locked_lease(str(home)):
                self.fail("mode")
        path.unlink()
        os.mkfifo(path, 0o600)
        with self.assertRaisesRegex(launcher.InventoryError, "lease_metadata"):
            with launcher.locked_lease(str(home)):
                self.fail("FIFO")
        path.unlink()
        path.symlink_to(self.base / "nonexistent")
        with self.assertRaises(launcher.InventoryError):
            with launcher.locked_lease(str(home)):
                self.fail("symlink")

    def test_lease_body_failure_closes_descriptors_and_lock(self):
        home, _ = self.lease()
        before = set(os.listdir("/dev/fd"))
        for _ in range(10):
            with self.assertRaisesRegex(RuntimeError, "synthetic"):
                with launcher.locked_lease(str(home)):
                    raise RuntimeError("synthetic")
        self.assertEqual(set(os.listdir("/dev/fd")), before)
        with launcher.locked_lease(str(home)):
            pass


class ProcessTests(ScratchTests):
    def identity(self, **changes):
        values = {"pid": 123, "start_time": "234",
                  "boot_id": "0f7089be-c571-4937-8cbb-6ee907df64cd",
                  "executable": "/usr/bin/node", "nonce": "ab" * 32}
        values.update(changes)
        return launcher.ProcessIdentity(**values)

    @contextlib.contextmanager
    def fake_pidfd(self, observed=None, open_error=None, signal_error=None):
        fd = os.open(self.base, os.O_RDONLY | os.O_DIRECTORY)
        try:
            with contextlib.ExitStack() as stack:
                stack.enter_context(mock.patch.object(launcher, "_process_support", return_value=True))
                opened = stack.enter_context(mock.patch.object(launcher.os, "pidfd_open", create=True,
                                                               return_value=fd, side_effect=open_error))
                read = stack.enter_context(mock.patch.object(launcher, "_read_process_identity",
                                                            return_value=observed or self.identity()))
                sent = stack.enter_context(mock.patch.object(launcher.signal, "pidfd_send_signal", create=True,
                                                            side_effect=signal_error))
                stack.enter_context(mock.patch.object(launcher.os, "kill", side_effect=AssertionError("numeric signal")))
                yield opened, read, sent, fd
        finally:
            try:
                os.close(fd)
            except OSError as error:
                self.assertEqual(error.errno, errno.EBADF)

    def test_unsupported_default_refuses_before_proc_or_pidfd(self):
        with mock.patch.object(launcher.sys, "platform", "darwin"):
            with mock.patch.object(launcher, "_read_process_identity", side_effect=AssertionError("proc")):
                self.assertEqual(launcher.inspect_process(self.identity(), "child").reason,
                                 "process_capability_unavailable")

    def test_matching_identity_uses_held_pidfd_signal_zero_only(self):
        with self.fake_pidfd() as (opened, read, sent, fd):
            def observe(pid, kind):
                opened.assert_called_once_with(123, 0)
                os.fstat(fd)
                return self.identity()
            read.side_effect = observe
            result = launcher.inspect_process(self.identity(), "child")
            self.assertEqual(result.state, "live")
            sent.assert_called_once_with(fd, 0, None, 0)
            with self.assertRaises(OSError):
                os.fstat(fd)

    def test_every_identity_mismatch_prevents_signal(self):
        changes = [{"pid": 124}, {"start_time": "235"},
                   {"boot_id": "1f7089be-c571-4937-8cbb-6ee907df64cd"},
                   {"executable": "/usr/bin/other"}, {"nonce": "cd" * 32}]
        for change in changes:
            with self.subTest(change=change), self.fake_pidfd(self.identity(**change)) as (_, _, sent, _):
                result = launcher.inspect_process(self.identity(), "launcher")
                self.assertEqual(result.reason, "process_identity_mismatch")
                sent.assert_not_called()

    def test_only_pidfd_esrch_can_report_gone(self):
        for error in (ProcessLookupError(errno.ESRCH, "synthetic"), PermissionError(errno.EPERM, "synthetic")):
            with self.fake_pidfd(open_error=error) as (_, read, sent, _):
                result = launcher.inspect_process(self.identity(), "child")
                self.assertEqual(result.state, "gone" if error.errno == errno.ESRCH else "unresolved")
                read.assert_not_called()
                sent.assert_not_called()
            with self.fake_pidfd(signal_error=error):
                result = launcher.inspect_process(self.identity(), "child")
                self.assertEqual(result.state, "gone" if error.errno == errno.ESRCH else "unresolved")

    def test_proc_disappearance_and_raw_errors_stay_unresolved(self):
        errors = [FileNotFoundError("synthetic-private-canary"),
                  UnicodeDecodeError("ascii", b"private-canary-\xff", 0, 1, "synthetic")]
        for error in errors:
            with self.fake_pidfd() as (_, read, sent, _):
                read.side_effect = error
                result = launcher.inspect_process(self.identity(), "child")
                self.assertEqual(result, launcher.ProcessObservation("unresolved", "process_unconfirmed"))
                self.assertNotIn("canary", repr(result))
                sent.assert_not_called()

    def test_invalid_input_never_opens_pidfd(self):
        for identity, kind in [(None, "child"), (self.identity(pid=True), "child"),
                               (self.identity(), "unknown")]:
            with self.fake_pidfd() as (opened, read, sent, _):
                self.assertEqual(launcher.inspect_process(identity, kind).state, "unresolved")
                opened.assert_not_called()
                read.assert_not_called()
                sent.assert_not_called()

    def test_stat_comm_and_pid_are_bound(self):
        tail = b"S " + b"0 " * 18 + b"234 0 0\n"
        for comm in (b"node", b"has spaces", b"weird ) ( ) name"):
            self.assertEqual(launcher._stat_start(b"123 (" + comm + b") " + tail, 123), "234")
        for data in (b"124 (node) " + tail, b"123 (node) S 0\n", b"123 (broken"):
            with self.assertRaises(launcher.InventoryError):
                launcher._stat_start(data, 123)

    def test_nonce_parsing_is_exact_and_duplicate_safe(self):
        nonce = self.identity().nonce.encode()
        self.assertEqual(launcher._process_nonce(b"python\x00run\x00--nonce\x00" + nonce + b"\x00", "launcher"),
                         nonce.decode())
        self.assertEqual(launcher._process_nonce(b"PRIVATE_KEY=synthetic\x00SOPHIA_REPLY_NONCE=" + nonce + b"\x00", "child"),
                         nonce.decode())
        bad = [(b"--nonce\x00" + nonce, "launcher"), (b"--nonce\x00", "launcher"),
               (b"--nonce\x00" + nonce + b"\x00--nonce\x00" + nonce + b"\x00", "launcher"),
               (b"OTHER_SOPHIA_REPLY_NONCE=" + nonce + b"\x00", "child"),
               ((b"SOPHIA_REPLY_NONCE=" + nonce + b"\x00") * 2, "child")]
        for data, kind in bad:
            with self.subTest(kind=kind), self.assertRaises(launcher.InventoryError):
                launcher._process_nonce(data, kind)

    def test_bounded_proc_read_rejects_links_fifo_and_overflow(self):
        path = self.base / "data"
        path.write_bytes(b"x" * 65)
        with launcher._directory(str(self.base)) as parent:
            self.assertEqual(launcher._bounded_proc_read(parent, "data", 65), b"x" * 65)
            with self.assertRaisesRegex(launcher.InventoryError, "process_limit"):
                launcher._bounded_proc_read(parent, "data", 64)
            path.unlink()
            os.mkfifo(path, 0o600)
            with self.assertRaisesRegex(launcher.InventoryError, "process_file"):
                launcher._bounded_proc_read(parent, "data", 64)
            path.unlink()
            path.symlink_to(self.base / "missing")
            with self.assertRaises(OSError):
                launcher._bounded_proc_read(parent, "data", 64)

    def test_ambiguous_launcher_nonce_forms_are_refused(self):
        nonce = self.identity().nonce.encode()
        canonical = b"python\x00reply-launch.py\x00run\x00--nonce\x00" + nonce + b"\x00"
        for data in (canonical + b"--nonce=" + b"cd" * 32 + b"\x00",
                     canonical + b"--nonce=" + nonce + b"\x00",
                     b"python\x00reply-launch.py\x00run\x00--\x00--nonce\x00" + nonce + b"\x00"):
            with self.subTest(length=len(data)), self.assertRaisesRegex(launcher.InventoryError, "process_nonce"):
                launcher._process_nonce(data, "launcher")

    def test_synthetic_proc_tree_assembles_only_identity(self):
        proc = self.base / "proc"
        boot = proc / "sys" / "kernel" / "random"
        boot.mkdir(parents=True)
        (boot / "boot_id").write_text(self.identity().boot_id + "\n")
        process = proc / "123"
        process.mkdir()
        (process / "stat").write_bytes(b"123 (weird ) comm) S " + b"0 " * 18 + b"234 0\n")
        (process / "exe").symlink_to("/usr/bin/node")
        (process / "environ").write_bytes(b"SECRET=synthetic-private-canary\x00SOPHIA_REPLY_NONCE=" +
                                         self.identity().nonce.encode() + b"\x00")
        original = launcher._directory

        def substitute(name, parent=None):
            return original(str(proc) if name == "/proc" else name, parent)

        with mock.patch.object(launcher, "_directory", side_effect=substitute):
            observed = launcher._read_process_identity(123, "child")
            self.assertEqual(observed, self.identity())
            self.assertNotIn("canary", repr(observed))



class CheckTests(LockTests):
    nonce = LeaseTests.nonce
    record = LeaseTests.record
    line = LeaseTests.line
    whole = LeaseTests.whole

    def prepared(self, name="gen-current", data=None):
        root = self.root(name, data is not None)
        (root / ".admit").touch(mode=0o600)
        if data is not None:
            lease = root / "attempt-1" / "lease.json"
            lease.touch(mode=0o600)
            lease.write_bytes(data)
        return root

    def check(self, wait=500):
        return launcher.check_attempt(str(self.replies), "attempt-1", "gen-current", wait)

    def test_all_generations_and_current_absence_are_observations(self):
        self.prepared()
        self.prepared("sealed-old")
        self.prepared("gen-unsealed")
        result = self.check()
        self.assertEqual([(Path(x.root).name, x.state) for x in result],
                         [("gen-current", "absent"), ("gen-unsealed", "unresolved"),
                          ("sealed-old", "absent")])

    def test_current_root_required_and_duplicate_home_refuses(self):
        with self.assertRaisesRegex(launcher.InventoryError, "current_root_missing"):
            self.check()
        self.prepared(data=self.whole())
        self.prepared("sealed-old", self.whole())
        with self.assertRaisesRegex(launcher.InventoryError, "duplicate_home"):
            self.check()

    def test_empty_is_distinct_from_lease_less_nonempty_and_torn(self):
        root = self.prepared()
        home = root / "attempt-1"
        home.mkdir(mode=0o700)
        self.assertEqual(self.check()[0].state, "empty")
        content = home / "unexpected"
        content.write_text("synthetic")
        self.assertEqual(self.check()[0].state, "unresolved")
        content.unlink()
        lease = home / "lease.json"
        lease.touch(mode=0o600)
        for data in (b"", b"torn", self.line(self.record())):
            lease.write_bytes(data)
            self.assertEqual(self.check()[0].state, "unresolved")

    def test_incomplete_fork_refuses_before_any_process_inspection(self):
        first = self.line(self.record())
        root = self.prepared(data=first)
        path = root / "attempt-1" / "lease.json"
        for data in (first, first + b"partial fork"):
            path.write_bytes(data)
            with mock.patch.object(launcher, "inspect_process", return_value=
                                   launcher.ProcessObservation("gone", "fixture")) as inspect:
                self.assertEqual(self.check()[0].state, "unresolved")
                inspect.assert_not_called()

    def test_new_home_with_unchanged_root_names_refuses_all_reports(self):
        current = self.prepared()
        self.prepared("sealed-old", self.whole())

        def observe(_identity, _kind):
            (current / "attempt-1").mkdir(mode=0o700, exist_ok=True)
            return launcher.ProcessObservation("gone", "fixture")

        with mock.patch.object(launcher, "inspect_process", side_effect=observe):
            with self.assertRaisesRegex(launcher.InventoryError, "duplicate_home"):
                self.check()

    def test_free_whole_lease_requires_every_recorded_process_gone(self):
        self.prepared(data=self.whole())
        gone = launcher.ProcessObservation("gone", "fixture")
        live = launcher.ProcessObservation("live", "fixture")
        unknown = launcher.ProcessObservation("unresolved", "fixture")
        for values, expected in (([gone, gone], "gone"), ([gone, live], "unsettled"),
                                 ([live, gone], "unsettled"), ([live, unknown], "unresolved")):
            with mock.patch.object(launcher, "inspect_process", side_effect=values) as inspect:
                self.assertEqual(self.check()[0].state, expected)
                self.assertEqual([x.args[1] for x in inspect.call_args_list], ["launcher", "child"])

    def test_missing_or_partial_child_requires_gone_launcher(self):
        first, fork, _, _ = self.whole().split(b"\n")
        root = self.prepared(data=first + b"\n" + fork + b"\n")
        path = root / "attempt-1" / "lease.json"
        for suffix in (b"", b"partial"):
            path.write_bytes(first + b"\n" + fork + b"\n" + suffix)
            with mock.patch.object(launcher, "inspect_process", return_value=
                                   launcher.ProcessObservation("gone", "fixture")) as inspect:
                self.assertEqual(self.check()[0].state, "gone")
                self.assertEqual(inspect.call_count, 1)

    def test_real_life_lock_prevents_process_observation(self):
        root = self.prepared(data=self.whole())
        self.holder(root / "attempt-1" / "lease.json")
        with mock.patch.object(launcher, "inspect_process") as inspect:
            self.assertEqual(self.check()[0].state, "unsettled")
            inspect.assert_not_called()

    def test_all_drains_and_life_lock_remain_held_during_process_read(self):
        first = self.prepared()
        second = self.prepared("sealed-old", self.whole())

        def observe(_identity, _kind):
            for root in (first, second):
                with self.assertRaisesRegex(launcher.InventoryError, "admission_open"):
                    with launcher.drain_generation(str(root), 1):
                        self.fail("drain released before final validation")
            with self.assertRaisesRegex(launcher.InventoryError, "life_lock_held"):
                with launcher.locked_lease(str(second / "attempt-1")):
                    self.fail("life lock released")
            return launcher.ProcessObservation("gone", "fixture")

        with mock.patch.object(launcher, "inspect_process", side_effect=observe):
            self.assertEqual(self.check()[1].state, "gone")

    def test_namespace_change_after_process_observation_refuses_all_reports(self):
        root = self.prepared(data=self.whole())

        def observe(_identity, _kind):
            other = self.replies / "sealed-new"
            if not other.exists():
                other.mkdir(mode=0o700)
            return launcher.ProcessObservation("gone", "fixture")

        with mock.patch.object(launcher, "inspect_process", side_effect=observe):
            with self.assertRaisesRegex(launcher.InventoryError, "namespace_changed"):
                self.check()
        self.assertTrue((root / "attempt-1" / "lease.json").exists())

    def test_late_process_result_cannot_reset_total_deadline(self):
        self.prepared(data=self.whole())

        def observe(_identity, _kind):
            time.sleep(0.025)
            return launcher.ProcessObservation("gone", "fixture")

        with mock.patch.object(launcher, "inspect_process", side_effect=observe):
            with self.assertRaisesRegex(launcher.InventoryError, "check_deadline"):
                self.check(20)

    def test_unavailable_actual_process_capability_never_reports_gone(self):
        self.prepared(data=self.whole())
        with mock.patch.object(launcher, "_process_support", return_value=False):
            self.assertEqual(self.check()[0].state, "unresolved")

    def test_empty_home_mutation_before_return_refuses(self):
        root = self.prepared()
        home = root / "attempt-1"
        home.mkdir(mode=0o700)
        original = launcher._verify_check_snapshot

        def change(*args):
            original(*args)
            (home / "unexpected").write_text("synthetic")

        with mock.patch.object(launcher, "_verify_check_snapshot", side_effect=change):
            with self.assertRaisesRegex(launcher.InventoryError, "home_changed"):
                self.check()

    def test_invalid_attempt_and_bounds_refuse(self):
        self.prepared()
        for attempt in ("../x", None, ""):
            with self.assertRaisesRegex(launcher.InventoryError, "invalid_attempt"):
                launcher.check_attempt(str(self.replies), attempt, "gen-current")
        for wait in (True, 0, 501):
            with self.assertRaisesRegex(launcher.InventoryError, "invalid_drain_wait"):
                self.check(wait)



class PrepareTests(LockTests):
    attempt = "0f7089be-c571-4937-8cbb-6ee907df64cd"
    nonce = "ab" * 32

    def argv(self, root):
        values = [str(root), self.attempt, str(os.getppid()), self.nonce, "/usr/bin/node",
                  "/runtime/node_modules/dsh/bin.js", "/runtime", "/template",
                  "sophia-reply-tree-v1:sha256:" + "cd" * 32, "sophia-reply", "sophia-runtime-test"]
        return ["run"] + [x for pair in zip(("--" + x for x in launcher.RUN_OPTIONS), values) for x in pair]

    def prepared_request(self):
        root, admission = self.admission()
        request = launcher.parse_run_arguments(self.argv(root))
        return root, admission, request

    def identity(self):
        return launcher.ProcessIdentity(123, "234", self.attempt, "/usr/bin/python3", self.nonce)

    def prepare(self, request, checkpoint=lambda: None):
        return launcher.prepare_lease(request, checkpoint)

    def test_closed_paired_parser_and_immutable_fields(self):
        root, _, request = self.prepared_request()
        self.assertEqual(request.root, str(root))
        self.assertEqual(request.parent, os.getppid())
        with self.assertRaises(AttributeError):
            request.nonce = "cd" * 32
        args = self.argv(root)
        variants = [args[:-2], args + ["--nonce", self.nonce],
                    ["run", "--root=" + str(root)] + args[3:]]
        for option in ("--", "--roo", "--nonce", "root"):
            altered = args.copy(); altered[1] = option; variants.append(altered)
        for altered in variants:
            with self.subTest(argv=altered), self.assertRaises(launcher.InventoryError):
                launcher.parse_run_arguments(altered)

    def test_parser_rejects_invalid_values(self):
        root, _, _ = self.prepared_request()
        invalid = {"root": ("relative", str(root).replace("gen-", "sealed-")),
                   "attempt": ("attempt-1", "../x"), "parent": ("01", "0", "2147483648"),
                   "nonce": ("AB" * 32, ""), "entry": ("/runtime-other/bin.js", "/runtime/../bin.js"),
                   "profile-name": ("../profile", ""), "unit": ("bad unit", ""),
                   "template-digest": ("cd" * 32, "sophia-tree-v2:sha256:" + "cd" * 32)}
        for key, values in invalid.items():
            for value in values:
                args = self.argv(root); args[args.index("--" + key) + 1] = value
                with self.subTest(key=key, value=value), self.assertRaises(launcher.InventoryError):
                    launcher.parse_run_arguments(args)

    def test_default_unsupported_path_refuses_before_mutation(self):
        root, _, request = self.prepared_request()
        with mock.patch.object(launcher, "_process_support", return_value=False):
            with self.assertRaisesRegex(launcher.InventoryError, "capability_unavailable"):
                with self.prepare(request):
                    self.fail("unsupported host")
        self.assertEqual([p.name for p in root.iterdir()], [".admit"])

    def test_self_binding_checks_parent_and_nonce_without_real_proc(self):
        _, _, request = self.prepared_request()
        with mock.patch.object(launcher, "_process_support", return_value=True):
            with mock.patch.object(launcher.os, "getppid", return_value=request.parent + 1):
                with mock.patch.object(launcher, "_read_process_identity") as read:
                    with self.assertRaisesRegex(launcher.InventoryError, "wrong_parent"):
                        launcher._launcher_identity(request)
                    read.assert_not_called()
            wrong = launcher.ProcessIdentity(123, "234", self.attempt, "/python", "cd" * 32)
            with mock.patch.object(launcher, "_read_process_identity", return_value=wrong):
                with self.assertRaisesRegex(launcher.InventoryError, "identity_mismatch"):
                    launcher._launcher_identity(request)

    def test_other_shared_admission_does_not_block_this_attempt(self):
        # Deterministic, not timed: another attempt really holds the admission shared, and this attempt's own request
        # on that inode must be one non-blocking shared lock that the real flock grants at once. A retry (it would have
        # had to wait) or another mode (an exclusive request) fails here, without depending on how long the durable
        # lease setup after admission takes (FND-B1 sentinel evidence: the old 0.1 s bound also spanned fsyncs).
        root, admission, request = self.prepared_request()
        self.holder(admission)
        inode = os.stat(admission).st_ino
        real = launcher.fcntl.flock
        requests = []

        def flock(fd, operation):
            if os.fstat(fd).st_ino == inode:
                requests.append(operation)
                self.assertEqual(operation, launcher.fcntl.LOCK_SH | launcher.fcntl.LOCK_NB, "admission is a non-blocking shared lock")
                self.assertEqual(len(requests), 1, "admission retried: another shared holder blocked this attempt")
            return real(fd, operation)

        with mock.patch.object(launcher, "_launcher_identity", return_value=self.identity()):
            with mock.patch.object(launcher.fcntl, "flock", side_effect=flock):
                with self.prepare(request):
                    self.assertTrue((root / self.attempt / "lease.json").exists())
        self.assertEqual(requests, [launcher.fcntl.LOCK_SH | launcher.fcntl.LOCK_NB])

    def test_records_durable_before_admission_release_and_life_lock_retained(self):
        root, _, request = self.prepared_request()
        original = launcher.os.fsync
        events = []

        def sync(fd):
            with self.assertRaisesRegex(launcher.InventoryError, "admission_open"):
                with launcher.drain_generation(str(root), 1):
                    self.fail("admission released before durability")
            events.append(os.fstat(fd).st_mode)
            original(fd)

        with mock.patch.object(launcher, "_launcher_identity", return_value=self.identity()):
            with mock.patch.object(launcher.os, "fsync", side_effect=sync):
                with self.prepare(request) as lease:
                    home = root / self.attempt
                    records = launcher.parse_lease((home / "lease.json").read_bytes())
                    self.assertTrue(records.fork_record)
                    self.assertEqual(records.launcher, self.identity())
                    self.assertEqual(sorted(p.name for p in home.iterdir()), ["lease.json"])
                    self.assertFalse(os.get_inheritable(lease))
                    with launcher.drain_generation(str(root), 10):
                        pass
                    with self.assertRaisesRegex(launcher.InventoryError, "life_lock_held"):
                        with launcher.locked_lease(str(home)):
                            self.fail("life lock released")
        self.assertEqual(len(events), 2)
        with launcher.locked_lease(str(root / self.attempt)):
            pass

    def test_existing_home_is_not_opened_or_changed(self):
        root, _, request = self.prepared_request()
        home = root / self.attempt; home.mkdir(mode=0o700)
        occupant = home / "canary"; occupant.write_text("synthetic untouched")
        with mock.patch.object(launcher, "_launcher_identity", return_value=self.identity()):
            with mock.patch.object(launcher, "_new_lease") as create:
                with self.assertRaises(FileExistsError):
                    with self.prepare(request):
                        self.fail("occupied")
                create.assert_not_called()
        self.assertEqual(occupant.read_text(), "synthetic untouched")

    def test_cancel_before_admission_leaves_no_home(self):
        root, _, request = self.prepared_request()
        def cancelled():
            raise launcher.InventoryError("cancelled")
        with self.assertRaisesRegex(launcher.InventoryError, "cancelled"):
            with self.prepare(request, cancelled):
                self.fail("cancelled")
        self.assertFalse((root / self.attempt).exists())

    def test_partial_write_failure_retains_torn_lease_and_releases_locks(self):
        root, _, request = self.prepared_request()
        original = launcher.os.write
        calls = []
        def partial(fd, data):
            if calls:
                raise OSError(errno.EIO, "synthetic failure")
            calls.append(True)
            return original(fd, data[:10])
        with mock.patch.object(launcher, "_launcher_identity", return_value=self.identity()):
            with mock.patch.object(launcher.os, "write", side_effect=partial):
                with self.assertRaises(OSError):
                    with self.prepare(request):
                        self.fail("partial")
        home = root / self.attempt
        self.assertEqual((home / "lease.json").stat().st_size, 10)
        with launcher.drain_generation(str(root), 10):
            pass
        with self.assertRaisesRegex(launcher.InventoryError, "lease_incomplete"):
            with launcher.locked_lease(str(home)):
                self.fail("torn")

    def test_root_sealed_after_mkdir_prevents_lease_creation(self):
        root, _, request = self.prepared_request()
        original = launcher._new_home
        sealed = self.replies / "sealed-current"
        def rename(value):
            original(value); root.rename(sealed)
        with mock.patch.object(launcher, "_launcher_identity", return_value=self.identity()):
            with mock.patch.object(launcher, "_new_home", side_effect=rename):
                with self.assertRaises(FileNotFoundError):
                    with self.prepare(request):
                        self.fail("sealed")
        self.assertEqual(list((sealed / self.attempt).iterdir()), [])
        with launcher.drain_generation(str(sealed), 10):
            pass

    def test_replaced_named_lease_prevents_success(self):
        root, _, request = self.prepared_request()
        original = launcher._durable_lease
        def replace(*args):
            fd = original(*args)
            path = root / self.attempt / "lease.json"
            path.rename(path.with_name("old")); path.touch(mode=0o600)
            return fd
        with mock.patch.object(launcher, "_launcher_identity", return_value=self.identity()):
            with mock.patch.object(launcher, "_durable_lease", side_effect=replace):
                with self.assertRaisesRegex(launcher.InventoryError, "lease_changed"):
                    with self.prepare(request):
                        self.fail("replaced")

    def test_success_inside_caller_exception_keeps_valid_life_lock(self):
        root, _, request = self.prepared_request()
        before = set(os.listdir("/dev/fd"))
        try:
            raise RuntimeError("synthetic prior failure")
        except RuntimeError:
            with mock.patch.object(launcher, "_launcher_identity", return_value=self.identity()):
                with self.prepare(request) as fd:
                    self.assertGreater(os.fstat(fd).st_size, 0)
                    with self.assertRaisesRegex(launcher.InventoryError, "life_lock_held"):
                        with launcher.locked_lease(str(root / self.attempt)):
                            self.fail("life lock closed in caller exception context")
        with launcher.locked_lease(str(root / self.attempt)):
            pass
        self.assertEqual(set(os.listdir("/dev/fd")), before)

    def test_body_failure_releases_life_lock_without_deleting_home(self):
        root, _, request = self.prepared_request()
        before = set(os.listdir("/dev/fd"))
        with mock.patch.object(launcher, "_launcher_identity", return_value=self.identity()):
            with self.assertRaisesRegex(RuntimeError, "synthetic"):
                with self.prepare(request):
                    raise RuntimeError("synthetic")
        with launcher.locked_lease(str(root / self.attempt)):
            pass
        self.assertEqual(set(os.listdir("/dev/fd")), before)

    def test_exclusive_drain_wait_remains_cancellable(self):
        root, _, request = self.prepared_request()
        polls = []
        def cancel_later():
            polls.append(True)
            if len(polls) == 5:
                raise launcher.InventoryError("cancelled")
        with launcher.drain_generation(str(root), 10):
            with mock.patch.object(launcher, "_launcher_identity", return_value=self.identity()):
                with self.assertRaisesRegex(launcher.InventoryError, "cancelled"):
                    with self.prepare(request, cancel_later):
                        self.fail("blocked admission")
        self.assertFalse((root / self.attempt).exists())

    def test_deadline_is_checked_after_control_callback(self):
        with mock.patch.object(launcher.time, "monotonic", side_effect=[1, 4]):
            with self.assertRaisesRegex(launcher.InventoryError, "setup_deadline"):
                launcher._setup_checkpoint(lambda: None, 3)



class SetupTests(LockTests):
    attempt = PrepareTests.attempt
    nonce = PrepareTests.nonce
    argv = PrepareTests.argv
    prepared_request = PrepareTests.prepared_request
    identity = PrepareTests.identity

    def pair(self, kind=socket.SOCK_STREAM):
        a, b = socket.socketpair(type=kind)
        self.addCleanup(a.close); self.addCleanup(b.close)
        return a, b

    def reader(self):
        a, b = self.pair()
        control = launcher.SetupControl(launcher._unix_stream(a.fileno()), time.monotonic() + 30)
        self.addCleanup(control.close)
        return control, a, b

    def test_parent_binding_orders_prctl_before_parent_check(self):
        events = []
        with mock.patch.object(launcher, "_process_support", return_value=True):
            with mock.patch.object(launcher, "_set_parent_death", side_effect=lambda: events.append("armed")):
                with mock.patch.object(launcher.os, "getppid", side_effect=lambda: (events.append("parent"), 123)[1]):
                    with mock.patch.object(launcher.signal, "signal", side_effect=lambda *a: events.append(a)):
                        launcher.bind_launcher_parent(123)
        self.assertEqual(events, ["armed", "parent", (launcher.signal.SIGCHLD, launcher.signal.SIG_DFL)])

    def test_wrong_parent_or_unsupported_never_changes_signal_disposition(self):
        with mock.patch.object(launcher, "_set_parent_death") as arm:
            with mock.patch.object(launcher.signal, "signal") as sig:
                with mock.patch.object(launcher, "_process_support", return_value=False):
                    with self.assertRaisesRegex(launcher.InventoryError, "capability_unavailable"):
                        launcher.bind_launcher_parent(123)
                    arm.assert_not_called()
                with mock.patch.object(launcher, "_process_support", return_value=True):
                    with mock.patch.object(launcher.os, "getppid", return_value=124):
                        with self.assertRaisesRegex(launcher.InventoryError, "wrong_parent"):
                            launcher.bind_launcher_parent(123)
                sig.assert_not_called()
        for parent in (True, 0, -1, "123", 2147483648):
            with self.assertRaisesRegex(launcher.InventoryError, "wrong_parent"):
                launcher.bind_launcher_parent(parent)

    def test_prctl_ffi_has_explicit_signature_and_fixed_failure(self):
        libc = mock.Mock(); libc.prctl.return_value = 0
        with mock.patch.object(launcher.ctypes, "CDLL", return_value=libc):
            launcher._set_parent_death()
            libc.prctl.assert_called_once_with(1, int(launcher.signal.SIGKILL), 0, 0, 0)
            self.assertEqual(len(libc.prctl.argtypes), 5)
            libc.prctl.return_value = -1
            with self.assertRaisesRegex(launcher.InventoryError, "parent_death_unavailable"):
                launcher._set_parent_death()

    def test_alarm_default_unblocked_then_armed_without_actual_signals(self):
        events = []
        with mock.patch.object(launcher.signal, "signal", side_effect=lambda *a: events.append(("signal", a))):
            with mock.patch.object(launcher.signal, "pthread_sigmask", side_effect=lambda *a: events.append(("mask", a))):
                with mock.patch.object(launcher.signal, "alarm", side_effect=lambda *a: events.append(("alarm", a))):
                    launcher._arm_setup_alarm()
        self.assertEqual([e[0] for e in events], ["signal", "mask", "alarm"])
        self.assertEqual(events[0][1], (launcher.signal.SIGALRM, launcher.signal.SIG_DFL))
        self.assertEqual(events[1][1], (launcher.signal.SIG_UNBLOCK,
                                      {launcher.signal.SIGALRM, launcher.signal.SIGCHLD}))
        self.assertEqual(events[2][1], (30,))

    def test_connected_unix_stream_only_and_bad_fd_cleanup(self):
        before = set(os.listdir("/dev/fd"))
        a, _ = self.pair(socket.SOCK_DGRAM)
        with self.assertRaisesRegex(launcher.InventoryError, "channel_invalid"):
            launcher._unix_stream(a.fileno())
        a.close()
        with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as unconnected:
            with self.assertRaises(OSError):
                launcher._unix_stream(unconnected.fileno())
        path = self.base / "regular"; path.write_text("synthetic")
        with path.open("rb") as regular:
            with self.assertRaises(OSError):
                launcher._unix_stream(regular.fileno())
        for fd in (-1, True, "0"):
            with self.assertRaises(launcher.InventoryError):
                launcher._unix_stream(fd)
        self.doCleanups()
        self.assertEqual(set(os.listdir("/dev/fd")), before)

    def test_nondefault_timeout_refuses_before_dup_or_flag_change(self):
        a, _ = self.pair()
        before = launcher.fcntl.fcntl(a.fileno(), launcher.fcntl.F_GETFL)
        descriptors = set(os.listdir("/dev/fd"))
        previous = socket.getdefaulttimeout()
        try:
            for timeout in (0, 1):
                socket.setdefaulttimeout(timeout)
                with mock.patch.object(launcher.os, "dup", wraps=os.dup) as duplicate:
                    with self.assertRaisesRegex(launcher.InventoryError, "setup_socket_default"):
                        launcher._unix_stream(a.fileno())
                    duplicate.assert_not_called()
                self.assertEqual(launcher.fcntl.fcntl(a.fileno(), launcher.fcntl.F_GETFL), before)
        finally:
            socket.setdefaulttimeout(previous)
        self.assertEqual(set(os.listdir("/dev/fd")), descriptors)

    def test_fragmented_commands_and_sticky_cancellation(self):
        for command in (b"TERM", b"KILL"):
            control, original, peer = self.reader()
            flags = launcher.fcntl.fcntl(original.fileno(), launcher.fcntl.F_GETFL)
            control.poll()
            peer.sendall(command[:2]); control.poll()
            peer.sendall(command[2:]); control.poll()
            peer.sendall(b"\n")
            with self.assertRaisesRegex(launcher.InventoryError, "cancelled"):
                control.poll()
            with self.assertRaisesRegex(launcher.InventoryError, "cancelled"):
                control.poll()
            self.assertEqual(control.pending, b"")
            self.assertEqual(launcher.fcntl.fcntl(original.fileno(), launcher.fcntl.F_GETFL), flags)

    def test_eof_malformed_and_closed_are_refusals(self):
        control, _, peer = self.reader(); peer.close()
        with self.assertRaisesRegex(launcher.InventoryError, "cancelled"):
            control.poll()
        for data in (b"\n", b"TERMX", b"TERM\r\n", b"synthetic-secret" * 10):
            control, _, peer = self.reader(); peer.sendall(data)
            with self.assertRaisesRegex(launcher.InventoryError, "control_invalid") as error:
                control.poll()
            self.assertNotIn("synthetic-secret", str(error.exception))
            self.assertEqual(control.pending, b"")
        control.close()
        with self.assertRaises(launcher.InventoryError):
            control.poll()

    def test_late_no_data_poll_cannot_return_after_original_deadline(self):
        stream = mock.Mock(); stream.recv.side_effect = BlockingIOError()
        control = launcher.SetupControl(stream, 5)
        with mock.patch.object(launcher.time, "monotonic", side_effect=[4, 6]):
            with self.assertRaisesRegex(launcher.InventoryError, "setup_deadline"):
                control.poll()

    def test_initialize_never_reads_relay_or_leaks_on_alias(self):
        _, _, request = self.prepared_request()
        a, b = self.pair(); relay, peer = self.pair()
        peer.sendall(b"synthetic relay content")
        before = set(os.listdir("/dev/fd"))
        with mock.patch.object(launcher, "bind_launcher_parent") as bind:
            with mock.patch.object(launcher, "_arm_setup_alarm") as arm:
                control = launcher.initialize_setup(request, a.fileno(), relay.fileno())
                self.assertEqual(relay.recv(64), b"synthetic relay content")
                bind.assert_called_once_with(request.parent); arm.assert_called_once()
                control.close()
                arm.reset_mock()
                with self.assertRaisesRegex(launcher.InventoryError, "channel_alias"):
                    launcher.initialize_setup(request, a.fileno(), a.fileno())
                arm.assert_not_called()
        self.assertEqual(set(os.listdir("/dev/fd")), before)

    def test_cancel_after_mkdir_leaves_empty_governed_home(self):
        root, _, request = self.prepared_request()
        a, peer = self.pair(); relay, _ = self.pair()
        with mock.patch.object(launcher, "bind_launcher_parent"), mock.patch.object(launcher, "_arm_setup_alarm"):
            control = launcher.initialize_setup(request, a.fileno(), relay.fileno())
        self.addCleanup(control.close)
        original = launcher._new_home
        def cancel(value):
            original(value); peer.sendall(b"TERM\n")
        with mock.patch.object(launcher, "_launcher_identity", return_value=self.identity()):
            with mock.patch.object(launcher, "_new_home", side_effect=cancel):
                with self.assertRaisesRegex(launcher.InventoryError, "cancelled"):
                    with launcher.prepare_lease(request, control.poll):
                        self.fail("cancelled")
        self.assertEqual(list((root / self.attempt).iterdir()), [])
        with launcher.drain_generation(str(root), 10):
            pass

    def test_prepare_cannot_reset_initialized_setup_deadline(self):
        root, _, request = self.prepared_request()
        a, _ = self.pair(); relay, _ = self.pair()
        with mock.patch.object(launcher, "bind_launcher_parent"), mock.patch.object(launcher, "_arm_setup_alarm"):
            with mock.patch.object(launcher.time, "monotonic", return_value=100):
                control = launcher.initialize_setup(request, a.fileno(), relay.fileno())
        self.addCleanup(control.close)
        with mock.patch.object(launcher.time, "monotonic", return_value=131):
            with self.assertRaisesRegex(launcher.InventoryError, "setup_deadline"):
                with launcher.prepare_lease(request, control.poll):
                    self.fail("reset clock")
        self.assertFalse((root / self.attempt).exists())


class TemplateTests(ScratchTests):
    def setUp(self):
        super().setUp()
        self.template = self.base / 'template'
        self.template.mkdir(mode=0o700)
        self.destination = self.base / 'copy'
        self.runtime = '/approved/runtime'
        self.addCleanup(self.thaw)

    def thaw(self):
        for root, dirs, files in os.walk(self.template, followlinks=False):
            os.chmod(root, 0o700)

    def freeze(self):
        for root, dirs, files in os.walk(self.template, followlinks=False):
            for name in files:
                path = Path(root) / name
                if not path.is_symlink():
                    os.chmod(path, 0o555 if path.stat().st_mode & 0o111 else 0o444)
            os.chmod(root, 0o555)

    def inventory(self, checkpoint=lambda: None):
        return launcher.template_inventory(str(self.template), self.runtime, checkpoint)

    def copy(self, digest, checkpoint=lambda: None):
        return launcher.copy_template(str(self.template), str(self.destination), self.runtime, digest, checkpoint)

    def test_exact_recipe_and_private_fresh_copy(self):
        import hashlib
        (self.template / 'd').mkdir()
        (self.template / 'd' / 'f').write_bytes(b'abc')
        (self.template / 'z').write_bytes(b'run')
        os.chmod(self.template / 'z', 0o755)
        os.symlink('d/f', self.template / 'l')
        os.symlink(self.runtime + '/asset', self.template / 'r')
        self.freeze()
        entries, digest = self.inventory()
        lines = [b'd d', b'f d/f - ' + hashlib.sha256(b'abc').hexdigest().encode(),
                 b'l l ' + b'd/f'.hex().encode(),
                 b'l r ' + (self.runtime + '/asset').encode().hex().encode(),
                 b'f z x ' + hashlib.sha256(b'run').hexdigest().encode()]
        self.assertEqual(digest, 'sophia-reply-tree-v1:sha256:' + hashlib.sha256(b'\n'.join(lines)).hexdigest())
        self.assertEqual(self.copy(digest), digest)
        for relative, mode in (('', 0o700), ('d', 0o700), ('d/f', 0o600), ('z', 0o700)):
            self.assertEqual((self.destination / relative).stat().st_mode & 0o777, mode)
        self.assertEqual(os.readlink(self.destination / 'l'), 'd/f')
        self.assertEqual(os.readlink(self.destination / 'r'), self.runtime + '/asset')
        self.assertEqual((self.destination / 'd/f').read_bytes(), b'abc')

    def test_hardlinks_copied_independently_and_hidden_files_included(self):
        (self.template / '.f').write_bytes(b'synthetic')
        os.link(self.template / '.f', self.template / 'b')
        self.freeze()
        entries, digest = self.inventory()
        self.assertEqual([e.path for e in entries], ['.f', 'b'])
        self.copy(digest)
        self.assertNotEqual((self.destination / '.f').stat().st_ino, (self.destination / 'b').stat().st_ino)

    def test_bad_digest_refuses_before_destination_write(self):
        self.freeze()
        with self.assertRaisesRegex(launcher.InventoryError, 'template_digest_mismatch'):
            self.copy('wrong')
        self.assertFalse(self.destination.exists())

    def test_destination_scope_and_existing_occupant(self):
        self.freeze()
        _, digest = self.inventory()
        for path in (str(self.template), str(self.template / 'nested'), str(self.base), str(self.base) + '/copy/../x'):
            with self.subTest(path=path), self.assertRaisesRegex(launcher.InventoryError, 'template_destination'):
                launcher.copy_template(str(self.template), path, self.runtime, digest, lambda: None)
        self.destination.mkdir()
        (self.destination / 'keep').write_bytes(b'keep')
        with self.assertRaises(FileExistsError):
            self.copy(digest)
        self.assertEqual((self.destination / 'keep').read_bytes(), b'keep')

    def test_link_escape_dangling_and_cycle_refuse(self):
        for target in ('../outside', '/elsewhere/file', self.runtime + '-other/file', 'missing', 'bad'):
            with self.subTest(target=target):
                self.thaw()
                link = self.template / 'bad'
                if link.is_symlink(): link.unlink()
                os.symlink(target, link)
                self.freeze()
                with self.assertRaises(launcher.InventoryError): self.inventory()

    def test_link_chain_directory_and_parent_resolution(self):
        (self.template / 'd').mkdir()
        (self.template / 'd/f').write_bytes(b'a')
        os.symlink('d', self.template / 'alias')
        os.symlink('alias/../d/f', self.template / 'link')
        os.symlink('../link', self.template / 'd/link')
        self.freeze()
        _, digest = self.inventory()
        self.copy(digest)
        self.assertEqual(os.readlink(self.destination / 'd/link'), '../link')

    def test_file_traversal_and_indirect_runtime_escape_refuse(self):
        (self.template / 'f').write_bytes(b'a')
        os.symlink(self.runtime + '/asset', self.template / 'external')
        for target in ('f/../f', 'external/../../outside'):
            self.thaw()
            link = self.template / 'bad'
            if link.is_symlink(): link.unlink()
            os.symlink(target, link)
            self.freeze()
            with self.subTest(target=target), self.assertRaises(launcher.InventoryError): self.inventory()

    def test_special_file_and_writable_template_refuse(self):
        with self.assertRaisesRegex(launcher.InventoryError, 'template_not_readonly'): self.inventory()
        os.mkfifo(self.template / 'fifo', 0o400)
        self.freeze()
        with self.assertRaisesRegex(launcher.InventoryError, 'template_special_file'): self.inventory()

    def test_ambiguous_name_refuses(self):
        (self.template / 'bad\nname').write_bytes(b'x')
        self.freeze()
        with self.assertRaisesRegex(launcher.InventoryError, 'template_name'): self.inventory()

    def test_entry_file_and_total_bounds(self):
        (self.template / 'a').write_bytes(b'abc')
        (self.template / 'b').write_bytes(b'xyz')
        self.freeze()
        for name, limit in (('TEMPLATE_ENTRIES', 1), ('TEMPLATE_FILE_BYTES', 2), ('TEMPLATE_TOTAL_BYTES', 5)):
            with self.subTest(name=name), mock.patch.object(launcher, name, limit):
                with self.assertRaises(launcher.InventoryError): self.inventory()

    def test_source_change_after_inventory_refuses_and_keeps_partial(self):
        (self.template / 'a').write_bytes(b'abc')
        self.freeze()
        _, digest = self.inventory()
        original = launcher._copy_template_file
        def change(source, destination, entry, checkpoint):
            os.chmod(self.template / 'a', 0o600)
            (self.template / 'a').write_bytes(b'xyz')
            return original(source, destination, entry, checkpoint)
        with mock.patch.object(launcher, '_copy_template_file', side_effect=change):
            with self.assertRaisesRegex(launcher.InventoryError, 'template_changed'): self.copy(digest)
        self.assertTrue(self.destination.exists())

    def test_corrupted_copy_refuses(self):
        (self.template / 'a').write_bytes(b'abc')
        self.freeze()
        _, digest = self.inventory()
        original = launcher._copy_template_file
        def corrupt(source, destination, entry, checkpoint):
            original(source, destination, entry, checkpoint)
            (self.destination / 'a').write_bytes(b'xyz')
        with mock.patch.object(launcher, '_copy_template_file', side_effect=corrupt):
            with self.assertRaisesRegex(launcher.InventoryError, 'template_digest_mismatch'): self.copy(digest)
        self.assertTrue(self.destination.exists())

    def test_cancellation_during_final_digest_refuses_success(self):
        self.freeze()
        _, digest = self.inventory()
        original = launcher._template_lines
        cancelled = [False]
        calls = [0]
        def lines(entries):
            result = original(entries)
            calls[0] += 1
            if calls[0] == 2:
                cancelled[0] = True
            return result
        def checkpoint():
            if cancelled[0]:
                raise launcher.InventoryError('setup_cancelled')
        with mock.patch.object(launcher, '_template_lines', side_effect=lines):
            with self.assertRaisesRegex(launcher.InventoryError, 'setup_cancelled'):
                self.copy(digest, checkpoint)
        self.assertTrue(cancelled[0])
        self.assertTrue(self.destination.exists())

    def test_partial_writes_complete_exactly(self):
        (self.template / 'a').write_bytes(b'abcdefgh')
        self.freeze()
        _, digest = self.inventory()
        original = os.write
        with mock.patch.object(launcher.os, 'write', side_effect=lambda fd, data: original(fd, data[:2])):
            self.copy(digest)
        self.assertEqual((self.destination / 'a').read_bytes(), b'abcdefgh')

    def test_cancellation_during_copy_keeps_partial(self):
        (self.template / 'a').write_bytes(b'x' * 200000)
        self.freeze()
        _, digest = self.inventory()
        def cancel():
            path = self.destination / 'a'
            if path.exists() and path.stat().st_size:
                raise launcher.InventoryError('setup_cancelled')
        with self.assertRaisesRegex(launcher.InventoryError, 'setup_cancelled'): self.copy(digest, cancel)
        self.assertGreater((self.destination / 'a').stat().st_size, 0)
        self.assertLess((self.destination / 'a').stat().st_size, 200000)

    def test_symlink_parent_refuses_without_target_mutation(self):
        alias = self.base / 'alias'
        os.symlink(self.template, alias)
        with self.assertRaises(OSError):
            launcher.template_inventory(str(alias), self.runtime, lambda: None)


class LayoutTests(LockTests):
    attempt = PrepareTests.attempt
    nonce = PrepareTests.nonce
    argv = PrepareTests.argv
    prepared_request = PrepareTests.prepared_request
    identity = PrepareTests.identity
    prepare = PrepareTests.prepare

    def test_layout_modes_descriptors_and_lease_retention(self):
        root, _, request = self.prepared_request()
        with mock.patch.object(launcher, '_launcher_identity', return_value=self.identity()):
            with self.prepare(request) as lease:
                outputs = launcher.prepare_layout(request, lease, lambda: None)
                try:
                    for relative in ('home', 'home/tmp', 'dsh-home', 'dsh-home/profiles', 'work', 'diag'):
                        self.assertEqual((root / self.attempt / relative).stat().st_mode & 0o777, 0o700)
                    for fd in outputs:
                        self.assertEqual(os.fstat(fd).st_mode & 0o777, 0o600)
                        self.assertFalse(os.get_inheritable(fd))
                    os.fstat(lease)
                finally:
                    for fd in outputs: os.close(fd)

    def test_layout_cancellation_keeps_partial_and_lease(self):
        root, _, request = self.prepared_request()
        def cancel():
            if (root / self.attempt / 'home').exists():
                raise launcher.InventoryError('setup_cancelled')
        with mock.patch.object(launcher, '_launcher_identity', return_value=self.identity()):
            with self.prepare(request) as lease:
                with self.assertRaisesRegex(launcher.InventoryError, 'setup_cancelled'):
                    launcher.prepare_layout(request, lease, cancel)
                os.fstat(lease)
        self.assertTrue((root / self.attempt / 'home').is_dir())
        self.assertFalse((root / self.attempt / 'dsh-home').exists())

    def test_layout_existing_home_not_reused(self):
        root, _, request = self.prepared_request()
        with mock.patch.object(launcher, '_launcher_identity', return_value=self.identity()):
            with self.prepare(request) as lease:
                (root / self.attempt / 'home').mkdir()
                with self.assertRaises(FileExistsError): launcher.prepare_layout(request, lease, lambda: None)
                self.assertFalse((root / self.attempt / 'diag').exists())


class ComposedSetupTests(LockTests):
    attempt = PrepareTests.attempt
    nonce = PrepareTests.nonce
    argv = PrepareTests.argv
    prepared_request = PrepareTests.prepared_request
    identity = PrepareTests.identity
    pair = SetupTests.pair

    def fixture(self):
        from dataclasses import replace
        root, _, request = self.prepared_request()
        template = self.base / 'frozen'
        template.mkdir(mode=0o700)
        (template / 'static').write_bytes(b'synthetic profile')
        os.chmod(template / 'static', 0o444)
        os.chmod(template, 0o555)
        self.addCleanup(os.chmod, template, 0o700)
        _, digest = launcher.template_inventory(str(template), request.runtime_dir, lambda: None)
        request = replace(request, template=str(template), template_digest=digest)
        control, peer = self.pair()
        relay, relay_peer = self.pair()
        return root, request, control, peer, relay, relay_peer

    @contextlib.contextmanager
    def prepare(self, request, control, relay):
        with mock.patch.object(launcher, 'bind_launcher_parent'):
            with mock.patch.object(launcher, '_arm_setup_alarm'):
                with mock.patch.object(launcher, '_launcher_identity', return_value=self.identity()):
                    with launcher.prepared_reply_setup(request, control.fileno(), relay.fileno()) as result:
                        yield result

    def test_composition_owns_files_control_lease_and_diagnostics(self):
        root, request, control, peer, relay, relay_peer = self.fixture()
        relay_peer.sendall(b'untouched')
        with self.prepare(request, control, relay) as prepared:
            prepared.checkpoint()
            lease = prepared.lease
            diagnostics = prepared.diagnostics
            channel = prepared.control.stream
            profile = root / self.attempt / 'dsh-home/profiles' / request.profile_name / 'static'
            self.assertEqual(profile.read_bytes(), b'synthetic profile')
            self.assertEqual(relay.recv(9), b'untouched')
            for fd in (lease,) + diagnostics: os.fstat(fd)
            with mock.patch.object(launcher.os, 'dup2') as redirect:
                prepared.redirect_diagnostics()
            self.assertEqual(redirect.call_args_list, [mock.call(diagnostics[0], 1, inheritable=True),
                                                      mock.call(diagnostics[1], 2, inheritable=True)])
        for fd in (lease,) + diagnostics:
            with self.assertRaises(OSError): os.fstat(fd)
        self.assertEqual(channel.fileno(), -1)
        self.assertTrue(profile.exists())
        with self.assertRaisesRegex(launcher.InventoryError, 'setup_closed'): prepared.checkpoint()
        control.fileno(); relay.fileno()  # Original channels are caller-owned.

    def test_cancel_before_admission_creates_no_home(self):
        root, request, control, peer, relay, _ = self.fixture()
        peer.sendall(b'TERM\n')
        with self.assertRaisesRegex(launcher.InventoryError, 'cancelled'):
            with self.prepare(request, control, relay): self.fail('cancelled')
        self.assertFalse((root / self.attempt).exists())

    def test_original_deadline_is_not_reset_by_preparation(self):
        _, request, control, _, relay, _ = self.fixture()
        with mock.patch.object(launcher.time, 'monotonic', return_value=100):
            with self.prepare(request, control, relay) as prepared:
                self.assertEqual(prepared.control.deadline, 130)
                with mock.patch.object(launcher.time, 'monotonic', return_value=130):
                    with self.assertRaisesRegex(launcher.InventoryError, 'setup_deadline'): prepared.checkpoint()
                with self.assertRaisesRegex(launcher.InventoryError, 'setup_fence_unconfirmed'): prepared.checkpoint()

    def test_seal_before_next_write_stops_copy_and_preserves_partial(self):
        root, request, control, _, relay, _ = self.fixture()
        sealed = root.with_name('sealed-test')
        original = launcher._copy_template_bytes
        def seal(source, destination, entry, checkpoint):
            root.rename(sealed)
            return original(source, destination, entry, checkpoint)
        with mock.patch.object(launcher, '_copy_template_bytes', side_effect=seal):
            with self.assertRaises(OSError):
                with self.prepare(request, control, relay): self.fail('sealed')
        partial = sealed / self.attempt / 'dsh-home/profiles' / request.profile_name / 'static'
        self.assertEqual(partial.read_bytes(), b'')
        lease = os.open(sealed / self.attempt / 'lease.json', os.O_RDONLY)
        try: launcher._life_lock(lease)
        finally: os.close(lease)

    def test_same_name_new_generation_refuses_and_is_sticky(self):
        root, request, control, _, relay, _ = self.fixture()
        with self.prepare(request, control, relay) as prepared:
            sealed = root.with_name('sealed-test'); root.rename(sealed); root.mkdir(mode=0o700)
            with self.assertRaisesRegex(launcher.InventoryError, 'admission_changed'): prepared.checkpoint()
            root.rmdir(); sealed.rename(root)
            with self.assertRaisesRegex(launcher.InventoryError, 'setup_fence_unconfirmed'): prepared.checkpoint()

    def test_changed_lease_refuses_even_when_same_named_inode(self):
        _, request, control, _, relay, _ = self.fixture()
        with self.prepare(request, control, relay) as prepared:
            os.write(prepared.lease, b'changed')
            with self.assertRaisesRegex(launcher.InventoryError, 'lease_changed'): prepared.checkpoint()

    def test_late_cancel_prevents_yield_and_releases_owned_fds(self):
        root, request, control, peer, relay, _ = self.fixture()
        original = launcher.copy_template
        captured = []
        original_layout = launcher.prepare_layout
        def layout(*args):
            result = original_layout(*args); captured.extend(result); return result
        def late(*args):
            result = original(*args); peer.sendall(b'KILL\n'); return result
        with mock.patch.object(launcher, 'copy_template', side_effect=late):
            with mock.patch.object(launcher, 'prepare_layout', side_effect=layout):
                with self.assertRaisesRegex(launcher.InventoryError, 'cancelled'):
                    with self.prepare(request, control, relay): self.fail('late cancellation')
        self.assertEqual(len(captured), 2)
        for fd in captured:
            with self.assertRaises(OSError): os.fstat(fd)
        self.assertTrue((root / self.attempt / 'lease.json').exists())

    def test_redirect_failure_cannot_resume_after_partial_transfer(self):
        _, request, control, _, relay, _ = self.fixture()
        with self.prepare(request, control, relay) as prepared:
            with mock.patch.object(launcher.os, 'dup2', side_effect=[None, OSError('synthetic')]) as redirect:
                with self.assertRaises(OSError): prepared.redirect_diagnostics()
            self.assertEqual(redirect.call_count, 2)
            with self.assertRaisesRegex(launcher.InventoryError, 'diagnostic_redirect_unconfirmed'):
                prepared.checkpoint()
            for fd in prepared.diagnostics: os.fstat(fd)

    def test_body_error_still_releases_all_owned_descriptors(self):
        _, request, control, _, relay, _ = self.fixture()
        with self.assertRaisesRegex(RuntimeError, 'synthetic'):
            with self.prepare(request, control, relay) as prepared:
                descriptors = (prepared.lease,) + prepared.diagnostics
                channel = prepared.control.stream
                raise RuntimeError('synthetic')
        for fd in descriptors:
            with self.assertRaises(OSError): os.fstat(fd)
        self.assertEqual(channel.fileno(), -1)


def evaluate_reply_filter(program, number, argument=0, architecture=0xC000003E):
    """Small independent classic-BPF interpreter over synthetic seccomp_data."""
    import struct
    data = struct.pack('<IIQ6Q', number & 0xffffffff, architecture, 0, argument & 0xffffffffffffffff, 0, 0, 0, 0, 0)
    index = 0
    accumulator = 0
    for _ in range(len(program) + 1):
        if not 0 <= index < len(program): raise AssertionError('jump outside program')
        code, yes, no, value = program[index]
        if code == 0x20:
            if value % 4 or not 0 <= value <= len(data) - 4: raise AssertionError('invalid load')
            accumulator = struct.unpack_from('<I', data, value)[0]
            index += 1
        elif code == 0x15:
            index += 1 + (yes if accumulator == value else no)
        elif code == 0x45:
            index += 1 + (yes if accumulator & value else no)
        elif code == 0x35:
            index += 1 + (yes if accumulator >= value else no)
        elif code == 0x06:
            return value
        else:
            raise AssertionError('unexpected instruction')
    raise AssertionError('unterminated program')


class FilterTests(unittest.TestCase):
    def setUp(self):
        self.program = launcher.reply_seccomp_program(1234)
        self.allow = 0x7fff0000
        self.denied = 0x00050001

    def verdict(self, syscall, argument=0):
        return evaluate_reply_filter(self.program, syscall, argument)

    def test_architecture_and_x32_fail_closed(self):
        for architecture in (0, 0x40000003, 0xc00000b7, 0x8000003e):
            for number in (0, 41, 56, 62, 435):
                self.assertEqual(evaluate_reply_filter(self.program, number, 1234, architecture), 0x80000000)
        for number in (0, 41, 56, 62, 435):
            self.assertEqual(self.verdict(number | 0x40000000, 1234), 0x80000000)

    def test_unflagged_legacy_x32_aliases_refuse_without_kernel_assumptions(self):
        for number in range(512, 548):
            self.assertEqual(self.verdict(number, 1234), 0x80000000)
        for number in (511, 548, 549):
            self.assertEqual(self.verdict(number, 1234), self.allow)

    def test_process_creation_and_pidfd_access_denied(self):
        for number in (57, 58, 200, 424, 434, 438):
            for arg in (0, 1234, -1, 1 << 63):
                self.assertEqual(self.verdict(number, arg), self.denied)
        self.assertEqual(self.verdict(435, 0), 0x00050026)  # Linux ENOSYS38.

    def test_clone_requires_actual_low_word_thread_bit(self):
        for flags in (0, 17, 0x100, 0x4000, 0x0001000000000000):
            self.assertEqual(self.verdict(56, flags), self.denied)
        for flags in (0x10000, 0x10f00, 0x3d0f00, 0x8000000000010000):
            self.assertEqual(self.verdict(56, flags), self.allow)

    def test_signal_target_is_own_process_after_int_truncation(self):
        for number in (62, 129, 234, 297):
            for target in (0, -1, -1234, 1, 1233, 1235, 1 << 32):
                self.assertEqual(self.verdict(number, target), self.denied)
            for target in (1234, (1 << 32) | 1234, (0xffffffff << 32) | 1234):
                self.assertEqual(self.verdict(number, target), self.allow)

    def test_unix_family_cannot_hide_in_upper_argument_bits(self):
        for number in (41, 53):
            for family in (1, 0x100000001, 0xffffffff00000001):
                self.assertEqual(self.verdict(number, family), self.denied)
            for family in (2, 10, 0x100000002):
                self.assertEqual(self.verdict(number, family), self.allow)

    def test_io_uring_cannot_bypass_socket_creation_policy(self):
        for number in (425, 426, 427):
            for argument in (0, 1, 3, -1, 1234, 0x100000001, 0xffffffffffffffff):
                self.assertEqual(self.verdict(number, argument), self.denied)

    def test_unrelated_calls_preserved_and_all_paths_terminate(self):
        special = {41, 53, 56, 57, 58, 62, 129, 200, 234, 297, 424, 425, 426, 427, 434, 435, 438}
        for number in range(549):
            for arg in (0, 1, 2, 1234, 0x10000):
                result = self.verdict(number, arg)
                if number not in special and not 512 <= number <= 547: self.assertEqual(result, self.allow)
        self.assertIsInstance(self.program, tuple)
        self.assertLess(len(self.program), 4096)

    def test_pid_is_required_and_bound_in_program(self):
        for pid in (0, -1, True, '1234', 2147483648):
            with self.assertRaisesRegex(launcher.InventoryError, 'filter_identity'): launcher.reply_seccomp_program(pid)
        other = launcher.reply_seccomp_program(4321)
        self.assertEqual(evaluate_reply_filter(other, 62, 1234), self.denied)
        self.assertEqual(evaluate_reply_filter(other, 62, 4321), self.allow)


class CapabilityTests(unittest.TestCase):
    @contextlib.contextmanager
    def supported(self, abi=4, seccomp=0):
        with contextlib.ExitStack() as stack:
            stack.enter_context(mock.patch.object(launcher, '_process_support', return_value=True))
            calls = stack.enter_context(mock.patch.object(launcher, '_linux_syscall', side_effect=[abi, seccomp]))
            pidfd = stack.enter_context(mock.patch.object(launcher.os, 'pidfd_open', return_value=65432, create=True))
            send = stack.enter_context(mock.patch.object(launcher.signal, 'pidfd_send_signal', create=True))
            close = stack.enter_context(mock.patch.object(launcher.os, 'close'))
            stack.enter_context(mock.patch.object(launcher.os, 'getpid', return_value=1234))
            yield calls, pidfd, send, close

    def test_known_abi_rights_and_exact_readonly_query_calls(self):
        for abi in range(4, 12):
            with self.subTest(abi=abi), self.supported(abi) as (calls, pidfd, send, close):
                result = launcher.query_linux_capabilities(lambda: None)
                self.assertEqual(result.landlock_abi, abi)
                self.assertEqual(result.handled_filesystem, (1 << (15 if abi == 4 else 16 if abi < 9 else 17)) - 1)
                first, second = calls.call_args_list
                self.assertEqual(first.args[0], 444)
                self.assertEqual([v.value for v in first.args[1]], [None, 0, 1])
                self.assertEqual(second.args[0], 317)
                self.assertEqual([v.value for v in second.args[1][:2]], [2, 0])
                self.assertEqual(second.args[1][2]._obj.value, 0x80000000)
                pidfd.assert_called_once_with(1234, 0)
                send.assert_called_once_with(65432, 0, None, 0)
                close.assert_called_once_with(65432)

    def test_unknown_old_or_malformed_abi_refuses_without_pidfd(self):
        for abi in (-1, 0, 1, 2, 3, 12, 99, True, '4'):
            with self.subTest(abi=abi), self.supported(abi) as (calls, pidfd, send, close):
                with self.assertRaisesRegex(launcher.InventoryError, 'landlock_abi_unqualified'):
                    launcher.query_linux_capabilities(lambda: None)
                self.assertEqual(calls.call_count, 1)
                pidfd.assert_not_called(); send.assert_not_called(); close.assert_not_called()

    def test_unsupported_host_refuses_before_any_libc_or_pidfd(self):
        with mock.patch.object(launcher, '_process_support', return_value=False):
            with mock.patch.object(launcher, '_linux_syscall') as calls:
                with self.assertRaisesRegex(launcher.InventoryError, 'process_capability_unavailable'):
                    launcher.query_linux_capabilities(lambda: None)
                calls.assert_not_called()

    def test_seccomp_query_failure_cannot_be_read_as_available(self):
        with self.supported(seccomp=1) as (_, pidfd, send, close):
            with self.assertRaisesRegex(launcher.InventoryError, 'seccomp_query_unconfirmed'):
                launcher.query_linux_capabilities(lambda: None)
            pidfd.assert_not_called(); send.assert_not_called(); close.assert_not_called()

    def test_pidfd_signal_zero_failure_closes_and_refuses(self):
        with self.supported() as (_, _, send, close):
            send.side_effect = OSError('synthetic')
            with self.assertRaisesRegex(launcher.InventoryError, 'linux_capability_unconfirmed'):
                launcher.query_linux_capabilities(lambda: None)
            close.assert_called_once_with(65432)

    def test_cancellation_with_open_pidfd_closes_it(self):
        ticks = [0]
        def checkpoint():
            ticks[0] += 1
            if ticks[0] == 4: raise launcher.InventoryError('cancelled')
        with self.supported() as (_, pidfd, send, close):
            with self.assertRaisesRegex(launcher.InventoryError, 'cancelled'):
                launcher.query_linux_capabilities(checkpoint)
            pidfd.assert_called_once(); send.assert_not_called(); close.assert_called_once_with(65432)

    def test_late_query_completion_cannot_bypass_final_checkpoint(self):
        ticks = [0]
        def checkpoint():
            ticks[0] += 1
            if ticks[0] == 6: raise launcher.InventoryError('deadline')
        with self.supported() as (_, _, _, close):
            with self.assertRaisesRegex(launcher.InventoryError, 'deadline'):
                launcher.query_linux_capabilities(checkpoint)
            close.assert_called_once_with(65432)

    def test_libc_wrapper_types_return_and_fixed_refusal(self):
        libc = mock.Mock()
        libc.syscall.return_value = 4
        with mock.patch.object(launcher.ctypes, 'CDLL', return_value=libc) as load:
            self.assertEqual(launcher._linux_syscall(444, ()), 4)
            load.assert_called_once_with(None, use_errno=True)
            self.assertIs(libc.syscall.restype, launcher.ctypes.c_long)
            self.assertEqual(libc.syscall.argtypes, (launcher.ctypes.c_long,))
            self.assertEqual(libc.syscall.call_args.args[0].value, 444)
            libc.syscall.return_value = -1
            with self.assertRaisesRegex(launcher.InventoryError, 'linux_query_unavailable'):
                launcher._linux_syscall(317, ())


if __name__ == "__main__":
    unittest.main()


class ChildDescriptorTests(unittest.TestCase):
    @contextlib.contextmanager
    def isolated(self, inventories):
        with contextlib.ExitStack() as stack:
            stack.enter_context(mock.patch.object(launcher.platform, 'system', return_value='Linux'))
            listing = stack.enter_context(mock.patch.object(launcher.os, 'listdir', side_effect=inventories))
            stat_fd = stack.enter_context(mock.patch.object(launcher.os, 'fstat'))
            close = stack.enter_context(mock.patch.object(launcher.os, 'close'))
            flags = stack.enter_context(mock.patch.object(launcher.os, 'set_inheritable'))
            stack.enter_context(mock.patch.object(launcher.os, 'get_inheritable', side_effect=lambda fd: fd < 4))
            yield listing, stat_fd, close, flags

    def test_closes_high_fds_and_preserves_only_explicit_exec_boundary(self):
        with self.isolated([['0','1','2','3','7','8','4096','99999'], ['0','1','2','3','7','8']]) as (_, _, close, flags):
            launcher.close_reply_descriptors(7, 8)
            self.assertEqual(close.call_args_list, [mock.call(4096), mock.call(99999)])
            self.assertEqual(flags.call_args_list, [mock.call(fd, fd < 4) for fd in (0,1,2,3,7,8)])

    def test_enumeration_ghost_is_ignored_only_when_no_longer_open(self):
        with self.isolated([['0','1','2','3','7','8','9'], ['0','1','2','3','7','8','9']]) as (_, stat_fd, close, _):
            close.side_effect = OSError(errno.EBADF, 'closed iterator')
            stat_fd.side_effect = lambda fd: (_ for _ in ()).throw(OSError(errno.EBADF, 'closed')) if fd == 9 else None
            launcher.close_reply_descriptors(7, 8)
            close.assert_called_once_with(9)

    def test_surviving_or_new_descriptor_refuses(self):
        with self.isolated([['0','1','2','3','7','8'], ['0','1','2','3','7','8','100000']]):
            with self.assertRaisesRegex(launcher.InventoryError, 'descriptor_closure_unconfirmed'):
                launcher.close_reply_descriptors(7, 8)

    def test_close_error_is_not_retried_or_reported_as_success(self):
        with self.isolated([['0','1','2','3','7','8','9'], ['0','1','2','3','7','8']]) as (listing, _, close, _):
            close.side_effect = OSError(errno.EINTR, 'uncertain')
            with self.assertRaisesRegex(launcher.InventoryError, 'descriptor_closure_unconfirmed'):
                launcher.close_reply_descriptors(7, 8)
            close.assert_called_once_with(9)
            self.assertEqual(listing.call_count, 1)

    def test_wrong_inheritance_refuses(self):
        with self.isolated([[], []]), mock.patch.object(launcher.os, 'get_inheritable', return_value=True):
            with self.assertRaisesRegex(launcher.InventoryError, 'descriptor_inheritance_unconfirmed'):
                launcher.close_reply_descriptors(7, 8)

    def test_invalid_or_aliased_owned_fds_never_close(self):
        for pair in ((3,8),(7,7),(True,8),('7',8),(7,2147483648)):
            with self.isolated([]) as (_, _, close, _):
                with self.assertRaisesRegex(launcher.InventoryError, 'descriptor_identity'):
                    launcher.close_reply_descriptors(*pair)
                close.assert_not_called()

    def test_bad_inventory_and_unsupported_host_refuse(self):
        for names in (['01'], ['-1'], ['x'], ['4','4'], ['2147483648'], ['4'] * 16385):
            with self.isolated([names]):
                with self.assertRaisesRegex(launcher.InventoryError, 'descriptor_inventory'):
                    launcher.close_reply_descriptors(7, 8)
        with mock.patch.object(launcher.platform, 'system', return_value='Darwin'):
            with self.assertRaisesRegex(launcher.InventoryError, 'descriptor_platform_unavailable'):
                launcher.close_reply_descriptors(7, 8)


class ChildEnvironmentTests(unittest.TestCase):
    attempt = PrepareTests.attempt
    nonce = PrepareTests.nonce
    argv = PrepareTests.argv

    def request(self, root='/replies/gen-a'):
        return launcher.parse_run_arguments(self.argv(root))

    def test_host_environment_and_credentials_cannot_cross(self):
        hostile = {'HOME':'/other-person', 'TMPDIR':'/shared', 'DSH_HOME':'/other-mission',
                   'NODE_OPTIONS':'--require=/untrusted', 'PYTHONPATH':'/untrusted',
                   'OPENAI_API_KEY':'synthetic-not-a-secret', 'ANTHROPIC_API_KEY':'synthetic',
                   'HTTP_PROXY':'http://synthetic.invalid', 'SOPHIA_REPLY_NONCE':'wrong',
                   'SOPHIA_RUNTIME_UNIT':'wrong', 'SOPHIA_REPLY_FD':'9'}
        with mock.patch.dict(launcher.os.environ, hostile, clear=True):
            before = dict(launcher.os.environ)
            env = launcher.reply_child_environment(self.request())
            self.assertEqual(dict(launcher.os.environ), before)
        home = '/replies/gen-a/' + self.attempt
        self.assertEqual(env, {'HOME':home+'/home', 'TMPDIR':home+'/home/tmp',
            'DSH_HOME':home+'/dsh-home', 'SOPHIA_WORKSPACE':home+'/work',
            'DSH_TELEMETRY_DISABLED':'1', 'LANG':'C.UTF-8', 'PATH':'/usr/bin:/bin',
            'SOPHIA_RUNTIME_UNIT':'sophia-runtime-test', 'SOPHIA_REPLY_FD':'3',
            'SOPHIA_REPLY_NONCE':self.nonce})

    def test_each_attempt_gets_fresh_environment_without_global_home_switch(self):
        first = launcher.reply_child_environment(self.request())
        second = launcher.reply_child_environment(self.request('/replies/gen-b'))
        first['HOME'] = '/tampered-result'
        first['OPENAI_API_KEY'] = 'synthetic'
        third = launcher.reply_child_environment(self.request())
        self.assertNotEqual(second['HOME'], third['HOME'])
        self.assertTrue(third['HOME'].startswith('/replies/gen-a/'))
        self.assertNotIn('OPENAI_API_KEY', third)
        self.assertNotIn('OPENAI_API_KEY', second)

    def test_direct_invalid_request_refuses_without_environment_read(self):
        from dataclasses import replace
        for request in (None, {}, replace(self.request(), root='/replies/gen-a/../gen-b'),
                        replace(self.request(), nonce='wrong'), replace(self.request(), unit='bad\x00unit')):
            with self.assertRaises(launcher.InventoryError):
                launcher.reply_child_environment(request)
        with mock.patch.object(launcher.os, 'environ', None):
            self.assertEqual(launcher.reply_child_environment(self.request())['SOPHIA_REPLY_FD'], '3')


class LandlockInstallTests(unittest.TestCase):
    def request(self):
        return launcher.parse_run_arguments(PrepareTests.argv(self, '/replies/gen-a'))

    attempt = PrepareTests.attempt
    nonce = PrepareTests.nonce

    @contextlib.contextmanager
    def installer(self):
        from types import SimpleNamespace
        request = self.request()
        cap = launcher.LinuxCapabilities(4, (1 << 15)-1)
        with contextlib.ExitStack() as stack:
            stack.enter_context(mock.patch.object(launcher, '_process_support', return_value=True))
            stack.enter_context(mock.patch.object(launcher.os, 'O_PATH', 0x200000, create=True))
            stack.enter_context(mock.patch.object(launcher.os, 'getpid', return_value=731))
            tasks = stack.enter_context(mock.patch.object(launcher.os, 'listdir', return_value=['731']))
            limits = stack.enter_context(mock.patch.object(launcher.resource, 'setrlimit'))
            getlimits = stack.enter_context(mock.patch.object(launcher.resource, 'getrlimit', return_value=(0,0)))
            paths = stack.enter_context(mock.patch.object(launcher, '_landlock_path', side_effect=lambda *a:contextlib.nullcontext(81)))
            opened = stack.enter_context(mock.patch.object(launcher.os, 'open', side_effect=OSError(errno.EACCES,'denied')))
            closed = stack.enter_context(mock.patch.object(launcher.os, 'close'))
            calls = []
            def syscall(number,args):
                calls.append((number,args))
                if number==444:
                    attrs=launcher.ctypes.cast(args[0],launcher.ctypes.POINTER(launcher._LandlockRuleset)).contents
                    self.assertEqual((attrs.filesystem,args[1].value,args[2].value),(32767,8,0))
                    return 63
                if number==157: return 1 if args[0].value==39 else 0
                return 0
            kernel = stack.enter_context(mock.patch.object(launcher,'_linux_syscall',side_effect=syscall))
            yield SimpleNamespace(request=request,cap=cap,tasks=tasks,limits=limits,getlimits=getlimits,
                                  paths=paths,opened=opened,closed=closed,calls=calls,kernel=kernel)

    def test_closed_policy_grants_only_three_writable_leaves(self):
        request=self.request();cap=launcher.LinuxCapabilities(9,131071)
        rules=launcher._landlock_rules(request,cap,('/usr/lib','/etc/ssl','/dev/null','/proc/self'))
        home=request.root+'/'+request.attempt
        self.assertEqual([row[0] for row in rules[:3]],[home+'/'+name for name in ('home','dsh-home','work')])
        self.assertTrue(all(row[1]==131071 and row[3] for row in rules[:3]))
        self.assertTrue(all(row[1] & ~13 == 0 and not row[3] for row in rules[3:]))
        self.assertFalse(any(row[0] in (request.root,home,home+'/lease.json',home+'/diag') for row in rules))

    def test_invalid_selection_capability_and_runtime_overlap_refuse_without_effect(self):
        from dataclasses import replace
        with self.installer() as r:
            for reads in (['/usr/lib'],('/etc',),('/usr/lib','/usr/lib'),(None,)):
                with self.assertRaises(launcher.InventoryError): launcher.install_reply_landlock(r.request,r.cap,reads)
            for cap in (None,launcher.LinuxCapabilities(3,32767),launcher.LinuxCapabilities(4,1)):
                with self.assertRaises(launcher.InventoryError): launcher.install_reply_landlock(r.request,cap,())
            for path in ('/replies',r.request.root,r.request.root+'/runtime'):
                request=replace(r.request,runtime_dir=path,entry=path+'/entry.js')
                with self.assertRaisesRegex(launcher.InventoryError,'landlock_read_overlap'):
                    launcher.install_reply_landlock(request,r.cap,())
            r.kernel.assert_not_called();r.limits.assert_not_called()

    def test_installs_rules_nnp_restriction_then_requires_both_denials(self):
        with self.installer() as r:
            launcher.install_reply_landlock(r.request,r.cap,('/usr/lib',))
            numbers=[n for n,_ in r.calls]
            self.assertEqual(numbers,[444]+[445]*6+[157,157,446])
            self.assertEqual([a[0].value for n,a in r.calls if n==157],[38,39])
            self.assertEqual(r.paths.call_count,6)
            r.limits.assert_called_once_with(launcher.resource.RLIMIT_CORE,(0,0))
            r.closed.assert_called_once_with(63)
            self.assertEqual(r.opened.call_count,2)
            self.assertIn('/.con01-denial-',r.opened.call_args_list[0].args[0])
            self.assertTrue(r.opened.call_args_list[1].args[0].endswith('/lease.json'))

    def test_noninteger_rights_refuse_before_any_os_effect(self):
        for rights in (32767.0, True, '32767', None):
            with self.installer() as r:
                cap=launcher.LinuxCapabilities(4,rights)
                with self.assertRaisesRegex(launcher.InventoryError,'landlock_capability_binding'):
                    launcher.install_reply_landlock(r.request,cap,())
                r.kernel.assert_not_called();r.limits.assert_not_called()
                r.tasks.assert_not_called();r.opened.assert_not_called();r.closed.assert_not_called()

    def test_failed_rule_and_restriction_close_owned_ruleset_and_do_not_probe(self):
        for failure in (445,446):
            with self.installer() as r:
                original=r.kernel.side_effect
                r.kernel.side_effect=lambda n,a:1 if n==failure else original(n,a)
                with self.assertRaises(launcher.InventoryError): launcher.install_reply_landlock(r.request,r.cap,())
                r.closed.assert_called_once_with(63);r.opened.assert_not_called()

    def test_failed_creation_owns_no_ruleset_and_uncertain_close_is_not_success(self):
        with self.installer() as r:
            r.kernel.side_effect=launcher.InventoryError('linux_query_unavailable')
            with self.assertRaises(launcher.InventoryError): launcher.install_reply_landlock(r.request,r.cap,())
            r.closed.assert_not_called();r.opened.assert_not_called()
        with self.installer() as r:
            r.closed.side_effect=OSError(errno.EIO,'uncertain')
            with self.assertRaisesRegex(launcher.InventoryError,'landlock_install_unconfirmed'):
                launcher.install_reply_landlock(r.request,r.cap,())
            r.closed.assert_called_once_with(63);r.opened.assert_not_called()

    def test_bad_thread_core_or_privilege_cannot_restrict(self):
        for failure in ('thread','core','set-nnp','get-nnp'):
            with self.installer() as r:
                if failure=='thread':r.tasks.return_value=['731','732']
                if failure=='core':r.getlimits.return_value=(0,1)
                original=r.kernel.side_effect
                def syscall(n,a):
                    if n==157 and a[0].value==38 and failure=='set-nnp':return 1
                    if n==157 and a[0].value==39 and failure=='get-nnp':return 0
                    return original(n,a)
                r.kernel.side_effect=syscall
                with self.assertRaises(launcher.InventoryError):launcher.install_reply_landlock(r.request,r.cap,())
                self.assertNotIn(446,[call.args[0] for call in r.kernel.call_args_list])
                r.opened.assert_not_called()

    def test_self_test_needs_access_denial_not_missing_busy_or_existing_file(self):
        for code in (errno.ENOENT,errno.EEXIST,errno.EIO,errno.EPERM):
            with self.installer() as r:
                r.opened.side_effect=OSError(code,'unconfirmed')
                with self.assertRaisesRegex(launcher.InventoryError,'landlock_denial_unconfirmed'):
                    launcher.install_reply_landlock(r.request,r.cap,())
                self.assertEqual(r.opened.call_count,1)

    def test_unexpected_canary_or_lease_open_fails_and_closes_once(self):
        for sequence in ([91],[OSError(errno.EACCES,'denied'),91]):
            with self.installer() as r:
                r.opened.side_effect=sequence
                with self.assertRaisesRegex(launcher.InventoryError,'landlock_denial_failed'):
                    launcher.install_reply_landlock(r.request,r.cap,())
                self.assertEqual(r.closed.call_args_list,[mock.call(63),mock.call(91)])


class LandlockPathTests(unittest.TestCase):
    def test_each_component_is_nofollow_and_all_owned_descriptors_close(self):
        import stat
        from types import SimpleNamespace
        with mock.patch.object(launcher.os,'O_PATH',0x200000,create=True), mock.patch.object(launcher.os,'open',side_effect=[10,11,12]) as opening:
            with mock.patch.object(launcher.os,'close') as closing, mock.patch.object(launcher.os,'fstat',side_effect=[SimpleNamespace(st_mode=stat.S_IFDIR)]*2+[SimpleNamespace(st_mode=stat.S_IFREG)]):
                with launcher._landlock_path('/same/same',stat.S_IFREG,False) as fd:self.assertEqual(fd,12)
                flags=0x200000|os.O_NOFOLLOW|os.O_CLOEXEC
                self.assertEqual(opening.call_args_list,[mock.call('/',flags,dir_fd=None),mock.call('same',flags,dir_fd=10),mock.call('same',flags,dir_fd=11)])
                self.assertEqual(closing.call_args_list,[mock.call(12),mock.call(11),mock.call(10)])

    def test_symlink_component_refuses_without_opening_target(self):
        import stat
        from types import SimpleNamespace
        with mock.patch.object(launcher.os,'O_PATH',0x200000,create=True), mock.patch.object(launcher.os,'open',side_effect=[10,11]) as opening:
            with mock.patch.object(launcher.os,'close') as closing, mock.patch.object(launcher.os,'fstat',side_effect=[SimpleNamespace(st_mode=stat.S_IFDIR),SimpleNamespace(st_mode=stat.S_IFLNK)]):
                with self.assertRaisesRegex(launcher.InventoryError,'landlock_path_type'):
                    with launcher._landlock_path('/lib/target',stat.S_IFREG,False):self.fail('followed')
                self.assertEqual(opening.call_count,2)
                self.assertEqual(closing.call_args_list,[mock.call(11),mock.call(10)])


class FilterInstallTests(unittest.TestCase):
    @contextlib.contextmanager
    def installer(self):
        from types import SimpleNamespace
        with contextlib.ExitStack() as stack:
            support = stack.enter_context(mock.patch.object(launcher, '_process_support', return_value=True))
            pid = stack.enter_context(mock.patch.object(launcher.os, 'getpid', return_value=731))
            tasks = stack.enter_context(mock.patch.object(launcher.os, 'listdir', return_value=['731']))
            calls = []
            def syscall(number, args):
                calls.append((number, args))
                if number == 157:
                    return {39:1, 21:2}[args[0].value]
                self.assertEqual(number, 317)
                program = launcher.ctypes.cast(args[2], launcher.ctypes.POINTER(launcher._SockProgram)).contents
                rows = tuple((row.code,row.jt,row.jf,row.k) for row in program.filters[:program.length])
                self.assertEqual(rows, launcher.reply_seccomp_program(731))
                self.assertEqual((args[0].value,args[1].value), (1,0))
                return 0
            kernel = stack.enter_context(mock.patch.object(launcher, '_linux_syscall', side_effect=syscall))
            yield SimpleNamespace(support=support,pid=pid,tasks=tasks,kernel=kernel,calls=calls)

    def test_exact_native_layout_and_owned_pid_policy_reach_kernel(self):
        self.assertEqual(launcher.ctypes.sizeof(launcher._SockFilter),8)
        self.assertEqual([getattr(launcher._SockFilter,k).offset for k in ('code','jt','jf','k')],[0,2,3,4])
        self.assertEqual(launcher.ctypes.sizeof(launcher._SockProgram),16)
        self.assertEqual(launcher._SockProgram.filters.offset,8)
        with self.installer() as r:
            self.assertIsNone(launcher.install_reply_seccomp())
            self.assertEqual([number for number,_ in r.calls],[157,317,157])
            self.assertEqual([args[0].value for number,args in r.calls if number==157],[39,21])
            r.tasks.assert_called_once_with('/proc/self/task')

    def test_bad_platform_threads_and_pid_refuse_before_kernel_install(self):
        for failure in ('platform','threads','empty','wrong-thread','pid','changed-pid'):
            with self.installer() as r:
                if failure=='platform': r.support.return_value=False
                if failure=='threads': r.tasks.return_value=['731','732']
                if failure=='empty': r.tasks.return_value=[]
                if failure=='wrong-thread': r.tasks.return_value=['732']
                if failure=='pid': r.pid.return_value=True
                if failure=='changed-pid': r.pid.side_effect=[731,732]
                with self.assertRaises(launcher.InventoryError): launcher.install_reply_seccomp()
                self.assertNotIn(317,[number for number,_ in r.calls])

    def test_missing_no_new_privileges_is_not_replaced_by_privileged_install(self):
        for state in (0,2):
            with self.installer() as r:
                r.kernel.side_effect=lambda *args:state
                with self.assertRaisesRegex(launcher.InventoryError,'filter_privilege_unconfirmed'):
                    launcher.install_reply_seccomp()
                self.assertEqual(r.kernel.call_count,1)

    def test_nonzero_install_and_wrong_postinstall_mode_are_not_success(self):
        for responses in ([1,1], [1,0,0], [1,0,1]):
            with self.installer() as r:
                r.kernel.side_effect=responses
                with self.assertRaisesRegex(launcher.InventoryError,'filter_install_unconfirmed'):
                    launcher.install_reply_seccomp()
                self.assertEqual(r.kernel.call_count,len(responses))

    def test_each_uncertain_syscall_refuses_without_retry(self):
        for index in range(3):
            with self.installer() as r:
                r.kernel.side_effect=[1,0,2][:index]+[OSError('synthetic-private-detail')]
                with self.assertRaisesRegex(launcher.InventoryError,'^filter_install_unconfirmed$'):
                    launcher.install_reply_seccomp()
                self.assertEqual(r.kernel.call_count,index+1)

    def test_proc_inventory_failure_prevents_any_kernel_call(self):
        with self.installer() as r:
            r.tasks.side_effect=OSError('synthetic-private-detail')
            with self.assertRaisesRegex(launcher.InventoryError,'^filter_install_unconfirmed$'):
                launcher.install_reply_seccomp()
            r.kernel.assert_not_called()


class ChildRoleTests(unittest.TestCase):
    @contextlib.contextmanager
    def roles(self):
        from types import SimpleNamespace
        import stat
        def info(inode, kind, mode=0o600, uid=7, rdev=0):
            return SimpleNamespace(st_dev=1, st_ino=inode, st_mode=kind|mode, st_uid=uid,
                                   st_nlink=1, st_rdev=rdev, st_size=0, st_mtime_ns=0, st_ctime_ns=0)
        infos = {0:info(100,stat.S_IFSOCK), 1:info(101,stat.S_IFREG), 2:info(102,stat.S_IFREG),
                 3:info(103,stat.S_IFSOCK), 7:info(107,stat.S_IFIFO), 8:info(108,stat.S_IFREG),
                 20:info(109,stat.S_IFCHR,0o666,0,259), 40:info(140,stat.S_IFDIR,0o700)}
        infos[10], infos[11], infos[41] = infos[1], infos[2], infos[1]
        access = {fd:os.O_WRONLY for fd in infos}
        access.update({0:os.O_RDWR, 3:os.O_RDWR, 20:os.O_RDONLY, 40:os.O_RDONLY, 41:os.O_RDONLY})
        setup = mock.Mock(spec=launcher.PreparedReplySetup)
        setup.lease, setup.diagnostics = 8, (10,11)
        setup.request = SimpleNamespace(root='/replies/gen-a', attempt='synthetic')
        with contextlib.ExitStack() as stack:
            stack.enter_context(mock.patch.object(launcher.platform,'system',return_value='Linux'))
            stack.enter_context(mock.patch.object(launcher.os,'geteuid',return_value=7))
            stack.enter_context(mock.patch.object(launcher.os,'fstat',side_effect=lambda fd:infos[fd]))
            stack.enter_context(mock.patch.object(launcher.os,'stat',side_effect=lambda *a,**k:infos[20]))
            stack.enter_context(mock.patch.object(launcher.fcntl,'fcntl',side_effect=lambda fd,*a:access[fd]))
            streams = stack.enter_context(mock.patch.object(launcher,'_unix_stream',side_effect=lambda fd:mock.Mock()))
            named = stack.enter_context(mock.patch.object(launcher,'_named_diagnostic_role',side_effect=lambda req,name:launcher._descriptor_role_key(infos[10 if name=='stdout' else 11])))
            opening = stack.enter_context(mock.patch.object(launcher.os,'open',return_value=20))
            closing = stack.enter_context(mock.patch.object(launcher.os,'close'))
            def transfer(source,target,**kwargs):
                infos[target],access[target] = infos[source],access[source]
            duplicate = stack.enter_context(mock.patch.object(launcher.os,'dup2',side_effect=transfer))
            yield SimpleNamespace(infos=infos,access=access,setup=setup,streams=streams,named=named,
                                  opening=opening,closing=closing,duplicate=duplicate)

    def test_capture_binds_named_diagnostics_distinct_roles_and_fixed_null(self):
        with self.roles() as r:
            binding = launcher.capture_child_descriptor_roles(r.setup,7)
            self.assertEqual([fd for fd,_,_ in binding.roles],[0,1,2,3,7,8])
            self.assertEqual(r.streams.call_args_list,[mock.call(0),mock.call(3)])
            self.assertEqual(r.setup.checkpoint.call_count,2)
            self.assertEqual(r.named.call_args_list,[mock.call(r.setup.request,'stdout'),mock.call(r.setup.request,'stderr')]*2)
            with self.assertRaises(AttributeError): binding.status_fd=8
            r.opening.assert_not_called(); r.duplicate.assert_not_called()

    def test_capture_refuses_wrong_status_access_alias_and_unredirected_output(self):
        for change in ('status','access','alias','output','mode'):
            with self.roles() as r:
                if change=='status': r.infos[7]=r.infos[8]
                if change=='access': r.access[7]=os.O_RDONLY
                if change=='alias': r.infos[3]=r.infos[0]
                if change=='output': r.infos[1]=r.infos[8]
                if change=='mode': r.infos[10].st_mode |= 0o040
                with self.assertRaises(launcher.InventoryError): launcher.capture_child_descriptor_roles(r.setup,7)
                r.duplicate.assert_not_called()

    def test_late_checkpoint_or_role_replacement_prevents_binding(self):
        with self.roles() as r:
            def checkpoint():
                if r.setup.checkpoint.call_count==2: r.infos[3]=r.infos[0]
            r.setup.checkpoint.side_effect=checkpoint
            with self.assertRaisesRegex(launcher.InventoryError,'child_descriptor_changed'):
                launcher.capture_child_descriptor_roles(r.setup,7)
        with self.roles() as r:
            r.setup.checkpoint.side_effect=launcher.InventoryError('setup_cancelled')
            with self.assertRaisesRegex(launcher.InventoryError,'setup_cancelled'):
                launcher.capture_child_descriptor_roles(r.setup,7)

    def test_final_checkpoint_named_diagnostic_replacement_refuses(self):
        for changed_name in ('stdout', 'stderr'):
            with self.roles() as r:
                original_named = r.named.side_effect
                def named(request, name):
                    if r.setup.checkpoint.call_count == 2 and name == changed_name:
                        return launcher._descriptor_role_key(r.infos[8])
                    return original_named(request, name)
                r.named.side_effect = named
                with self.assertRaisesRegex(launcher.InventoryError, 'child_descriptor_role'):
                    launcher.capture_child_descriptor_roles(r.setup, 7)
                r.duplicate.assert_not_called()

    def test_postgate_input_is_verified_before_and_after_transfer(self):
        with self.roles() as r:
            binding=launcher.capture_child_descriptor_roles(r.setup,7)
            launcher.bind_child_input(binding)
            r.opening.assert_called_once_with('/dev/null',os.O_RDONLY|os.O_NOFOLLOW|os.O_CLOEXEC)
            r.duplicate.assert_called_once_with(20,0,inheritable=True)
            r.closing.assert_called_once_with(20)
            with self.assertRaises(launcher.InventoryError): launcher.bind_child_input(binding)
            self.assertEqual(r.duplicate.call_count,1)

    def test_changed_role_refuses_before_any_stdin_effect(self):
        with self.roles() as r:
            binding=launcher.capture_child_descriptor_roles(r.setup,7)
            r.infos[3]=r.infos[0]
            with self.assertRaises(launcher.InventoryError): launcher.bind_child_input(binding)
            r.opening.assert_not_called(); r.duplicate.assert_not_called(); r.closing.assert_not_called()

    def test_changed_null_device_and_failed_dup_close_owned_fd(self):
        for change in ('device','dup'):
            with self.roles() as r:
                binding=launcher.capture_child_descriptor_roles(r.setup,7)
                if change=='device': r.infos[20].st_rdev=260
                else: r.duplicate.side_effect=OSError(errno.EIO,'synthetic')
                with self.assertRaises(launcher.InventoryError): launcher.bind_child_input(binding)
                r.closing.assert_called_once_with(20)
                if change=='device': r.duplicate.assert_not_called()

    def test_uncertain_close_and_bad_transfer_never_report_success(self):
        for change in ('close','transfer'):
            with self.roles() as r:
                binding=launcher.capture_child_descriptor_roles(r.setup,7)
                if change=='close': r.closing.side_effect=OSError(errno.EINTR,'synthetic')
                else: r.duplicate.side_effect=None
                with self.assertRaises(launcher.InventoryError): launcher.bind_child_input(binding)
                r.closing.assert_called_once_with(20)

    def test_finalization_rechecks_roles_after_descriptor_closure(self):
        with self.roles() as r:
            binding=launcher.capture_child_descriptor_roles(r.setup,7)
            launcher.bind_child_input(binding)
            with mock.patch.object(launcher,'close_reply_descriptors') as close:
                launcher.finalize_child_descriptors(binding)
                close.assert_called_once_with(7,8)
            def replace(*args): r.infos[8]=r.infos[1]
            with mock.patch.object(launcher,'close_reply_descriptors',side_effect=replace):
                with self.assertRaises(launcher.InventoryError): launcher.finalize_child_descriptors(binding)

    def test_lease_append_does_not_change_descriptor_identity(self):
        with self.roles() as r:
            binding=launcher.capture_child_descriptor_roles(r.setup,7)
            r.infos[8].st_size=1024; r.infos[8].st_mtime_ns=99; r.infos[8].st_ctime_ns=99
            launcher.bind_child_input(binding)
            with mock.patch.object(launcher,'close_reply_descriptors'):
                launcher.finalize_child_descriptors(binding)


class NamedDiagnosticRoleTests(unittest.TestCase):
    roles = ChildRoleTests.roles
    def test_named_diagnostic_open_is_private_nofollow_and_owned(self):
        named = launcher._named_diagnostic_role
        with self.roles() as r:
            r.opening.return_value=41
            with mock.patch.object(launcher,'_absolute_directory',return_value=contextlib.nullcontext(40)) as directory:
                key=named(r.setup.request,'stdout')
                self.assertEqual(key,launcher._descriptor_role_key(r.infos[1]))
                directory.assert_called_once_with('/replies/gen-a/synthetic/diag')
                r.opening.assert_called_once_with('stdout',os.O_RDONLY|os.O_NOFOLLOW|os.O_CLOEXEC|os.O_NONBLOCK,dir_fd=40)
                r.closing.assert_called_once_with(41)

    def test_named_metadata_failure_still_closes_opened_descriptor(self):
        named = launcher._named_diagnostic_role
        with self.roles() as r:
            r.opening.return_value=41
            r.infos[41].st_nlink=2
            with mock.patch.object(launcher,'_absolute_directory',return_value=contextlib.nullcontext(40)):
                with self.assertRaisesRegex(launcher.InventoryError,'child_descriptor_role'):
                    named(r.setup.request,'stdout')
                r.closing.assert_called_once_with(41)


class ChildLifecycleTests(unittest.TestCase):
    def start(self):
        binding=launcher.ChildDescriptorRoles(9,8,(),())
        return launcher.ReplyChildStart(731,4,5,6,binding)

    @contextlib.contextmanager
    def gate(self):
        from types import SimpleNamespace
        events=[]
        with contextlib.ExitStack() as stack:
            stack.enter_context(mock.patch.object(launcher,'_process_support',return_value=True))
            alarm=stack.enter_context(mock.patch.object(launcher.signal,'alarm',side_effect=lambda n:events.append(('alarm',n))))
            disposition=stack.enter_context(mock.patch.object(launcher.signal,'getsignal',return_value=launcher.signal.SIG_DFL))
            mask=stack.enter_context(mock.patch.object(launcher.signal,'pthread_sigmask',return_value=set()))
            close=stack.enter_context(mock.patch.object(launcher.os,'close',side_effect=lambda fd:events.append(('close',fd))))
            death=stack.enter_context(mock.patch.object(launcher,'_set_parent_death',side_effect=lambda:events.append(('pdeath',))))
            parent=stack.enter_context(mock.patch.object(launcher.os,'getppid',side_effect=lambda:events.append(('parent',)) or 731))
            read=stack.enter_context(mock.patch.object(launcher.os,'read',side_effect=lambda fd,n:events.append(('read',fd,n)) or b'G'))
            yield SimpleNamespace(events=events,alarm=alarm,disposition=disposition,mask=mask,close=close,
                                  death=death,parent=parent,read=read)

    def test_gate_orders_bound_unused_ends_parent_and_exact_one_byte(self):
        with self.gate() as r:
            launcher.await_reply_gate(self.start())
            self.assertEqual(r.events,[('alarm',10),('close',5),('close',6),('pdeath',),('parent',),('read',4,1),('close',4)])
            r.mask.assert_called_once_with(launcher.signal.SIG_BLOCK,set())

    def test_invalid_fd_alias_or_parent_refuses_before_alarm(self):
        from dataclasses import replace
        for start in (None,replace(self.start(),launcher_pid=True),replace(self.start(),gate_write=8),replace(self.start(),gate_read=3)):
            with self.gate() as r:
                with self.assertRaisesRegex(launcher.InventoryError,'child_start_invalid'):launcher.await_reply_gate(start)
                self.assertEqual(r.events,[])

    def test_wrong_parent_and_alarm_state_never_read_gate(self):
        for failure in ('parent','ignored','blocked'):
            with self.gate() as r:
                if failure=='parent':r.parent.side_effect=None;r.parent.return_value=732
                if failure=='ignored':r.disposition.return_value=launcher.signal.SIG_IGN
                if failure=='blocked':r.mask.return_value={launcher.signal.SIGALRM}
                with self.assertRaises(launcher.InventoryError):launcher.await_reply_gate(self.start())
                r.read.assert_not_called()

    def test_eof_wrong_byte_and_read_failure_close_gate_without_success(self):
        for value in (b'',b'X',OSError(errno.EIO,'uncertain')):
            with self.gate() as r:
                r.read.side_effect=value if isinstance(value,Exception) else None
                r.read.return_value=value
                with self.assertRaises(launcher.InventoryError):launcher.await_reply_gate(self.start())
                self.assertEqual(r.close.call_args_list,[mock.call(5),mock.call(6),mock.call(4)])

    def test_uncertain_gate_close_never_retries_or_opens_gate(self):
        with self.gate() as r:
            r.close.side_effect=[None,None,OSError(errno.EIO,'uncertain')]
            with self.assertRaisesRegex(launcher.InventoryError,'child_gate_unconfirmed'):
                launcher.await_reply_gate(self.start())
            self.assertEqual(r.close.call_count,3)

    @contextlib.contextmanager
    def execution(self):
        from types import SimpleNamespace
        events=[];mocks={}
        with contextlib.ExitStack() as stack:
            for name in ('bind_child_input','install_reply_landlock','install_reply_seccomp','finalize_child_descriptors'):
                mocks[name]=stack.enter_context(mock.patch.object(launcher,name,side_effect=lambda *a,n=name:events.append(n)))
            chdir=stack.enter_context(mock.patch.object(launcher.os,'chdir',side_effect=lambda p:events.append('chdir')))
            alarm=stack.enter_context(mock.patch.object(launcher.signal,'alarm',side_effect=lambda n:events.append('alarm')))
            execute=stack.enter_context(mock.patch.object(launcher.os,'execve',side_effect=lambda *a:events.append('exec')))
            yield SimpleNamespace(events=events,mocks=mocks,chdir=chdir,alarm=alarm,execute=execute)

    def test_exec_composition_uses_only_fixed_environment_and_preserves_order(self):
        request=LandlockInstallTests.request(LandlockInstallTests())
        with self.execution() as r:
            with self.assertRaisesRegex(launcher.InventoryError,'child_exec_returned'):
                launcher.exec_reply_child(request,launcher.LinuxCapabilities(4,32767),(),self.start().descriptors)
            self.assertEqual(r.events,['bind_child_input','install_reply_landlock','install_reply_seccomp','finalize_child_descriptors','chdir','alarm','exec'])
            r.chdir.assert_called_once_with(request.root+'/'+request.attempt+'/work')
            r.alarm.assert_called_once_with(0)
            r.execute.assert_called_once_with(request.node,[request.node,request.entry,'--profile',request.profile_name],launcher.reply_child_environment(request))

    def test_any_preexec_stage_failure_prevents_exec_and_later_stages(self):
        request=LandlockInstallTests.request(LandlockInstallTests())
        names=['bind_child_input','install_reply_landlock','install_reply_seccomp','finalize_child_descriptors']
        for index,name in enumerate(names):
            with self.execution() as r:
                r.mocks[name].side_effect=launcher.InventoryError('synthetic')
                with self.assertRaises(launcher.InventoryError):launcher.exec_reply_child(request,None,(),self.start().descriptors)
                self.assertEqual(r.events,names[:index]);r.execute.assert_not_called();r.alarm.assert_not_called()

    def test_terminal_branch_maps_gate_failures_without_reporting_before_gate(self):
        class ExitChild(BaseException):pass
        for reason,code in (('child_gate_closed',118),('child_parent_changed',119),('child_gate_unconfirmed',69)):
            with mock.patch.object(launcher,'await_reply_gate',side_effect=launcher.InventoryError(reason)), mock.patch.object(launcher,'exec_reply_child') as execute:
                with mock.patch.object(launcher,'_notify_child_failure') as notify, mock.patch.object(launcher.os,'_exit',side_effect=ExitChild) as exiting:
                    with self.assertRaises(ExitChild):launcher.run_reply_child(None,None,(),self.start())
                    exiting.assert_called_once_with(code);notify.assert_not_called();execute.assert_not_called()

    def test_postgate_failure_always_exits_even_if_reporting_fails(self):
        class ExitChild(BaseException):pass
        for report_error in (None,OSError('uncertain')):
            with mock.patch.object(launcher,'await_reply_gate'), mock.patch.object(launcher,'exec_reply_child',side_effect=OSError('synthetic private detail')):
                with mock.patch.object(launcher,'_notify_child_failure',side_effect=report_error) as notify, mock.patch.object(launcher.os,'_exit',side_effect=ExitChild) as exiting:
                    with self.assertRaises(ExitChild):launcher.run_reply_child(None,None,(),self.start())
                    notify.assert_called_once_with(9);exiting.assert_called_once_with(69)

    def test_failure_reports_are_fixed_nonblocking_and_best_effort(self):
        stream=mock.Mock()
        with mock.patch.object(launcher.socket,'MSG_NOSIGNAL',0x4000,create=True), mock.patch.object(launcher.os,'set_blocking') as flags:
            with mock.patch.object(launcher.os,'write',side_effect=OSError(errno.EPIPE,'private detail')) as write, mock.patch.object(launcher,'_unix_stream',return_value=stream):
                launcher._notify_child_failure(9)
                flags.assert_called_once_with(9,False);write.assert_called_once_with(9,b'F')
                payload,send_flags=stream.send.call_args.args
                self.assertEqual(json.loads(payload),{'t':'status','s':'failed','code':'containment_unavailable'})
                self.assertTrue(payload.endswith(b'\n'))
                self.assertEqual(send_flags,socket.MSG_DONTWAIT|0x4000)
                stream.close.assert_called_once_with()


class ChildRecordTests(ScratchTests):
    attempt=PrepareTests.attempt
    nonce=PrepareTests.nonce
    argv=PrepareTests.argv

    @contextlib.contextmanager
    def recording(self):
        from types import SimpleNamespace
        root=Path(tempfile.mkdtemp(prefix="gen-",dir=self.replies));home=root/self.attempt;home.mkdir(mode=0o700)
        request=launcher.parse_run_arguments(self.argv(root))
        parent=launcher.ProcessIdentity(os.getpid(),'123',self.attempt,'/usr/bin/python3',self.nonce)
        child=launcher.ProcessIdentity(os.getpid()+100000,'456',self.attempt,'/usr/bin/python3',self.nonce)
        path=home/'lease.json'
        fd=os.open(path,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_CLOEXEC,0o600)
        try:
            launcher._life_lock(fd)
            os.write(fd,launcher._launcher_records(parent));os.fsync(fd)
            control=mock.Mock();control.deadline=time.monotonic()+30
            setup=launcher.PreparedReplySetup(request,fd,launcher._identity(root.stat()),control)
            with contextlib.ExitStack() as stack:
                stack.enter_context(mock.patch.object(launcher,'_process_support',return_value=True))
                for name,value in (('P_PID',1),('WEXITED',4),('WNOHANG',1),('WNOWAIT',0x1000000)):
                    stack.enter_context(mock.patch.object(launcher.os,name,value,create=True))
                wait=stack.enter_context(mock.patch.object(launcher.os,'waitid',return_value=None,create=True))
                identity=stack.enter_context(mock.patch.object(launcher,'_read_process_identity',side_effect=lambda pid,kind:parent if pid==parent.pid else child))
                yield SimpleNamespace(setup=setup,parent=parent,child=child,path=path,wait=wait,identity=identity,root=root)
        finally:
            os.close(fd)

    def test_exact_durable_child_line_preserves_parent_and_original_setup_fence(self):
        with self.recording() as r:
            before=r.path.read_bytes();original_signature=r.setup.lease_signature
            with mock.patch.object(launcher.os,'fsync',wraps=os.fsync) as sync:
                record=launcher.record_reply_child(r.setup,r.child.pid)
            sync.assert_called_once_with(r.setup.lease)
            parsed=launcher.parse_lease(r.path.read_bytes())
            self.assertEqual(parsed.launcher,r.parent)
            self.assertEqual(parsed.child,record.identity)
            self.assertEqual(record.identity.executable,r.setup.request.node)
            self.assertEqual(record.gate_identity,r.child)
            self.assertTrue(r.path.read_bytes().startswith(before))
            self.assertEqual(r.setup.lease_signature,original_signature)
            self.assertEqual(r.setup.refusal,'child_recorded')
            with self.assertRaises(launcher.InventoryError):r.setup.checkpoint()
            launcher._recorded_checkpoint(record)
            self.assertTrue(all(call.args==(os.P_PID,r.child.pid,os.WEXITED|os.WNOHANG|os.WNOWAIT) for call in r.wait.call_args_list))
            with self.assertRaises(launcher.InventoryError):launcher.record_reply_child(r.setup,r.child.pid)
            self.assertEqual(r.path.read_bytes().count(b'"kind":"child"'),1)

    def test_foreign_dead_or_changed_child_cannot_append(self):
        from dataclasses import replace
        for failure in ('foreign','dead','nonce','executable'):
            with self.subTest(failure=failure),self.recording() as r:
                before=r.path.read_bytes()
                if failure=='foreign':r.wait.side_effect=ChildProcessError(errno.ECHILD,'not owned')
                if failure=='dead':r.wait.return_value=object()
                if failure in ('nonce','executable'):
                    child=replace(r.child,nonce='cd'*32) if failure=='nonce' else replace(r.child,executable='/other/node')
                    r.identity.side_effect=lambda pid,kind:r.parent if pid==r.parent.pid else child
                with self.assertRaises(launcher.InventoryError):launcher.record_reply_child(r.setup,r.child.pid)
                self.assertEqual(r.path.read_bytes(),before)

    def test_wrong_append_offset_and_already_recorded_lease_refuse(self):
        with self.recording() as r:
            before=r.path.read_bytes();os.lseek(r.setup.lease,0,os.SEEK_SET)
            with self.assertRaisesRegex(launcher.InventoryError,'lease_append_position'):
                launcher.record_reply_child(r.setup,r.child.pid)
            self.assertEqual(r.path.read_bytes(),before)

    def test_existing_complete_child_line_cannot_be_adopted_as_fresh_record(self):
        with self.recording() as r:
            line=launcher._child_record_line(r.child)
            os.write(r.setup.lease,line);os.fsync(r.setup.lease)
            fresh=launcher.PreparedReplySetup(r.setup.request,r.setup.lease,r.setup.root_identity,r.setup.control)
            before=r.path.read_bytes()
            with self.assertRaisesRegex(launcher.InventoryError,'child_already_recorded'):
                launcher.record_reply_child(fresh,r.child.pid)
            self.assertEqual(r.path.read_bytes(),before);r.wait.assert_not_called()

    def test_expired_original_deadline_prevents_append(self):
        with self.recording() as r:
            r.setup.control.deadline=0;before=r.path.read_bytes()
            with self.assertRaisesRegex(launcher.InventoryError,'setup_deadline'):
                launcher.record_reply_child(r.setup,r.child.pid)
            self.assertEqual(r.path.read_bytes(),before)
            self.assertEqual(r.setup.refusal,'child_recording')

    def test_torn_append_is_retained_and_cannot_reset_original_signature(self):
        with self.recording() as r:
            original=os.write;calls=[]
            def torn(fd,data):
                if calls:raise OSError(errno.EIO,'uncertain write')
                calls.append(True);return original(fd,data[:9])
            with mock.patch.object(launcher.os,'write',side_effect=torn):
                with self.assertRaises(launcher.InventoryError):launcher.record_reply_child(r.setup,r.child.pid)
            self.assertEqual(r.setup.refusal,'child_recording')
            self.assertEqual(launcher.parse_lease(r.path.read_bytes()).tail,'partial_child')
            before=r.path.read_bytes()
            with self.assertRaises(launcher.InventoryError):launcher.record_reply_child(r.setup,r.child.pid)
            self.assertEqual(r.path.read_bytes(),before)

    def test_fsync_failure_does_not_return_record_or_admit_retry(self):
        with self.recording() as r:
            with mock.patch.object(launcher.os,'fsync',side_effect=OSError(errno.EIO,'uncertain')):
                with self.assertRaisesRegex(launcher.InventoryError,'child_record_unconfirmed'):
                    launcher.record_reply_child(r.setup,r.child.pid)
            self.assertEqual(r.setup.refusal,'child_recording')
            self.assertIsNotNone(launcher.parse_lease(r.path.read_bytes()).child)
            with self.assertRaises(launcher.InventoryError):launcher.record_reply_child(r.setup,r.child.pid)

    def assert_record_stays_refused(self, record):
        self.assertEqual(record.setup.refusal,'child_record_fence_unconfirmed')
        with mock.patch.object(launcher.os,'pidfd_open',create=True) as opening:
            with self.assertRaisesRegex(launcher.InventoryError,'child_record_unavailable'):
                with launcher.retained_reply_pidfd(record):self.fail('yielded')
            opening.assert_not_called()

    def test_restored_namespace_cannot_reuse_refused_record(self):
        with self.recording() as r:
            record=launcher.record_reply_child(r.setup,r.child.pid)
            moved=r.root.with_name(r.root.name+'-moved');r.root.rename(moved)
            try:
                with self.assertRaises((OSError,launcher.InventoryError)):
                    launcher._recorded_checkpoint(record)
            finally:moved.rename(r.root)
            self.assert_record_stays_refused(record)

    def test_restored_named_lease_cannot_reuse_refused_record(self):
        with self.recording() as r:
            record=launcher.record_reply_child(r.setup,r.child.pid)
            moved=r.path.with_name('lease-moved');r.path.rename(moved)
            try:
                with self.assertRaises((OSError,launcher.InventoryError)):
                    launcher._recorded_checkpoint(record)
            finally:moved.rename(r.path)
            self.assert_record_stays_refused(record)

    def test_recovered_control_cannot_reuse_refused_record(self):
        for failure in (OSError(errno.EIO,'uncertain'),launcher.InventoryError('setup_deadline')):
            with self.subTest(failure=type(failure).__name__),self.recording() as r:
                record=launcher.record_reply_child(r.setup,r.child.pid)
                deadline=r.setup.control.deadline;r.setup.control.poll.side_effect=failure
                with self.assertRaises(type(failure)):launcher._recorded_checkpoint(record)
                r.setup.control.poll.side_effect=None
                self.assertEqual(r.setup.control.deadline,deadline)
                self.assert_record_stays_refused(record)

    def test_changed_recorded_lease_signature_permanently_refuses(self):
        with self.recording() as r:
            record=launcher.record_reply_child(r.setup,r.child.pid)
            os.write(r.setup.lease,b' ')
            with self.assertRaisesRegex(launcher.InventoryError,'lease_changed'):
                launcher._recorded_checkpoint(record)
            os.ftruncate(r.setup.lease,record.lease_signature[1])
            self.assert_record_stays_refused(record)

    def test_retained_pidfd_follows_record_and_is_closed_once(self):
        with self.recording() as r:
            record=launcher.record_reply_child(r.setup,r.child.pid)
            original_close=os.close
            with mock.patch.object(launcher.os,'pidfd_open',return_value=98765,create=True) as opening:
                with mock.patch.object(launcher.os,'close',side_effect=lambda fd:None if fd==98765 else original_close(fd)) as closing:
                    with launcher.retained_reply_pidfd(record) as fd:self.assertEqual(fd,98765)
                    opening.assert_called_once_with(r.child.pid,0)
                    self.assertEqual(sum(call.args==(98765,) for call in closing.call_args_list),1)

    def test_late_child_change_closes_pidfd_without_yield(self):
        with self.recording() as r:
            record=launcher.record_reply_child(r.setup,r.child.pid);original_close=os.close
            def opening(*args):r.wait.return_value=object();return 98765
            with mock.patch.object(launcher.os,'pidfd_open',side_effect=opening,create=True):
                with mock.patch.object(launcher.os,'close',side_effect=lambda fd:None if fd==98765 else original_close(fd)) as closing:
                    with self.assertRaisesRegex(launcher.InventoryError,'child_not_live'):
                        with launcher.retained_reply_pidfd(record):self.fail('yielded')
                    self.assertEqual(sum(call.args==(98765,) for call in closing.call_args_list),1)

    def test_uncertain_pidfd_close_refuses_without_retry(self):
        with self.recording() as r:
            record=launcher.record_reply_child(r.setup,r.child.pid);original_close=os.close
            def close(fd):
                if fd==98765:raise OSError(errno.EIO,'uncertain')
                return original_close(fd)
            with mock.patch.object(launcher.os,'pidfd_open',return_value=98765,create=True):
                with mock.patch.object(launcher.os,'close',side_effect=close) as closing:
                    with self.assertRaisesRegex(launcher.InventoryError,'child_pidfd_close_unconfirmed'):
                        with launcher.retained_reply_pidfd(record):pass
                    self.assertEqual(sum(call.args==(98765,) for call in closing.call_args_list),1)


class ChildReaperTests(unittest.TestCase):
    def setUp(self):
        from types import SimpleNamespace
        self.result=lambda status=0,code=1:SimpleNamespace(si_pid=12345,si_code=code,si_status=status)
        self.stack=contextlib.ExitStack();self.addCleanup(self.stack.close)
        self.stack.enter_context(mock.patch.object(launcher,'_process_support',return_value=True))
        for name,value in (('P_PIDFD',3),('WEXITED',4),('WNOHANG',1),('CLD_EXITED',1),('CLD_KILLED',2),('CLD_DUMPED',3)):
            self.stack.enter_context(mock.patch.object(launcher.os,name,value,create=True))
        self.waitid=self.stack.enter_context(mock.patch.object(launcher.os,'waitid',return_value=None,create=True))
        self.waitpid=self.stack.enter_context(mock.patch.object(launcher.os,'waitpid',return_value=(0,0)))
        self.send=self.stack.enter_context(mock.patch.object(launcher.signal,'pidfd_send_signal',create=True))
        self.kill=self.stack.enter_context(mock.patch.object(launcher.os,'kill'))
        self.now=100.0
        self.clock=self.stack.enter_context(mock.patch.object(launcher.time,'monotonic',side_effect=lambda:self.now))
        self.sleep=self.stack.enter_context(mock.patch.object(launcher.time,'sleep',side_effect=self.advance))

    def advance(self, seconds):
        self.assertGreater(seconds,0);self.assertLessEqual(seconds,0.05)
        self.now+=seconds

    def test_pidfd_exit_and_signal_are_reaped_once_and_cached(self):
        for code,status,state in ((1,0,'exited'),(1,255,'exited'),(2,9,'signalled'),(3,11,'signalled')):
            with self.subTest(code=code,status=status):
                self.waitid.reset_mock();self.waitid.return_value=self.result(status,code)
                reaper=launcher.ReplyChildReaper(12345,99)
                expected=launcher.ChildSettlement(state,status)
                self.assertEqual(reaper.poll(),expected)
                self.assertEqual(reaper.wait(102),expected)
                self.assertFalse(reaper.send(launcher.signal.SIGKILL))
                self.waitid.assert_called_once_with(os.P_PIDFD,99,os.WEXITED|os.WNOHANG)
        self.waitpid.assert_not_called();self.send.assert_not_called();self.kill.assert_not_called()

    def test_no_pidfd_uses_only_own_numeric_wait_without_signal(self):
        self.waitpid.side_effect=[(0,0),(12345,118<<8)]
        reaper=launcher.ReplyChildReaper(12345)
        self.assertEqual(reaper.wait(101),launcher.ChildSettlement('exited',118))
        with self.assertRaisesRegex(launcher.InventoryError,'child_signal_unavailable'):
            reaper.send(launcher.signal.SIGKILL)
        self.assertTrue(all(c.args==(12345,os.WNOHANG) for c in self.waitpid.call_args_list))
        self.waitid.assert_not_called();self.send.assert_not_called();self.kill.assert_not_called()

    def test_wait_eintr_uses_same_deadline_and_terminal_result(self):
        self.waitid.side_effect=[InterruptedError(errno.EINTR,'interrupt'),None,self.result()]
        reaper=launcher.ReplyChildReaper(12345,99)
        self.assertEqual(reaper.wait(100.2),launcher.ChildSettlement('exited',0))
        self.assertEqual(self.waitid.call_count,3);self.assertAlmostEqual(self.now,100.1)

    def test_timeout_cannot_reset_or_poll_again(self):
        reaper=launcher.ReplyChildReaper(12345,99)
        self.assertEqual(reaper.wait(100.1),launcher.ChildSettlement('unknown'))
        calls=self.waitid.call_count;self.waitid.return_value=self.result()
        self.assertEqual(reaper.wait(110),launcher.ChildSettlement('unknown'))
        self.assertFalse(reaper.send(launcher.signal.SIGKILL))
        self.assertEqual(self.waitid.call_count,calls);self.send.assert_not_called()
        self.assertAlmostEqual(self.now,100.1)

    def test_invalid_or_expired_bounds_do_not_touch_child(self):
        for deadline in (True,None,'101',float('inf'),float('nan'),-1,10**1000,113,100,99):
            with self.subTest(deadline=str(deadline)[:20]):
                reaper=launcher.ReplyChildReaper(12345,99)
                self.assertEqual(reaper.wait(deadline),launcher.ChildSettlement('unknown'))
        self.waitid.assert_not_called();self.waitpid.assert_not_called();self.sleep.assert_not_called()

    def test_late_wait_result_does_not_pass_original_bound(self):
        def late(*args):self.now=101;return self.result()
        self.waitid.side_effect=late
        reaper=launcher.ReplyChildReaper(12345,99)
        self.assertEqual(reaper.wait(100.5),launcher.ChildSettlement('unknown'))
        self.assertEqual(reaper.wait(110),launcher.ChildSettlement('unknown'))
        self.waitid.assert_called_once();self.sleep.assert_not_called()

    def test_pidfd_invalid_or_missing_wait_evidence_stays_unknown(self):
        from types import SimpleNamespace
        failures=[ChildProcessError(errno.ECHILD,'not child'),OSError(errno.ESRCH,'gone'),
                  self.result(-1),self.result(256),self.result(0,2),self.result(9,4),
                  self.result(9.0,2),SimpleNamespace(si_pid=54321,si_code=1,si_status=0),object()]
        for failure in failures:
            with self.subTest(failure=repr(failure)):
                self.waitid.reset_mock();self.waitid.side_effect=None
                if isinstance(failure,Exception):self.waitid.side_effect=failure
                else:self.waitid.return_value=failure
                reaper=launcher.ReplyChildReaper(12345,99)
                self.assertEqual(reaper.poll(),launcher.ChildSettlement('unknown'))
                self.waitid.side_effect=None;self.waitid.return_value=self.result()
                self.assertEqual(reaper.poll(),launcher.ChildSettlement('unknown'))
                self.assertEqual(self.waitid.call_count,1)

    def test_numeric_nonterminal_or_invalid_wait_evidence_stays_unknown(self):
        for result in ((54321,0),(12345,0x7f),(12345,-1),(0,1),(True,0),(12345,0xffff)):
            with self.subTest(result=result):
                self.waitpid.return_value=result
                self.assertEqual(launcher.ReplyChildReaper(12345).poll(),launcher.ChildSettlement('unknown'))
        self.waitid.assert_not_called();self.kill.assert_not_called()

    def test_signal_uses_retained_fd_only_and_never_claims_settlement(self):
        reaper=launcher.ReplyChildReaper(12345,99)
        self.assertTrue(reaper.send(launcher.signal.SIGTERM));self.assertIsNone(reaper.outcome)
        self.send.assert_called_once_with(99,launcher.signal.SIGTERM,None,0)
        self.send.reset_mock();self.send.side_effect=OSError(errno.ESRCH,'gone')
        self.assertFalse(reaper.send(launcher.signal.SIGKILL))
        self.assertEqual(reaper.outcome,launcher.ChildSettlement('unknown'))
        self.assertFalse(reaper.send(launcher.signal.SIGKILL));self.assertEqual(self.send.call_count,1)
        self.kill.assert_not_called()

    def test_invalid_identity_fd_and_signal_refuse_before_process_effects(self):
        for pid,fd in ((True,99),(0,99),(os.getpid(),99),(12345,3),(12345,True),(12345,-1)):
            with self.assertRaises(launcher.InventoryError):launcher.ReplyChildReaper(pid,fd)
        for requested in (15.0,'TERM',0,True,launcher.signal.SIGSTOP):
            with self.assertRaises(launcher.InventoryError):launcher.ReplyChildReaper(12345,99).send(requested)
        self.waitid.assert_not_called();self.waitpid.assert_not_called();self.send.assert_not_called()


class ParentPipeTests(ScratchTests):
    attempt=ChildRecordTests.attempt
    nonce=ChildRecordTests.nonce
    argv=ChildRecordTests.argv
    recording=ChildRecordTests.recording

    @contextlib.contextmanager
    def pipes(self):
        # Python's owned os.pipe is non-inheritable here; pipe2 is Linux-only.
        with mock.patch.object(launcher.os,'pipe2',side_effect=lambda flags:os.pipe(),create=True):
            pipes=launcher.ReplyParentPipes()
            try:yield pipes
            finally:pipes.close()

    @contextlib.contextmanager
    def gate(self, r, pipes):
        record=launcher.record_reply_child(r.setup,r.child.pid)
        reaper=launcher.ReplyChildReaper(r.child.pid,98765)
        relay_key=(1,2,launcher.stat.S_IFSOCK,os.geteuid(),1,0)
        binding=launcher.ChildDescriptorRoles(pipes.status_write,r.setup.lease,((3,relay_key,os.O_RDWR),),())
        original_close=os.close;original_role=launcher._descriptor_role
        with contextlib.ExitStack() as stack:
            stack.enter_context(mock.patch.object(reaper,'poll',return_value=None))
            closing=stack.enter_context(mock.patch.object(launcher.os,'close',side_effect=lambda fd:None if fd==3 else original_close(fd)))
            stack.enter_context(mock.patch.object(launcher,'_descriptor_role',side_effect=lambda fd,*args:relay_key if fd==3 else original_role(fd,*args)))
            yield record,reaper,binding,closing

    def test_owned_pairs_are_cloexec_nonblocking_gate_and_close_once(self):
        with self.recording(),self.pipes() as pipes:
            fds=(pipes.gate_read,pipes.gate_write,pipes.status_read,pipes.status_write)
            self.assertEqual(len(set(fds)),4)
            self.assertTrue(all(not os.get_inheritable(fd) for fd in fds))
            self.assertFalse(os.get_blocking(pipes.gate_write))
            pipes.close();pipes.close()
            for fd in fds:
                with self.assertRaises(OSError):os.fstat(fd)

    def test_parent_closes_unused_ends_and_opens_once_after_relay_close(self):
        with self.recording() as r,self.pipes() as pipes,self.gate(r,pipes) as (record,reaper,binding,closing):
            reader=os.dup(pipes.gate_read);os.set_blocking(reader,False)
            try:
                pipes.after_fork();self.assertIsNone(pipes.gate_read);self.assertIsNone(pipes.status_write)
                events=[];original_close=closing.side_effect;original_write=os.write
                def close(fd):events.append(('close',fd));return original_close(fd)
                def write(fd,data):events.append(('write',fd));return original_write(fd,data)
                closing.side_effect=close
                with mock.patch.object(launcher.os,'write',side_effect=write):pipes.open_gate(record,reaper,binding)
                self.assertEqual(os.read(reader,2),b'G');self.assertEqual(os.read(reader,1),b'')
                self.assertLess(events.index(('close',3)),next(i for i,x in enumerate(events) if x[0]=='write'))
                self.assertEqual(pipes.state,'opened')
                with self.assertRaises(launcher.InventoryError):pipes.open_gate(record,reaper,binding)
                self.assertEqual(sum(c.args==(3,) for c in closing.call_args_list),1)
            finally:os.close(reader)

    def test_failed_fence_closes_gate_without_byte_and_no_relay_close(self):
        with self.recording() as r,self.pipes() as pipes,self.gate(r,pipes) as (record,reaper,binding,closing):
            reader=os.dup(pipes.gate_read);os.set_blocking(reader,False)
            try:
                pipes.after_fork();r.setup.control.poll.side_effect=launcher.InventoryError('cancelled')
                with self.assertRaises(launcher.InventoryError):pipes.open_gate(record,reaper,binding)
                self.assertEqual(os.read(reader,1),b'')
                self.assertFalse(any(c.args==(3,) for c in closing.call_args_list))
                r.setup.control.poll.side_effect=None
                with self.assertRaises(launcher.InventoryError):pipes.open_gate(record,reaper,binding)
            finally:os.close(reader)

    def test_relay_close_failure_cannot_write_or_retry(self):
        with self.recording() as r,self.pipes() as pipes,self.gate(r,pipes) as (record,reaper,binding,closing):
            pipes.after_fork();original_close=closing.side_effect
            def close(fd):
                if fd==3:raise OSError(errno.EIO,'uncertain')
                return original_close(fd)
            closing.side_effect=close
            with mock.patch.object(launcher.os,'write') as writing:
                with self.assertRaises(launcher.InventoryError):pipes.open_gate(record,reaper,binding)
                with self.assertRaises(launcher.InventoryError):pipes.open_gate(record,reaper,binding)
                writing.assert_not_called()
            self.assertEqual(sum(c.args==(3,) for c in closing.call_args_list),1)

    def test_uncertain_gate_write_never_replays(self):
        for result in (0,OSError(errno.EIO,'uncertain')):
            with self.subTest(result=result),self.recording() as r,self.pipes() as pipes,self.gate(r,pipes) as (record,reaper,binding,_):
                pipes.after_fork()
                with mock.patch.object(launcher.os,'write',side_effect=result if isinstance(result,Exception) else None,return_value=result) as writing:
                    with self.assertRaises(launcher.InventoryError):pipes.open_gate(record,reaper,binding)
                    with self.assertRaises(launcher.InventoryError):pipes.open_gate(record,reaper,binding)
                    self.assertEqual(writing.call_count,1)
                self.assertIsNone(pipes.gate_write)

    def test_gate_binding_mismatch_refuses_before_relay_or_write(self):
        from dataclasses import replace
        for mismatch in ('pid','pidfd','settled','lease','status','relay'):
            with self.subTest(mismatch=mismatch),self.recording() as r,self.pipes() as pipes,self.gate(r,pipes) as (record,reaper,binding,closing):
                pipes.after_fork()
                if mismatch=='pid':reaper.pid+=1
                if mismatch=='pidfd':reaper.pidfd=None
                if mismatch=='settled':reaper.poll.return_value=launcher.ChildSettlement('unknown')
                if mismatch=='lease':binding=replace(binding,lease_fd=binding.lease_fd+10000)
                if mismatch=='status':binding=replace(binding,status_fd=binding.status_fd+10000)
                if mismatch=='relay':binding=replace(binding,roles=())
                with mock.patch.object(launcher.os,'write') as writing:
                    with self.assertRaises(launcher.InventoryError):pipes.open_gate(record,reaper,binding)
                    writing.assert_not_called()
                self.assertFalse(any(c.args==(3,) for c in closing.call_args_list))

    def test_second_pair_failure_closes_first_owned_pair(self):
        opened=[]
        def pipe(flags):
            if opened:raise OSError(errno.EMFILE,'no descriptors')
            pair=os.pipe();opened.extend(pair);return pair
        with self.recording(),mock.patch.object(launcher.os,'pipe2',side_effect=pipe,create=True):
            with self.assertRaises(OSError):launcher.ReplyParentPipes()
        for fd in opened:
            with self.assertRaises(OSError):os.fstat(fd)

    def test_close_failure_attempts_all_ends_once(self):
        with self.recording(),self.pipes() as pipes:
            fds=(pipes.gate_read,pipes.gate_write,pipes.status_read,pipes.status_write)
            original=os.close;calls=[]
            def close(fd):
                calls.append(fd);original(fd)
                if fd==fds[0]:raise OSError(errno.EIO,'uncertain')
            with mock.patch.object(launcher.os,'close',side_effect=close):
                with self.assertRaisesRegex(launcher.InventoryError,'child_pipe_close_unconfirmed'):pipes.close()
                pipes.close()
            self.assertEqual(calls,list(fds))

    def test_gate_close_error_is_not_opened_and_cannot_replay(self):
        with self.recording() as r,self.pipes() as pipes,self.gate(r,pipes) as (record,reaper,binding,closing):
            pipes.after_fork();gate=pipes.gate_write;original=closing.side_effect
            def close(fd):
                result=original(fd)
                if fd==gate:raise OSError(errno.EIO,'uncertain')
                return result
            closing.side_effect=close
            with mock.patch.object(launcher.os,'write',return_value=1) as writing:
                with self.assertRaisesRegex(launcher.InventoryError,'child_pipe_close_unconfirmed'):
                    pipes.open_gate(record,reaper,binding)
                with self.assertRaises(launcher.InventoryError):pipes.open_gate(record,reaper,binding)
                writing.assert_called_once_with(gate,b'G')
            self.assertEqual(pipes.state,'gate_attempted');self.assertIsNone(pipes.gate_write)

    def test_late_control_refusal_after_relay_close_prevents_byte(self):
        with self.recording() as r,self.pipes() as pipes,self.gate(r,pipes) as (record,reaper,binding,closing):
            pipes.after_fork();original=closing.side_effect
            def close(fd):
                if fd==3:r.setup.control.poll.side_effect=launcher.InventoryError('cancelled')
                return original(fd)
            closing.side_effect=close
            with mock.patch.object(launcher.os,'write') as writing:
                with self.assertRaises(launcher.InventoryError):pipes.open_gate(record,reaper,binding)
                writing.assert_not_called()
            self.assertIsNone(pipes.gate_write)


class ParentMonitorTests(unittest.TestCase):
    def setUp(self):
        from types import SimpleNamespace
        self.stack=contextlib.ExitStack();self.addCleanup(self.stack.close)
        self.now=100.0
        self.stack.enter_context(mock.patch.object(launcher.time,'monotonic',side_effect=lambda:self.now))
        self.sleep=self.stack.enter_context(mock.patch.object(launcher.time,'sleep',side_effect=self.advance))
        self.alarm=self.stack.enter_context(mock.patch.object(launcher.signal,'alarm'))
        self.read=self.stack.enter_context(mock.patch.object(launcher.os,'read',side_effect=BlockingIOError()))
        self.stack.enter_context(mock.patch.object(launcher.os,'set_blocking'))
        self.stack.enter_context(mock.patch.object(launcher,'_descriptor_role'))
        self.check=self.stack.enter_context(mock.patch.object(launcher,'_recorded_checkpoint'))
        self.identity=self.stack.enter_context(mock.patch.object(launcher,'_read_process_identity'))
        self.stream=mock.Mock();self.stream.recv.side_effect=BlockingIOError()
        self.control=launcher.SetupControl(self.stream,130)
        self.record=SimpleNamespace(setup=SimpleNamespace(control=self.control),identity=SimpleNamespace(pid=12345))
        self.identity.return_value=self.record.identity
        self.pipes=SimpleNamespace(status_read=55)
        self.reaper=mock.Mock();self.reaper.poll.return_value=None
        self.reaper.wait.return_value=launcher.ChildSettlement('signalled',9)

    def advance(self, seconds):
        self.assertGreater(seconds,0);self.assertLessEqual(seconds,0.05);self.now+=seconds

    def test_exec_eof_requires_matching_live_image_and_two_wait_observations(self):
        self.read.side_effect=None;self.read.return_value=b''
        self.assertEqual(launcher.wait_reply_exec(self.record,self.pipes,self.reaper),0)
        self.identity.assert_called_once_with(12345,'child')
        self.assertEqual(self.reaper.poll.call_count,2)
        self.assertEqual(self.check.call_count,2);self.alarm.assert_not_called()

    def test_exec_eof_plus_death_or_wrong_image_refuses(self):
        self.read.side_effect=None;self.read.return_value=b''
        self.reaper.poll.side_effect=[None,launcher.ChildSettlement('exited',0)]
        self.assertEqual(launcher.wait_reply_exec(self.record,self.pipes,self.reaper),69)
        self.reaper.poll.side_effect=None;self.identity.return_value=object()
        self.assertEqual(launcher.wait_reply_exec(self.record,self.pipes,self.reaper),69)

    def test_exec_status_failure_unknown_and_control_codes(self):
        self.read.side_effect=None;self.read.return_value=b'F'
        self.assertEqual(launcher.wait_reply_exec(self.record,self.pipes,self.reaper),69)
        self.reaper.poll.return_value=launcher.ChildSettlement('unknown')
        self.assertEqual(launcher.wait_reply_exec(self.record,self.pipes,self.reaper),74)
        self.reaper.poll.return_value=None
        for reason,code in (('cancelled',72),('control_invalid',72),('setup_deadline',73),('lease_changed',69)):
            self.check.side_effect=launcher.InventoryError(reason)
            self.assertEqual(launcher.wait_reply_exec(self.record,self.pipes,self.reaper),code)

    def test_original_setup_deadline_caps_exec_wait_and_late_eof(self):
        self.control.deadline=100.1
        self.assertEqual(launcher.wait_reply_exec(self.record,self.pipes,self.reaper),73)
        self.assertAlmostEqual(self.now,100.1)
        self.now=100;self.control.deadline=110
        def late(*args):self.now=111;return b''
        self.read.side_effect=late
        self.assertEqual(launcher.wait_reply_exec(self.record,self.pipes,self.reaper),73)

    def test_runtime_transfer_preserves_partial_commands_and_refuses_retransfer(self):
        self.control.pending=b'TE';self.stream.recv.side_effect=[b'RM\nKILL\n']
        channel=launcher.RuntimeReplyControl(self.control)
        self.assertEqual(channel.poll(),launcher.signal.SIGTERM)
        self.assertEqual(channel.poll(),launcher.signal.SIGKILL)
        self.assertEqual(channel.poll(),launcher.signal.SIGKILL)
        self.stream.recv.assert_called_once_with(16,socket.MSG_DONTWAIT)
        with self.assertRaises(launcher.InventoryError):launcher.RuntimeReplyControl(self.control)
        with self.assertRaises(launcher.InventoryError):self.control.poll()

    def test_runtime_bad_input_eof_and_read_error_request_only_kill(self):
        for value in (b'',b'BAD\n',b'KILL\n',b'X',OSError(errno.EIO,'lost')):
            stream=mock.Mock()
            if isinstance(value,Exception):stream.recv.side_effect=value
            else:stream.recv.return_value=value
            channel=launcher.RuntimeReplyControl(launcher.SetupControl(stream,130))
            self.assertEqual(channel.poll(),launcher.signal.SIGKILL)
            self.assertTrue(channel.ended)

    def test_runtime_term_then_kill_requires_actual_reap(self):
        self.stream.recv.side_effect=[b'TERM\n',b'KILL\n']
        self.assertEqual(launcher.monitor_reply_runtime(self.control,self.reaper),76)
        self.assertEqual(self.reaper.send.call_args_list,[mock.call(launcher.signal.SIGTERM),mock.call(launcher.signal.SIGKILL)])
        self.reaper.wait.assert_called_once_with(112.05)
        self.assertAlmostEqual(self.now,100.05)

    def test_runtime_terminal_status_and_unknown_preserve_verdicts(self):
        for outcome,code in ((launcher.ChildSettlement('exited',0),0),(launcher.ChildSettlement('exited',1),75),
                             (launcher.ChildSettlement('signalled',9),76),(launcher.ChildSettlement('unknown'),74)):
            control=launcher.SetupControl(mock.Mock(),130);self.reaper.poll.return_value=outcome
            self.assertEqual(launcher.monitor_reply_runtime(control,self.reaper),code)
        self.reaper.send.assert_not_called();self.reaper.wait.assert_not_called()

    def test_gate_failure_may_have_executed_so_kills_and_reaps(self):
        pipes=mock.Mock();pipes.open_gate.side_effect=launcher.InventoryError('child_pipe_close_unconfirmed')
        self.assertEqual(launcher._bound_reply_parent(self.record,pipes,self.reaper,object()),69)
        self.reaper.send.assert_called_once_with(launcher.signal.SIGKILL)
        self.reaper.wait.assert_called_once_with(112)
        self.alarm.assert_not_called()

    def test_exec_failure_never_reports_settled_when_reap_unknown(self):
        self.read.side_effect=None;self.read.return_value=b'F'
        self.reaper.wait.return_value=launcher.ChildSettlement('unknown')
        self.assertEqual(launcher._bound_reply_parent(self.record,mock.Mock(status_read=55),self.reaper,object()),74)
        self.alarm.assert_not_called()

    def test_alarm_disarmed_only_after_observed_exec(self):
        self.read.side_effect=None;self.read.return_value=b''
        with mock.patch.object(launcher,'monitor_reply_runtime',return_value=0) as running:
            self.assertEqual(launcher._bound_reply_parent(self.record,mock.Mock(status_read=55),self.reaper,object()),0)
            running.assert_called_once_with(self.control,self.reaper)
        self.alarm.assert_called_once_with(0);self.reaper.send.assert_not_called()


class ParentCompositionTests(ScratchTests):
    attempt=ChildRecordTests.attempt
    nonce=ChildRecordTests.nonce
    argv=ChildRecordTests.argv
    recording=ChildRecordTests.recording

    def test_parent_registration_failure_closes_gate_and_waits_without_signal(self):
        with self.recording() as r:
            pipes=mock.Mock();reaper=mock.Mock();reaper.wait.return_value=launcher.ChildSettlement('exited',118)
            with mock.patch.object(launcher,'record_reply_child',side_effect=launcher.InventoryError('lease_failed')):
                with mock.patch.object(launcher,'ReplyChildReaper',return_value=reaper) as create:
                    self.assertEqual(launcher._run_reply_parent(r.setup,pipes,r.child.pid,object()),77)
                    create.assert_called_once_with(r.child.pid)
            pipes._close_end.assert_called_once_with('gate_write');reaper.send.assert_not_called()

    def test_missing_pidfd_closes_gate_and_unknown_is_not_settlement(self):
        with self.recording() as r:
            pipes=mock.Mock();reaper=mock.Mock();reaper.wait.return_value=launcher.ChildSettlement('unknown')
            with mock.patch.object(launcher,'retained_reply_pidfd',side_effect=launcher.InventoryError('unavailable')):
                with mock.patch.object(launcher,'ReplyChildReaper',return_value=reaper):
                    self.assertEqual(launcher._run_reply_parent(r.setup,pipes,r.child.pid,object()),74)
            pipes._close_end.assert_called_once_with('gate_write');reaper.send.assert_not_called()

    def test_pidfd_close_uncertainty_never_creates_second_reaper(self):
        with self.recording() as r:
            @contextlib.contextmanager
            def retained(record):
                yield 98765
                raise launcher.InventoryError('child_pidfd_close_unconfirmed')
            with mock.patch.object(launcher,'retained_reply_pidfd',side_effect=retained):
                with mock.patch.object(launcher,'ReplyChildReaper') as create:
                    with mock.patch.object(launcher,'_bound_reply_parent',return_value=0):
                        self.assertEqual(launcher._run_reply_parent(r.setup,mock.Mock(),r.child.pid,object()),74)
                    create.assert_called_once_with(r.child.pid,98765)

    def test_prepared_parent_forks_once_after_capture_and_keeps_cleanup(self):
        with self.recording() as r,contextlib.ExitStack() as stack:
            events=[];caps=object();binding=object();pipes=mock.Mock(gate_read=61,gate_write=62,status_read=63,status_write=64)
            stack.enter_context(mock.patch.object(launcher,'query_linux_capabilities',return_value=caps))
            stack.enter_context(mock.patch.object(launcher,'_landlock_rules'))
            stack.enter_context(mock.patch.object(r.setup,'redirect_diagnostics',side_effect=lambda:events.append('diagnostics')))
            stack.enter_context(mock.patch.object(launcher,'ReplyParentPipes',return_value=pipes))
            stack.enter_context(mock.patch.object(launcher,'capture_child_descriptor_roles',side_effect=lambda *args:events.append('capture') or binding))
            stack.enter_context(mock.patch.object(launcher,'_validate_child_start'))
            fork=stack.enter_context(mock.patch.object(launcher.os,'fork',side_effect=lambda:events.append('fork') or r.child.pid))
            parent=stack.enter_context(mock.patch.object(launcher,'_run_reply_parent',return_value=0))
            child=stack.enter_context(mock.patch.object(launcher,'run_reply_child'))
            self.assertEqual(launcher.run_prepared_reply(r.setup,()),0)
            self.assertEqual(events,['diagnostics','capture','fork']);fork.assert_called_once()
            parent.assert_called_once_with(r.setup,pipes,r.child.pid,binding)
            child.assert_not_called();pipes.close.assert_called_once()

    def test_cleanup_failure_after_fork_is_unknown_even_after_parent_success(self):
        with self.recording() as r,contextlib.ExitStack() as stack:
            pipes=mock.Mock(gate_read=61,gate_write=62,status_read=63,status_write=64)
            pipes.close.side_effect=launcher.InventoryError('child_pipe_close_unconfirmed')
            for name in ('query_linux_capabilities','_landlock_rules','capture_child_descriptor_roles','_validate_child_start'):
                stack.enter_context(mock.patch.object(launcher,name))
            stack.enter_context(mock.patch.object(r.setup,'redirect_diagnostics'))
            stack.enter_context(mock.patch.object(launcher,'ReplyParentPipes',return_value=pipes))
            stack.enter_context(mock.patch.object(launcher.os,'fork',return_value=r.child.pid))
            stack.enter_context(mock.patch.object(launcher,'_run_reply_parent',return_value=0))
            self.assertEqual(launcher.run_prepared_reply(r.setup,()),74)
            pipes.close.assert_called_once()

    def test_child_return_or_exception_exits_without_parent_cleanup(self):
        class ChildExit(BaseException):pass
        for failure in (None,RuntimeError('synthetic child failure')):
            with self.subTest(failure=failure),self.recording() as r,contextlib.ExitStack() as stack:
                pipes=mock.Mock(gate_read=61,gate_write=62,status_read=63,status_write=64)
                for name in ('query_linux_capabilities','_landlock_rules','capture_child_descriptor_roles','_validate_child_start'):
                    stack.enter_context(mock.patch.object(launcher,name))
                stack.enter_context(mock.patch.object(r.setup,'redirect_diagnostics'))
                stack.enter_context(mock.patch.object(launcher,'ReplyParentPipes',return_value=pipes))
                stack.enter_context(mock.patch.object(launcher.os,'fork',return_value=0))
                stack.enter_context(mock.patch.object(launcher,'run_reply_child',side_effect=failure))
                exiting=stack.enter_context(mock.patch.object(launcher.os,'_exit',side_effect=ChildExit()))
                parent=stack.enter_context(mock.patch.object(launcher,'_parent_result'))
                with self.assertRaises(ChildExit):launcher.run_prepared_reply(r.setup,())
                exiting.assert_called_once_with(69);pipes.close.assert_not_called();parent.assert_not_called()

    def test_cancellation_and_deadline_preserved_before_record_and_pidfd(self):
        import itertools
        cases=itertools.product(('record','pidfd'),(('cancelled',72),('setup_deadline',73)),('exited','unknown'))
        for stage,(reason,code),state in cases:
            expected=code if state=='exited' else 74
            with self.subTest(stage=stage,reason=reason,state=state),self.recording() as r,contextlib.ExitStack() as stack:
                reaper=mock.Mock();reaper.wait.return_value=launcher.ChildSettlement(state,118 if state=='exited' else None)
                stack.enter_context(mock.patch.object(launcher,'ReplyChildReaper',return_value=reaper))
                target='record_reply_child' if stage=='record' else 'retained_reply_pidfd'
                stack.enter_context(mock.patch.object(launcher,target,side_effect=launcher.InventoryError(reason)))
                self.assertEqual(launcher._run_reply_parent(r.setup,mock.Mock(),r.child.pid,object()),expected)
                reaper.send.assert_not_called()


class ParentCorrectionTests(unittest.TestCase):
    setUp=ParentMonitorTests.setUp
    advance=ParentMonitorTests.advance
    def test_settlement_clock_failure_is_unknown_without_effects(self):
        with mock.patch.object(launcher.time, 'monotonic', side_effect=OSError(errno.EIO, 'synthetic clock failure')):
            self.assertEqual(launcher._kill_and_settle(self.reaper),74)
        self.reaper.send.assert_not_called()
        self.reaper.wait.assert_not_called()

    def test_settlement_error_does_not_signal_twice_or_reset_deadline(self):
        def failed(deadline):self.now=105;raise OSError(errno.EIO,'synthetic wait failure')
        self.reaper.wait.side_effect=failed
        self.read.side_effect=None;self.read.return_value=b'F'
        self.assertEqual(launcher._bound_reply_parent(self.record,mock.Mock(status_read=55),self.reaper,object()),74)
        self.reaper.send.assert_called_once_with(launcher.signal.SIGKILL)
        self.reaper.wait.assert_called_once_with(112)

    def test_runtime_kill_settlement_error_never_retries(self):
        self.stream.recv.side_effect=None;self.stream.recv.return_value=b'KILL\n'
        def failed(deadline):self.now=105;raise OSError(errno.EIO,'synthetic wait failure')
        self.reaper.wait.side_effect=failed
        self.assertEqual(launcher.monitor_reply_runtime(self.control,self.reaper),74)
        self.reaper.send.assert_called_once_with(launcher.signal.SIGKILL)
        self.reaper.wait.assert_called_once_with(112)

    def test_identity_decode_failure_is_fixed_code_with_one_settlement(self):
        for error in (ValueError('synthetic parse'),UnicodeDecodeError('ascii',b'\xff',0,1,'synthetic')):
            with self.subTest(error=type(error).__name__):
                self.reaper.reset_mock();self.read.side_effect=None;self.read.return_value=b''
                self.identity.side_effect=error
                self.assertEqual(launcher._bound_reply_parent(self.record,mock.Mock(status_read=55),self.reaper,object()),69)
                self.reaper.send.assert_called_once_with(launcher.signal.SIGKILL)
                self.reaper.wait.assert_called_once_with(112)
                self.alarm.assert_not_called()

    def test_gate_cancellation_and_deadline_require_reap_and_preserve_reason(self):
        for reason,code in (('cancelled',72),('setup_deadline',73)):
            for state,expected in (('signalled',code),('unknown',74)):
                with self.subTest(reason=reason,state=state):
                    pipes=mock.Mock();pipes.open_gate.side_effect=launcher.InventoryError(reason)
                    self.reaper.wait.return_value=launcher.ChildSettlement(state,9 if state=='signalled' else None)
                    self.assertEqual(launcher._bound_reply_parent(self.record,pipes,self.reaper,object()),expected)


class CheckCommandTests(ScratchTests):
    attempt = '0f7089be-c571-4937-8cbb-6ee907df64cd'

    def setUp(self):
        super().setUp()
        self.current = self.root()
        (self.current / '.admit').write_bytes(b'')
        (self.current / '.admit').chmod(0o600)
        self.argv = ['check', '--replies', str(self.replies), '--attempt', self.attempt]

    def command(self, argv=None, current=None):
        import io
        out, err = io.StringIO(), io.StringIO()
        with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
            code = launcher.launcher_command(self.argv if argv is None else argv,
                                             str(self.current) if current is None else current)
        return code, out.getvalue(), err.getvalue()

    def test_closed_arguments_and_explicit_generation(self):
        expected = (str(self.replies), self.attempt, 'gen-current')
        self.assertEqual(launcher.parse_check_arguments(self.argv, str(self.current)), expected)
        self.assertEqual(launcher.parse_check_arguments(
            ['check', '--attempt', self.attempt, '--replies', str(self.replies)], str(self.current)), expected)
        invalid = [[], self.argv + ['extra'], self.argv[:-1],
                   ['check', '--replies', str(self.replies), '--replies', str(self.replies)],
                   ['check', '--replies=' + str(self.replies), '--attempt', self.attempt],
                   ['check', '--replies', str(self.replies), '--attempt', 'attempt-1'],
                   ['check', '--replies', str(self.replies) + '/..', '--attempt', self.attempt],
                   ['check', '--replies', str(self.replies), '--attempt', None]]
        for argv in invalid:
            with self.subTest(argv=argv), self.assertRaises(launcher.InventoryError):
                launcher.parse_check_arguments(argv, str(self.current))
        for current in (None, '', str(self.replies / 'sealed-current'),
                        str(self.current / 'gen-inner'), str(self.base / 'gen-current'),
                        str(self.current) + '/', str(self.replies) + '/./gen-current'):
            with self.subTest(current=current), self.assertRaises(launcher.InventoryError):
                launcher.parse_check_arguments(self.argv, current)

    def test_unsupported_host_never_calls_observer(self):
        with mock.patch.object(launcher, '_process_support', return_value=False), \
                mock.patch.object(launcher, 'check_attempt') as observe:
            self.assertEqual(self.command(), (69, '', 'containment_unavailable\n'))
            observe.assert_not_called()

    def test_real_owned_empty_and_absent_reports_under_injected_support(self):
        old = self.root('sealed-old')
        (old / '.admit').write_bytes(b''); (old / '.admit').chmod(0o600)
        with mock.patch.object(launcher, '_process_support', return_value=True):
            for empty in (False, True):
                if empty: (self.current / self.attempt).mkdir(mode=0o700)
                code, output, error = self.command()
                self.assertEqual((code, error), (0, ''))
                rows = [json.loads(line) for line in output.splitlines()]
                self.assertEqual([row['state'] for row in rows], ['empty' if empty else 'absent', 'absent'])
                self.assertTrue(all(row['attemptId'] == self.attempt for row in rows))
                self.assertTrue((self.current / '.admit').exists())
        self.assertTrue((self.current / self.attempt).exists())

    def test_unsealed_older_generation_is_nonzero_not_guessed_current(self):
        self.root('gen-old')
        with mock.patch.object(launcher, '_process_support', return_value=True):
            code, output, error = self.command()
        self.assertEqual((code, error), (74, ''))
        self.assertEqual(json.loads(output.splitlines()[1])['reason'], 'generation_unsealed')

    def test_failed_argument_binding_never_observes_filesystem(self):
        with mock.patch.object(launcher, 'check_attempt') as observe:
            self.assertEqual(self.command(current=''), (64, '', 'check_arguments\n'))
            observe.assert_not_called()

    def test_observer_failure_has_no_partial_report_or_raw_error(self):
        with mock.patch.object(launcher, '_process_support', return_value=True):
            for error in (OSError('synthetic sensitive detail'), launcher.InventoryError('namespace_changed'),
                          ValueError('synthetic decode detail')):
                with self.subTest(error=type(error).__name__), \
                        mock.patch.object(launcher, 'check_attempt', side_effect=error):
                    self.assertEqual(self.command(), (74, '', 'check_unconfirmed\n'))

    def row(self, state='absent', reason='home_absent', root=None, attempt=None):
        return launcher.CheckObservation(self.attempt if attempt is None else attempt,
                                        str(self.current) if root is None else root, state, reason)

    def test_complete_report_validation_refuses_mixed_or_unbounded_success(self):
        good = self.row()
        invalid = [(), [good], (good, good), tuple(good for _ in range(257)),
                   (self.row(root=str(self.replies / 'sealed-other')),),
                   (good, self.row(root=str(self.base / 'sealed-other'))),
                   (good, self.row(attempt='wrong')),
                   (good, self.row(state='gone', reason='raw content')),
                   (good, self.row(state='gone', reason='home_absent')),
                   (self.row('empty', 'home_empty'),
                    self.row('gone', 'recorded_processes_gone', str(self.replies / 'sealed-other')))]
        with mock.patch.object(launcher, '_process_support', return_value=True):
            for rows in invalid:
                with self.subTest(rows=rows), mock.patch.object(launcher, 'check_attempt', return_value=rows):
                    self.assertEqual(self.command(), (74, '', 'check_unconfirmed\n'))

    def test_report_cap_is_bytes_not_row_count(self):
        replies = '/' + 'x' * 3900
        rows = tuple(launcher.CheckObservation(self.attempt, replies + '/gen-' + str(i),
                                               'absent', 'home_absent') for i in range(20))
        with self.assertRaisesRegex(launcher.InventoryError, 'check_report_limit'):
            launcher.check_report(rows, replies, self.attempt, 'gen-0')

    def test_unsettled_or_unresolved_report_never_exits_zero(self):
        for state, reason in (('unsettled', 'life_lock_held'), ('unresolved', 'process_unconfirmed')):
            with self.subTest(state=state):
                code, output = launcher.check_report((self.row(state, reason),),
                                                      str(self.replies), self.attempt, 'gen-current')
                self.assertEqual(code, 74)
                self.assertEqual(json.loads(output)['state'], state)

    def test_output_failure_never_returns_success(self):
        import io
        for failure in ('short', 'write', 'flush'):
            output = mock.Mock()
            output.write.side_effect = OSError('synthetic output') if failure == 'write' else None
            output.write.return_value = 0 if failure == 'short' else None
            if failure == 'flush':
                output.write.side_effect = len
                output.flush.side_effect = OSError('synthetic flush')
            with self.subTest(failure=failure), mock.patch.object(launcher.sys, 'stdout', output), \
                    contextlib.redirect_stderr(io.StringIO()), \
                    mock.patch.object(launcher, '_process_support', return_value=True):
                self.assertEqual(launcher.launcher_command(self.argv, str(self.current)), 74)

    def test_execution_commands_stay_disabled(self):
        with mock.patch.object(launcher, 'run_prepared_reply') as run:
            for command in ('run', 'probe'):
                code, output, error = self.command(argv=[command])
                self.assertEqual((code, output), (69, ''))
                self.assertIn('unimplemented', error)
            run.assert_not_called()

    def test_main_uses_only_named_generation_environment(self):
        environment = mock.Mock()
        environment.get.return_value = str(self.current)
        with mock.patch.object(launcher.sys, 'argv', ['reply-launch.py'] + self.argv), \
                mock.patch.object(launcher.os, 'environ', environment), \
                mock.patch.object(launcher, 'launcher_command', return_value=74) as command:
            self.assertEqual(launcher.main(), 74)
            environment.get.assert_called_once_with('SOPHIA_REPLY_ROOT')
            command.assert_called_once_with(self.argv, str(self.current))


    def test_incomplete_owned_lease_preserves_unresolved_report_without_process_read(self):
        home = self.current / self.attempt
        home.mkdir(mode=0o700)
        identity = launcher.ProcessIdentity(12345, '456', self.attempt, '/usr/bin/python3', 'ab' * 32)
        data = launcher._launcher_records(identity).splitlines(keepends=True)[0]
        fd = os.open(home / 'lease.json', os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        try:
            os.write(fd, data)
        finally:
            os.close(fd)
        with mock.patch.object(launcher, '_process_support', return_value=True), \
                mock.patch.object(launcher, 'inspect_process') as inspect:
            code, output, error = self.command()
            inspect.assert_not_called()
        self.assertEqual((code, error), (74, ''))
        self.assertEqual(json.loads(output), {'attemptId': self.attempt, 'root': str(self.current),
                                             'state': 'unresolved', 'reason': 'lease_incomplete'})
        self.assertEqual((home / 'lease.json').read_bytes(), data)


class SweepFixture(ScratchTests):
    attempt = '0f7089be-c571-4937-8cbb-6ee907df64cd'

    def setUp(self):
        super().setUp()
        self.current = self.root()
        (self.current / '.admit').write_bytes(b''); (self.current / '.admit').chmod(0o600)
        self.home = self.current / self.attempt; self.home.mkdir(mode=0o700)
        self.parent_identity = launcher.ProcessIdentity(12345, '456', self.attempt, '/usr/bin/python3', 'ab' * 32)
        self.child_identity = launcher.ProcessIdentity(12346, '457', self.attempt, '/runtime/node', 'ab' * 32)
        self.original = launcher._launcher_records(self.parent_identity) + launcher._child_record_line(self.child_identity)
        self.lease = self.home / 'lease.json'; self.lease.write_bytes(self.original); self.lease.chmod(0o600)
        self.stack = contextlib.ExitStack(); self.addCleanup(self.stack.close)
        self.now = 100; self.closed = []; self.registered = set()
        self.actual_close = os.close
        self.pidfds = {12345: 8001, 12346: 8002}
        self.identities = {12345: self.parent_identity, 12346: self.child_identity}
        self.stack.enter_context(mock.patch.object(launcher.os, 'close', side_effect=self.close_fd))
        self.stack.enter_context(mock.patch.object(launcher.time, 'monotonic', side_effect=lambda: self.now))
        self.stack.enter_context(mock.patch.object(launcher.time, 'sleep', side_effect=self.advance))
        self.stack.enter_context(mock.patch.object(launcher, '_process_support', return_value=True))
        self.open_pidfd = self.stack.enter_context(mock.patch.object(launcher.os, 'pidfd_open',
                                          side_effect=lambda pid, flags: self.pidfds[pid], create=True))
        self.read_identity = self.stack.enter_context(mock.patch.object(launcher, '_read_process_identity',
                          side_effect=lambda pid, kind: self.identities[pid]))
        self.send = self.stack.enter_context(mock.patch.object(launcher.signal, 'pidfd_send_signal', create=True))
        self.kill = self.stack.enter_context(mock.patch.object(launcher.os, 'kill', side_effect=AssertionError('numeric signal')))
        self.poller = mock.Mock()
        self.poller.register.side_effect = lambda fd, event: self.registered.add(fd)
        self.poller.unregister.side_effect = self.registered.remove
        self.poller.poll.side_effect = lambda timeout: [(fd, launcher.select.POLLIN) for fd in sorted(self.registered)]
        self.stack.enter_context(mock.patch.object(launcher.select, 'poll', return_value=self.poller))

    def advance(self, amount):
        self.now += amount

    def close_fd(self, fd):
        if fd in self.pidfds.values(): self.closed.append(fd)
        else: self.actual_close(fd)

    def sweep(self, wait_ms=12000):
        return launcher.sweep_attempt(str(self.replies), self.attempt, 'gen-current', wait_ms)

    def kills(self):
        return [call.args[0] for call in self.send.call_args_list if call.args[1] == launcher.signal.SIGKILL]

class SweepTests(SweepFixture):
    def test_verified_child_before_parent_and_retained_lease(self):
        self.assertEqual(self.sweep()[0].state, 'stopped')
        self.assertEqual(self.kills(), [8002, 8001])
        self.assertEqual(self.closed, [8001, 8002])
        self.assertEqual(self.lease.read_bytes(), self.original)
        self.assertTrue(self.home.exists())
        self.assertEqual(self.registered, set())
        self.kill.assert_not_called()

    def test_all_five_identity_mismatches_prevent_every_kill(self):
        from dataclasses import replace
        changes = [{'pid': 999}, {'start_time': '999'}, {'boot_id': '1' + self.attempt[1:]},
                   {'executable': '/other/python'}, {'nonce': 'cd' * 32}]
        for change in changes:
            self.send.reset_mock(); self.closed.clear()
            wrong = replace(self.parent_identity, **change)
            self.read_identity.side_effect = lambda pid, kind: wrong if pid == 12345 else self.child_identity
            with self.subTest(change=change):
                self.assertEqual(self.sweep()[0].state, 'unresolved')
                self.assertEqual(self.kills(), [])
                self.assertEqual(self.closed, [8001, 8002])

    def test_late_identity_mismatch_never_signals_that_pidfd(self):
        from dataclasses import replace
        self.read_identity.side_effect = [self.child_identity, self.parent_identity,
                                         replace(self.child_identity, nonce='cd' * 32)]
        self.assertEqual(self.sweep()[0].state, 'unresolved')
        self.assertEqual(self.kills(), [])

    def test_process_exits_between_proof_and_signal_is_not_reopened(self):
        def send(fd, sig, info, flags):
            if sig == launcher.signal.SIGKILL: raise OSError(errno.ESRCH, 'synthetic gone')
        self.send.side_effect = send
        self.assertEqual(self.sweep()[0].state, 'gone')
        self.assertEqual(self.kills(), [8002, 8001])
        self.assertEqual(self.open_pidfd.call_count, 2)
        self.assertEqual(self.lease.read_bytes(), self.original)

    def test_already_gone_entries_need_life_lock_but_no_signal(self):
        self.open_pidfd.side_effect = OSError(errno.ESRCH, 'synthetic gone')
        self.assertEqual(self.sweep()[0].state, 'gone')
        self.send.assert_not_called(); self.read_identity.assert_not_called()
        self.assertEqual(self.closed, [])

    def test_missing_child_record_can_end_only_verified_launcher_then_requires_life_lock(self):
        self.lease.write_bytes(launcher._launcher_records(self.parent_identity) + b'partial child')
        self.assertEqual(self.sweep()[0].state, 'stopped')
        self.assertEqual(self.kills(), [8001])
        self.assertEqual(self.open_pidfd.call_count, 1)
        self.assertTrue(self.lease.read_bytes().endswith(b'partial child'))

    def test_busy_life_lock_never_becomes_settled_from_signal_success(self):
        with mock.patch.object(launcher, '_life_lock', side_effect=launcher.InventoryError('life_lock_held')):
            with self.assertRaisesRegex(launcher.InventoryError, 'sweep_deadline'):
                self.sweep(100)
        self.assertEqual(self.kills(), [8002, 8001])
        self.assertGreaterEqual(self.now, 100.1)
        self.assertTrue(self.home.exists())

    def test_wait_timeout_never_restarts_deadline_or_signals(self):
        self.poller.poll.side_effect = lambda timeout: []
        with self.assertRaisesRegex(launcher.InventoryError, 'sweep_deadline'):
            self.sweep(100)
        self.assertEqual(self.kills(), [8002, 8001])
        self.assertEqual(self.open_pidfd.call_count, 2)
        self.assertLessEqual(self.now, 100.101)
        self.assertTrue(self.home.exists())

    def test_wait_invalid_readiness_and_late_result_are_unconfirmed(self):
        self.poller.poll.side_effect = lambda timeout: [(8002, launcher.select.POLLNVAL)]
        self.assertEqual(self.sweep()[0].state, 'unresolved')
        self.send.reset_mock(); self.now = 100
        def late(timeout):
            self.now = 113
            return [(fd, launcher.select.POLLIN) for fd in sorted(self.registered)]
        self.poller.poll.side_effect = late
        with self.assertRaisesRegex(launcher.InventoryError, 'sweep_deadline'):
            self.sweep()
        self.assertEqual(self.kills(), [8002, 8001])

    def test_lease_change_before_effect_refuses(self):
        def read(pid, kind):
            self.lease.write_bytes(self.original + b'x')
            return self.child_identity
        self.read_identity.side_effect = read
        self.assertEqual(self.sweep()[0].state, 'unresolved')
        self.assertEqual(self.kills(), [])
        self.assertTrue(self.lease.read_bytes().endswith(b'x'))

    def test_lease_change_after_child_signal_stops_further_effects(self):
        def send(fd, sig, info, flags):
            if sig == launcher.signal.SIGKILL: self.lease.write_bytes(self.original + b'x')
        self.send.side_effect = send
        self.assertEqual(self.sweep()[0].state, 'unresolved')
        self.assertEqual(self.kills(), [8002])
        self.assertTrue(self.home.exists())

    def test_namespace_change_before_effect_refuses(self):
        def read(pid, kind):
            self.root('sealed-new')
            return self.child_identity
        self.read_identity.side_effect = read
        with self.assertRaisesRegex(launcher.InventoryError, 'namespace_changed'):
            self.sweep()
        self.assertEqual(self.kills(), [])

    def test_unsealed_generation_prevents_all_process_effects(self):
        self.root('gen-old')
        result = self.sweep()
        self.assertEqual([r.reason for r in result], ['generation_unsealed', 'generation_unsealed'])
        self.open_pidfd.assert_not_called(); self.send.assert_not_called()

    def test_duplicate_home_prevents_all_process_effects(self):
        old = self.root('sealed-old'); (old / self.attempt).mkdir(mode=0o700)
        with self.assertRaisesRegex(launcher.InventoryError, 'duplicate_home'):
            self.sweep()
        self.open_pidfd.assert_not_called(); self.send.assert_not_called()

    def test_incomplete_lease_never_opens_pidfd(self):
        self.lease.write_bytes(launcher._launcher_records(self.parent_identity).splitlines(keepends=True)[0])
        self.assertEqual(self.sweep()[0].reason, 'lease_incomplete')
        self.open_pidfd.assert_not_called(); self.send.assert_not_called()

    def test_unsupported_process_capability_never_opens_pidfd(self):
        with mock.patch.object(launcher, '_process_support', return_value=False):
            self.assertEqual(self.sweep()[0].state, 'unresolved')
        self.open_pidfd.assert_not_called(); self.send.assert_not_called()

    def test_pidfd_close_failure_never_claims_stopped_or_retries_close(self):
        def close(fd):
            self.close_fd(fd)
            if fd == 8001: raise OSError(errno.EIO, 'synthetic close uncertainty')
        with mock.patch.object(launcher.os, 'close', side_effect=close):
            self.assertEqual(self.sweep()[0].state, 'unresolved')
        self.assertEqual(self.closed, [8001, 8002])
        self.assertEqual(self.kills(), [8002, 8001])

    def test_absent_and_empty_home_are_only_filesystem_observations(self):
        self.lease.unlink()
        self.assertEqual(self.sweep()[0].state, 'empty')
        self.home.rmdir()
        self.assertEqual(self.sweep()[0].state, 'absent')
        self.open_pidfd.assert_not_called(); self.send.assert_not_called()

    def test_invalid_scope_and_wait_refuse_before_process_effects(self):
        for wait in (0, -1, True, 12001, 1.5):
            with self.subTest(wait=wait), self.assertRaisesRegex(launcher.InventoryError, 'sweep_arguments'):
                self.sweep(wait)
        with self.assertRaisesRegex(launcher.InventoryError, 'sweep_arguments'):
            launcher.sweep_attempt(str(self.replies), 'not-uuid', 'gen-current')
        self.open_pidfd.assert_not_called(); self.send.assert_not_called()


class SweepAllTests(SweepFixture):
    second = '1f7089be-c571-4937-8cbb-6ee907df64cd'

    def sealed(self):
        root = self.root('sealed-old')
        (root / '.admit').write_bytes(b''); (root / '.admit').chmod(0o600)
        return root

    def add_home(self, root, attempt=None):
        home = root / (self.second if attempt is None else attempt); home.mkdir(mode=0o700)
        parent = launcher.ProcessIdentity(12347, '458', self.attempt, '/usr/bin/python3', 'cd' * 32)
        child = launcher.ProcessIdentity(12348, '459', self.attempt, '/runtime/node', 'cd' * 32)
        self.pidfds.update({12347: 8003, 12348: 8004})
        self.identities.update({12347: parent, 12348: child})
        lease = home / 'lease.json'
        lease.write_bytes(launcher._launcher_records(parent) + launcher._child_record_line(child)); lease.chmod(0o600)
        return home

    def all(self, wait_ms=12000):
        return launcher.sweep_all(str(self.replies), 'gen-current', wait_ms)

    def test_complete_inventory_uses_each_original_process_once(self):
        old = self.sealed(); second = self.add_home(old)
        rows = self.all()
        self.assertEqual([(r.attempt_id, r.state) for r in rows], [(self.attempt, 'stopped'), (self.second, 'stopped')])
        self.assertEqual(self.kills(), [8002, 8001, 8004, 8003])
        self.assertCountEqual(self.closed, [8001, 8002, 8003, 8004])
        self.assertTrue(second.exists()); self.assertEqual(self.lease.read_bytes(), self.original)
        self.kill.assert_not_called()

    def test_all_generation_drains_held_before_any_signal(self):
        old = self.sealed(); self.add_home(old)
        def send(fd, sig, info, flags):
            if sig != launcher.signal.SIGKILL: return
            for root in (self.current, old):
                with launcher._absolute_directory(str(root)) as root_fd:
                    with launcher._admission_file(root_fd) as lock_fd:
                        with self.assertRaises(BlockingIOError):
                            launcher.fcntl.flock(lock_fd, launcher.fcntl.LOCK_EX | launcher.fcntl.LOCK_NB)
        self.send.side_effect = send
        self.assertEqual([r.state for r in self.all()], ['stopped', 'stopped'])
        with launcher.drain_generation(str(old), 1): pass

    def test_all_attempts_share_the_original_deadline(self):
        self.add_home(self.sealed())
        calls = []
        def ready(timeout):
            calls.append(self.now)
            self.now = 100.06 if len(calls) == 1 else 100.11
            return [(fd, launcher.select.POLLIN) for fd in sorted(self.registered)]
        self.poller.poll.side_effect = ready
        with self.assertRaisesRegex(launcher.InventoryError, 'sweep_deadline'):
            self.all(100)
        self.assertEqual(self.kills(), [8002, 8001, 8004, 8003])
        self.assertEqual(len(calls), 2)

    def test_later_generation_drain_failure_prevents_earlier_home_effects(self):
        old = self.sealed()
        with launcher._absolute_directory(str(old)) as root_fd, launcher._admission_file(root_fd) as lock_fd:
            launcher.fcntl.flock(lock_fd, launcher.fcntl.LOCK_SH | launcher.fcntl.LOCK_NB)
            with self.assertRaisesRegex(launcher.InventoryError, 'admission_open'):
                self.all()
        self.open_pidfd.assert_not_called(); self.send.assert_not_called()
        with launcher.drain_generation(str(self.current), 1): pass

    def test_unsealed_older_root_prevents_all_effects(self):
        self.root('gen-old')
        with self.assertRaisesRegex(launcher.InventoryError, 'generation_unsealed'):
            self.all()
        self.open_pidfd.assert_not_called(); self.send.assert_not_called()

    def test_duplicate_attempt_across_roots_prevents_every_signal(self):
        self.add_home(self.sealed(), self.attempt)
        with self.assertRaisesRegex(launcher.InventoryError, 'duplicate_home'):
            self.all()
        self.open_pidfd.assert_not_called(); self.send.assert_not_called()

    def test_inventory_limit_refuses_before_first_effect(self):
        for i in range(256):
            (self.current / ('%08x-c571-4937-8cbb-6ee907df64cd' % i)).mkdir(mode=0o700)
        with self.assertRaisesRegex(launcher.InventoryError, 'sweep_inventory_invalid'):
            self.all()
        self.open_pidfd.assert_not_called(); self.send.assert_not_called()

    def test_inventory_limit_is_shared_between_roots(self):
        old = self.sealed()
        for i in range(256):
            (old / ('%08x-c571-4937-8cbb-6ee907df64cd' % i)).mkdir(mode=0o700)
        with self.assertRaisesRegex(launcher.InventoryError, 'sweep_inventory_limit'):
            self.all()
        self.open_pidfd.assert_not_called(); self.send.assert_not_called()

    def test_report_capacity_refuses_before_effects(self):
        with mock.patch.object(launcher, '_sweep_capacity', side_effect=launcher.InventoryError('sweep_report_limit')):
            with self.assertRaisesRegex(launcher.InventoryError, 'sweep_report_limit'):
                self.all()
        self.open_pidfd.assert_not_called(); self.send.assert_not_called()
        homes = tuple(('%08x-c571-4937-8cbb-6ee907df64cd' % i, (1, i)) for i in range(25))
        with self.assertRaisesRegex(launcher.InventoryError, 'sweep_report_limit'):
            launcher._sweep_capacity('/' + 'x' * 3000, (('gen-current', (1, 1), (1, 2), homes),))

    def test_unknown_entries_and_symlinks_refuse_before_effects(self):
        unknown = self.current / 'unexpected'; unknown.write_text('synthetic')
        with self.assertRaisesRegex(launcher.InventoryError, 'sweep_inventory_invalid'): self.all()
        unknown.unlink()
        link = self.current / self.second; link.symlink_to(self.home)
        with self.assertRaises((OSError, launcher.InventoryError)): self.all()
        self.open_pidfd.assert_not_called(); self.send.assert_not_called()

    def test_admission_inode_replacement_cannot_inherit_old_drain(self):
        def read(pid, kind):
            (self.current / '.admit').unlink()
            (self.current / '.admit').write_bytes(b''); (self.current / '.admit').chmod(0o600)
            return self.identities[pid]
        self.read_identity.side_effect = read
        with self.assertRaisesRegex(launcher.InventoryError, 'namespace_changed'):
            self.all()
        self.assertEqual(self.kills(), [])

    def test_new_home_after_first_signal_invalidates_pass_and_stops_further_signals(self):
        def send(fd, sig, info, flags):
            if sig == launcher.signal.SIGKILL: (self.current / self.second).mkdir(mode=0o700)
        self.send.side_effect = send
        with self.assertRaisesRegex(launcher.InventoryError, 'namespace_changed'):
            self.all()
        self.assertEqual(self.kills(), [8002])
        self.assertTrue(self.home.exists()); self.assertTrue((self.current / self.second).exists())

    def test_empty_generations_report_no_invented_attempt(self):
        self.lease.unlink(); self.home.rmdir(); self.sealed()
        self.assertEqual(self.all(), ())
        self.open_pidfd.assert_not_called(); self.send.assert_not_called()

    def test_empty_home_is_reported_and_retained(self):
        self.lease.unlink()
        rows = self.all()
        self.assertEqual([(r.attempt_id, r.state) for r in rows], [(self.attempt, 'empty')])
        self.assertTrue(self.home.exists()); self.open_pidfd.assert_not_called()

    def test_unresolved_home_does_not_hide_its_partial_effect_or_other_reports(self):
        self.add_home(self.sealed())
        def send(fd, sig, info, flags):
            if fd == 8001 and sig == launcher.signal.SIGKILL: raise OSError(errno.EPERM, 'synthetic refusal')
        self.send.side_effect = send
        self.assertEqual([r.state for r in self.all()], ['unresolved', 'stopped'])
        self.assertEqual(self.kills(), [8002, 8001, 8004, 8003])
        self.assertTrue(self.home.exists())

    def test_late_empty_inventory_and_invalid_scope_never_succeed(self):
        for wait in (0, -1, True, 12001):
            with self.subTest(wait=wait), self.assertRaisesRegex(launcher.InventoryError, 'sweep_arguments'):
                self.all(wait)
        with self.assertRaisesRegex(launcher.InventoryError, 'current_root_missing'):
            launcher.sweep_all(str(self.replies), 'gen-wrong')
        original = launcher._sweep_tree_entries
        def late(roots):
            rows = original(roots); self.now = 113; return rows
        with mock.patch.object(launcher, '_sweep_tree_entries', side_effect=late):
            with self.assertRaisesRegex(launcher.InventoryError, 'sweep_deadline'): self.all()
        self.open_pidfd.assert_not_called(); self.send.assert_not_called()


class SweepCommandTests(ScratchTests):
    attempt = '0f7089be-c571-4937-8cbb-6ee907df64cd'

    def setUp(self):
        super().setUp()
        self.current = self.root()
        self.argv = ['sweep', '--replies', str(self.replies)]

    def command(self, argv=None, current=None):
        import io
        out, err = io.StringIO(), io.StringIO()
        with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
            code = launcher.launcher_command(self.argv if argv is None else argv,
                                             str(self.current) if current is None else current)
        return code, out.getvalue(), err.getvalue()

    def row(self, state='stopped', reason='recorded_processes_stopped', root=None, attempt=None):
        return launcher.CheckObservation(self.attempt if attempt is None else attempt,
                                        str(self.current) if root is None else root, state, reason)

    def test_scope_refuses_aliases_and_extra_authority(self):
        self.assertEqual(launcher.parse_sweep_arguments(self.argv, str(self.current)),
                         (str(self.replies), 'gen-current'))
        cases = [[], ['sweep'], self.argv + ['--wait-ms', '999999'],
                 ['sweep', '--attempt', self.attempt], ['sweep', '--replies', None],
                 ['sweep', '--replies', str(self.replies) + '/..']]
        for argv in cases:
            with self.subTest(argv=argv), self.assertRaises(launcher.InventoryError):
                launcher.parse_sweep_arguments(argv, str(self.current))
        with mock.patch.object(launcher, 'sweep_all') as sweep:
            for current in ('', str(self.replies / 'sealed-old'), str(self.base / 'gen-other')):
                self.assertEqual(self.command(current=current), (64, '', 'sweep_arguments\n'))
            sweep.assert_not_called()

    def test_unsupported_host_never_sweeps(self):
        with mock.patch.object(launcher, '_process_support', return_value=False), \
                mock.patch.object(launcher, 'sweep_all') as sweep:
            self.assertEqual(self.command(), (69, '', 'containment_unavailable\n'))
            sweep.assert_not_called()

    def test_command_passes_only_bound_scope_with_default_deadline(self):
        with mock.patch.object(launcher, '_process_support', return_value=True), \
                mock.patch.object(launcher, 'sweep_all', return_value=(self.row(),)) as sweep:
            code, output, error = self.command()
            self.assertEqual((code, error), (0, ''))
            self.assertEqual(json.loads(output)['state'], 'stopped')
            sweep.assert_called_once_with(str(self.replies), 'gen-current')

    def test_empty_inventory_is_complete_not_an_invented_attempt(self):
        with mock.patch.object(launcher, '_process_support', return_value=True), \
                mock.patch.object(launcher, 'sweep_all', return_value=()):
            self.assertEqual(self.command(), (0, '', ''))

    def test_all_actual_states_have_closed_reason_and_exit(self):
        for state, reasons in launcher.SWEEP_REASONS.items():
            for reason in reasons:
                with self.subTest(state=state, reason=reason):
                    code, output = launcher.sweep_report((self.row(state, reason),),
                                                         str(self.replies), 'gen-current')
                    self.assertEqual(code, 74 if state in ('unsettled', 'unresolved') else 0)
                    self.assertEqual(json.loads(output)['reason'], reason)

    def test_duplicate_wrong_identity_or_content_never_becomes_report(self):
        good = self.row()
        cases = [[good], (good, good), (good, self.row(root=str(self.replies / 'sealed-old'))),
                 (self.row(root=str(self.replies / 'gen-other')),),
                 (self.row(root=str(self.base / 'sealed-old')),), (self.row(attempt='wrong'),),
                 (self.row(state='stopped', reason='sensitive content'),),
                 (self.row(state='gone', reason='recorded_processes_stopped'),),
                 tuple(good for _ in range(257))]
        for rows in cases:
            with self.subTest(rows=rows), self.assertRaises(launcher.InventoryError):
                launcher.sweep_report(rows, str(self.replies), 'gen-current')

    def test_output_capacity_is_bytes(self):
        import uuid
        replies = '/' + 'x' * 3900
        rows = tuple(self.row(root=replies + '/gen-current', attempt=str(uuid.UUID(int=i)))
                     for i in range(20))
        with self.assertRaisesRegex(launcher.InventoryError, 'sweep_report_limit'):
            launcher.sweep_report(rows, replies, 'gen-current')

    def test_failure_after_effect_does_not_emit_success_or_details(self):
        effects = []
        def fail(*args):
            effects.append('synthetic-signal')
            raise OSError('sensitive synthetic detail')
        with mock.patch.object(launcher, '_process_support', return_value=True), \
                mock.patch.object(launcher, 'sweep_all', side_effect=fail):
            self.assertEqual(self.command(), (74, '', 'sweep_unconfirmed\n'))
        self.assertEqual(effects, ['synthetic-signal'])

    def test_report_failure_after_sweep_is_nonzero(self):
        with mock.patch.object(launcher, '_process_support', return_value=True), \
                mock.patch.object(launcher, 'sweep_all', return_value=(self.row(reason='invalid'),)) as sweep:
            self.assertEqual(self.command(), (74, '', 'sweep_unconfirmed\n'))
            self.assertEqual(sweep.call_count, 1)

    def test_output_uncertainty_is_nonzero(self):
        import io
        for failure in ('short', 'write', 'flush'):
            output = mock.Mock()
            output.write.side_effect = OSError('synthetic write') if failure == 'write' else len
            if failure == 'short': output.write.side_effect = lambda value: len(value) - 1
            if failure == 'flush': output.flush.side_effect = OSError('synthetic flush')
            with self.subTest(failure=failure), mock.patch.object(launcher.sys, 'stdout', output), \
                    contextlib.redirect_stderr(io.StringIO()), \
                    mock.patch.object(launcher, '_process_support', return_value=True), \
                    mock.patch.object(launcher, 'sweep_all', return_value=(self.row(),)):
                self.assertEqual(launcher.launcher_command(self.argv, str(self.current)), 74)


class DigestCommandTests(ScratchTests):
    def setUp(self):
        super().setUp()
        self.template = self.base / 'template'
        self.template.mkdir(mode=0o700)
        self.runtime = '/approved/runtime'
        self.argv = ['digest', str(self.template)]
        self.addCleanup(lambda: self.template.chmod(0o700))

    def command(self, argv=None, runtime=None):
        import io
        out, err = io.StringIO(), io.StringIO()
        with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
            code = launcher.launcher_command(self.argv if argv is None else argv, None,
                                             self.runtime if runtime is None else runtime)
        return code, out.getvalue(), err.getvalue()

    def test_exact_owned_frozen_tree_digest_without_following_runtime_link(self):
        import hashlib
        (self.template / 'file').write_bytes(b'abc')
        (self.template / 'file').chmod(0o444)
        os.symlink(self.runtime + '/never-opened', self.template / 'link')
        self.template.chmod(0o555)
        lines = [b'f file - ' + hashlib.sha256(b'abc').hexdigest().encode(),
                 b'l link ' + (self.runtime + '/never-opened').encode().hex().encode()]
        expected = 'sophia-reply-tree-v1:sha256:' + hashlib.sha256(b'\n'.join(lines)).hexdigest() + '\n'
        self.assertEqual(self.command(), (0, expected, ''))
        self.assertEqual((self.template / 'file').read_bytes(), b'abc')

    def test_invalid_binding_never_scans(self):
        with mock.patch.object(launcher, 'template_inventory') as scan:
            for argv in (['digest'], self.argv + ['extra'], ['digest', 'relative'], ['digest', None]):
                self.assertEqual(self.command(argv=argv), (64, '', 'digest_arguments\n'))
            for runtime in ('', '/a/../b', '/a/', 'relative'):
                self.assertEqual(self.command(runtime=runtime), (64, '', 'digest_arguments\n'))
            scan.assert_not_called()

    def test_writable_tree_and_escaping_link_refuse(self):
        self.assertEqual(self.command(), (74, '', 'digest_unconfirmed\n'))
        os.symlink('/unapproved/content', self.template / 'link')
        self.template.chmod(0o555)
        self.assertEqual(self.command(), (74, '', 'digest_unconfirmed\n'))

    def test_one_deadline_refuses_late_scan_result(self):
        self.template.chmod(0o555)
        now = [100.0]
        def scan(*args):
            args[-1]()
            now[0] = 130.0
            return (), 'sophia-reply-tree-v1:sha256:' + 'ab' * 32
        with mock.patch.object(launcher.time, 'monotonic', side_effect=lambda: now[0]), \
                mock.patch.object(launcher, 'template_inventory', side_effect=scan):
            self.assertEqual(self.command(), (74, '', 'digest_unconfirmed\n'))

    def test_failures_and_invalid_results_expose_no_content(self):
        for error in (OSError('sensitive detail'), ValueError('sensitive decode')):
            with self.subTest(error=error), mock.patch.object(launcher, 'template_inventory', side_effect=error):
                self.assertEqual(self.command(), (74, '', 'digest_unconfirmed\n'))
        with mock.patch.object(launcher, 'template_inventory', return_value=((), 'sensitive result')):
            self.assertEqual(self.command(), (74, '', 'digest_unconfirmed\n'))

    def test_output_uncertainty_refuses_success(self):
        import io
        for failure in ('short', 'write', 'flush'):
            output = mock.Mock()
            output.write.side_effect = OSError('synthetic write') if failure == 'write' else len
            if failure == 'short': output.write.side_effect = lambda value: len(value) - 1
            if failure == 'flush': output.flush.side_effect = OSError('synthetic flush')
            with self.subTest(failure=failure), mock.patch.object(launcher.sys, 'stdout', output), \
                    contextlib.redirect_stderr(io.StringIO()), \
                    mock.patch.object(launcher, '_digest_output', return_value='ab' * 32 + '\n'):
                self.assertEqual(launcher.launcher_command(self.argv, None, self.runtime), 74)

    def test_main_reads_only_explicit_runtime_binding(self):
        environment = mock.Mock()
        environment.get.return_value = self.runtime
        with mock.patch.object(launcher.sys, 'argv', ['reply-launch.py'] + self.argv), \
                mock.patch.object(launcher.os, 'environ', environment), \
                mock.patch.object(launcher, 'launcher_command', return_value=0) as command:
            self.assertEqual(launcher.main(), 0)
            environment.get.assert_called_once_with('SOPHIA_REPLY_RUNTIME_DIR')
            command.assert_called_once_with(self.argv, None, self.runtime)
