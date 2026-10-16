// «Your name» (docs/plans/profile-editor.md, #365 section 8): the account menu offers it where the server serves
// profiles (A32), and the sheet reads, saves, refuses, and says a conflict or a lost reply as the API's rules have them.
// The demo's project (room.html) answers the profile as the API would (fixtures/profile-data.ts); the signed-in app
// (app.html, a synthetic Auth service) checks that one account's name never shows for the next.
import { expect, test, type BrowserContext, type Page } from '@playwright/test'
import { DRAWN, drawn } from './drawn.ts'

const kept = (page: Page) => page.evaluate(() => window.profileFixture?.profileOf() ?? null)
const saves = (page: Page) => page.evaluate(() => window.profileFixture?.saves ?? [])

const openMenu = async (page: Page, query = '') => {
  await page.goto(`/room.html?demo=1&place=goals${query}`)
  await drawn(page, DRAWN.goals)
  await page.getByRole('button', { name: 'Account' }).click()
  return page.getByRole('menu', { name: 'Account' })
}

const openSheet = async (page: Page) => {
  const menu = await openMenu(page)
  await menu.getByRole('menuitem', { name: 'Your name' }).click()
  const sheet = page.getByRole('dialog', { name: 'Your name' })
  await expect(sheet.getByRole('textbox', { name: 'Name' })).toBeVisible()
  return sheet
}

test('profile · a name is saved trimmed, and the account menu names you by it', async ({ page }) => {
  const sheet = await openSheet(page)
  const field = sheet.getByRole('textbox', { name: 'Name' })
  const save = sheet.getByRole('button', { name: 'Save' })
  await expect(field).toHaveValue('')
  await expect(save).toBeDisabled()
  await field.fill('  Ana Ruiz  ')
  await save.click()
  await expect(sheet.getByRole('status')).toContainText('Saved.')
  await expect(field).toHaveValue('Ana Ruiz')
  await expect(save).toBeDisabled()
  expect(await kept(page)).toEqual({ displayName: 'Ana Ruiz', chosen: true, revision: 1 })
  // Saved, nothing is left to drop: the head's Close is the one way out, not a second Cancel.
  await expect(sheet.getByRole('button', { name: 'Cancel' })).toHaveCount(0)
  await sheet.getByRole('button', { name: 'Close' }).click()
  await expect(sheet).toBeHidden()
  await page.getByRole('button', { name: 'Account' }).click()
  const head = page.getByRole('menu', { name: 'Account' }).locator('.menu-head')
  await expect(head.locator('.account-name')).toHaveText('Ana Ruiz')
  // The address is the person's own to see, under their name.
  await expect(head).toContainText('luis@sophia.test')
})

test('profile · blank waits, and an address, a hidden character or 61 characters are refused in place', async ({
  page,
}) => {
  const sheet = await openSheet(page)
  const field = sheet.getByRole('textbox', { name: 'Name' })
  const save = sheet.getByRole('button', { name: 'Save' })
  await field.fill('   ')
  await expect(save).toBeDisabled()
  await expect(sheet.getByRole('alert')).toHaveCount(0)
  for (const [typed, said] of [
    ['ana@sophia.test', 'A name, not an email address.'],
    ['An\u0007a', 'Use letters, numbers and spaces.'],
    ['x'.repeat(61), 'At most 60 characters.'],
  ] as const) {
    await field.fill(typed)
    await expect(sheet.getByRole('alert')).toHaveText(said)
    await expect(field).toHaveAttribute('aria-invalid', 'true')
    await expect(save).toBeDisabled()
  }
  expect(await saves(page)).toEqual([])
})

