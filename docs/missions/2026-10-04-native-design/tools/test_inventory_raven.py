"""Synthetic tests for the pack helper; not tests of Raven or Sophia."""
import copy
import importlib.util
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

SPEC = importlib.util.spec_from_file_location('inventory_raven', Path(__file__).with_name('inventory_raven.py'))
mod = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(mod)

class InventoryTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.repo = Path(self.temp.name)
        self.call('init', '-q')
        self.roots = []
        for i in range(4):
            p = self.repo/f'skills/s{i}'
            p.mkdir(parents=True)
            (p/'SKILL.md').write_text(f'# Synthetic fixture {i}\n', encoding='utf-8')
            self.roots.append({'id': f'RV-{i+1:02}', 'path': f'skills/s{i}'})
        (self.repo/'LICENSE').write_text('Synthetic notice; no donor license claim.\n', encoding='utf-8')
        self.call('add', '.')
        self.call('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'fixture')
        self.commit = self.call('rev-parse', 'HEAD').strip()
        for r in self.roots:
            r['entry_git_blob'] = self.call('rev-parse', f'{self.commit}:{r["path"]}/SKILL.md').strip()
        self.manifest = {'repository': 'synthetic-fixture', 'commit': self.commit, 'roots': self.roots}
    def tearDown(self):
        self.temp.cleanup()
    def call(self, *args):
        return subprocess.check_output(['git','-C',str(self.repo),*args], stderr=subprocess.DEVNULL, text=True)
    def test_four_roots_and_hashes(self):
        out = mod.inventory(self.repo, self.manifest)
        self.assertEqual(len(out['roots']), 4)
        self.assertEqual(len(out['files']), 4)
        self.assertTrue(all(len(x['sha256']) == 64 and x['active'] is False for x in out['files']))
        self.assertEqual(out['notice_files'][0]['path'], 'LICENSE')
    def test_bad_expected_blob_rejected(self):
        m=copy.deepcopy(self.manifest); m['roots'][0]['entry_git_blob']='0'*40
        with self.assertRaises(mod.InventoryError): mod.inventory(self.repo,m)
    def test_missing_commit_rejected(self):
        m=copy.deepcopy(self.manifest); m['commit']='0'*40
        with self.assertRaises(mod.InventoryError): mod.inventory(self.repo,m)
    def test_unsafe_path_rejected(self):
        m=copy.deepcopy(self.manifest); m['roots'][0]['path']='../private'
        with self.assertRaises(mod.InventoryError): mod.inventory(self.repo,m)
    def test_uses_git_pin_not_changed_worktree(self):
        before=mod.inventory(self.repo,self.manifest)
        (self.repo/'skills/s0/SKILL.md').write_text('changed working tree',encoding='utf-8')
        after=mod.inventory(self.repo,self.manifest)
        self.assertEqual(before,after)
    def test_exact_four_roots_required(self):
        m=copy.deepcopy(self.manifest); m['roots']=m['roots'][:3]
        with self.assertRaises(mod.InventoryError): mod.inventory(self.repo,m)

if __name__ == '__main__': unittest.main()
