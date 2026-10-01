import assert from 'node:assert/strict'
import test from 'node:test'
import ts from 'typescript'
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'

const file = path.resolve('src/lib/user-tasks.ts')
const source = fs.readFileSync(file, 'utf8')
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText.replace("require(\"@/src/lib/format\")", "require('./format')")

const taskModule = { exports: {} }
vm.runInNewContext(compiled, {
  module: taskModule,
  exports: taskModule.exports,
  require(specifier) {
    if (specifier === './format') {
      return {
        calendarDaysUntil(value, today = new Date()) {
          if (!value) return null
          const current = new Date(today.getFullYear(), today.getMonth(), today.getDate())
          const [year, month, day] = value.split('-').map(Number)
          return Math.round((new Date(year, month - 1, day) - current) / 86400000)
        },
      }
    }
    throw new Error(`Unexpected import: ${specifier}`)
  },
  URL,
})

const { filterUserTasks, isUserTaskOverdue, userTaskSourceHref } = taskModule.exports

const baseTask = {
  id: '1', title: 'Tarea', notes: null, status: 'Pendiente', priority: 'Media',
  due_date: '2026-09-17', entity_type: 'agent', entity_id: 'agent-1',
  entity_label: 'Agente', source_module: 'agents', source_path: '/agents/agent-1',
  completed_at: null, updated_at: null,
}

test('las vistas de tareas separan pendientes, vencidas y completadas', () => {
  const today = new Date(2026, 8, 18, 12)
  const completed = { ...baseTask, id: '2', status: 'Completada' }
  assert.equal(isUserTaskOverdue(baseTask, today), true)
  assert.deepEqual(filterUserTasks([baseTask, completed], 'pending', today).map((row) => row.id), ['1'])
  assert.deepEqual(filterUserTasks([baseTask, completed], 'overdue', today).map((row) => row.id), ['1'])
  assert.deepEqual(filterUserTasks([baseTask, completed], 'completed', today).map((row) => row.id), ['2'])
})

test('los enlaces de contexto aceptan solo rutas internas del tipo esperado', () => {
  assert.equal(userTaskSourceHref(baseTask), '/agents/agent-1')
  assert.equal(userTaskSourceHref({ ...baseTask, source_path: '//evil.test/agents/1' }), null)
  assert.equal(userTaskSourceHref({ ...baseTask, source_path: '/invoicing/1' }), null)
  assert.equal(userTaskSourceHref({ ...baseTask, source_path: '/agents/1?tab=lanes#rates' }), '/agents/1?tab=lanes#rates')
})
