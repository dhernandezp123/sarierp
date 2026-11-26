import { DemoPdfWatermark } from './DemoPdfWatermark'
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer'
import type { HrPayslip } from '@/src/lib/hr-payroll'
import { formatDate, formatMoney } from '@/src/lib/format'
const styles = StyleSheet.create({ page: { padding: 40, fontSize: 10, fontFamily: 'Helvetica', lineHeight: 1.5 }, row: { flexDirection: 'row', paddingVertical: 7, borderBottomWidth: 0.5, borderBottomColor: '#dddddd' }, muted: { color: '#64748b', fontSize: 9 } })
export function HrPayslipPdf({ slip: s }: { slip: HrPayslip }) {
 return <Document><Page size="LETTER" style={styles.page}><DemoPdfWatermark />
  <Text style={{fontSize:16}}>{s.company.name}</Text>{s.company.rtn && <Text style={styles.muted}>RTN: {s.company.rtn}</Text>}{s.company.address && <Text style={styles.muted}>{s.company.address}</Text>}
  <Text style={{fontSize:14,marginTop:20}}>Comprobante de {s.kind.toLocaleLowerCase('es')}</Text><Text style={styles.muted}>{s.status} · {s.id}</Text>
  <Text style={{marginTop:14}}>{s.employee.code} · {s.employee.name}</Text><Text>Período: {formatDate(s.starts_on)} – {formatDate(s.ends_on)}</Text><Text>Pago previsto: {formatDate(s.pay_date)}</Text>
  <View style={{marginTop:20}}>{s.items.map((item,index)=><View key={index} style={styles.row} wrap={false}><View style={{width:'72%'}}><Text>{item.name}</Text><Text style={styles.muted}>{item.kind}</Text></View><Text style={{width:'28%',textAlign:'right'}}>{formatMoney(item.amount,s.currency)}</Text></View>)}</View>
  <View style={{marginTop:16}} wrap={false}><Text>Ingresos: {formatMoney(s.gross,s.currency)}</Text><Text>Deducciones: {formatMoney(s.deductions,s.currency)}</Text><Text style={{fontSize:13,marginTop:5}}>Neto: {formatMoney(s.net,s.currency)}</Text><Text style={styles.muted}>Aportes patronales: {formatMoney(s.employer,s.currency)} (no se descuentan al trabajador).</Text></View>
  <Text style={{marginTop:30}}>Firma del trabajador: __________________________</Text><Text style={{marginTop:12}}>Firma y sello de la empresa: ____________________</Text>
  <Text style={[styles.muted,{marginTop:25}]}>Documento privado de Recursos Humanos. Este comprobante detalla remuneraciones aprobadas; su emisión no acredita pago, transferencia bancaria ni firma.</Text>
 </Page></Document>
}
