// Home's guided first run (docs/plans/home-first-run.md): the first time, with no projects, three short steps under the
// greeting, each one skippable. Its fixture page is Home's (fixtures/home.tsx): `first=new` (a name not chosen yet) or
// `first=named` (chosen), over `projects=none`; the rest of its switches are first-run-api.ts's. The profile's save and
// the project's creation are answered as the API would, and recorded in `homeFixture.pressed`. «Your projects» is the
// index's own name (Welcome.tsx's `aria-label`).
import { expect, test, type Page } from '@playwright/test'

const CREATED = '00000000-0000-4000-8000-0000000000f1'
const pressed = (page: Page) => page.evaluate(() => window.homeFixture?.pressed ?? [])
const step = (page: Page, title: string) => page.getByRole('region', { name: title })
const NAME = 'What should people in your projects call you?'
const HOW = 'Will you work on your own or with a team?'
const PROJECT = 'Name your first project'
const TITLES = [NAME, HOW, PROJECT]
/** Home as it is today with no projects: her line, and «Start a project» in the index. */
async function homeAsToday(page: Page) {
  for (const title of TITLES) await expect(step(page, title)).toHaveCount(0)
  await expect(page.getByRole('textbox', { name: 'Say something to Sophia' })).toBeVisible()
  await expect(
    page.getByRole('list', { name: 'Your projects' }).getByRole('button', { name: /Start a project/ }),
  ).toBeVisible()
}

test('home first run · name, a team, the project: saved, created, opened with Invite people', async ({ page }) => {
  await page.goto('/home.html?projects=none&first=new')
  const name = step(page, NAME)
  await expect(name).toBeVisible()
  const field = name.getByRole('textbox', { name: 'Your name' })
  await expect(field).toHaveValue('Luis Pérez')
  await field.fill('Luis')
  await field.press('Enter')
  const how = step(page, HOW)
  await expect(how.getByRole('heading', { name: HOW })).toBeFocused()
  await expect(name).toHaveCount(0)
  await expect(how.getByRole('button', { name: /On my own/ })).toContainText(
    'A project for you and Sophia. You can invite people later.',
  )
  await how.getByRole('button', { name: /With a team/ }).click()
  const project = step(page, PROJECT)
  await expect(project.getByRole('heading', { name: PROJECT })).toBeFocused()
  const title = project.getByRole('textbox', { name: 'Project name' })
  await title.fill('Onboarding pilot')
  await title.press('Enter')
  await expect
    .poll(() => pressed(page))
    .toEqual(['name Luis', 'create Onboarding pilot', `open ${CREATED}`, `invite ${CREATED}`])
  // Ended: the next load is Home as today.
  await page.reload()
  await homeAsToday(page)
})

test('home first run · a chosen name is not asked again; on your own, no Invite', async ({ page }) => {
  await page.goto('/home.html?projects=none&first=named')
  await expect(step(page, HOW)).toBeVisible()
  await expect(step(page, NAME)).toHaveCount(0)
  await step(page, HOW)
    .getByRole('button', { name: /On my own/ })
    .click()
  await step(page, PROJECT).getByRole('textbox', { name: 'Project name' }).fill('Notes')
  await step(page, PROJECT).getByRole('button', { name: 'Start the project' }).click()
  await expect.poll(() => pressed(page)).toEqual(['create Notes', `open ${CREATED}`])
})

test('home first run · every step skips; «Not now» leaves Home as today, for good', async ({ page }) => {
  await page.goto('/home.html?projects=none&first=new')
  await step(page, NAME).getByRole('button', { name: 'Skip' }).click()
  await expect(step(page, HOW).getByRole('heading', { name: HOW })).toBeFocused()
  await step(page, HOW).getByRole('button', { name: 'Skip' }).click()
  await expect(step(page, PROJECT).getByRole('heading', { name: PROJECT })).toBeFocused()
  await step(page, PROJECT).getByRole('button', { name: 'Not now, just talk to Sophia' }).click()
  await homeAsToday(page)
  expect(await pressed(page)).toEqual([])
  await page.reload()
  await homeAsToday(page)
})

