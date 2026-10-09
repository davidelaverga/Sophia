/**
 * Sophia role presets: which native dsh tools each versioned role may see and
 * run. Role ids and flags mirror config/roles.json (a unit test keeps them in
 * sync). Its `tool_allowlist` names Sophia domain tools that later goals
 * build (project_read, workspace_patch, ...); none is registered at S1-03.
 * What this file adds is the native-tool policy of 02_DSH_BOOTSTRAP §6, read
 * conservatively:
 *
 * - no role gets host execution or host file mutation (bash, write, edit,
 *   job_*): `raw_host_shell` is false for every role;
 * - no role gets the global web tools, plugin/config/account tools, native
 *   subagent spawning or cross-agent messaging (S1-10 owns peers);
 * - goal tools only for roles with `goal_continuation`;
 * - the PTC `workflow` runtime only for research and prototype. Its child
 *   agents are held to the parent attempt's role by the bridge's guard.
 *
 * - `sophia-brief-v1` (S1-05A) drafts a brief from inputs the service puts in
 *   its prompt (the source-bound context manifest). It needs no native tool,
 *   so it may run none: every tool is hidden and the guard denies any call.
 * - The specialist roles (SMC-M03), such as `sophia-research-md-v1` and
 *   `sophia-research-pdf-v1`, come from config/specialists.json through the
 *   generated `specialists.generated.ts`, never restated here. A research
 *   specialist reads and writes only through Sophia's research tools (S4),
 *   never the workspace, the host or the global web; a tool the composition
 *   does not register yet is simply absent. Its route is the bridge row's
 *   `roleRoutes`, which the runtime unit keeps equal to the registry.
 * - The native design roles (SDD-01), `sophia-html-designer-v1` and the
 *   separate `sophia-visual-review-v1`, come from the same registry. Each
 *   also names the prompt sections and native skills its preset loads
 *   explicitly (DESIGN_ROLES below); the reviewer's tools never include a
 *   design_* tool, so it cannot write, render, submit or publish.
 *
 * A role id is versioned. A session created under one role resumes under the
 * same id, and a bundle that no longer defines it refuses to resume
 * (02_DSH_BOOTSTRAP §7).
 * @module @sophia/dsh-bundle/role-registry
 */

import { SPECIALISTS } from './specialists.generated.js'
import type { SpecialistId } from './specialists.generated.js'

export type RoleId =
  | 'sophia-guide-v1'
  | 'sophia-lead-v1'
  | 'sophia-research-v1'
  | 'sophia-prototype-v1'
  | 'sophia-review-v1'
  | 'sophia-brief-v1'
  | SpecialistId

export interface RolePreset {
  readonly id: RoleId
  /** Native tools this role may see and run. Anything else is hidden and denied. */
  readonly nativeTools: ReadonlySet<string>
  readonly goalContinuation: boolean
  readonly rawHostShell: false
  /** A specialist's task kind (the registry's task_kind): which service operations meter its model calls. */
  readonly taskKind?: 'research' | 'source_review'
}

const READ_WORKSPACE = ['read', 'glob', 'grep', 'read_image']
const GOALS = ['get_goal', 'create_goal', 'update_goal']

const preset = (id: RoleId, goalContinuation: boolean, tools: readonly string[]): RolePreset => ({
  id,
  nativeTools: new Set(tools),
  goalContinuation,
  rawHostShell: false,
})

export const ROLE_PRESETS: Readonly<Record<RoleId, RolePreset>> = {
  'sophia-guide-v1': preset('sophia-guide-v1', false, ['todo_write', 'skill']),
  'sophia-lead-v1': preset('sophia-lead-v1', false, ['todo_write', 'skill', ...READ_WORKSPACE]),
  'sophia-research-v1': preset('sophia-research-v1', true, ['todo_write', 'skill', ...READ_WORKSPACE, ...GOALS, 'workflow']),
  'sophia-prototype-v1': preset('sophia-prototype-v1', true, ['todo_write', 'skill', ...READ_WORKSPACE, ...GOALS, 'workflow']),
  'sophia-review-v1': preset('sophia-review-v1', false, [...READ_WORKSPACE]),
  'sophia-brief-v1': preset('sophia-brief-v1', false, []),
  // Specialists never continue through native goals: Sophia's episode owns their continuation.
  ...(Object.fromEntries(SPECIALISTS.map((s) => [s.id, { ...preset(s.id, false, s.nativeTools), taskKind: s.taskKind }])) as Record<SpecialistId, RolePreset>),
}

/**
 * @param id - requested role id.
 * @returns the preset, or undefined when this bundle does not define it.
 */
export function roleOf(id: unknown): RolePreset | undefined {
  return typeof id === 'string' && Object.hasOwn(ROLE_PRESETS, id) ? ROLE_PRESETS[id as RoleId] : undefined
}

/** A native design role (SDD-01): the designer or the separate visual reviewer, with what its preset composes. */
export interface DesignRole {
  readonly id: SpecialistId
  readonly family: 'design' | 'design_review'
  /** Prompt sections, then skills, installed in this order; nothing is discovered. */
  readonly promptSections: readonly string[]
  readonly skills: readonly string[]
  /** The references it may read (ids or `prefix/*`), read-only (SDD-01-RF-0002). */
  readonly references: readonly string[]
  /** The role inspects real captures, so it runs only on a route that declares image input. */
  readonly imageInput: boolean
}

export const DESIGN_ROLES: ReadonlyMap<string, DesignRole> = new Map(
  SPECIALISTS.flatMap((s): Array<[string, DesignRole]> =>
    'promptSections' in s
      ? [[s.id, { id: s.id, family: s.family, promptSections: s.promptSections, skills: s.skills, references: s.references, imageInput: s.imageInput }]]
      : [],
  ),
)
