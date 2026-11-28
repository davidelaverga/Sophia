import { randomUUID } from 'node:crypto'
import { expect, test, type Page } from '@playwright/test'
import { parseConversationInputRecorded, parseConversationInputStarted } from '@sophia/contracts/validate'
import { owner, PROJECT, seedReport, setMember, subOf, tokenOf } from './support/tasks-served.ts'

test.skip(process.env.SOPHIA_CONVERSATION_INPUT_ADDRESSING !== 'on', 'Requires addressed inputs on the disposable API')

const actor = 'Davide'
const token = tokenOf(actor)
const member = subOf(token)
const START = '/api/v1/projects/' + PROJECT + '/conversation-inputs/addressed'
const tab = `sophia.held.v1:${JSON.stringify([member, 'talk', PROJECT])}`
const contract = { interactionContract: 'automatic_v1', addressingVersion: 1, mentions: [] } as const

async function mode(state: 'enabled' | 'read_only') {
  await owner('SELECT sophia.set_conversation_settings($1, $2, $3)', [PROJECT, state, 'Synthetic held recovery'])
}

function requestOf(key: string, data: unknown) {
  return { headers: { authorization: `Bearer ${token}`, 'idempotency-key': key }, data }
}

async function recordedInTab(page: Page, versionId?: string) {
  const title = `Synthetic question ${randomUUID()}`
  const version = versionId ? { artifactVersionId: versionId } : {}
  const start = { key: randomUUID(), ask: { title, text: title, askSophia: false, addressingVersion: 1, ...version } }
  const body = { ...contract, title, text: title, ...version }
  const started = await page.request.post(START, requestOf(start.key, body))
  expect(started.status()).toBe(202)
  const startResult = parseConversationInputStarted(await started.json())
  const id = startResult.conversation.id
  const path = `/api/v1/conversations/${id}/inputs/addressed`
  const send = {
    key: randomUUID(),
    ask: {
      text: 'A synthetic reply',
      askSophia: false,
      addressingVersion: 1,
      replyToMessageId: startResult.message.id,
      ...version,
    },
  }
  const sendBody = { ...contract, text: send.ask.text, replyToMessageId: send.ask.replyToMessageId, ...version }
  const sent = await page.request.post(path, requestOf(send.key, sendBody))
  expect(sent.status()).toBe(202)
  const sendResult = parseConversationInputRecorded(await sent.json())
  await page.addInitScript(
    ({ key, value, name }) => {
      sessionStorage.setItem('sophia.dev.identity', name)
      if (sessionStorage.getItem('synthetic-held-seeded') !== null) return
      sessionStorage.setItem('synthetic-held-seeded', '1')
      sessionStorage.setItem(key, value)
    },
    { name: actor, key: tab, value: JSON.stringify({ '#start': start, [id]: send }) },
  )
  return { start, send, startResult, sendResult, body, sendBody, path }
}

async function noFresh(page: Page) {
  await expect(page.getByRole('button', { name: 'New conversation' })).toHaveCount(0)
  await expect(page.getByRole('form', { name: 'New conversation' })).toHaveCount(0)
  await expect(page.getByRole('form', { name: 'Continue this conversation' })).toHaveCount(0)
}

test('read-only writer · exact Start and Send receipts are recoverable without a fresh composer', async ({ page }) => {
  await mode('enabled')
  const { versionId } = await seedReport('heldrecovery')
  const prior = await recordedInTab(page, versionId)
  await mode('read_only')
  try {
    await owner(
      'SELECT sophia.mission_erase_source(project_id, source_id) FROM sophia.artifact_versions WHERE project_id = $1 AND id = $2',
      [PROJECT, versionId],
    )
    await page.goto(`/p/${PROJECT}/conversations`)
    const start = page.getByRole('button', { name: 'Retry Start' })
    const send = page.getByRole('button', { name: 'Retry Send' })
    await expect(start).toBeVisible()
    await expect(send).toBeVisible()
    await expect(page.getByText('Pond survey heldrecovery', { exact: false })).toHaveCount(0)
    await noFresh(page)
    const started = page.waitForResponse((res) => res.url().endsWith(START) && res.request().method() === 'POST')
    await start.click()
    const startResponse = await started
    expect(startResponse.request().headers()['idempotency-key']).toBe(prior.start.key)
    expect(startResponse.request().postDataJSON()).toEqual(prior.body)
    expect(parseConversationInputStarted(await startResponse.json())).toMatchObject({
      conversation: { id: prior.startResult.conversation.id },
      input: prior.startResult.input,
      message: prior.startResult.message,
    })
    const sent = page.waitForResponse((res) => res.url().endsWith(prior.path) && res.request().method() === 'POST')
    await send.click()
    const sendResponse = await sent
    expect(sendResponse.request().headers()['idempotency-key']).toBe(prior.send.key)
    expect(sendResponse.request().postDataJSON()).toEqual(prior.sendBody)
    expect(parseConversationInputRecorded(await sendResponse.json())).toEqual(prior.sendResult)
    await expect(send).toHaveCount(0)
    await expect(start).toHaveCount(0)
    await expect(page.getByText('The previous request was refused.', { exact: true })).toHaveCount(0)
    await expect.poll(() => page.evaluate((key) => sessionStorage.getItem(key), tab)).toBeNull()
    await noFresh(page)
  } finally {
    await mode('enabled')
  }
})

test('read-only definitive refusal remains visible after the held request clears', async ({ page }) => {
  await mode('enabled')
  const prior = await recordedInTab(page)
  await mode('read_only')
  try {
    const privateWords = 'Synthetic private refusal details'
    await page.route(
      (url) => [START, prior.path].includes(url.pathname),
      (route) =>
        route.fulfill({
          status: 422,
          json: { code: 'invalid_request', message: privateWords, retry: 'never', requestId: randomUUID() },
        }),
    )
    await page.goto(`/p/${PROJECT}/conversations`)
    for (const [label, region] of [
      ['Retry Start', 'All conversations'],
      ['Retry Send', 'Open conversation'],
    ] as const) {
      const pane = page.getByRole('region', { name: region })
      const retry = pane.getByRole('button', { name: label })
      await retry.click()
      await expect(retry).toHaveCount(0)
      await expect(pane.getByRole('alert')).toHaveText('The previous request was refused.')
    }
    await expect(page.getByText(privateWords, { exact: false })).toHaveCount(0)
    await expect.poll(() => page.evaluate((key) => sessionStorage.getItem(key), tab)).toBeNull()
    await noFresh(page)
  } finally {
    await mode('enabled')
  }
})

for (const access of ['viewer', 'revoked'] as const) {
  test(`read-only ${access} · held addressed writes do not offer recovery`, async ({ page }) => {
    await mode('enabled')
    const prior = await recordedInTab(page)
    await mode('read_only')
    try {
      await setMember(member, access === 'viewer' ? { role: 'viewer' } : { active: false })
      await page.goto(`/p/${PROJECT}/conversations`)
      if (access === 'viewer')
        await expect(page.getByRole('heading', { name: prior.start.ask.title, exact: true })).toBeVisible()
      else await expect(page.getByRole('heading', { name: 'No access to this project' })).toBeVisible()
      await expect(page.getByRole('button', { name: 'Retry Start' })).toHaveCount(0)
      await expect(page.getByRole('button', { name: 'Retry Send' })).toHaveCount(0)
      await noFresh(page)
    } finally {
      await setMember(member, { active: true, role: 'editor' })
      await mode('enabled')
    }
  })
}
