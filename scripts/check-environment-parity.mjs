import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'

// Read-only comparison: never reads env files, credentials or remote datasets.
const [source = 'main', target = '.demo-sync'] = process.argv.slice(2)
const manifest = JSON.parse(fs.readFileSync(new URL('../docs/quality/environment-parity.json', import.meta.url), 'utf8'))
const workingTree = source === 'WORKTREE'
const files = [...new Set(execFileSync('git', workingTree ? ['ls-files','--cached','--others','--exclude-standard','--','src','supabase/migrations'] : ['ls-tree', '-r', '--name-only', source, '--', 'src', 'supabase/migrations'], { encoding:'utf8' }).trim().split('\n'))]
const hash = text => createHash('sha256').update(text.replace(/\r\n/g,'\n')).digest('hex')
const differences = [], expected = []
for (const file of files) {
  const destination = path.join(target, file)
  if (!fs.existsSync(destination)) { differences.push({ file, reason:'Missing shared file' }); continue }
  const a = hash(workingTree ? fs.readFileSync(file,'utf8') : execFileSync('git', ['show', `${source}:${file}`], {encoding:'utf8',maxBuffer:8*1024*1024}))
  const b = hash(fs.readFileSync(destination,'utf8'))
  if (a === b) continue
  const variant = manifest.variants[file]
  if (variant?.source_sha256 === a && variant?.trial_sha256 === b) expected.push({file,reason:variant.reason})
  else differences.push({file,reason:'Unreviewed difference or outdated reviewed variant'})
}
const shared = new Set(files)
function walk(directory) {
  return fs.readdirSync(path.join(target,directory),{withFileTypes:true}).flatMap(item=>item.isDirectory()?walk(`${directory}/${item.name}`):[`${directory}/${item.name}`])
}
for (const file of walk('src')) if (!shared.has(file) && !manifest.trial_only_source.includes(file)) differences.push({file,reason:'Unreviewed Trial-only source'})
console.log(JSON.stringify({source,target,sharedFiles:files.length,reviewedVariants:expected.length,differences},null,2))
if (differences.length) process.exitCode = 1