test('profile · a name changed elsewhere is said, yours kept, and saved over the new revision', async ({ page }) => {
  const sheet = await openSheet(page)
  const field = sheet.getByRole('textbox', { name: 'Name' })
  await page.evaluate(() => window.profileFixture?.changeElsewhere('Bea from the phone'))
  await field.fill('Ana')
  await sheet.getByRole('button', { name: 'Save' }).click()
  await expect(sheet.getByRole('status')).toHaveText(
    'Changed elsewhere to «Bea from the phone». Save to use yours instead.',
  )
  await expect(field).toHaveValue('Ana')
  expect((await kept(page))?.displayName).toBe('Bea from the phone')
  await sheet.getByRole('button', { name: 'Save' }).click()
  await expect(sheet.getByRole('status')).toContainText('Saved.')
  expect(await kept(page)).toEqual({ displayName: 'Ana', chosen: true, revision: 2 })
  // Two edits, two keys: the second over the revision the conflict read.
  const sent = await saves(page)
  expect(sent.map((s) => s.body)).toEqual([
    { displayName: 'Ana', expectedRevision: 0 },
    { displayName: 'Ana', expectedRevision: 1 },
  ])
  expect(new Set(sent.map((s) => s.key)).size).toBe(2)
})

test('profile · a lost reply keeps the name and Try again sends the same key: one edit, not two', async ({ page }) => {
  const sheet = await openSheet(page)
  const field = sheet.getByRole('textbox', { name: 'Name' })
  await page.evaluate(() => {
    if (window.profileFixture) window.profileFixture.loseNextReply = true
  })
  await field.fill('Ana')
  await sheet.getByRole('button', { name: 'Save' }).click()
  await expect(sheet.getByRole('alert')).toContainText('Sophia didn’t answer.')
  await expect(field).toHaveAttribute('readonly', '')
  await expect(sheet.getByRole('button', { name: 'Save' })).toBeDisabled()
  await sheet.getByRole('button', { name: 'Try again' }).click()
  await expect(sheet.getByRole('status')).toContainText('Saved.')
  const sent = await saves(page)
  expect(sent).toHaveLength(2)
  expect(sent[1]).toEqual(sent[0])
  expect(await kept(page)).toEqual({ displayName: 'Ana', chosen: true, revision: 1 })
})

test('profile · after a conflict nothing is saved until the name kept now is read; a failed read says so', async ({
  page,
}) => {
  const sheet = await openSheet(page)
  const field = sheet.getByRole('textbox', { name: 'Name' })
  await page.evaluate(() => {
    window.profileFixture?.changeElsewhere('Bea from the phone')
    if (window.profileFixture) window.profileFixture.failNextRead = true
  })
  await field.fill('Ana')
  await sheet.getByRole('button', { name: 'Save' }).click()
  await expect(sheet.getByRole('alert')).toContainText('Changed elsewhere, and the new name couldn’t be read.')
  // The revision read before the conflict is known to be stale: Save waits for a read that answers.
  await expect(sheet.getByRole('button', { name: 'Save' })).toBeDisabled()
  await sheet.getByRole('button', { name: 'Try again' }).click()
  await expect(sheet.getByRole('status')).toHaveText(
    'Changed elsewhere to «Bea from the phone». Save to use yours instead.',
  )
  await expect(field).toHaveValue('Ana')
  await sheet.getByRole('button', { name: 'Save' }).click()
  await expect(sheet.getByRole('status')).toContainText('Saved.')
  expect(await kept(page)).toEqual({ displayName: 'Ana', chosen: true, revision: 2 })
})

test('profile · while the conflict’s fresh read is pending, Save stays unavailable', async ({ page }) => {
  const sheet = await openSheet(page)
  const field = sheet.getByRole('textbox', { name: 'Name' })
  const save = sheet.getByRole('button', { name: 'Save' })
  await page.evaluate(() => {
    window.profileFixture?.changeElsewhere('Bea from the phone')
    if (window.profileFixture) window.profileFixture.holdNextRead = true
  })
  await field.fill('Ana')
  await save.click()
  // The PUT was refused as stale and the fresh GET is held: nothing may be saved over the revision known to be stale.
  await expect.poll(() => saves(page).then((sent) => sent.length)).toBe(1)
  await expect(save).toBeDisabled()
  await expect(field).toHaveAttribute('readonly', '')
  await expect(sheet.getByRole('status')).toHaveCount(0)
  await page.waitForTimeout(500)
  await expect(save).toBeDisabled()
  expect(await saves(page)).toHaveLength(1)
  await page.evaluate(() => window.profileFixture?.releaseRead())
  await expect(sheet.getByRole('status')).toHaveText(
    'Changed elsewhere to «Bea from the phone». Save to use yours instead.',
  )
  await expect(save).toBeEnabled()
})

