#!/usr/bin/env python3
"""CON-01 Q7 revision 6, L0: the admission lock, the life lock, and the gate's unused ends.

Synthetic mechanics only. The probe (P) stands in for the supervisor's seal and for `check`.
Each launcher stand-in (L) is P's own fork; each child stand-in (C) is L's fork. P is a child
subreaper, so a C orphaned by L's death comes back to P and is reaped here. Every process this
probe waits on or reads is one it started. No signal is sent by number; no pid reuse is
attempted; no dsh, network, credential or provider. Scratch is removed at the end.
"""
import ctypes, json, os, select, shutil, signal, socket, sys, tempfile, time, fcntl

libc = ctypes.CDLL(None, use_errno=True)
PR_SET_PDEATHSIG, PR_SET_CHILD_SUBREAPER = 1, 36


def prctl(opt, arg):
    if libc.prctl(opt, ctypes.c_ulong(arg), 0, 0, 0) != 0:
        e = ctypes.get_errno()
        raise OSError(e, os.strerror(e))


def starttime(pid):
    with open(f'/proc/{pid}/stat') as f:
        s = f.read()
    return int(s[s.rindex(')') + 2:].split()[19])  # field 22


CHILD_IMAGE = r'''
import os, socket, sys, time
fds = sorted(int(x) for x in os.listdir('/proc/self/fd'))
s = socket.socket(fileno=3)
s.sendall(("image fds " + ",".join(map(str, fds)) + "\n").encode())
time.sleep(float(sys.argv[1]))
'''


