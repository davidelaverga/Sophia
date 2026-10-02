"""Executable, in-memory specification rehearsal; NOT a production authorization service.

No networking, provider access, credentials, disk persistence, or real concurrency.
Tests demonstrate intended invariants only. Implement them again at actual SQL/API,
object storage, OAuth, runtime and UI boundaries with real integration evidence.
"""
from __future__ import annotations
from dataclasses import dataclass, field
from copy import deepcopy
from hashlib import sha256
import json

class Refused(ValueError):
    """A modeled operation violates the proposed contract."""

def digest(value: object) -> str:
    return sha256(json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()).hexdigest()

@dataclass
class PersonalFlow:
    jobs: dict = field(default_factory=dict)
    packages: dict = field(default_factory=dict)
    previews: dict = field(default_factory=dict)
    shares: dict = field(default_factory=dict)
    members: dict = field(default_factory=dict)
    receipts: dict = field(default_factory=dict)
    erased_keys: set = field(default_factory=set)
    project_events: list = field(default_factory=list)
    private_events: list = field(default_factory=list)

    def add_job(self, owner: str, job_id: str) -> None:
        if job_id in self.jobs:
            raise Refused("duplicate_job")
        self.jobs[job_id] = {"owner": owner, "generation": 1, "revision": 1,
            "status": "ready", "claim": None, "messages": [], "dispatch": "not_sent",
            "wake_pending": False, "exchanges": 0, "max_exchanges": 6}

    def _job(self, owner: str, job_id: str, generation: int | None = None) -> dict:
        job = self.jobs.get(job_id)
        # Identical error for not found and wrong owner: no modeled enumeration leak.
        if not job or job["owner"] != owner:
            raise Refused("unavailable")
        if generation is not None and job["generation"] != generation:
            raise Refused("stale_generation")
        if job["status"] == "withdrawn":
            raise Refused("withdrawn")
        return job

    def _prior(self, owner: str, key: str, payload: object):
        k = (owner, key)
        if k in self.erased_keys:
            raise Refused("request_erased")
        if k not in self.receipts:
            return None
        record = self.receipts[k]
        if record["digest"] != digest(payload):
            raise Refused("key_conflict")
        return deepcopy(record["result"])

    def _record(self, owner: str, key: str, payload: object, result: dict) -> dict:
        self.receipts[(owner, key)] = {"digest": digest(payload), "result": deepcopy(result)}
        return deepcopy(result)

    def read_job(self, owner: str, job_id: str) -> dict:
        return deepcopy(self._job(owner, job_id))

    def claim(self, owner: str, job_id: str, generation: int, key: str) -> dict:
        payload = ["claim", job_id, generation]
        old = self._prior(owner, key, payload)
        if old is not None:
            return old
        job = self._job(owner, job_id, generation)
        if job["claim"] is not None:
            raise Refused("claim_active_or_uncertain")
        if job["status"] not in ("ready", "waiting_for_owner", "waiting_for_peer", "waiting_for_device"):
            raise Refused("not_claimable")
        job.update(claim=key, status="active", wake_pending=False)
        return self._record(owner, key, payload, {"claim": key, "generation": generation})

    def end_turn(self, owner: str, job_id: str, generation: int, claim: str, waiting: bool) -> None:
        job = self._job(owner, job_id, generation)
        if job["claim"] != claim:
            raise Refused("wrong_claim")
        job["claim"] = None
        job["status"] = "waiting_for_owner" if waiting else "candidate_ready"

    def uncertain_claim(self, owner: str, job_id: str) -> None:
        # Deliberately retain the claim: observer timeout does not prove provider termination.
        job = self._job(owner, job_id)
        job["status"] = "abandoned_unknown"

    def send_message(self, owner: str, job_id: str, generation: int, key: str,
                     kind: str, body: str, reply_to: int | None = None) -> dict:
        payload = ["message", job_id, generation, kind, body, reply_to]
        old = self._prior(owner, key, payload)
        if old is not None:
            return old
        job = self._job(owner, job_id, generation)
        if kind not in {"question", "answer", "guidance", "finding", "blocker", "checkpoint", "handoff", "ack"}:
            raise Refused("unknown_kind")
        if not body or len(body.encode()) > 16384:
            raise Refused("message_size")
        if reply_to is not None and not any(m["sequence"] == reply_to for m in job["messages"]):
            raise Refused("missing_reply")
        if kind != "ack" and job["exchanges"] >= job["max_exchanges"]:
            raise Refused("checkpoint_required")
        seq = len(job["messages"]) + 1
        message = {"sequence": seq, "kind": kind, "body": body, "reply_to": reply_to,
                   "audience": "personal", "delivery": "stored"}
        job["messages"].append(message)
        job["exchanges"] += kind != "ack"
        if kind in {"answer", "guidance"} and job["status"].startswith("waiting"):
            job["wake_pending"] = True
        self.private_events.append({"owner": owner, "job": job_id, "message": seq})
        return self._record(owner, key, payload, {"sequence": seq, "delivery": "stored"})

    def notify(self, owner: str, job_id: str) -> None:
        job = self._job(owner, job_id)
        if job["dispatch"] in {"intent_recorded", "accepted", "unknown"}:
            raise Refused("reconcile_before_redispatch")
        job["dispatch"] = "intent_recorded"

    def notify_result(self, owner: str, job_id: str, result: str) -> None:
        job = self._job(owner, job_id)
        if result not in {"accepted", "rejected", "unknown"}:
            raise Refused("invalid_dispatch_result")
        job["dispatch"] = result
        # Not a job completion or result receipt.

    def submit(self, owner: str, job_id: str, generation: int, key: str,
               report: str, private_meta: str = "") -> dict:
        payload = ["package", job_id, generation, report, private_meta]
        old = self._prior(owner, key, payload)
        if old is not None:
            return old
        job = self._job(owner, job_id, generation)
        if job["claim"] is None or job["status"] != "active":
            raise Refused("unclaimed")
        pid = "package-" + digest([owner, job_id])[:12]
        versions = self.packages.setdefault(pid, {"owner": owner, "versions": [], "current": 0})
        n = versions["current"] + 1
        content = {"report": report, "private_meta": private_meta}
        versions["versions"].append({"version": n, "content": content, "sha256": digest(content)})
        versions["current"] = n
        self.private_events.append({"owner": owner, "package": pid, "version": n})
        return self._record(owner, key, payload, {"package": pid, "version": n, "audience": "personal"})

    def add_member(self, project: str, owner: str) -> None:
        self.members.setdefault(project, {"revision": 0, "owners": set()})
        self.members[project]["owners"].add(owner)
        self.members[project]["revision"] += 1

    def remove_member(self, project: str, owner: str) -> None:
        self.members[project]["owners"].discard(owner)
        self.members[project]["revision"] += 1

    def preview(self, owner: str, package: str, project: str, selected_text: str) -> dict:
        record = self.packages.get(package)
        if not record or record["owner"] != owner:
            raise Refused("unavailable")
        membership = self.members.get(project)
        if not membership or owner not in membership["owners"]:
            raise Refused("not_member")
        snapshot = {"report": selected_text}  # Private metadata never copied implicitly.
        pid = "preview-" + str(len(self.previews) + 1)
        self.previews[pid] = {"owner": owner, "package": package,
            "version": record["current"], "project": project,
            "membership_revision": membership["revision"], "snapshot": snapshot,
            "sha256": digest(snapshot)}
        return {"preview": pid, "sha256": digest(snapshot)}

    def publish(self, owner: str, principal_kind: str, preview: str, confirmed_hash: str, key: str) -> dict:
        if principal_kind != "human":
            raise Refused("human_only")
        payload = ["publish", preview, confirmed_hash]
        old = self._prior(owner, key, payload)
        if old is not None:
            return old
        p = self.previews.get(preview)
        if not p or p["owner"] != owner:
            raise Refused("unavailable")
        pack = self.packages[p["package"]]
        mem = self.members[p["project"]]
        if owner not in mem["owners"] or mem["revision"] != p["membership_revision"]:
            raise Refused("membership_changed")
        if pack["current"] != p["version"] or confirmed_hash != p["sha256"]:
            raise Refused("stale_preview")
        sid = "share-" + str(len(self.shares) + 1)
        self.shares[sid] = {"owner": owner, "project": p["project"],
            "snapshot": deepcopy(p["snapshot"]), "state": "pending_copy"}
        return self._record(owner, key, payload, {"share": sid, "state": "pending_copy"})

    def settle_copy(self, share: str, success: bool) -> None:
        s = self.shares[share]
        if s["state"] != "pending_copy":
            return
        s["state"] = "published" if success else "copy_failed"
        if success:
            self.project_events.append({"project": s["project"], "share": share})

    def team_read(self, reader: str, share: str) -> dict:
        s = self.shares.get(share)
        if not s or s["state"] != "published" or reader not in self.members[s["project"]]["owners"]:
            raise Refused("unavailable")
        return deepcopy(s["snapshot"])

    def withdraw_share(self, owner: str, share: str) -> None:
        if self.shares[share]["owner"] != owner:
            raise Refused("unavailable")
        self.shares[share]["state"] = "withdrawn"

    def withdraw_job(self, owner: str, job_id: str) -> None:
        job = self._job(owner, job_id)
        job["generation"] += 1
        job["status"] = "withdrawn"
        job["wake_pending"] = False

    def erase_personal(self, owner: str) -> None:
        for key in list(self.receipts):
            if key[0] == owner:
                self.erased_keys.add(key)
                del self.receipts[key]
        for store in (self.jobs, self.packages, self.previews):
            for key in list(store):
                if store[key]["owner"] == owner:
                    del store[key]
        self.private_events = [e for e in self.private_events if e["owner"] != owner]
        # Shared snapshot remains separately withdrawable; no private read-through.
