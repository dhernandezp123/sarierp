import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'

const root = process.cwd()
const expectedProject = 'fwspgdzvlbtbgiupvrzo'
const linked = fs.readFileSync('supabase/.temp/project-ref', 'utf8').trim()
if (linked !== expectedProject) throw new Error('Unexpected linked project; no release package prepared')
const target = path.resolve(root, '.ua/intermediate/audit-production-package-v2')
if (!target.startsWith(path.join(root, '.ua', 'intermediate') + path.sep)) throw new Error('Invalid package path')
const migrations = path.join(target, 'supabase/migrations')
fs.mkdirSync(migrations, { recursive: true })
if (fs.readdirSync(migrations).length) throw new Error('Package already exists; review it rather than overwriting SQL')
const excluded = '20261002120000_sari_outlook_intake.sql'
const files = fs.readdirSync('supabase/migrations').filter(file => file.endsWith('.sql') && file !== excluded).sort()
const expectedNew = files.filter(file => /^2026101[34]/.test(file))
if (expectedNew.length !== 16 || !expectedNew.at(-1).includes('154000')) throw new Error('Unexpected audit migration inventory')
const manifest = []
for (const file of files) {
  const bytes = fs.readFileSync(path.join('supabase/migrations', file))
  fs.writeFileSync(path.join(migrations, file), bytes)
  manifest.push({ file, sha256: createHash('sha256').update(bytes).digest('hex') })
}
fs.copyFileSync('supabase/config.toml', path.join(target, 'supabase/config.toml'))
fs.cpSync('supabase/.temp', path.join(target, 'supabase/.temp'), { recursive: true })
fs.writeFileSync(path.join(target, 'manifest.json'), JSON.stringify({ project: linked, excluded, migrations: manifest }, null, 2) + '\n')
console.log(`Prepared ${files.length} migrations, ${expectedNew.length} audit changes; Outlook excluded. No database mutation.`)
