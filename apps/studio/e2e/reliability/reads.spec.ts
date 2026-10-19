import { expect, test, type BrowserContext, type Locator, type Page } from '@playwright/test'
import { failReads, hits, record, settled, withProbe, type Rule } from './measure.ts'

// M6 (docs/plans/reliability-measure.md, the baseline's §4 and §1.1): a sweep. Each view, and each of the baseline's
// ~11 reads that fall back to empty, is opened with its own reads failing as the fixture's outage fails them (a fetch
// that rejects), narrowed to those reads so the snapshot and the feed keep working. Once the page's retries are over,
// the part either shows the failure (an alert, or a «couldn’t / can’t be read / didn’t load» line, or a Try again,
// that the same part didn't show with nothing failing) or falls silent. Measured, not judged: the checks assert only
// that the scenario ran.

const DEMO = '/room.html?demo=1'
const ROLLOUT = 'Roll the new onboarding out to every region'
/** What a failure shown in words reads like across the Studio. */
const SAID = /couldn[’']t|can[’']t be read|cannot be read|didn[’']t load|unreachable|went wrong|Try again/i

const lost = (...patterns: string[]): Rule[] => patterns.map((pattern) => ({ pattern, answer: 'lost', times: null }))
const views = (page: Page) => page.getByRole('navigation', { name: 'Project views' })
const region = (name: string) => (page: Page) => page.getByRole('region', { name })
const body = (page: Page) => page.locator('body')

test.beforeEach(async ({ context }) => {
  // A control, then the page's retries (1, 2 and 4 s) and a quiet 5 s: longer than a check's 30 s.
  test.setTimeout(120_000)
  await context.route(
    (url) => url.origin !== 'http://127.0.0.1:5199',
    (route) => route.abort(),
  )
})

/** Opens a view or a read's place, calls `fail` where its reads should start failing, and gives the part to read. */
type Open = (page: Page, fail: () => Promise<void>) => Promise<Locator>

interface Read {
  view: string
  kind: 'view' | 'site'
  rules: Rule[]
  /** The reads fail from the page's load (they are made as it opens), not from `fail`. */
  atLoad: boolean
}

/** The alerts and the failure-like lines a part shows. */
async function said(scope: Locator) {
  if ((await scope.count()) === 0) return { found: false, alerts: [] as string[], lines: [] as string[] }
  const first = scope.first()
  const alerts = (await first.getByRole('alert').filter({ visible: true }).allInnerTexts()).map((t) => t.trim())
  const lines = (await first.innerText()).split('\n').filter((l) => SAID.test(l))
  return { found: true, alerts: alerts.filter(Boolean), lines: lines.map((l) => l.trim()) }
}

/** The part with nothing failing, so words it always says are not taken for a failure. */
async function control(context: BrowserContext, open: Open) {
  const calm = await context.newPage()
  await withProbe(calm)
  const scope = await open(calm, () => Promise.resolve())
  await calm.waitForTimeout(3000)
  const seen = await said(scope)
  await calm.close()
  return seen
}

/** One view or read: a control, then its reads failing; once the page's retries are over, what the part shows. */
async function sweep(context: BrowserContext, page: Page, read: Read, open: Open) {
  const calm = await control(context, open)
  await withProbe(page, read.atLoad ? read.rules : [])
  const scope = await open(page, () => failReads(page, read.rules))
  await settled(page)
  const failed = await hits(page)
  const now = await said(scope)
  const fresh = [
    ...now.alerts.filter((t) => !calm.alerts.includes(t)),
    ...now.lines.filter((l) => !calm.lines.includes(l)),
  ]
  const sample = {
    view: read.view,
    kind: read.kind,
    failedReads: failed.length,
    paths: [...new Set(failed.map((h) => h.path))],
    found: now.found,
    visible: failed.length === 0 ? null : fresh.length > 0,
    said: (fresh[0] ?? '').slice(0, 160),
  }
  await record(test.info(), 'M6', [sample])
  expect(sample.view).toBe(read.view)
}

/** In the project at its room, the bar drawn; then `label`'s view, its reads failing from the press on. */
const viewOpen =
  (label: string, part: (page: Page) => Locator): Open =>
  async (page, fail) => {
    await page.goto(DEMO)
    await expect(page.getByRole('button', { name: 'Invite' }).first()).toBeVisible()
    await fail()
    const link = views(page).getByRole('link', { name: label, exact: true })
    await link.click()
    await expect(link).toHaveAttribute('aria-current', 'page')
    return part(page)
  }

/** A page whose reads are made as it opens: they fail from the load. */
const pageOpen =
  (url: string, part: (page: Page) => Locator): Open =>
  async (page) => {
    await page.goto(url)
    return part(page)
  }

const view = (name: string, ...patterns: string[]): Read => ({
  view: name,
  kind: 'view',
  rules: lost(...patterns),
  atLoad: false,
})
const site = (name: string, atLoad: boolean, ...patterns: string[]): Read => ({
  view: name,
  kind: 'site',
  rules: lost(...patterns),
  atLoad,
})

test.describe('M6 · views', () => {
  test('Studio: the brief and the replies fail as the room opens @reliability', async ({ context, page }) => {
    const read = { ...view('Studio', '/mission(\\?|$)', '/discussion/replies'), atLoad: true }
    await sweep(context, page, read, async (p) => {
      await p.goto(DEMO)
      await expect(p.getByRole('button', { name: 'Invite' }).first()).toBeVisible()
      return body(p)
    })
  })

  test('Conversations: the list, the messages and the context fail @reliability', async ({ context, page }) => {
    const read = view('Conversations', '/conversations(\\?|$)', '/conversations/[^/]+/messages', '/mission')
    await sweep(context, page, read, viewOpen('Conversations', region('Conversations')))
  })

  test('Goals: the board, the members, the dates and the notes fail @reliability', async ({ context, page }) => {
    const read = view('Goals', '/plans(\\?|$)', '/members(\\?|$)', '/goal-targets', '/mission')
    await sweep(context, page, read, viewOpen('Goals', region('Goals')))
  })

  test('Tasks: the board, the members and the source review fail @reliability', async ({ context, page }) => {
    const read = view('Tasks', '/plans(\\?|$)', '/members(\\?|$)', '/plans/source-review')
    await sweep(context, page, read, viewOpen('Tasks', region('Tasks')))
  })

  test('Knowledge: the reports, what was carried in and the covers fail @reliability', async ({ context, page }) => {
    const patterns = ['/knowledge/reports', '^/api/v1/projects(\\?|$)', '/artifacts/[^/]+/versions', '/sources/']
    await sweep(context, page, view('Knowledge', ...patterns), viewOpen('Knowledge', region('Knowledge')))
  })

  test('Updates: what changed and the meetings fail @reliability', async ({ context, page }) => {
    const read = view('Updates', '/since(\\?|$)', '/meetings')
    await sweep(context, page, read, viewOpen('Updates', region('Updates')))
  })

  test('Resources: nothing it reads (it makes no read yet) @reliability', async ({ context, page }) => {
    await sweep(context, page, view('Resources', '/resources'), viewOpen('Resources', region('Resources')))
  })
})

test.describe('M6 · reads that fall back to empty (baseline §1.1)', () => {
  test('Goals · the owner picker’s members (GoalTargets) @reliability', async ({ context, page }) => {
    const read = site('Goals · owner picker (members)', false, '/members(\\?|$)')
    await sweep(context, page, read, async (p, fail) => {
      await viewOpen('Goals', region('Goals'))(p, fail)
      await settled(p, 5000, 15_000)
      await p.getByRole('button', { name: ROLLOUT, exact: true }).click()
      return p.getByRole('dialog', { name: ROLLOUT })
    })
  })

  test('Invite · people from your projects (FromYourProjects) @reliability', async ({ context, page }) => {
    const read = site('Invite · from your projects', false, '/invitable$')
    await sweep(context, page, read, async (p, fail) => {
      await p.goto(DEMO)
      await expect(p.getByRole('button', { name: 'Invite' }).first()).toBeVisible()
      await fail()
      await p.getByRole('button', { name: 'Invite' }).first().click()
      return p.getByRole('tabpanel', { name: 'Members' })
    })
  })

  test('Project · archived or not (Archive) @reliability', async ({ context, page }) => {
    const read = site('Project · archived line', true, '/projects/archived$')
    await sweep(context, page, read, async (p) => {
      await p.goto('/room.html?archived=1')
      await expect(p.getByRole('button', { name: 'Invite' }).first()).toBeVisible()
      return body(p)
    })
  })

  test('Call · the meeting so far (CatchUp) @reliability', async ({ context, page }) => {
    const read = site('Call · catch up', false, '/meetings(\\?|$)', '/so-far$')
    await sweep(context, page, read, async (p, fail) => {
      await p.goto('/room.html?people=2&meeting=earlier')
      await fail()
      await p.getByRole('button', { name: 'Join the room' }).first().click()
      await expect(p.getByRole('button', { name: 'Leave the room' }).first()).toBeVisible()
      return body(p)
    })
  })

  test('Stage · where Sophia is in the report (StagePresent) @reliability', async ({ context, page }) => {
    const read = site('Stage · Sophia’s place', false, '/rooms/[^/]+/focus$')
    await sweep(context, page, read, async (p, fail) => {
      await p.goto('/room.html?call=on&people=2&floor=1&sophia=listening&history=pilot')
      await expect(p.getByRole('button', { name: 'Leave the room' }).first()).toBeVisible()
      await fail()
      await p.evaluate(() => window.fixture?.show('me'))
      await p.evaluate(() => window.fixture?.sophiaWalks('charging-speed-in-practice'))
      return p.getByRole('region', { name: /^Fixture report, shown by/ })
    })
  })
})

test.describe('M6 · reads that fall back to empty, on other pages and sheets', () => {
  test('New conversation · start from what’s still open (NewConversation) @reliability', async ({ context, page }) => {
    const read = site('New conversation · starters', true, '/mission(\\?|$)')
    await sweep(context, page, read, async (p) => {
      await p.goto('/room.html?place=conversations&demo=1')
      await p
        .getByRole('region', { name: 'All conversations' })
        .getByRole('button', { name: 'New conversation' })
        .click()
      return p.getByRole('form', { name: 'New conversation' })
    })
  })

  test('Work · Review sources offered (ReviewSources) @reliability', async ({ context, page }) => {
    const read = site('Work · review sources', true, '/plans/source-review$')
    await sweep(context, page, read, pageOpen('/work.html?served=1', body))
  })

  test('Report · where each source came from (source-origins) @reliability', async ({ context, page }) => {
    const read = site('Report · source origins', false, '/source-origins$')
    await sweep(context, page, read, async (p, fail) => {
      await p.goto('/room.html?place=knowledge&demo=1')
      await fail()
      await p.locator('.report-card').first().locator('.report-card-title').click()
      const pane = p.locator('.report-pane:not([hidden])')
      await pane.getByRole('tab', { name: /Sources/ }).click()
      return pane
    })
  })

  test('Welcome · what the project is for (WelcomeBand) @reliability', async ({ context, page }) => {
    const read = site('Welcome · what it’s for', true, '/mission(\\?|$)')
    await sweep(context, page, read, pageOpen('/room.html?demo=1&welcome=1', region('Welcome')))
  })

  test('Home · invitations waiting (InvitedBand) @reliability', async ({ context, page }) => {
    const read = site('Home · invitations', true, '/me/invitations$')
    await sweep(context, page, read, pageOpen('/home.html?invited=1', body))
  })

  test('Composer · the notes consent (ContinuityChoice): no fixture reaches it @reliability', async () => {
    // The fixture's note policy is fixed at `capture: 'off'`, so the choice never shows: not reached, said so.
    const sample = { view: 'Composer · notes consent', kind: 'site', failedReads: 0, visible: null, paths: [] }
    await record(test.info(), 'M6', [{ ...sample, found: false, said: 'no fixture page asks for consent' }])
    expect(sample.failedReads).toBe(0)
  })
})
