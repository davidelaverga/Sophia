// revise_html_page (guide v1.3, SDD-01 G5): revise named sections of the designed HTML page of a report's current
// version, by voice or text, for the bound speaker. The model names the task, the sections project_status lists for
// its page, and what to change; everything else is the server's: the current version and its page's candidate, the
// scope (the page around the sections and the shared stylesheet stay protected unless the speaker asked for them), and
// the instruction, kept as the speaker's own contribution (0041 request_design_edit). A receipt says admitted, never
// revised; a refusal is typed `not_started:<code>`, and a call whose outcome is unknown is `unconfirmed:<code>`.
import type { MediaToolResult } from '@sophia/contracts'
import { DomainError } from '@sophia/domain'
import { liveCallAdmits, readHtmlPages, requestDesignEdit, withActor } from '@sophia/persistence'
import type { ToolContext } from './mission-tools.ts'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const SECTION = /^[a-z][a-z0-9-]{0,63}$/
const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID.test(v)
const isText = (v: unknown, max: number): v is string => typeof v === 'string' && v.trim().length > 0 && v.length <= max

const clarify = (ask: string): MediaToolResult => ({ status: 'clarify', output: { ask } })
const refused = (code: string, reason: string): MediaToolResult => ({ status: 'refused', output: { code, reason } })

/** Why nothing was started, in the speaker's words; the database's own message where it is specific. */
const EDIT_REFUSALS: Partial<Record<string, string>> = {
  forbidden: 'Only editors and admins can ask for a page to be revised.',
  html_unavailable: 'Designed HTML pages are not available right now, so nothing was started.',
  research_limit_reached: 'This report’s page has been designed and revised as often as allowed.',
  source_ineligible: 'This report draws on a source that was withdrawn, so its page is not revised.',
  stale_revision: 'A newer version of this report exists: read project_status and name its sections again.',
  idempotency_conflict: 'I could not confirm whether the revision was asked for; read project_status.',
}

/** The sections the model named: 1 to 16 section ids, or null. */
function sectionsOf(v: unknown): string[] | null {
  if (!Array.isArray(v) || v.length < 1 || v.length > 16) return null
  const ids = v.filter((x): x is string => typeof x === 'string' && SECTION.test(x))
  return ids.length === v.length ? ids : null
}

function editRefusal(err: unknown): MediaToolResult {
  if (!(err instanceof DomainError) || err.code === 'outcome_unknown' || err.code === 'unavailable') {
    return {
      status: 'unknown',
      output: { code: 'unconfirmed:error', reason: 'I could not confirm whether the revision was asked for.' },
    }
  }
  return refused(`not_started:${err.code}`, EDIT_REFUSALS[err.code] ?? err.message)
}

const listed = (ids: readonly string[]) => ids.join(', ')

/**
 * revise_html_page: an edit of the report's current page, scoped to the sections named. It arrives as the report's
 * next version; nothing outside the scope may change, and the work card shows its progress.
 */
export async function reviseHtmlPage(ctx: ToolContext): Promise<MediaToolResult> {
  const { taskId, instruction } = ctx.args
  if (!isUuid(taskId)) return clarify('Which report’s HTML page should I revise?')
  const sections = sectionsOf(ctx.args.sections)
  if (!sections) return clarify('Which sections of the page should change? project_status lists them.')
  if (!isText(instruction, 2000)) return clarify('What should change in those sections?')
  try {
    const [page] = await withActor(ctx.pool, ctx.actorId, 'read', (c) => readHtmlPages(c, ctx.projectId, [taskId]))
    if (!page) return refused('not_started:no_html_page', 'That report has no designed HTML page to revise.')
    const receipt = await withActor(ctx.pool, ctx.actorId, 'write', async (c) => {
      // Voice qualification on (A15): the edit's task is linked to the call that asked for it, in this transaction.
      if (ctx.liveCall) await liveCallAdmits(c, ctx.projectId, ctx.key)
      const edit = await requestDesignEdit(
        c,
        ctx.projectId,
        ctx.key,
        {
          versionId: page.versionId,
          sections,
          instruction: instruction.trim(),
          ...(ctx.args.shell === true ? { shell: true } : {}),
          ...(ctx.args.styles === true ? { styles: true } : {}),
        },
        'voice',
      )
      // A recorded call's answer, with what it admitted (Codex P1 r4234782534): the transaction's last statement.
      await ctx.seal?.(c, 'admitted')
      return edit
    })
    return {
      status: 'admitted',
      output: {
        taskId: receipt.taskId,
        sections: receipt.sections,
        note: `Admitted, not revised yet: only ${listed(receipt.sections)} can change. The revised page arrives as the report’s next version, and the work card shows its progress.`,
      },
    }
  } catch (err: unknown) {
    return editRefusal(err)
  }
}
