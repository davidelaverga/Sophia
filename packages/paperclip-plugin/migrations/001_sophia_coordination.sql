-- sophia.coordination plugin namespace (WBC-02). Operation bindings, replay protection and reconciliation state only:
-- the issue itself is a core record, changed only through the issue APIs of the host.
CREATE TABLE plugin_sophia_coordination_00c896da3d.envelope_nonces (
  nonce text PRIMARY KEY,
  company_id text NOT NULL,
  delivery_key text NOT NULL,
  expires_at timestamptz NOT NULL,
  seen_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE plugin_sophia_coordination_00c896da3d.commissions (
  commission_key text PRIMARY KEY,
  company_id text NOT NULL,
  sophia_project_id text NOT NULL,
  paperclip_project_id text NOT NULL,
  work_id text NOT NULL,
  state text NOT NULL CHECK (state IN ('creating', 'created')),
  issue_id uuid REFERENCES public.issues(id),
  -- The effect lease: one delivery at a time changes the issue of this commission (effect_holder until effect_until),
  -- renewed before each write so that a write is only begun with more lease left than the host call can take.
  effect_holder text,
  effect_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((state = 'created') = (issue_id IS NOT NULL))
);

-- One row per delivered control. A key is recorded pending before its effect and becomes applied only once the
-- status of the issue and any wakeup are confirmed: a resend of a pending key applies the effect again (both are
-- idempotent), so the presence of a key never proves its effect. seq orders the controls of a commission: a pending
-- key that a later applied control superseded is closed without acting.
-- No quote character may appear in these comments: the host strips quoted strings before comments when it checks
-- each statement (plugin-database.ts, stripSqlForKeywordScan).
CREATE TABLE plugin_sophia_coordination_00c896da3d.controls (
  delivery_key text PRIMARY KEY,
  seq bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  commission_key text NOT NULL REFERENCES plugin_sophia_coordination_00c896da3d.commissions(commission_key),
  issue_id uuid NOT NULL REFERENCES public.issues(id),
  op text NOT NULL CHECK (op IN ('hold', 'resume', 'stop', 'complete', 'fail')),
  state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending', 'applied')),
  received_at timestamptz NOT NULL DEFAULT now(),
  applied_at timestamptz,
  CHECK ((state = 'applied') = (applied_at IS NOT NULL))
);

-- One row per issue status write the plugin makes for a commission (a control effect or a settlement), recorded
-- before the write with the host process that serves it. A host call can fail after its write was durable, or land
-- after its caller stopped waiting, so every write is open until a settlement has read the issue after the write
-- finished. ended_at is set when the host answered the call, with the issue or an error (it answers once it finished
-- with it). A call it never answered, or whose worker died, finishes only once host_process is gone, since a process
-- that is gone can no longer commit; time alone never finishes it. settled_at is set by the settlement that read the
-- issue after it finished; until then no delivery of the commission is confirmed against it, and every settlement
-- still restores the wanted status if the write lands.
CREATE TABLE plugin_sophia_coordination_00c896da3d.effects (
  effect_id text PRIMARY KEY,
  commission_key text NOT NULL REFERENCES plugin_sophia_coordination_00c896da3d.commissions(commission_key),
  status text NOT NULL,
  host_process text,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  settled_at timestamptz
);

-- One row per wakeup the plugin asks the host for (for a commission, for a Resume), keyed by the delivery that asks it.
-- The pinned host does not deduplicate a wakeup by its idempotency key, and can fail after the wakeup is durable, so
-- an ask is recorded before it is made and a resend never asks blindly: a run of the issue since the first ask
-- confirms it (public.heartbeat_runs, read only); an ask that may still be in flight is waited for; only a stale,
-- unconfirmed ask with no run since is asked again, by the one resend that claims it.
CREATE TABLE plugin_sophia_coordination_00c896da3d.wakes (
  wake_key text PRIMARY KEY,
  issue_id uuid NOT NULL REFERENCES public.issues(id),
  first_asked_at timestamptz NOT NULL DEFAULT now(),
  asked_at timestamptz NOT NULL DEFAULT now(),
  confirmed_at timestamptz
);
