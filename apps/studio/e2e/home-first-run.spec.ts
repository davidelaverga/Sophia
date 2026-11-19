// Home's guided first run (docs/plans/home-first-run.md): the first time, with no projects, three short steps under the
// greeting, each one skippable. Its fixture page is Home's (fixtures/home.tsx): `first=new` (a name not chosen yet) or
// `first=named` (chosen), over `projects=none`; `archived=1` keeps one archived project. The profile's save and the
// project's creation are answered as the API would, and recorded in `homeFixture.pressed`.
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
