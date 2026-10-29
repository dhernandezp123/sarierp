export type WorkspaceCrumb = { label:string;href?:string }
const roots:Record<string,WorkspaceCrumb>={
  accounting:{label:'Contabilidad'},invoicing:{label:'Facturación',href:'/invoicing'},settings:{label:'Configuración'},
  operations:{label:'Operaciones',href:'/operations/dashboard'},reports:{label:'Reportes'},
  quotations:{label:'Cotizaciones',href:'/quotations'},clientes:{label:'Clientes',href:'/clientes'},
  suppliers:{label:'Proveedores',href:'/suppliers'},agents:{label:'Agentes',href:'/agents'},
  'accounts-payable':{label:'Cuentas por pagar',href:'/accounts-payable'},miami:{label:'Miami Bodega',href:'/miami'},
  admin:{label:'Administración'},catalogs:{label:'Catálogos'},ventas:{label:'Ventas'},'pricing-comparison':{label:'Comparación de tarifas'},
  'cost-validation':{label:'Validación de costos',href:'/cost-validation'},support:{label:'Soporte',href:'/support'},profile:{label:'Mi perfil'},
}
const leaves:Record<string,Record<string,string>>={
 accounting:{accounts:'Catálogo de cuentas',journal:'Asientos contables',purchases:'Compras y documentos',receivables:'Cuentas por cobrar','supplier-statements':'Estado de proveedores',banks:'Caja y bancos',voids:'Anulaciones',books:'Libros y balances',assets:'Activos',settings:'Configuración y períodos'},
 invoicing:{new:'Preparar documento',drafts:'Borradores',collections:'Cobranza y recibos',statements:'Estados de cuenta',voids:'Anulaciones'},
 settings:{company:'Empresa y facturación',cai:'Rangos CAI','mail-intake':'Recepción de correo',connections:'Conexiones'},
 reports:{'client-operations':'Operaciones por cliente'},admin:{users:'Usuarios'},
 operations:{'shipping-instructions':'Instrucciones de embarque',bookings:'Bookings',garantias:'Garantías'},
 miami:{inventario:'Inventario',embarques:'Embarques',manifiestos:'Manifiestos',ingreso:'Ingreso individual'},
}
/** Only real ancestor routes receive links; query filters are not hierarchy. */
export function workspaceBreadcrumbs(pathname:string):WorkspaceCrumb[]{
 const parts=pathname.split('?')[0].split('/').filter(Boolean),root=roots[parts[0]]
 if(!root||pathname==='/dashboard')return []
 const result:WorkspaceCrumb[]=[{label:'Inicio',href:'/dashboard'},{...root}]
 if(parts.length===1)return result
 const section=leaves[parts[0]]?.[parts[1]]
 if(section){
  const path=`/${parts[0]}/${parts[1]}`
  const linked=['operations','miami'].includes(parts[0])&&parts[1]!=='ingreso'
  result.push({label:section,...(linked?{href:path}:{})})
 }else if(parts[1]==='dashboard'&&parts[0]==='operations')return result
 else if(['new','nuevo','nueva'].includes(parts[1]))result.push({label:parts[0]==='quotations'?'Nueva cotización':parts[0]==='clientes'?'Nuevo cliente':parts[0]==='suppliers'?'Nuevo proveedor':'Nuevo registro'})
 else if(!leaves[parts[0]])result.push({label:parts[0]==='quotations'?'Cotización':parts[0]==='clientes'?'Ficha del cliente':parts[0]==='suppliers'?'Ficha del proveedor':'Detalle',href:`/${parts[0]}/${parts[1]}`})
 else if(parts[0]==='invoicing')result.push({label:'Documento',href:`/invoicing/${parts[1]}`})
 else return []
 if(parts.length>2){
  if(parts[2]==='edit')result.push({label:'Editar'})
  else if(parts[0]==='operations'&&parts[1]==='shipping-instructions'){
   result.push({label:'Instrucción de embarque',href:`/operations/shipping-instructions/${parts[2]}`})
   if(parts[3]==='booking')result.push({label:'Preparar booking'})
   if(parts[3]==='bookings'&&parts[4])result.push({label:'Booking',href:`/operations/shipping-instructions/${parts[2]}/bookings/${parts[4]}`})
   if(parts[5]==='bl'&&parts[6])result.push({label:'Conocimiento de embarque'})
  }else result.push({label:parts[2]==='nuevo'?'Nuevo registro':'Detalle'})
 }
 return result.map((crumb,index)=>index===result.length-1?{label:crumb.label}:crumb)
}
