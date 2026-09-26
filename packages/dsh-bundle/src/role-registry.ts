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
 *
 * A role id is versioned. A session created under one role resumes under the
 * same id, and a bundle that no longer defines it refuses to resume
 * (02_DSH_BOOTSTRAP §7).
 * @module @sophia/dsh-bundle/role-registry
 */

export type RoleId = 'sophia-guide-v1' | 'sophia-lead-v1' | 'sophia-research-v1' | 'sophia-prototype-v1' | 'sophia-review-v1' | 'sophia-brief-v1'

export interface RolePreset {
  readonly id: RoleId
  /** Native tools this role may see and run. Anything else is hidden and denied. */
  readonly nativeTools: ReadonlySet<string>
  readonly goalContinuation: boolean
  readonly rawHostShell: false
}

const READ_WORKSPACE = ['read', 'glob', 'grep', 'read_image']
const GOALS = ['get_goal', 'create_goal', 'update_goal']

const preset = (id: RoleId, goalContinuation: boolean, tools: string[]): RolePreset => ({
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
}

/**
 * @param id - requested role id.
 * @returns the preset, or undefined when this bundle does not define it.
 */
export function roleOf(id: unknown): RolePreset | undefined {
  return typeof id === 'string' && Object.hasOwn(ROLE_PRESETS, id) ? ROLE_PRESETS[id as RoleId] : undefined
}
