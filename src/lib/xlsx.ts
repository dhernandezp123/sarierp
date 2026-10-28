// Small OOXML writer for tabular reports. No external library; cells are typed,
// strings are never interpreted as formulas. ZIP uses the standard STORE method.
const encoder = new TextEncoder()
const xml = (value: unknown) => String(value ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
  .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;')
function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff
  for (const byte of bytes) { crc ^= byte; for (let bit=0;bit<8;bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0) }
  return (crc ^ 0xffffffff) >>> 0
}
function columnName(index: number) {
  let result=''
  for (let n=index+1;n>0;n=Math.floor((n-1)/26)) result=String.fromCharCode(65+(n-1)%26)+result
  return result
}
function zip(files: Record<string,string>) {
  const chunks: Uint8Array[] = [], central: Uint8Array[] = []
  let offset=0, directorySize=0
  for (const [path,content] of Object.entries(files)) {
    const name=encoder.encode(path), body=encoder.encode(content), checksum=crc32(body)
    const header=new Uint8Array(30+name.length), view=new DataView(header.buffer)
    view.setUint32(0,0x04034b50,true); view.setUint16(4,20,true); view.setUint16(6,0x800,true)
    view.setUint16(12,33,true); view.setUint32(14,checksum,true); view.setUint32(18,body.length,true); view.setUint32(22,body.length,true)
    view.setUint16(26,name.length,true); header.set(name,30)
    const dir=new Uint8Array(46+name.length), dv=new DataView(dir.buffer)
    dv.setUint32(0,0x02014b50,true); dv.setUint16(4,20,true); dv.setUint16(6,20,true); dv.setUint16(8,0x800,true)
    dv.setUint16(14,33,true); dv.setUint32(16,checksum,true); dv.setUint32(20,body.length,true); dv.setUint32(24,body.length,true)
    dv.setUint16(28,name.length,true); dv.setUint32(42,offset,true); dir.set(name,46)
    chunks.push(header,body); central.push(dir); offset+=header.length+body.length; directorySize+=dir.length
  }
  const end=new Uint8Array(22), ev=new DataView(end.buffer)
  ev.setUint32(0,0x06054b50,true); ev.setUint16(8,central.length,true); ev.setUint16(10,central.length,true)
  ev.setUint32(12,directorySize,true); ev.setUint32(16,offset,true)
  const output=new Uint8Array(offset+directorySize+22); let at=0
  for (const chunk of [...chunks,...central,end]) { output.set(chunk,at); at+=chunk.length }
  return output
}
export function createXlsx(rows: (string | number)[][], sheetName='Reporte') {
  if (rows.length>1048576 || rows.some(row=>row.length>16384)) throw new Error('El reporte excede el tamaño permitido por Excel.')
  const sheet=xml(sheetName.replace(/[\\/*?:\[\]]/g,' ').slice(0,31) || 'Reporte')
  const body=rows.map((row,i)=>`<row r="${i+1}">${row.map((value,j)=>{
    const ref=`${columnName(j)}${i+1}`
    if (typeof value==='number' && Number.isFinite(value)) return `<c r="${ref}" t="n"><v>${value}</v></c>`
    return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xml(value)}</t></is></c>`
  }).join('')}</row>`).join('')
  return zip({
    '[Content_Types].xml':'<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>',
    '_rels/.rels':'<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    'xl/workbook.xml':`<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${sheet}" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    'xl/_rels/workbook.xml.rels':'<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
    'xl/worksheets/sheet1.xml':`<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${body}</sheetData></worksheet>`,
  })
}
