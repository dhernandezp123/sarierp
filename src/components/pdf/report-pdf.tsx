import {
  Document,
  Font,
  Page,
  StyleSheet,
  Text,
  View,
} from '@react-pdf/renderer'

export type ReportPdfColumn = {
  key: string
  label: string
  width?: string
  align?: 'left' | 'right' | 'center'
}

export type ReportPdfMetric = {
  label: string
  value: string
}

export type ReportPdfRow = Record<string, string | number>

export type ReportPdfData = {
  title: string
  subtitle: string
  generatedAt: string
  filters: string[]
  metrics: ReportPdfMetric[]
  columns: ReportPdfColumn[]
  rows: ReportPdfRow[]
}

Font.registerHyphenationCallback((word) => [word])

const styles = StyleSheet.create({
  page: {
    padding: 28,
    fontSize: 8,
    color: '#0f172a',
    fontFamily: 'Helvetica',
  },
  header: {
    borderBottom: '1 solid #cbd5e1',
    paddingBottom: 10,
    marginBottom: 12,
  },
  eyebrow: {
    color: '#0038BD',
    fontSize: 7,
    fontWeight: 700,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  title: {
    marginTop: 4,
    fontSize: 17,
    fontWeight: 700,
    color: '#0f172a',
  },
  subtitle: {
    marginTop: 3,
    color: '#475569',
    fontSize: 8,
  },
  generated: {
    marginTop: 4,
    color: '#64748b',
    fontSize: 7,
  },
  metricsGrid: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 10,
  },
  metric: {
    flexGrow: 1,
    border: '1 solid #e2e8f0',
    borderRadius: 4,
    padding: 8,
    backgroundColor: '#f8fafc',
  },
  metricLabel: {
    color: '#64748b',
    fontSize: 7,
  },
  metricValue: {
    marginTop: 3,
    color: '#0f172a',
    fontSize: 11,
    fontWeight: 700,
  },
  filters: {
    marginBottom: 10,
    color: '#475569',
    fontSize: 7,
  },
  table: {
    border: '1 solid #e2e8f0',
  },
  row: {
    flexDirection: 'row',
    borderBottom: '1 solid #e2e8f0',
    minHeight: 20,
  },
  headerCell: {
    padding: 5,
    backgroundColor: '#0f172a',
    color: '#ffffff',
    fontSize: 7,
    fontWeight: 700,
    textTransform: 'uppercase',
  },
  cell: {
    padding: 5,
    fontSize: 7,
    color: '#0f172a',
  },
  footer: {
    position: 'absolute',
    bottom: 16,
    left: 28,
    right: 28,
    borderTop: '1 solid #e2e8f0',
    paddingTop: 6,
    flexDirection: 'row',
    justifyContent: 'space-between',
    color: '#64748b',
    fontSize: 7,
  },
  empty: {
    border: '1 solid #e2e8f0',
    borderRadius: 4,
    padding: 16,
    color: '#64748b',
    textAlign: 'center',
  },
})

export function ReportPdf({ data }: { data: ReportPdfData }) {
  const rows = data.rows.slice(0, 120)

  return (
    <Document>
      <Page size="LETTER" orientation="landscape" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.eyebrow}>Sari Express ERP</Text>
          <Text style={styles.title}>{data.title}</Text>
          <Text style={styles.subtitle}>{data.subtitle}</Text>
          <Text style={styles.generated}>Generado: {data.generatedAt}</Text>
        </View>

        <View style={styles.metricsGrid}>
          {data.metrics.map((metric) => (
            <View key={metric.label} style={styles.metric}>
              <Text style={styles.metricLabel}>{metric.label}</Text>
              <Text style={styles.metricValue}>{metric.value}</Text>
            </View>
          ))}
        </View>

        <Text style={styles.filters}>{data.filters.join('  |  ')}</Text>

        {rows.length === 0 ? (
          <Text style={styles.empty}>No hay datos para los filtros seleccionados.</Text>
        ) : (
          <View style={styles.table}>
            <View style={styles.row} fixed>
              {data.columns.map((column) => (
                <Text
                  key={column.key}
                  style={[
                    styles.headerCell,
                    {
                      width: column.width || `${100 / data.columns.length}%`,
                      textAlign: column.align || 'left',
                    },
                  ]}
                >
                  {column.label}
                </Text>
              ))}
            </View>

            {rows.map((row, rowIndex) => (
              <View key={`${rowIndex}-${row.__key || ''}`} style={styles.row} wrap={false}>
                {data.columns.map((column) => (
                  <Text
                    key={column.key}
                    style={[
                      styles.cell,
                      {
                        width: column.width || `${100 / data.columns.length}%`,
                        textAlign: column.align || 'left',
                        backgroundColor: rowIndex % 2 === 0 ? '#ffffff' : '#f8fafc',
                      },
                    ]}
                  >
                    {String(row[column.key] ?? '')}
                  </Text>
                ))}
              </View>
            ))}
          </View>
        )}

        <View style={styles.footer} fixed>
          <Text>Reporte exportable PDF</Text>
          <Text render={({ pageNumber, totalPages }) => `Pagina ${pageNumber} de ${totalPages}`} />
        </View>
      </Page>
    </Document>
  )
}
