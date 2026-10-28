import loadTs from './load-ts.mjs'
import { createContext } from 'react'

export function mountPage(entry, mocks = {}, { exported = 'default', props = {}, unwrap } = {}) {
  const hooks = [], effects = []
  let cursor = 0, tree
  const same = (a, b) => a?.length === b?.length && a.every((value, index) => Object.is(value, b[index]))
  const react = {
    createContext,
    useId() { const index = cursor++; hooks[index] ||= { value: `test-id-${index}` }; return hooks[index].value },
    useState(initial) {
      const index = cursor++
      hooks[index] ||= { value: typeof initial === 'function' ? initial() : initial }
      return [hooks[index].value, value => { hooks[index].value = typeof value === 'function' ? value(hooks[index].value) : value }]
    },
    useRef(current) { const index = cursor++; return hooks[index] ||= { current } },
    useCallback(value, deps) { const index = cursor++; if (!hooks[index] || !same(hooks[index].deps, deps)) hooks[index] = { value, deps }; return hooks[index].value },
    useMemo(fn, deps) { const index = cursor++; if (!hooks[index] || !same(hooks[index].deps, deps)) hooks[index] = { value: fn(), deps }; return hooks[index].value },
    useEffect(fn, deps) {
      const index = cursor++
      if (!hooks[index] || !same(hooks[index].deps, deps)) {
        hooks[index]?.cleanup?.(); hooks[index] = { deps }
        effects.push(() => { hooks[index].cleanup = fn() })
      }
    },
  }
  const tags = names => Object.fromEntries(names.map(name => [name, name]))
  const router = { push() {}, replace() {} }
  const entryComponent = loadTs(entry, {
    react, 'react/jsx-runtime': { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) },
    'next/navigation': { useRouter: () => router, useSearchParams: () => new URLSearchParams(), usePathname: () => '/test' },
    'next/link': 'a', 'next/image': 'img',
    '@/src/components/ui/NumberInput': { NumberInput: 'input' },
    '@/src/components/ui/CompactSelect': { CompactSelect: 'CompactSelect' },
    '@/src/components/ui/table': tags(['Table','TableBody','TableCell','TableHead','TableHeader','TableRow']),
    '../../../components/ui/table': tags(['Table','TableBody','TableCell','TableHead','TableHeader','TableRow']),
    '@/src/components/ui/tabs': tags(['Tabs','TabsList','TabsTrigger','TabsContent']),
    '@/src/components/ui/ConfirmDialog': { ConfirmDialog: 'ConfirmDialog' },
    '@/src/components/ui/Pagination': { Pagination: 'Pagination' },
    '@/src/components/ui/page-skeleton': { PageSkeleton: 'skeleton' },
    '@/src/components/ui/TableSkeleton': { TableSkeleton: 'skeleton' },
    '@/src/components/ui/EmptyState': { EmptyState: 'EmptyState' },
    '@react-pdf/renderer': { PDFDownloadLink: 'PDFDownloadLink' },
    '@/src/components/pdf/estado-cuenta-pdf': { EstadoCuentaPdf: 'EstadoCuentaPdf' },
    '@/src/components/tenant/TenantProvider': { useTenant: () => ({ id: 'tenant', tradeName: 'Prueba' }) },
    '@/src/hooks/useUser': { useUser: () => ({ user: { id: 'finance' }, profile: { id: 'finance', tenant_id: 'tenant', rol: 'Finanzas' } }) },
    '../../../hooks/useUser': { useUser: () => ({ user: { id: 'finance' }, profile: { id: 'finance', tenant_id: 'tenant', rol: 'Finanzas' } }) },
    sonner: { toast: { success() {}, error() {}, info() {} } },
    ...mocks,
  })[exported]
  const component = unwrap ? unwrap(entryComponent(props)) : entryComponent
  const render = () => { cursor = 0; tree = component(props); effects.splice(0).forEach(fn => fn()); return tree }
  const nodes = node => !node || typeof node !== 'object' ? [] : Array.isArray(node) ? node.flatMap(nodes) : [node, ...nodes(node.props?.children)]
  const text = node => node == null ? '' : Array.isArray(node) ? node.map(text).join('') : typeof node === 'object' ? text(node.props?.children) : String(node)
  const tick = () => new Promise(resolve => setTimeout(resolve, 30))
  return {
    render, tick, ready: async () => { render(); await tick(); render() },
    find: predicate => nodes(tree).find(predicate),
    findAll: predicate => nodes(tree).filter(predicate),
    button: label => nodes(tree).find(node => node.type === 'button' && text(node) === label),
    text: (node = tree) => text(node),
    cleanup: () => hooks.forEach(hook => hook?.cleanup?.()),
  }
}