test('home first run · Escape never traps: it ends the first run, the focus on You and Sophia', async ({ page }) => {
  await page.goto('/home.html?projects=none&first=new')
  await step(page, NAME).getByRole('textbox', { name: 'Your name' }).focus()
  await page.keyboard.press('Escape')
  await homeAsToday(page)
  await expect(page.getByRole('heading', { name: 'You and Sophia' })).toBeFocused()
  await page.reload()
  await homeAsToday(page)
})

test('home first run · never with projects, active or archived', async ({ page }) => {
  await page.goto('/home.html?first=new')
  await expect(page.getByRole('list', { name: 'Your projects' })).toBeVisible()
  for (const title of TITLES) await expect(step(page, title)).toHaveCount(0)
  await page.goto('/home.html?projects=none&first=new&archived=1')
  await homeAsToday(page)
})

test('home first run · on a phone it fits: one column, nothing sideways @phone', async ({ page }) => {
  await page.goto('/home.html?projects=none&first=named')
  await expect(step(page, HOW)).toBeVisible()
  const wide = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(wide).toBeLessThanOrEqual(0)
  const [alone, team] = await Promise.all([
    step(page, HOW)
      .getByRole('button', { name: /On my own/ })
      .boundingBox(),
    step(page, HOW)
      .getByRole('button', { name: /With a team/ })
      .boundingBox(),
  ])
  // Stacked: the second choice under the first.
  expect(team?.y ?? 0).toBeGreaterThanOrEqual((alone?.y ?? 0) + (alone?.height ?? 0))
})

test('home first run · under reduced motion a step arrives still', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/home.html?projects=none&first=named')
  const region = step(page, HOW)
  await expect(region).toBeVisible()
  await expect(region).toHaveCSS('animation-name', 'none')
})

// The review's cases (first-run-api.ts's switches): refusals, no reply, a name changed elsewhere, a server with no
// profile, a read that fails, what waits while it is read, races with Skip and Escape, another tab, a project arriving.
const nameField = (page: Page) => step(page, NAME).getByRole('textbox', { name: 'Your name' })
const release = (page: Page) => page.evaluate(() => window.homeFixture?.firstRelease())
const puts = (page: Page) => page.evaluate(() => window.homeFixture?.firstPuts() ?? [])

test('home first run · a name refused is said in place, in the profile’s words, and the step stays', async ({
  page,
}) => {
  await page.goto('/home.html?projects=none&first=new&save=refuse')
  await nameField(page).fill('Luis')
  await nameField(page).press('Enter')
  await expect(step(page, NAME)).toContainText('That name can’t be used. Try letters, numbers and spaces.')
  await expect(step(page, NAME)).toBeVisible()
  expect(await pressed(page)).toEqual([])
})

test('home first run · a name problem describes the field, said politely', async ({ page }) => {
  await page.goto('/home.html?projects=none&first=new')
  await nameField(page).fill('luis@sophia.test')
  await expect(nameField(page)).toHaveAccessibleDescription('A name, not an email address.')
  await expect(step(page, NAME).getByText('A name, not an email address.')).toHaveAttribute('aria-live', 'polite')
})

test('home first run · no reply: the name held as sent, one Try again, the same key', async ({ page }) => {
  await page.goto('/home.html?projects=none&first=new&save=noreply')
  await nameField(page).fill('Luis')
  await nameField(page).press('Enter')
  await expect(step(page, NAME)).toContainText('Sophia didn’t answer.')
  await expect(nameField(page)).not.toBeEditable()
  const again = step(page, NAME).getByRole('button', { name: 'Try again' })
  await expect(again).toHaveCount(1)
  await again.click()
  await expect(step(page, HOW).getByRole('heading', { name: HOW })).toBeFocused()
  expect(await pressed(page)).toEqual(['name Luis'])
  const [first, second] = await puts(page)
  expect(second).toBe(first)
})

