/** Allocate unspecified widths from the remaining space, never beyond a page. */
export function reportColumnWidths(columns:{width?:string}[]){
 const values=columns.map(c=>c.width&&/^\d+(\.\d+)?%$/.test(c.width)?Number.parseFloat(c.width):null)
 const fixed=values.reduce<number>((sum,v)=>sum+(v||0),0),missing=values.filter(v=>v===null).length
 const weights=values.map(v=>v??(fixed<100?(100-fixed)/Math.max(missing,1):100/Math.max(columns.length,1)))
 const total=weights.reduce((sum,v)=>sum+v,0)||1
 return weights.map(v=>`${v*100/total}%`)
}
