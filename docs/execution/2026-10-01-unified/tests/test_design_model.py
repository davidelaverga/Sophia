"""In-memory contract rehearsals only; no production or provider acceptance."""
import sys
from pathlib import Path
import unittest
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from design.personal_flow_model import PersonalFlow, Refused

class FlowTests(unittest.TestCase):
    def setUp(self):
        self.m = PersonalFlow(); self.m.add_job('alice', 'job'); self.m.add_member('project', 'alice')
        self.m.add_member('project', 'bob'); self.m.claim('alice', 'job', 1, 'claim')
    def pkg(self):
        return self.m.submit('alice', 'job', 1, 'submit', 'Keep this finding', 'Excluded client note')
    def preview(self):
        p = self.pkg(); return self.m.preview('alice', p['package'], 'project', 'Keep this finding')
    def pub(self):
        p = self.preview(); return self.m.publish('alice','human',p['preview'],p['sha256'],'publish')['share']
    def test_owner_only(self):
        with self.assertRaisesRegex(Refused, 'unavailable'): self.m.read_job('bob','job')
    def test_admin_not_owner(self):
        with self.assertRaisesRegex(Refused, 'unavailable'): self.m.read_job('project-admin','job')
    def test_claim_duplicate_idempotent(self):
        self.assertEqual(self.m.claim('alice','job',1,'claim')['claim'], 'claim')
    def test_second_claim_refused(self):
        with self.assertRaises(Refused): self.m.claim('alice','job',1,'other')
    def test_uncertain_provider_not_restarted(self):
        self.m.uncertain_claim('alice','job')
        with self.assertRaises(Refused): self.m.claim('alice','job',1,'other')
    def test_activation_not_completion(self):
        self.m.notify('alice','job'); self.m.notify_result('alice','job','accepted')
        self.assertEqual(self.m.jobs['job']['status'],'active'); self.assertFalse(self.m.packages)
    def test_unknown_activation_no_blind_retry(self):
        self.m.notify('alice','job'); self.m.notify_result('alice','job','unknown')
        with self.assertRaises(Refused): self.m.notify('alice','job')
    def test_question_and_reply_private(self):
        self.m.send_message('alice','job',1,'m1','question','Which source?')
        self.m.end_turn('alice','job',1,'claim',True)
        self.m.send_message('alice','job',1,'m2','answer','Both dated versions',1)
        self.assertTrue(self.m.jobs['job']['wake_pending']); self.assertEqual(self.m.project_events,[])
    def test_ack_does_not_wake(self):
        self.m.end_turn('alice','job',1,'claim',True)
        self.m.send_message('alice','job',1,'ack','ack','Received')
        self.assertFalse(self.m.jobs['job']['wake_pending'])
    def test_reply_to_missing_message(self):
        with self.assertRaises(Refused):self.m.send_message('alice','job',1,'a','answer','Yes',99)
    def test_message_key_conflict(self):
        self.m.send_message('alice','job',1,'a','finding','one')
        with self.assertRaisesRegex(Refused,'key_conflict'):self.m.send_message('alice','job',1,'a','finding','two')
    def test_exchange_budget(self):
        for i in range(6):self.m.send_message('alice','job',1,str(i),'finding','evidence')
        with self.assertRaisesRegex(Refused,'checkpoint'):self.m.send_message('alice','job',1,'extra','finding','more')
    def test_package_private_and_idempotent(self):
        a=self.pkg();b=self.pkg();self.assertEqual(a,b);self.assertFalse(self.m.project_events)
        self.assertEqual(len(self.m.packages[a['package']]['versions']),1)
    def test_bot_cannot_publish(self):
        p=self.preview()
        with self.assertRaisesRegex(Refused,'human_only'):self.m.publish('alice','connector',p['preview'],p['sha256'],'p')
    def test_stale_package_version(self):
        p=self.preview();self.m.submit('alice','job',1,'s2','Changed text')
        with self.assertRaisesRegex(Refused,'stale_preview'):self.m.publish('alice','human',p['preview'],p['sha256'],'p')
    def test_changed_hash(self):
        p=self.preview()
        with self.assertRaisesRegex(Refused,'stale_preview'):self.m.publish('alice','human',p['preview'],'f'*64,'p')
    def test_member_removed_at_commit(self):
        p=self.preview();self.m.remove_member('project','alice')
        with self.assertRaisesRegex(Refused,'membership_changed'):self.m.publish('alice','human',p['preview'],p['sha256'],'p')
    def test_copy_pending_not_visible(self):
        s=self.pub()
        with self.assertRaises(Refused):self.m.team_read('bob',s)
        self.assertFalse(self.m.project_events)
    def test_copy_failure_not_visible(self):
        s=self.pub();self.m.settle_copy(s,False)
        with self.assertRaises(Refused):self.m.team_read('bob',s)
        self.assertFalse(self.m.project_events)
    def test_shared_snapshot_omits_private_metadata(self):
        s=self.pub();self.m.settle_copy(s,True)
        self.assertEqual(self.m.team_read('bob',s),{'report':'Keep this finding'})
    def test_new_private_edit_does_not_update_share(self):
        s=self.pub();self.m.settle_copy(s,True);self.m.submit('alice','job',1,'s2','New private version')
        self.assertEqual(self.m.team_read('bob',s)['report'],'Keep this finding')
    def test_late_write_after_withdraw(self):
        self.m.withdraw_job('alice','job')
        with self.assertRaises(Refused):self.m.submit('alice','job',1,'late','old context')
    def test_private_erase_keeps_shared_snapshot(self):
        s=self.pub();self.m.settle_copy(s,True);self.m.erase_personal('alice')
        self.assertEqual(self.m.team_read('bob',s),{'report':'Keep this finding'})
        self.assertFalse(self.m.jobs);self.assertFalse(self.m.packages)
    def test_erasure_tombstone_no_recreate(self):
        self.pkg();self.m.erase_personal('alice')
        with self.assertRaisesRegex(Refused,'request_erased'):self.pkg()
    def test_shared_withdrawal(self):
        s=self.pub();self.m.settle_copy(s,True);self.m.withdraw_share('alice',s)
        with self.assertRaises(Refused):self.m.team_read('bob',s)
    def test_wrong_owner_cannot_preview(self):
        p=self.pkg()
        with self.assertRaises(Refused):self.m.preview('bob',p['package'],'project','secret')

if __name__ == '__main__':unittest.main(verbosity=2)