test('profile · a save that takes long says so after six seconds, then says it saved', async ({ page }) => {
  const sheet = await openSheet(page)
  await page.evaluate(() => {
    if (window.profileFixture) window.profileFixture.slowNextSaveMs = 7500
  })
  await sheet.getByRole('textbox', { name: 'Name' }).fill('Ana')
  await sheet.getByRole('button', { name: 'Save' }).click()
  await expect(sheet.getByRole('button', { name: 'Saving…' })).toBeDisabled()
  await expect(sheet.getByText('Taking longer than usual.', { exact: false })).toBeVisible({ timeout: 7000 })
  await expect(sheet.getByRole('status').filter({ hasText: 'Saved.' })).toBeVisible({ timeout: 5000 })
  await expect(sheet.getByText('Taking longer than usual.', { exact: false })).toHaveCount(0)
})

test('profile · a server without profiles offers no «Your name», and the head keeps the address', async ({ page }) => {
  const menu = await openMenu(page, '&profile=none')
  await expect(menu.getByRole('menuitem', { name: 'Your personal data' })).toBeVisible()
  await expect(menu.getByRole('menuitem', { name: 'Your name' })).toHaveCount(0)
  await expect(menu.locator('.menu-head .account-name')).toHaveText('luis@sophia.test')
})

/** A control's box on screen; none fails the check. */
const boxOf = async (page: Page, name: string) => {
  const box = await page.getByRole('dialog', { name: 'Your name' }).getByRole('button', { name }).boundingBox()
  if (!box) throw new Error(`${name} is not on screen`)
  return box
}

test('profile · on a phone the sheet is reached from the menu and its controls take a finger @phone', async ({
  page,
}) => {
  const sheet = await openSheet(page)
  const field = sheet.getByRole('textbox', { name: 'Name' })
  await field.fill('Ana')
  // A pill takes 40 px under a finger, a ghost 36 (CONTRIBUTING, Touch).
  expect((await boxOf(page, 'Save')).height).toBeGreaterThanOrEqual(40)
  expect((await boxOf(page, 'Cancel')).height).toBeGreaterThanOrEqual(36)
  const inside = await field.evaluate((el) => {
    const r = el.getBoundingClientRect()
    return r.left >= 0 && r.right <= window.innerWidth
  })
  expect(inside).toBe(true)
  await sheet.getByRole('button', { name: 'Save' }).tap()
  await expect(sheet.getByRole('status')).toContainText('Saved.')
})

// The signed-in app: who is in changes, and the name read for the last account never shows for the next.
const APP = 'http://127.0.0.1:5198'
const SESSION_KEY = 'sb-127-auth-token'
interface Person {
  id: string
  email: string
}
const DAVIDE: Person = { id: '00000000-0000-4000-8000-00000000d001', email: 'davide@sophia.test' }
const LUIS: Person = { id: '00000000-0000-4000-8000-00000000e001', email: 'luis@sophia.test' }
const part = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url')

/** A synthetic session, unsigned: only the synthetic Auth service ever sees it (as e2e/app-auth.spec.ts's). */
function session(person: Person) {
  const exp = Math.floor(Date.now() / 1000) + 24 * 3600
  const claims = { sub: person.id, email: person.email, role: 'authenticated', aud: 'authenticated', exp }
  return {
    access_token: `${part({ alg: 'none', typ: 'JWT' })}.${part({ ...claims, is_anonymous: false })}.synthetic`,
    refresh_token: `synthetic-refresh-${person.id}`,
    token_type: 'bearer',
    expires_in: 24 * 3600,
    expires_at: exp,
    user: {
      id: person.id,
      aud: 'authenticated',
      role: 'authenticated',
      email: person.email,
      is_anonymous: false,
      app_metadata: { provider: 'email' },
      user_metadata: {},
      created_at: '2026-10-01T00:00:00Z',
    },
  }
}

