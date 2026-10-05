-- sophia.coordination plugin namespace (WBC-02). Operation bindings, replay protection and reconciliation state only:
-- the issue itself is a core record, changed only through the host's issue APIs.
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
  -- When the host confirmed the commission's wakeup. Null while a wake the commission asked for is unconfirmed: a
  -- resend asks again (the issue's existence never proves its wake happened).
  woken_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((state = 'created') = (issue_id IS NOT NULL))
);

-- One row per delivered control. A key is recorded 'pending' before its effect and becomes 'applied' only once the
-- issue's status and any wakeup are confirmed: a resend of a pending key applies the effect again (both are
-- idempotent), so a key's presence never proves its effect. seq orders a commission's controls: a pending key that a
-- later applied control superseded is closed without acting.
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