# ---------------------------------------------------------------- the launcher stand-in (in L)
def launcher(root, attempt, hooks, sync_w, resume_r, fd3_child):
    def pause(tag):
        if tag in hooks.get('pause', ()):
            os.write(sync_w, (tag + '\n').encode())
            if os.read(resume_r, 1) == b'':
                os._exit(97)

    def crash(tag):
        if hooks.get('crash') == tag:
            os._exit(99)  # a crash stand-in: the kernel closes every descriptor

    pause('before_admit_open')
    try:
        afd = os.open(os.path.join(root, '.admit'), os.O_RDONLY | os.O_NOFOLLOW | os.O_CLOEXEC)
    except FileNotFoundError:
        os._exit(78)
    pause('before_shared_lock')
    fcntl.flock(afd, fcntl.LOCK_SH)
    try:
        st = os.stat(os.path.join(root, '.admit'), follow_symlinks=False)
    except FileNotFoundError:
        os._exit(78)
    fs = os.fstat(afd)
    if (st.st_dev, st.st_ino) != (fs.st_dev, fs.st_ino):
        os._exit(78)
    pause('before_mkdir')
    home = os.path.join(root, attempt)
    try:
        os.mkdir(home, 0o700)
    except FileNotFoundError:
        os._exit(78)
    pause('before_lease_create')
    try:
        lfd = os.open(os.path.join(home, 'lease.json'),
                      os.O_RDWR | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW | os.O_CLOEXEC, 0o600)
    except FileNotFoundError:
        os._exit(78)
    fcntl.flock(lfd, fcntl.LOCK_EX)  # the life lock: held for this launcher's whole life
    pause('after_lease_open')
    rec = json.dumps({'k': 'launcher', 'pid': os.getpid(), 'start': starttime(os.getpid())}) + '\n'
    if hooks.get('torn') == 'launcher':
        os.write(lfd, rec[:9].encode())
        pause('after_partial')
        crash('after_partial')
    os.write(lfd, rec.encode())
    os.write(lfd, b'{"k":"fork_intent"}\n')
    os.fsync(lfd)
    try:
        dfd = os.open(home, os.O_RDONLY | os.O_DIRECTORY | os.O_CLOEXEC)  # by name
    except FileNotFoundError:
        os._exit(78)
    os.fsync(dfd)
    os.close(dfd)
    os.close(afd)  # admission ends: the lease is whole and durable; no fork has happened
    try:
        dg = os.open(os.path.join(home, 'diag'), os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    except FileNotFoundError:
        os._exit(78)

    gate_r, gate_w = os.pipe()
    st_r, st_w = os.pipe2(os.O_CLOEXEC)
    lpid = os.getpid()
    cpid = os.fork()
    if cpid == 0:  # ------------------------------------------ the child stand-in (in C)
        signal.alarm(hooks.get('child_alarm', 3))
        if not hooks.get('keep_gate_w'):
            os.close(gate_w)          # its inherited copy of the gate's write end
        os.close(st_r)                # its inherited copy of the status pipe's read end
        os.close(sync_w)
        os.close(resume_r)
        if not hooks.get('no_pdeathsig'):
            prctl(PR_SET_PDEATHSIG, signal.SIGKILL)
        if os.getppid() != lpid:
            os._exit(119)
        if hooks.get('hold_child'):   # deliberately held alive before the gate
            signal.alarm(0)
            time.sleep(hooks['hold_child'])
            os._exit(117)
        if os.read(gate_r, 1) == b'':
            os._exit(118)
        os.close(gate_r)
        hi3 = fcntl.fcntl(fd3_child, fcntl.F_DUPFD_CLOEXEC, 20)  # avoid number collisions
        hi1 = fcntl.fcntl(dg, fcntl.F_DUPFD_CLOEXEC, 20)
        os.dup2(hi3, 3)
        os.dup2(hi1, 1)
        os.set_inheritable(3, True)
        os.set_inheritable(1, True)
        os.close(hi3)
        os.close(hi1)
        signal.alarm(0)
        os.execv(sys.executable, [sys.executable, '-I', '-c', CHILD_IMAGE, str(hooks.get('image_sleep', 0.3))])
    # ------------------------------------------------------------ back in L
    os.close(gate_r)
    os.close(st_w)
    os.close(dg)
    time.sleep(hooks.get('crash_delay', 0))  # test hook: let the child reach its gate first
    crash('before_child_entry')
    crec = json.dumps({'k': 'child', 'pid': cpid, 'start': starttime(cpid)}) + '\n'
    if hooks.get('torn') == 'child':
        os.write(lfd, crec[:11].encode())
        os._exit(99)
    os.write(lfd, crec.encode())
    os.fsync(lfd)
    pfd = os.pidfd_open(cpid)
    os.close(fd3_child)
    os.write(gate_w, b'g')
    os.close(gate_w)
    os.read(st_r, 1)  # end-of-file: the exec happened
    crash('after_exec')
    res = os.waitid(os.P_PIDFD, pfd, os.WEXITED)
    os._exit(0 if res.si_status == 0 else 75)


# ---------------------------------------------------------------- the check stand-in (in P)
def try_lock(path, mode):
    try:
        fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_CLOEXEC)
    except FileNotFoundError:
        return 'ENOENT', None
    try:
        fcntl.flock(fd, mode | fcntl.LOCK_NB)
        return 'acquired', fd
    except BlockingIOError:
        os.close(fd)
        return 'held', None


def read_lease(path):
    with open(path, 'rb') as f:
        raw = f.read()
    if raw == b'':
        return 'zero', None
    lines = raw.split(b'\n')
    whole, tail = lines[:-1], lines[-1]
    recs = []
    for ln in whole:
        try:
            recs.append(json.loads(ln))
        except ValueError:
            return 'torn', None
    if len(recs) < 2 or recs[0].get('k') != 'launcher' or recs[1].get('k') != 'fork_intent':
        return 'torn', None
    child = 'torn' if tail else 'none'
    if len(recs) >= 3 and recs[2].get('k') == 'child':
        child = recs[2]
    return 'whole', child


def entry_gone(rec):
    try:
        pfd = os.pidfd_open(rec['pid'])
    except ProcessLookupError:
        return True
    try:
        try:
            return starttime(rec['pid']) != rec['start']
        except FileNotFoundError:
            return True
    finally:
        os.close(pfd)


