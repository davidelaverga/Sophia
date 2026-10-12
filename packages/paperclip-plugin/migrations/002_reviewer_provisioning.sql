-- sophia.coordination plugin namespace, second migration: one provisioning claim per company for its managed source
-- reviewer. The pinned host reconciles a managed agent without a lock: it reads the binding, then creates an agent and
-- writes the binding (server/src/services/plugin-managed-agents.ts at 5edf55d7), so two reconciles of one company at once
-- leave two live agents, each issue assigned to the one its request created. The plugin asks the host to reconcile only
-- while it holds the company claim here, recorded before it asks with a token and the host process that serves it and
-- that process namespace. ended_at is set when the host answered the reconcile, with the agent or an error (it answers
-- once it finished with it); the claim may then be taken again. A reconcile the host never answered may still land,
-- however late: the claim stays until an operator fences it, after verifying that the instance that served it stopped
-- and its database sessions ended (fence names who and why). Time alone never ends a claim. A reviewer the host has
-- already bound is read without any claim.
-- No quote character may appear in these comments: the host strips quoted strings before comments when it checks
-- each statement (plugin-database.ts, stripSqlForKeywordScan).
CREATE TABLE plugin_sophia_coordination_00c896da3d.reviewer_provisioning (
  company_id text PRIMARY KEY,
  claim_token text NOT NULL,
  host_namespace text,
  host_process text,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  agent_id text,
  fenced_at timestamptz,
  fence text,
  CHECK ((fenced_at IS NULL) = (fence IS NULL)),
  CHECK (agent_id IS NULL OR ended_at IS NOT NULL)
);
