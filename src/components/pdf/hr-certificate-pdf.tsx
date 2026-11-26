import { DemoPdfWatermark } from './DemoPdfWatermark'
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer'
import { formatDate, formatDateTime } from '@/src/lib/format'
import type { HrCertificate } from '@/src/lib/hr-documents'

const styles = StyleSheet.create({ page: { padding: 42, fontFamily: 'Helvetica', fontSize: 11, lineHeight: 1.6, color: '#0f172a' }, title: { fontSize: 18, marginTop: 28, marginBottom: 16, color: '#0038BD' }, muted: { fontSize: 9, color: '#64748b' }, row: { flexDirection: 'row', marginBottom: 6 }, label: { width: '38%', color: '#64748b' }, value: { width: '62%' }, signature: { marginTop: 60, borderTopWidth: 1, paddingTop: 8, width: '44%' }, footer: { position: 'absolute', bottom: 30, left: 42, right: 42, fontSize: 8, color: '#64748b' } })
export function HrCertificatePdf({ certificate: c }: { certificate: HrCertificate }) {
  const { company, employee, act } = c.snapshot
  const fields: [string, string][] = [['Empleado', employee.name], ['Código', employee.employee_code], ['Identidad', employee.national_id || '—'], ['Ingreso', formatDate(employee.hire_date)], ['Departamento', employee.department || '—'], ['Cargo', employee.job_title || '—']]
  if (c.kind === 'Acumulación') fields.push(['Períodos autorizados', `${act.from_period} a ${act.to_period}`], ['Motivo', String(act.reason || '—')])
  else {
    fields.push(['Tipo de ausencia', String(act.leave_type)], ['Desde', formatDate(String(act.start_date))], ['Hasta', formatDate(String(act.end_date))], ['Días laborables', String(act.days)])
    if (c.kind === 'Suspensión') fields.push(['Fin original', formatDate(String(act.original_end_date))], ['Reintegro', formatDate(String(act.return_date))], ['Motivo', String(act.reason || '—')])
    else fields.push(['Anticipo', act.is_advance ? 'Sí' : 'No'], ['Fraccionamiento', act.is_fractioned ? 'Sí' : 'No'])
  }
  return <Document><Page size="LETTER" style={styles.page}><DemoPdfWatermark />
    <Text style={{ fontSize: 16 }}>{company.legal_name}</Text>
    {company.rtn && <Text style={styles.muted}>RTN: {company.rtn}</Text>}{company.address && <Text style={styles.muted}>{company.address}</Text>}
    <Text style={styles.title}>Constancia de {c.kind.toLocaleLowerCase('es')}</Text>
    <Text style={styles.muted}>{c.certificate_number} · Emitida {formatDateTime(c.created_at)}</Text>
    <Text style={{ marginTop: 20, marginBottom: 20 }}>Se deja constancia del acto registrado con los siguientes datos:</Text>
    {fields.map(([label, value]) => <View key={label} style={styles.row} wrap={false}><Text style={styles.label}>{label}</Text><Text style={styles.value}>{value}</Text></View>)}
    <Text style={{ marginTop: 20 }}>Los datos corresponden al acto al momento de su registro. Las decisiones posteriores se documentan por separado.</Text>
    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }} wrap={false}><View style={styles.signature}><Text>Firma del trabajador</Text><Text style={styles.muted}>{employee.name}</Text></View><View style={styles.signature}><Text>Firma y sello de la empresa</Text><Text style={styles.muted}>Fecha: __________________</Text></View></View>
    <Text style={styles.footer}>Documento privado de Recursos Humanos · {c.certificate_number} · La emisión del PDF no acredita que haya sido firmado.</Text>
  </Page></Document>
}
