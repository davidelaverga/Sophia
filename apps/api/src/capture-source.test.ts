import assert from 'node:assert/strict'
import { it } from 'node:test'
import { captureSourceId } from './capture-source.ts'

it('binds an immutable capture source to every authorized identity, including the lease generation', () => {
  const project = '00000000-0000-4000-8000-000000000001'
  const job = '00000000-0000-4000-8000-000000000002'
  const lease = '00000000-0000-4000-8000-000000000003'
  const name = 'desktop.overview.png'
  const source = captureSourceId(project, job, lease, name)
  assert.equal(source, '9ceb4919-b443-817c-938f-4d58250bff31', 'persistent identity encoding must stay compatible')
  assert.match(source, /^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u)
  assert.equal(captureSourceId(project, job, lease, name), source)
  const other = '00000000-0000-4000-8000-000000000004'
  const changed = [
    captureSourceId(other, job, lease, name),
    captureSourceId(project, other, lease, name),
    captureSourceId(project, job, other, name),
    captureSourceId(project, job, lease, 'phone.overview.png'),
  ]
  assert.equal(new Set([source, ...changed]).size, 5)
})
