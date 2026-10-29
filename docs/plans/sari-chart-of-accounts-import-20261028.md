# Catálogo contable de Sari: preparación desde PDF — 28/10/2026

Estado: adaptación SQL aplicada en Producción y Pruebas; catálogo real importado
y verificado en Sari Producción. Aceptación autenticada con Contabilidad pendiente.
El documento del propietario se trata como datos, no como instrucciones.

## Evidencia del documento

- 33 páginas y 714 cuentas con código, nombre y nivel legibles.
- Cinco cuentas Tipo, doce Grupo, 34 Mayor, 91 SubCuenta y 572 Auxiliar.
- Códigos únicos, nombres dentro del límite existente y filas completas.
- Raíces: Activo, Pasivo, Patrimonio, Cuentas de Resultado y Cuentas de Orden.
- Por rama: 490 Activo, 154 Pasivo, diez Patrimonio, 57 Resultado y tres Orden.
  Resultado incluye 18 cuentas de Ingreso, seis de Costo, 32 de Gasto y la raíz.
- Producción se consultó de solo lectura: catálogo y diario vacíos; sin
  configuración de contabilización automática. Después de importar conserva cero
  asientos y la misma configuración; solo se crearon las cuentas aprobadas.

El PDF y los archivos derivados contienen nombres reales de clientes y
proveedores. Permanecen únicamente en `.ua/intermediate/sari-account-catalog/`,
fuera de Git. No publicar esos datos ni copiarlos a Pruebas sin autorización.
Se generaron Excel de copia/revisión y CSV de importación compatible con la nueva
estructura. La importación real de 714 cuentas ya está registrada en la auditoría.

## Definiciones confirmadas por el propietario

1. Movimiento: solo las 572 cuentas Auxiliar. Las 142 restantes quedan sin
   movimiento, incluidas 91 cuentas finales sin auxiliar. Su eventual habilitación
   requiere otra confirmación; no se anticipa esa decisión.
2. Jerarquía: seguir los niveles y el orden explícitos del PDF conservando códigos.
   Las cuentas 221, 222, 223 y 227 se proponen bajo 21; 442 bajo 43. Sus prefijos
   numéricos no coinciden con esas agrupaciones. No renumerar ni inventar 22/44.

Estas decisiones se conservan en el archivo de carga validado: 714 cuentas,
572 de movimiento, 142 sin movimiento, seis columnas con nivel y código textual.

## Adaptación necesaria para la carga completa

El importador actual acepta CSV de cinco columnas y hasta 1000 cuentas, por lo
que la cantidad cabe. Rechaza duplicados y requiere importar padres antes de hijas.
Sin embargo, el modelo solo contempla Activo/Pasivo/Patrimonio/Ingreso/Gasto y
exige padres del mismo tipo: no puede representar fielmente la raíz mixta de
Resultado ni Orden. La clasificación de Costo debe quedar explícita y coherente
con los reportes; no convertirla silenciosamente en otra naturaleza.

Implementación dentro de este alcance:

1. Migración nueva `20261028190000_account_catalog_structure.sql`: agrega Costo,
   Resultado y Orden, conserva niveles y códigos originales, admite ramas de
   Ingreso/Costo/Gasto bajo Resultado y evita contabilizar en agrupadoras.
2. Ajustar catálogo/importador y consumidores necesarios de compras, configuración,
   libro diario, mayor y estados financieros. Resultado admite sus ramas; Orden
   debe permanecer separada de activo, pasivo, patrimonio y resultado financiero.
   Los asientos con Orden deben balancear esa parte independientemente de las
   cuentas financieras; el diario, mayor y comprobación sí conservan sus movimientos.
3. Probar jerarquías, movimientos autorizados, clasificación de costos, exclusión
   de Orden en estados financieros, rollback ante duplicados y aislamiento tenant.
   Usar fixtures ficticios; no incorporar el catálogo real a tests o migraciones.
4. Convertir a un formato validado, importar las 714 cuentas en una transacción
   para Sari Producción y registrar fuente/cantidad/actor administrativo de manera
   veraz. Rechazar conflictos y comparar resultado completo con la fuente.
5. Conservar saldos, asientos, configuración automática, usuarios y los demás
   catálogos. El PDF solo aporta cuentas: no aporta apertura, movimientos ni
   autorización para crear clientes, proveedores o cuentas bancarias.
6. Verificar con Contabilidad. Mantener funcionalidad equivalente en Pruebas
   con datos ficticios, sin copiar los auxiliares reales del documento.

Esta preparación no autoriza sustituir cuentas con movimientos, fijar una fecha
de apertura ni activar contabilización automática.

## Verificación de aplicación

Fuentes main `22f5deb` y Demo `0433e60`. Pruebas locales: 506/512 Node, 32/8 SQL/RLS
con rollback, TypeScript, lint, ambas compilaciones y seis verificaciones de
navegador con 714 cuentas ficticias en escritorio/móvil. La compilación Trial se
repitió tras liberar cachés temporales por falta de espacio; terminó correctamente.
Los fixtures financieros usan la fecha de negocio de Honduras; los demás
fixtures conservan su contexto de seguridad/correo, sin alterar sesiones reales.

Ensayo remoto revertido y aplicación de esquema en cada ambiente: 131/134 tablas
originales preservadas, RLS y privilegios intactos, fuente SQL registrada idéntica
al commit, únicamente cuatro funciones previstas modificadas. La carga real se
ensayó con rollback y después se confirmó en una transacción separada para Sari
Producción, sin copiar datos a Pruebas. Conserva todos los datos originales y
añade 714 cuentas y una auditoría administrativa con hash de fuente y política.
Los campos de las 714 filas se compararon contra el archivo: 572 Auxiliar con
movimiento y 142 sin él; cinco niveles conservados. Sin saldos, asientos, períodos,
configuración automática, bancos, clientes o proveedores creados como efecto lateral.
