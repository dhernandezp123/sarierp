const UNIDADES = ['', 'UN', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE',
  'DIEZ', 'ONCE', 'DOCE', 'TRECE', 'CATORCE', 'QUINCE', 'DIECISÉIS', 'DIECISIETE', 'DIECIOCHO', 'DIECINUEVE']
const DECENAS = ['', '', 'VEINTE', 'TREINTA', 'CUARENTA', 'CINCUENTA', 'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA']
const CENTENAS = ['', 'CIEN', 'DOSCIENTOS', 'TRESCIENTOS', 'CUATROCIENTOS', 'QUINIENTOS', 'SEISCIENTOS', 'SETECIENTOS', 'OCHOCIENTOS', 'NOVECIENTOS']

export function amountInWords(n: number): string {
  if (n === 0) return 'CERO'
  if (n < 0) return 'MENOS ' + amountInWords(-n)

  if (!Number.isFinite(n) || n > 999999999999.99) return 'IMPORTE FUERA DE RANGO'
  const cents = Math.round(n * 100)
  const int = Math.floor(cents / 100)
  const dec = cents % 100

  function below1000(x: number): string {
    if (x === 0) return ''
    if (x < 20) return UNIDADES[x]
    if (x < 100) {
      const d = Math.floor(x / 10)
      const u = x % 10
      return u === 0 ? DECENAS[d] : (d === 2 ? 'VEINTI' + UNIDADES[u] : DECENAS[d] + ' Y ' + UNIDADES[u])
    }
    if (x === 100) return 'CIEN'
    const c = Math.floor(x / 100)
    const rest = x % 100
    return rest === 0 ? CENTENAS[c] : (c === 1 ? 'CIENTO' : CENTENAS[c]) + ' ' + below1000(rest)
  }

  function convert(x: number): string {
    if (x < 1000) return below1000(x)
    if (x < 1000000) {
      const miles = Math.floor(x / 1000)
      const rest = x % 1000
      const milPart = miles === 1 ? 'MIL' : below1000(miles) + ' MIL'
      return rest === 0 ? milPart : milPart + ' ' + below1000(rest)
    }
    const mill = Math.floor(x / 1000000)
    const rest = x % 1000000
    const millPart = mill === 1 ? 'UN MILLÓN' : convert(mill) + ' MILLONES'
    return rest === 0 ? millPart : millPart + ' ' + convert(rest)
  }

  const intWords = int === 0 ? 'CERO' : convert(int)
  const decStr = String(dec).padStart(2, '0')
  return `${intWords} CON ${decStr}/100`
}
