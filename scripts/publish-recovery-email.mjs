import { readFile } from 'node:fs/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { resolve } from 'node:path'

const root = fileURLToPath(new URL('../', import.meta.url))

// Only these fields may be patched. Never publish the local Auth/SMTP defaults.
export function recoveryAuthPatch(current, html, subject) {
  if (subject !== 'Restablece tu contraseña' || /[\u00c2\u00c3\ufffd]/u.test(html)) {
    throw Error('Recovery email encoding is invalid; use UTF-8 source files')
  }
  const callbacks = [...html.matchAll(/eq \.RedirectTo "([^"]+)"/g)].map(match => match[1])
  if (!callbacks.length) throw Error('Recovery template has no tenant callbacks')
  for (const callback of callbacks) {
    const url = new URL(callback)
    if (url.protocol !== 'https:' || url.username || url.password || url.port || url.hash
      || url.pathname !== '/auth/callback' || url.search !== '?next=/portal/reset-password'
      || !/^[a-z0-9-]+\.forwarders\.app$/.test(url.hostname)) {
      throw Error('Unexpected tenant recovery callback')
    }
  }
  if ((html.match(/href="{{ \.ConfirmationURL }}"/g) || []).length !== 2
    || html.includes('>{{ .ConfirmationURL }}</a>')) {
    throw Error('Both recovery links must use Auth; the token must not appear as visible text')
  }
  const existing = (current.uri_allow_list || '').split(',').map(value => value.trim()).filter(Boolean)
  return {
    mailer_subjects_recovery: subject,
    mailer_templates_recovery_content: html,
    uri_allow_list: [...new Set([...existing, ...callbacks])].join(','),
  }
}

async function main() {
  if (process.argv.slice(2).some(arg => arg !== '--apply')) throw Error('Usage: node scripts/publish-recovery-email.mjs [--apply]')
  const token = process.env.SUPABASE_ACCESS_TOKEN
  if (!token) throw Error('Set SUPABASE_ACCESS_TOKEN using the authenticated operator session')
  const project = (await readFile(resolve(root, 'supabase/.temp/project-ref'), 'utf8')).trim()
  if (!/^[a-z]{20}$/.test(project)) throw Error('Invalid linked project reference')
  const config = await readFile(resolve(root, 'supabase/config.toml'), 'utf8')
  const section = config.match(/\[auth\.email\.template\.recovery\]([^]*?)(?=\n\[|$)/)?.[1]
  const subject = JSON.parse(section?.match(/^subject\s*=\s*(".*")\s*$/m)?.[1] || 'null')
  const html = await readFile(resolve(root, 'supabase/templates/recovery.html'), 'utf8')
  const endpoint = `https://api.supabase.com/v1/projects/${project}/config/auth`
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json; charset=utf-8' }
  const request = async options => {
    const response = await fetch(endpoint, { headers, ...options, signal: AbortSignal.timeout(30000) })
    if (!response.ok) throw Error(`Auth configuration request failed (${response.status})`)
    return response.json()
  }
  const before = await request()
  const patch = recoveryAuthPatch(before, html, subject)
  if (!process.argv.includes('--apply')) {
    console.log(JSON.stringify({ project, subject, callbacks: patch.uri_allow_list.split(','), apply: false }))
    return
  }
  await request({ method: 'PATCH', body: JSON.stringify(patch) })
  const after = await request()
  for (const [field, value] of Object.entries(patch)) {
    if (after[field] !== value) throw Error(`Auth verification failed: ${field}`)
  }
  for (const field of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (!(field in patch) && JSON.stringify(before[field]) !== JSON.stringify(after[field])) {
      throw Error(`Unrelated Auth configuration changed: ${field}`)
    }
  }
  console.log(JSON.stringify({ project, subject, apply: true, verified: true, unrelatedSettingsUnchanged: true }))
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main().catch(error => { console.error(error.message); process.exitCode = 1 })
}
