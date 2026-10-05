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
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((state = 'created') = (issue_id IS NOT NULL))
);

CREATE TABLE plugin_sophia_coordination_00c896da3d.controls (
  delivery_key text PRIMARY KEY,
  commission_key text NOT NULL REFERENCES plugin_sophia_coordination_00c896da3d.commissions(commission_key),
  issue_id uuid NOT NULL REFERENCES public.issues(id),
  op text NOT NULL CHECK (op IN ('hold', 'resume', 'stop', 'complete', 'fail')),
  applied_at timestamptz NOT NULL DEFAULT now()
);
