import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
// Evidence copy normalizes the private checkout path; set CON01_CANDIDATE_ROOT to exact e4c8.
const { changeKept, keptAt, forgetKept, withFence, withUnfound, withFound, unfoundRead } = await import(pathToFileURL(resolve(process.env.CON01_CANDIDATE_ROOT, 'apps/studio/src/features/conversations/talk-store.ts')));

forgetKept();
changeKept('private-synthetic-project private-actor', k => withUnfound(withFence(k, 20), 'c1', 20));
const observed = keptAt('private-synthetic-project private-actor');
// The current callback ignores the old probe's from=10 and calls withFound(k,id).
const afterOldSuccess = withFound(observed, 'c1');
const afterFreshCappedList = unfoundRead(afterOldSuccess, 30, ['c2'], false);
assert.ok(unfoundRead(observed, 30, ['c2'], false).recheck.includes('c1'), 'control: without the stale success a fresh capped list rechecks c1');
assert.deepEqual(unfoundRead(withFound(observed, 'c1'), 30, ['c2'], false).recheck, [], 'control: an actually newer success can resolve the unfound state');
console.log(JSON.stringify({candidate:'e4c8cf8d',level:'L0 production helper replay only; not mounted/browser/provider proof',olderProbeFrom:10,newerNotFoundAt:20,unfoundAfterOldSuccess:afterOldSuccess.unfound,rechecksAfterFreshCappedList:afterFreshCappedList.recheck}));
assert.ok(afterFreshCappedList.recheck.includes('c1'), 'A success from before a newer not_found must not eliminate the required recheck');
