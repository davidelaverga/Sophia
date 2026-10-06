#!/usr/bin/env node
// WBC-02 (WBC-02-CX-0032 §2): one memory sample of a running container, from its own cgroup v2 on the host:
//   node scripts/paperclip-image-cgroup.mjs <container> <label> <samples.jsonl>
// The cgroup is resolved from the container's process (/proc/<pid>/cgroup); the systemd scope path docker usually
// uses is only a fallback, and the record says which was read. Each record carries memory.max, memory.swap.max,
// memory.peak (since the cgroup was created, so per start), memory.current, memory.events and docker's OOMKilled. A file
// that cannot be read is listed under `unavailable` and never guessed: the receipt then cannot call memory qualified.
// `docker stats` is recorded beside it as auxiliary evidence only.
import { execFileSync } from 'node:child_process'
import { appendFileSync, readFileSync } from 'node:fs'

const [container, label, out] = process.argv.slice(2)
if (!container || !label || !out) throw new Error('usage: paperclip-image-cgroup.mjs <container> <label> <samples.jsonl>')

const docker = (...args) => execFileSync('docker', args, { encoding: 'utf8', timeout: 20_000 }).trim()

/** A cgroup file's text: read directly, else through sudo -n (the runner's cgroup files can be root-only). */
function readCgroupFile(path) {
  try {
    return readFileSync(path, 'utf8').trim()
  } catch {
    return execFileSync('sudo', ['-n', 'cat', path], { encoding: 'utf8', timeout: 10_000 }).trim()
  }
}

function cgroupDir(pid, id) {
  if (pid > 0) {
    const line = readFileSync(`/proc/${pid}/cgroup`, 'utf8')
      .split('\n')
      .find((l) => l.startsWith('0::'))
    if (line) return { dir: `/sys/fs/cgroup${line.slice(3)}`, source: 'process' }
  }
  return { dir: `/sys/fs/cgroup/system.slice/docker-${id}.scope`, source: 'scope-guess' }
}

const record = { label, at: new Date().toISOString(), unavailable: [] }
try {
  const state = JSON.parse(docker('inspect', '--format', '{{json .State}}', container))
  const id = docker('inspect', '--format', '{{.Id}}', container)
  record.running = state.Running === true
  record.oomKilled = state.OOMKilled === true
  const { dir, source } = cgroupDir(Number(state.Pid ?? 0), id)
  record.cgroup = { path: dir.replace('/sys/fs/cgroup', ''), source }
  for (const [key, file] of [
    ['max', 'memory.max'],
    ['swapMax', 'memory.swap.max'],
    ['peak', 'memory.peak'],
    ['current', 'memory.current'],
    ['events', 'memory.events'],
  ]) {
    try {
      const text = readCgroupFile(`${dir}/${file}`)
      record[key] =
        key === 'events'
          ? Object.fromEntries(text.split('\n').map((l) => l.split(' ')).map(([k, v]) => [k, Number(v)]))
          : /^\d+$/.test(text)
            ? Number(text)
            : text
    } catch {
      record.unavailable.push(file)
    }
  }
} catch (error) {
  record.unavailable.push('container')
  record.error = String(error?.message ?? error).slice(0, 300)
}
try {
  record.dockerStats = JSON.parse(docker('stats', '--no-stream', '--format', '{{json .}}', container))
} catch {
  record.dockerStats = null
}
appendFileSync(out, `${JSON.stringify(record)}\n`)
const mib = (n) => (typeof n === 'number' ? `${Math.round(n / 1048576)} MiB` : String(n))
console.log(
  `[cgroup] ${label}: max ${mib(record.max)}, swap.max ${record.swapMax}, peak ${mib(record.peak)}, current ${mib(record.current)}, ` +
    `oom_kill ${record.events?.oom_kill ?? '?'}, OOMKilled ${record.oomKilled}, unavailable [${record.unavailable.join(', ')}]`,
)