def check(root, attempt, renamed, delete=False):
    """Revision 6's verdict for one home, without deleting unless asked and proven."""
    out = {}
    afd = lfd = None
    try:
        if renamed:
            state, afd = try_lock(os.path.join(root, '.admit'), fcntl.LOCK_EX)
            out['admission'] = 'drained' if state == 'acquired' else 'open'
            if state != 'acquired':
                out['verdict'] = 'unsettled:admission_open'
                return out
        home = os.path.join(root, attempt)
        if not os.path.lexists(home):
            out['verdict'] = 'absent'
            return out
        names = sorted(os.listdir(home))
        if not names:
            out['verdict'] = 'empty'
        elif 'lease.json' not in names:
            out['verdict'] = 'unresolved:no_lease'
        else:
            lease, child = read_lease(os.path.join(home, 'lease.json'))
            out['lease'] = lease
            if lease != 'whole':
                out['verdict'] = 'unresolved:' + lease + '_lease'
            else:
                state, lfd = try_lock(os.path.join(home, 'lease.json'), fcntl.LOCK_EX)
                out['life_lock'] = 'free' if state == 'acquired' else 'held'
                out['child_entry'] = child if isinstance(child, str) else 'valid'
                if state != 'acquired':
                    out['verdict'] = 'unsettled:life_lock_held'
                elif isinstance(child, dict) and not entry_gone(child):
                    out['verdict'] = 'unsettled:child_live'
                else:
                    out['verdict'] = 'gone'
        if delete and out['verdict'] in ('gone', 'empty'):
            shutil.rmtree(home)
            out['deleted_verified'] = not os.path.lexists(home)
        return out
    finally:
        for fd in (afd, lfd):
            if fd is not None:
                os.close(fd)


# ---------------------------------------------------------------- the cases
def fresh(base, name):
    rep = os.path.join(base, name, 'replies')
    os.makedirs(rep, 0o700)
    root = os.path.join(rep, 'gen-1')
    os.mkdir(root, 0o700)
    os.close(os.open(os.path.join(root, '.admit'), os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600))
    return rep, root


def seal(rep):
    os.rename(os.path.join(rep, 'gen-1'), os.path.join(rep, 'sealed-1'))
    d = os.open(rep, os.O_RDONLY | os.O_DIRECTORY)
    os.fsync(d)
    os.close(d)
    return os.path.join(rep, 'sealed-1')


class Run:
    def __init__(self, root, hooks):
        self.sync_r, sync_w = os.pipe()
        resume_r, self.resume_w = os.pipe()
        self.fd3_parent, fd3_child = socket.socketpair(socket.AF_UNIX, socket.SOCK_STREAM)
        self.t0 = time.monotonic()
        self.pid = os.fork()
        if self.pid == 0:
            try:
                os.close(self.sync_r)
                os.close(self.resume_w)
                self.fd3_parent.close()
                launcher(root, 'att', hooks, sync_w, resume_r, fd3_child.detach())
            finally:
                os._exit(98)
        os.close(sync_w)
        os.close(resume_r)
        fd3_child.close()
        self.pfd = os.pidfd_open(self.pid)

    def wait_tag(self, timeout=5):
        r, _, _ = select.select([self.sync_r], [], [], timeout)
        return os.read(self.sync_r, 64).decode().strip() if r else 'timeout'

    def resume(self):
        os.write(self.resume_w, b'r')

    def reap(self, timeout=10):
        select.select([self.pfd], [], [], timeout)
        res = os.waitid(os.P_PIDFD, self.pfd, os.WEXITED | os.WNOHANG)
        if res is None:
            return 'not_exited'
        return res.si_status if res.si_code == os.CLD_EXITED else 'signal:%d' % res.si_status

    def fd3_eof(self, timeout):
        self.fd3_parent.setblocking(False)
        deadline = time.monotonic() + timeout
        data = b''
        while time.monotonic() < deadline:
            r, _, _ = select.select([self.fd3_parent], [], [], max(0, deadline - time.monotonic()))
            if not r:
                break
            chunk = self.fd3_parent.recv(4096)
            if chunk == b'':
                return True, data.decode()
            data += chunk
        return False, data.decode()

    def close(self):
        for fd in (self.sync_r, self.resume_w, self.pfd):
            os.close(fd)
        self.fd3_parent.close()


def reap_orphan(timeout):
    """Reap a child stand-in reparented to this subreaper; return its status and the elapsed time."""
    t = time.monotonic()
    while time.monotonic() - t < timeout:
        try:
            pid, status = os.waitpid(-1, os.WNOHANG)
        except ChildProcessError:
            return 'none', 0
        if pid:
            st = os.waitstatus_to_exitcode(status)
            return (st if st >= 0 else 'signal:%d' % -st), round((time.monotonic() - t) * 1000)
        time.sleep(0.005)
    return 'not_exited', round((time.monotonic() - t) * 1000)


