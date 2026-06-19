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
  dateRange?: string
  generatedAt: string
  filters: string[]
  metrics: ReportPdfMetric[]
  columns: ReportPdfColumn[]
  rows: ReportPdfRow[]
  totals?: Record<string, string>
}

Font.registerHyphenationCallback((word) => [word])

const BRAND_BLUE = '#0038BD'
const BRAND_ORANGE = '#EF8E01'
const DARK = '#0f172a'
const MID = '#475569'
const LIGHT = '#64748b'
const BORDER = '#e2e8f0'

const styles = StyleSheet.create({
  page: {
    padding: 28,
    fontSize: 8,
    color: DARK,
    fontFamily: 'Helvetica',
  },
  // ── Header ──────────────────────────────────────────────────────────────
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    borderBottom: `2 solid ${BRAND_BLUE}`,
    paddingBottom: 10,
    marginBottom: 12,
  },
  brandBlock: {
    flexDirection: 'column',
  },
  brandName: {
    fontSize: 11,
    fontWeight: 700,
    color: BRAND_BLUE,
    letterSpacing: 0.5,
  },
  brandSub: {
    fontSize: 7,
    color: LIGHT,
    marginTop: 1,
  },
  brandAccent: {
    width: 32,
    height: 2,
    backgroundColor: BRAND_ORANGE,
    marginTop: 4,
  },
  reportBlock: {
    alignItems: 'flex-end',
  },
  eyebrow: {
    color: BRAND_ORANGE,
    fontSize: 7,
    fontWeight: 700,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  title: {
    fontSize: 15,
    fontWeight: 700,
    color: DARK,
    textAlign: 'right',
  },
  subtitle: {
    marginTop: 3,
    color: MID,
    fontSize: 7.5,
    textAlign: 'right',
  },
  generated: {
    marginTop: 3,
    color: LIGHT,
    fontSize: 7,
    textAlign: 'right',
  },
  // ── Metrics ─────────────────────────────────────────────────────────────
  metricsGrid: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 8,
  },
  metric: {
    flexGrow: 1,
    border: `1 solid ${BORDER}`,
    borderRadius: 4,
    padding: 8,
    backgroundColor: '#f8fafc',
  },
  metricLabel: {
    color: LIGHT,
    fontSize: 7,
  },
  metricValue: {
    marginTop: 3,
    color: DARK,
    fontSize: 11,
    fontWeight: 700,
  },
  // ── Filters ─────────────────────────────────────────────────────────────
  filtersRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginBottom: 10,
  },
  filterChip: {
    backgroundColor: '#f1f5f9',
    borderRadius: 20,
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    color: MID,
    fontSize: 6.5,
  },
  // ── Table ────────────────────────────────────────────────────────────────
  table: {
    border: `1 solid ${BORDER}`,
    borderRadius: 4,
  },
  row: {
    flexDirection: 'row',
    borderBottom: `1 solid ${BORDER}`,
    minHeight: 20,
  },
  headerCell: {
    padding: 5,
    backgroundColor: DARK,
    color: '#ffffff',
    fontSize: 7,
    fontWeight: 700,
    textTransform: 'uppercase',
  },
  cell: {
    padding: 5,
    fontSize: 7,
    color: DARK,
  },
  totalsRow: {
    flexDirection: 'row',
    borderTop: `2 solid ${BRAND_BLUE}`,
    minHeight: 20,
    backgroundColor: '#f1f5f9',
  },
  totalsCell: {
    padding: 5,
    fontSize: 7.5,
    fontWeight: 700,
    color: DARK,
  },
  // ── Footer ───────────────────────────────────────────────────────────────
  footer: {
    position: 'absolute',
    bottom: 16,
    left: 28,
    right: 28,
    borderTop: `1 solid ${BORDER}`,
    paddingTop: 5,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    color: LIGHT,
    fontSize: 6.5,
  },
  footerLeft: {
    flexDirection: 'row',
    gap: 8,
  },
  // ── Empty ────────────────────────────────────────────────────────────────
  empty: {
    border: `1 solid ${BORDER}`,
    borderRadius: 4,
    padding: 20,
    color: LIGHT,
    textAlign: 'center',
  },
})

export function ReportPdf({ data }: { data: ReportPdfData }) {
  const rows = data.rows.slice(0, 500)

  return (
    <Document>
      <Page size="LETTER" orientation="landscape" style={styles.page}>

        {/* ── Header ── */}
        <View style={styles.headerRow} fixed>
          <View style={styles.brandBlock}>
            <Text style={styles.brandName}>SARI EXPRESS S DE R.L. DE C.V.</Text>
            <Text style={styles.brandSub}>San Pedro Sula, Cortés, Honduras · RTN 08019003239182</Text>
            <View style={styles.brandAccent} />
          </View>
          <View style={styles.reportBlock}>
            <Text style={styles.eyebrow}>ERP Logístico · Reporte</Text>
            <Text style={styles.title}>{data.title}</Text>
            <Text style={styles.subtitle}>{data.subtitle}</Text>
            <Text style={styles.generated}>Generado: {data.generatedAt}</Text>
          </View>
        </View>

        {/* ── Metrics ── */}
        <View style={styles.metricsGrid}>
          {data.metrics.map((metric) => (
            <View key={metric.label} style={styles.metric}>
              <Text style={styles.metricLabel}>{metric.label}</Text>
              <Text style={styles.metricValue}>{metric.value}</Text>
            </View>
          ))}
        </View>

        {/* ── Active filters as chips ── */}
        {data.filters.length > 0 && (
          <View style={styles.filtersRow}>
            {data.filters.map((filter) => (
              <Text key={filter} style={styles.filterChip}>{filter}</Text>
            ))}
          </View>
        )}

        {/* ── Table ── */}
        {rows.length === 0 ? (
          <Text style={styles.empty}>No hay datos para los filtros seleccionados.</Text>
        ) : (
          <View style={styles.table}>
            {/* Header row */}
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

            {/* Data rows */}
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

            {/* Totals row */}
            {data.totals && (
              <View style={styles.totalsRow}>
                {data.columns.map((column) => (
                  <Text
                    key={column.key}
                    style={[
                      styles.totalsCell,
                      {
                        width: column.width || `${100 / data.columns.length}%`,
                        textAlign: column.align || 'left',
                      },
                    ]}
                  >
                    {data.totals![column.key] ?? ''}
                  </Text>
                ))}
              </View>
            )}
          </View>
        )}

        {/* ── Footer ── */}
        <View style={styles.footer} fixed>
          <View style={styles.footerLeft}>
            <Text>{data.title}</Text>
            {data.dateRange && <Text>· {data.dateRange}</Text>}
            {rows.length < data.rows.length && (
              <Text>· Mostrando {rows.length} de {data.rows.length} registros</Text>
            )}
          </View>
          <Text render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`} />
        </View>

      </Page>
    </Document>
  )
}
