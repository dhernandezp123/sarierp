import test from 'node:test'
import assert from 'node:assert/strict'
import {crc32} from 'node:zlib'
import loadTs from './load-ts.mjs'
const {createXlsx}=loadTs('src/lib/xlsx.ts')
test('Excel es un paquete ZIP OOXML válido, con importes numéricos y textos sin ejecución de fórmulas',()=>{
  const bytes=Buffer.from(createXlsx([['Cuenta','Importe'],['=HYPERLINK("bad")',12.34],['A&B <C>\u0000',-2]],'Diario / cuentas'))
  const entries=new Map();let offset=0
  while(bytes.readUInt32LE(offset)===0x04034b50){
    const len=bytes.readUInt32LE(offset+18),nameLen=bytes.readUInt16LE(offset+26),extra=bytes.readUInt16LE(offset+28)
    const name=bytes.toString('utf8',offset+30,offset+30+nameLen),start=offset+30+nameLen+extra,body=bytes.subarray(start,start+len)
    assert.equal(crc32(body),bytes.readUInt32LE(offset+14));entries.set(name,body.toString('utf8'));offset=start+len
  }
  assert.equal(entries.size,5);assert.equal(bytes.readUInt32LE(offset),0x02014b50);assert.equal(bytes.readUInt32LE(bytes.length-22),0x06054b50)
  assert.match(entries.get('[Content_Types].xml'),/spreadsheetml.sheet.main\+xml/)
  assert.match(entries.get('xl/worksheets/sheet1.xml'),/t="n"><v>12.34<\/v>/)
  assert.match(entries.get('xl/worksheets/sheet1.xml'),/=HYPERLINK\(&quot;bad&quot;\)/)
  assert.match(entries.get('xl/worksheets/sheet1.xml'),/A&amp;B &lt;C&gt;/)
  assert.doesNotMatch(entries.get('xl/worksheets/sheet1.xml'),/<f[ >]|\u0000/)
  assert.match(entries.get('xl/workbook.xml'),/Diario   cuentas/)
})