async function appSignedIn(context: BrowserContext, person: Person) {
  await context.route(`${APP}/synthetic-auth/**`, (route) =>
    route.fulfill({ status: 404, json: { code: 404, msg: 'Synthetic Auth: nothing here' } }),
  )
  const page = await context.newPage()
  await page.goto(`${APP}/favicon.svg`)
  await page.evaluate(([key, signedIn]) => localStorage.setItem(key, JSON.stringify(signedIn)), [
    SESSION_KEY,
    session(person),
  ] as const)
  await page.goto(`${APP}/?work=lost`)
  return page
}

test('profile · another account signing in here never shows the last one’s name', async ({ context }) => {
  const page = await appSignedIn(context, DAVIDE)
  const account = page.getByRole('button', { name: 'Account' }).first()
  await expect(account).toBeVisible()
  // Davide names himself through the sheet, as a person would.
  await account.click()
  await page.getByRole('menu', { name: 'Account' }).getByRole('menuitem', { name: 'Your name' }).click()
  const sheet = page.getByRole('dialog', { name: 'Your name' })
  await sheet.getByRole('textbox', { name: 'Name' }).fill('Davide L.')
  await sheet.getByRole('button', { name: 'Save' }).click()
  await expect(sheet.getByRole('status')).toContainText('Saved.')
  await page.keyboard.press('Escape')
  await expect(sheet).toBeHidden()
  await account.click()
  const name = page.getByRole('menu', { name: 'Account' }).locator('.menu-head .account-name')
  await expect(name).toHaveText('Davide L.')
  await page.keyboard.press('Escape')
  // Luis signs in from another tab of this browser: Supabase's client tells this one.
  const other = await context.newPage()
  await other.goto(`${APP}/favicon.svg`)
  await other.evaluate(
    ([key, signedIn]) => {
      localStorage.setItem(key, JSON.stringify(signedIn))
      // oxlint-disable-next-line unicorn/require-post-message-target-origin -- a BroadcastChannel has no target origin
      new BroadcastChannel(key).postMessage({ event: 'SIGNED_IN', session: signedIn })
    },
    [SESSION_KEY, session(LUIS)] as const,
  )
  await other.close()
  await expect
    .poll(async () => {
      await account.click()
      const said = await name.textContent()
      await page.keyboard.press('Escape')
      return said
    })
    .toBe(LUIS.email)
  // Luis's own sheet reads his profile, empty: never the name Davide saved here.
  await account.click()
  await page.getByRole('menu', { name: 'Account' }).getByRole('menuitem', { name: 'Your name' }).click()
  await expect(page.getByRole('dialog', { name: 'Your name' }).getByRole('textbox', { name: 'Name' })).toHaveValue('')
})

test('profile · another account coming in closes the sheet: nothing typed for one is saved for the next', async ({
  context,
}) => {
  const page = await appSignedIn(context, DAVIDE)
  const account = page.getByRole('button', { name: 'Account' }).first()
  await account.click()
  await page.getByRole('menu', { name: 'Account' }).getByRole('menuitem', { name: 'Your name' }).click()
  const sheet = page.getByRole('dialog', { name: 'Your name' })
  await sheet.getByRole('textbox', { name: 'Name' }).fill('Davide typed this')
  const other = await context.newPage()
  await other.goto(`${APP}/favicon.svg`)
  await other.evaluate(
    ([key, signedIn]) => {
      localStorage.setItem(key, JSON.stringify(signedIn))
      // oxlint-disable-next-line unicorn/require-post-message-target-origin -- a BroadcastChannel has no target origin
      new BroadcastChannel(key).postMessage({ event: 'SIGNED_IN', session: signedIn })
    },
    [SESSION_KEY, session(LUIS)] as const,
  )
  await other.close()
  await expect(sheet).toBeHidden()
  expect(await saves(page)).toEqual([])
})