def main():
    prctl(PR_SET_CHILD_SUBREAPER, 1)
    signal.alarm(120)
    base = tempfile.mkdtemp(prefix='q7-r6-', dir=os.path.dirname(os.path.abspath(__file__)))
    out = {'evidence': 'L0 owned mechanics only; not the launcher, dsh, Landlock, seccomp or a host',
           'python': sys.version.split()[0], 'kernel': os.uname().release, 'cases': {}}
    C = out['cases']
    try:
        # A1: lease opened (O_EXCL, zero bytes, life lock held); seal; check; resume.
        rep, root = fresh(base, 'a1')
        r = Run(root, {'pause': ['after_lease_open']})
        tag = r.wait_tag()
        sealed = seal(rep)
        try:
            os.open(os.path.join(root, 'att', 'x'), os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
            by_name = 'opened'
        except FileNotFoundError:
            by_name = 'ENOENT'
        during = check(sealed, 'att', renamed=True)
        r.resume()
        status = r.reap()
        after = check(sealed, 'att', renamed=True, delete=True)
        C['A1_lease_open_then_seal'] = {'paused': tag, 'fresh_by_name_open': by_name,
                                         'check_during': during, 'launcher_exit': status,
                                         'check_after': after}
        r.close()

        # A2: a torn launcher record, sealed while paused, then the launcher crashes.
        rep, root = fresh(base, 'a2')
        r = Run(root, {'pause': ['after_partial'], 'torn': 'launcher', 'crash': 'after_partial'})
        tag = r.wait_tag()
        sealed = seal(rep)
        during = check(sealed, 'att', renamed=True)
        r.resume()
        status = r.reap()
        after = check(sealed, 'att', renamed=True, delete=True)
        C['A2_torn_launcher_record'] = {'paused': tag, 'check_during': during, 'launcher_exit': status,
                                        'check_after': after,
                                        'home_kept': os.path.lexists(os.path.join(sealed, 'att'))}
        r.close()

        # A3: .admit open, shared lock not yet taken; seal; check (drained, absent); resume.
        rep, root = fresh(base, 'a3')
        r = Run(root, {'pause': ['before_shared_lock']})
        tag = r.wait_tag()
        sealed = seal(rep)
        during = check(sealed, 'att', renamed=True)
        r.resume()
        status = r.reap()
        after = check(sealed, 'att', renamed=True)
        C['A3_admit_open_before_shared_lock'] = {'paused': tag, 'check_during': during,
                                                 'launcher_exit': status, 'check_after': after}
        r.close()

        # A4: launcher started after the seal.
        rep, root = fresh(base, 'a4')
        r = Run(root, {'pause': ['before_admit_open']})
        tag = r.wait_tag()
        sealed = seal(rep)
        r.resume()
        status = r.reap()
        C['A4_started_after_seal'] = {'paused': tag, 'launcher_exit': status,
                                      'check_after': check(sealed, 'att', renamed=True)}
        r.close()

        # A5: verified under the shared lock, paused before mkdir; seal; check; resume.
        rep, root = fresh(base, 'a5')
        r = Run(root, {'pause': ['before_mkdir']})
        tag = r.wait_tag()
        sealed = seal(rep)
        during = check(sealed, 'att', renamed=True)
        r.resume()
        status = r.reap()
        after = check(sealed, 'att', renamed=True)
        C['A5_admitted_before_mkdir'] = {'paused': tag, 'check_during': during,
                                         'launcher_exit': status, 'check_after': after}
        r.close()

        # B1: launcher crashes after the fork, before the child's entry; gate ends closed; no PDEATHSIG.
        for name, hooks in (
            ('B1_crash_before_child_entry_closed_ends', {'crash': 'before_child_entry', 'no_pdeathsig': True, 'crash_delay': 0.2}),
            ('B2_torn_child_entry', {'torn': 'child', 'no_pdeathsig': True, 'crash_delay': 0.2}),
            ('B4_control_child_keeps_gate_write_end', {'crash': 'before_child_entry', 'no_pdeathsig': True,
                                                       'keep_gate_w': True, 'child_alarm': 2, 'crash_delay': 0.2}),
            ('B1p_crash_before_child_entry_with_pdeathsig', {'crash': 'before_child_entry', 'crash_delay': 0.2}),
        ):
            rep, root = fresh(base, name.lower())
            r = Run(root, hooks)
            status = r.reap()
            child_status, child_ms = reap_orphan(5)
            eof, _ = r.fd3_eof(0.5)
            C[name] = {'launcher_exit': status, 'child_exit': child_status, 'child_ended_ms': child_ms,
                       'fd3_eof_after_child': eof,
                       'check_after': check(root, 'att', renamed=False, delete=True)}
            r.close()

        # B3: launcher crashes before the child's entry; the child is deliberately held alive 1.5 s.
        rep, root = fresh(base, 'b3')
        r = Run(root, {'crash': 'before_child_entry', 'no_pdeathsig': True, 'hold_child': 1.5, 'crash_delay': 0.2})
        status = r.reap()
        while_held = check(root, 'att', renamed=False, delete=True)
        eof_held, _ = r.fd3_eof(0.3)
        child_status, child_ms = reap_orphan(5)
        eof_after, _ = r.fd3_eof(0.5)
        after = check(root, 'att', renamed=False, delete=True)
        C['B3_child_held_alive'] = {'launcher_exit': status, 'check_while_held': while_held,
                                    'home_kept_while_held': 'deleted_verified' not in while_held,
                                    'fd3_eof_while_held': eof_held, 'child_exit': child_status,
                                    'fd3_eof_after_child': eof_after, 'check_after': after}
        r.close()

        # B5: a normal run; the exec'd image lists its descriptors.
        rep, root = fresh(base, 'b5')
        r = Run(root, {'image_sleep': 0.4})
        time.sleep(0.15)
        during = check(root, 'att', renamed=False)
        status = r.reap()
        eof, data = r.fd3_eof(1)
        C['B5_normal'] = {'check_during_run': during, 'launcher_exit': status, 'image': data.strip(),
                          'fd3_eof': eof, 'check_after': check(root, 'att', renamed=False, delete=True)}
        r.close()

        # B6p: the child exec'd, then the launcher crashes; PDEATHSIG (it survives execve) ends the image.
        rep, root = fresh(base, 'b6p')
        r = Run(root, {'crash': 'after_exec', 'image_sleep': 1.0})
        status = r.reap()
        during = check(root, 'att', renamed=False, delete=True)
        child_status, _ = reap_orphan(5)
        C['B6p_exec_then_launcher_crash_with_pdeathsig'] = {
            'launcher_exit': status, 'check_before_reap': during, 'child_exit': child_status,
            'check_after_reap': check(root, 'att', renamed=False, delete=True)}
        r.close()

        # B6: the same without PDEATHSIG: the exec'd image outlives its launcher.
        rep, root = fresh(base, 'b6')
        r = Run(root, {'crash': 'after_exec', 'image_sleep': 1.0, 'no_pdeathsig': True})
        status = r.reap()
        during = check(root, 'att', renamed=False, delete=True)
        eof, data = r.fd3_eof(3)
        child_status, _ = reap_orphan(5)
        C['B6_exec_then_launcher_crash'] = {'launcher_exit': status, 'check_while_image_runs': during,
                                            'image': data.strip(), 'child_exit': child_status,
                                            'check_after': check(root, 'att', renamed=False, delete=True)}
        r.close()
    finally:
        leftover = 0
        while True:
            try:
                pid, _ = os.waitpid(-1, os.WNOHANG)
            except ChildProcessError:
                break
            if pid == 0:
                time.sleep(0.05)
                leftover += 1
                if leftover > 100:
                    break
            else:
                leftover = 0
        shutil.rmtree(base)
        out['cleanup'] = {'scratch_removed': not os.path.exists(base),
                          'children_remaining': 'none' if leftover == 0 else 'some'}
    print(json.dumps(out, indent=1))


if __name__ == '__main__':
    main()
