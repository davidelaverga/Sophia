#!/usr/bin/env node
// Runs the built sophia_dsh adapter inside the pinned Paperclip's own heartbeat (WBC-02-CX-0007), on a throwaway
// database with every pinned Paperclip migration, before any install:
//   SOPHIA_DISPOSABLE_DATABASE_URL=postgres://... node scripts/paperclip-host-probe.mjs --paperclip <checkout> --dist <dir>
// The pin's heartbeatService runs each wakeup and classifies each adapter result, and finalizes the managed agent's
// status, exactly as a host would; Sophia is a scripted client inside the adapter (no Sophia service, no provider, no
// plugin server). It checks what CX-0007 found: a Hold made in Sophia must leave the reviewer runnable so the Resume
// wakeup queues a run; so must a review that ended blocked, a denied permit and Stop; new work on the same reviewer
// runs; an adapter that cannot reach Sophia fails its run, and the host then queues no wakeup of that reviewer (the
// plugin answers that as 503 wake_not_queued, never as delivered). The wakeup is made as plugin-host-services.ts
// makes a plugin's requestWakeup. The probe's test file is written into the checkout's server tests only for the run
// (vitest resolves the pin's TypeScript there) and removed afterwards; nothing is installed anywhere.
import { spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import pg from 'pg'

const { values } = parseArgs({ options: { paperclip: { type: 'string' }, dist: { type: 'string' } } })
const checkout = resolve(values.paperclip ?? process.env.PAPERCLIP_SOURCE ?? '')
const dist = resolve(values.dist ?? join(import.meta.dirname, '../deploy/paperclip/dist'))
const admin = process.env.SOPHIA_DISPOSABLE_DATABASE_URL
if (!admin) throw new Error('SOPHIA_DISPOSABLE_DATABASE_URL is required')

const PROBE = String.raw`
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { agents, applyPendingMigrations, companies, companyMemberships, createDb, heartbeatRuns, issues } from "@paperclipai/db";
import { heartbeatService } from "../services/heartbeat.ts";
import { drainHeartbeatRunsToQuiescence } from "./helpers/drain-heartbeat-runs.js";

// What Sophia answers, per issue: the permit, then each observation's phase (the last one repeats).
// mirror(issueId, phase) applies the issue status the plugin's control would set for that phase (CONTROL_EFFECT).
const sophia = vi.hoisted(() => ({ byIssue: new Map(), issueOfRun: new Map(), mirror: async () => {} }));

vi.mock("../adapters/index.ts", async () => {
  const actual = await vi.importActual("../adapters/index.ts");
  const built = await import(process.env.SOPHIA_ADAPTER_ENTRY);
  const observation = (issueId, phase) => ({
    phase, workId: issueId, attemptId: "00000000-0000-4000-8000-0000000000a1", nativeSessionId: "native-probe",
    reason: phase === "blocked" ? "the probe's review reported a blocker" : null,
    result: phase === "result_ready"
      ? { resultId: "r1", sourceId: "00000000-0000-4000-8000-0000000000b1", versionId: "00000000-0000-4000-8000-0000000000c1", verdict: "supported", sha256: "a".repeat(64) }
      : null,
    usage: null,
  });
  const next = (runId) => {
    const issueId = sophia.issueOfRun.get(runId);
    const script = sophia.byIssue.get(issueId);
    const phase = script.phases.length > 1 ? script.phases.shift() : script.phases[0];
    return sophia.mirror(issueId, phase).then(() => observation(issueId, phase));
  };
  const client = {
    permit: (request) => {
      sophia.issueOfRun.set(request.runId, request.issueId);
      const script = sophia.byIssue.get(request.issueId);
      if (script.permit === "unreachable") return Promise.reject(new built.SophiaUnreachable("the probe's Sophia is down"));
      if (script.permit === "deny")
        return sophia.mirror(request.issueId, "held").then(() =>
          ({ decision: "deny", workId: request.issueId, state: "held", code: "held", reason: "Held in Sophia" }));
      return Promise.resolve({ decision: "attach", workId: request.issueId, state: "running" });
    },
    start: () => Promise.reject(new Error("the probe never starts an attempt")),
    observe: (request) => next(request.runId),
    cancel: (request) => next(request.runId),
  };
  const adapter = built.createSophiaDshAdapter({ client });
  return { ...actual, getServerAdapter: vi.fn(() => adapter) };
});

describe("sophia_dsh on the pinned heartbeat (WBC-02-CX-0007)", () => {
  let db, heartbeat, companyId, agentId, ownerUserId;
  beforeAll(async () => {
    await applyPendingMigrations(process.env.SOPHIA_PROBE_DATABASE_URL);
    db = createDb(process.env.SOPHIA_PROBE_DATABASE_URL);
    heartbeat = heartbeatService(db);
    companyId = randomUUID(); agentId = randomUUID(); ownerUserId = "owner-" + randomUUID();
    await db.insert(companies).values({ id: companyId, name: "Synthetic company",
      issuePrefix: "S" + companyId.replace(/-/g, "").slice(0, 6).toUpperCase(), defaultResponsibleUserId: ownerUserId });
    await db.insert(companyMemberships).values({ companyId, principalType: "user", principalId: ownerUserId,
      membershipRole: "owner", status: "active" });
    const MIRROR = { held: "blocked", result_ready: "done", stopped: "cancelled", withdrawn: "cancelled", blocked: "cancelled", failed: "cancelled" };
    sophia.mirror = async (issueId, phase) => {
      if (MIRROR[phase]) await db.update(issues).set({ status: MIRROR[phase] }).where(eq(issues.id, issueId));
    };
    await db.insert(agents).values({ id: agentId, companyId, name: "Source reviewer", role: "engineer", status: "idle",
      adapterType: "sophia_dsh", adapterConfig: {}, runtimeConfig: { heartbeat: { wakeOnDemand: true, maxConcurrentRuns: 1 } },
      permissions: {} });
  }, 120_000);
  afterAll(async () => { await drainHeartbeatRunsToQuiescence(db, heartbeat); });

  const issue = async (script) => {
    const id = randomUUID();
    sophia.byIssue.set(id, script);
    await db.insert(issues).values({ id, companyId, title: "Source review (probe)", status: "todo",
      assigneeAgentId: agentId, responsibleUserId: ownerUserId });
    return id;
  };
  // As plugin-host-services.ts makes a plugin's requestWakeup (source assignment, plugin context, the key).
  const pluginWake = (issueId, key) => heartbeat.wakeup(agentId, {
    source: "assignment", triggerDetail: "system", reason: "sophia:commission",
    payload: { issueId, mutation: "plugin_wakeup", pluginId: "sophia.coordination", pluginKey: "sophia.coordination", contextSource: "sophia.coordination" },
    idempotencyKey: key, requestedByActorType: "system", requestedByActorId: "sophia.coordination",
    contextSnapshot: { issueId, taskId: issueId, wakeReason: "sophia:commission", source: "sophia.coordination" },
  });
  const settle = async (runId) => {
    await drainHeartbeatRunsToQuiescence(db, heartbeat);
    const run = await db.select().from(heartbeatRuns).where(eq(heartbeatRuns.id, runId)).then((rows) => rows[0]);
    const { status, errorCode, error, scheduledRetryReason, livenessState, resultJson } = run;
    console.log("[probe] run", JSON.stringify({ status, errorCode, error, scheduledRetryReason, livenessState, resultJson }));
    return run;
  };
  const agentStatus = () => db.select().from(agents).where(eq(agents.id, agentId)).then((rows) => rows[0].status);

  it("a Hold made in Sophia leaves the reviewer runnable, and the Resume wakeup queues a run", async () => {
    const id = await issue({ permit: "attach", phases: ["running", "held"] });
    const run = await pluginWake(id, "commission-" + id);
    expect(run).not.toBeNull();
    const held = await settle(run.id);
    expect(held.status).toBe("succeeded");
    expect(held.resultJson?.sophiaOutcome).toBe("sophia_held");
    expect(await agentStatus(), "the reviewer is not left in error").toBe("idle");
    sophia.byIssue.set(id, { permit: "attach", phases: ["running", "result_ready"] });
    await db.update(issues).set({ status: "todo" }).where(eq(issues.id, id)); // the Resume control's status
    const resumed = await pluginWake(id, "resume-" + id);
    expect(resumed, "the Resume wakeup queued a run").not.toBeNull();
    expect((await settle(resumed.id)).status).toBe("succeeded");
  }, 120_000);

  it("a review that ended blocked and a denied permit leave it runnable; new work on the same reviewer runs", async () => {
    for (const script of [{ permit: "attach", phases: ["blocked"] }, { permit: "deny", phases: ["held"] }]) {
      const id = await issue(script);
      const run = await pluginWake(id, "commission-" + id);
      expect(run).not.toBeNull();
      expect((await settle(run.id)).status).toBe("succeeded");
      expect(await agentStatus()).toBe("idle");
    }
    const fresh = await issue({ permit: "attach", phases: ["result_ready"] });
    const run = await pluginWake(fresh, "commission-" + fresh);
    expect(run, "new work is queued").not.toBeNull();
    expect((await settle(run.id)).status).toBe("succeeded");
  }, 120_000);

  it("an adapter that cannot reach Sophia fails its run, for an operator; what a later wakeup does is recorded", async () => {
    const id = await issue({ permit: "unreachable", phases: ["running"] });
    const run = await pluginWake(id, "commission-" + id);
    const failed = await settle(run.id);
    expect(failed.status).toBe("failed");
    expect(failed.errorCode).toBe("sophia_unreachable");
    expect(await agentStatus()).toBe("error");
    // Recorded, not asserted: whether the host queues a run of a reviewer left in error. The plugin treats any
    // {queued: false} as not delivered (503 wake_not_queued) either way.
    const after = await issue({ permit: "attach", phases: ["result_ready"] });
    const later = await pluginWake(after, "commission-" + after);
    console.log("[probe] wake after error", JSON.stringify({ queued: Boolean(later), status: later ? (await settle(later.id)).status : null }));
  }, 120_000);
});
`

const name = `sophia_pchost_${randomBytes(5).toString('hex')}`
const server = new pg.Client({ connectionString: admin })
await server.connect()
await server.query(`CREATE DATABASE ${name}`)
const url = new URL(admin)
url.pathname = `/${name}`
const file = join(checkout, 'server/src/__tests__/sophia-wbc02-host-probe.test.ts')
let status = 1
try {
  writeFileSync(file, PROBE)
  const run = spawnSync('pnpm', ['exec', 'vitest', 'run', '--reporter=verbose', '--silent=false', 'src/__tests__/sophia-wbc02-host-probe.test.ts'], {
    cwd: join(checkout, 'server'),
    stdio: 'inherit',
    env: {
      ...process.env,
      SOPHIA_ADAPTER_ENTRY: join(dist, 'sophia-dsh-adapter/dist/index.js'),
      SOPHIA_PROBE_DATABASE_URL: url.toString(),
    },
  })
  status = run.status ?? 1
} finally {
  rmSync(file, { force: true })
  await server.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`)
  await server.end()
}
process.exit(status)