test('home first run · a name changed elsewhere is said as «Your name» says it, and saves over it', async ({
  page,
}) => {
  await page.goto('/home.html?projects=none&first=new&save=stale')
  await nameField(page).fill('Luis')
  await nameField(page).press('Enter')
  await expect(step(page, NAME)).toContainText('Changed elsewhere to «Luis P.». Save to use yours instead.')
  await expect(step(page, NAME)).not.toContainText('The profile changed')
  await expect(nameField(page)).toHaveValue('Luis')
  await step(page, NAME).getByRole('button', { name: 'Continue' }).click()
  await expect(step(page, HOW)).toBeVisible()
  expect(await pressed(page)).toEqual(['name Luis'])
  expect((await puts(page)).map((p) => p.split(' ')[1])).toEqual(['r1', 'r2'])
})

test('home first run · a server with no profile to change: no name asked', async ({ page }) => {
  await page.goto('/home.html?projects=none&first=new&profile=404')
  await expect(step(page, HOW)).toBeVisible()
  await expect(step(page, NAME)).toHaveCount(0)
})

test('home first run · the archived read failing: nothing is guessed, Home as today', async ({ page }) => {
  await page.goto('/home.html?projects=none&first=new&archived=fail')
  await homeAsToday(page)
})

test('home first run · while it can’t tell yet, the place under the greeting is held, never Home swapped', async ({
  page,
}) => {
  await page.goto('/home.html?projects=none&first=new&profile=hold')
  await expect(page.locator('.hw-first-held')).toBeAttached()
  await expect(page.getByRole('textbox', { name: 'Say something to Sophia' })).toHaveCount(0)
  await expect(page.getByRole('list', { name: 'Your projects' })).toHaveCount(0)
  await release(page)
  await expect(step(page, NAME)).toBeVisible()
  await expect(page.locator('.hw-first-held')).toHaveCount(0)
})

test('home first run · while the name is saved, Skip waits; saved, it moves on', async ({ page }) => {
  await page.goto('/home.html?projects=none&first=new&save=hold')
  await nameField(page).fill('Luis')
  await nameField(page).press('Enter')
  await expect(step(page, NAME).getByRole('button', { name: 'Skip' })).toBeDisabled()
  await release(page)
  await expect(step(page, HOW).getByRole('heading', { name: HOW })).toBeFocused()
  expect(await pressed(page)).toEqual(['name Luis'])
})

test('home first run · ended while the project is created: nothing opens, the projects are read again', async ({
  page,
}) => {
  await page.goto('/home.html?projects=none&first=named&create=hold')
  await step(page, HOW)
    .getByRole('button', { name: /On my own/ })
    .click()
  await step(page, PROJECT).getByRole('textbox', { name: 'Project name' }).fill('Notes')
  await step(page, PROJECT).getByRole('button', { name: 'Start the project' }).click()
  await page.keyboard.press('Escape')
  await homeAsToday(page)
  await release(page)
  await expect.poll(() => pressed(page)).toEqual(['create Notes', `added ${CREATED}`])
})

test('home first run · Escape ends it with the focus on the page, and never while a word is composed', async ({
  page,
}) => {
  await page.goto('/home.html?projects=none&first=new')
  await expect(step(page, NAME)).toBeVisible()
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, isComposing: true }))
  })
  await expect(step(page, NAME)).toBeVisible()
  await page.keyboard.press('Escape')
  await homeAsToday(page)
})

test('home first run · ended in another tab, it ends in this one', async ({ page, context }) => {
  await page.goto('/home.html?projects=none&first=new')
  await expect(step(page, NAME)).toBeVisible()
  const other = await context.newPage()
  await other.goto('/home.html?projects=none&first=new')
  await step(other, NAME).getByRole('textbox', { name: 'Your name' }).press('Escape')
  await homeAsToday(other)
  await homeAsToday(page)
})

test('home first run · a project arriving while it shows ends it for good', async ({ page }) => {
  await page.goto('/home.html?projects=none&first=new')
  await expect(step(page, NAME)).toBeVisible()
  await page.evaluate(() => window.homeFixture?.reread('four'))
  await expect(page.getByRole('list', { name: 'Your projects' })).toBeVisible()
  for (const title of TITLES) await expect(step(page, title)).toHaveCount(0)
  await page.goto('/home.html?projects=none&first=new')
  await homeAsToday(page)
})
