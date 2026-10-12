# Scanner / Generador de factura manual — SARI USA

Ruta: `/manual-invoices`, menú Finanzas → Scanner / Factura manual.
Disponible para Admin, Operaciones, Finanzas y Contabilidad de Sari.

## Uso

1. Cargar una factura en PDF, JPG, PNG o WEBP de hasta 3 MB. También se puede
   completar el formulario sin archivo. Para Word, exportar primero a PDF.
2. Seleccionar **Leer con OCR** cuando esté disponible. Comparar el original
   con los campos amarillos; corregir datos ilegibles y revisar los importes.
3. Editar cliente, factura, embarque, referencias, cargos y WR (uno por línea).
   El total se calcula sumando los cargos, con precisión de centavos.
4. Confirmar la revisión, generar la vista previa y descargar el PDF.
5. **Guardar documento** agrega una versión al historial. Abrir una versión y
   guardar cambios crea otra versión, conservando la anterior. El historial
   muestra las 100 versiones más recientes; no modifica cuentas por cobrar.

El PDF reconstruye la plantilla en papel Letter: logotipo extraído del Word
aportado, encabezado SARI USA, recuadros, cargos, WR, total y Remarks fijos.
No incorpora resaltados. Los documentos extensos continúan en otras páginas
con el encabezado repetido y el total al final. Las fechas se muestran como
DD/MM/YYYY según la convención del ERP y los importes en USD.

El original se conserva solo en memoria del navegador durante la edición.
El historial guarda los datos, no el archivo original ni un PDF binario; el
PDF se regenera desde la versión guardada. Cerrar o recargar sin guardar pierde
los cambios. El módulo avisa antes de reemplazar datos y al cerrar la pestaña.

## Activación del servidor

No se agregaron dependencias. El OCR usa `fetch` con Responses API y esquema
JSON estricto, siguiendo la documentación oficial de
[archivos](https://developers.openai.com/api/docs/guides/file-inputs) y
[salidas estructuradas](https://developers.openai.com/api/docs/guides/structured-outputs).

1. Aplicar mediante el procedimiento aprobado del proyecto la migración
   `supabase/migrations/20261012160000_manual_sari_usa_invoices.sql`.
2. Ejecutar `supabase/tests/manual_sari_usa_invoices.sql` en una base aislada con
   las migraciones vigentes. La prueba usa una transacción y termina en rollback.
3. Configurar solo en el servidor:

   ```dotenv
   MANUAL_INVOICE_OCR_ENABLED=true
   OPENAI_API_KEY=<clave privada del proyecto OpenAI>
   MANUAL_INVOICE_OCR_MODEL=gpt-4.1-mini
   ```

4. Revisar el presupuesto del proyecto OpenAI y publicar con el procedimiento
   aprobado. El modelo es configurable; debe aceptar imágenes, PDF y el esquema
   de salidas estructuradas. No usar variables `NEXT_PUBLIC_` para la clave.

La conexión permanece deshabilitada salvo activación explícita. Cada lectura
envía el documento a OpenAI y puede generar cargos en esa cuenta. `store: false`
evita guardar el estado de Responses; no equivale a una garantía de retención
cero del proveedor. No se envían documentos durante las pruebas locales.

El servidor valida sesión, aprobación, actividad, rol y empresa antes de leer
archivos o llamar al proveedor. Los bytes deben corresponder al tipo declarado.
El cuerpo se limita aun si falta Content-Length. La clave y los documentos no
se registran en logs. El cupo atómico es de 20 intentos diarios por usuario,
reiniciado a medianoche de Miami; los intentos fallidos consumen cupo.

## Validación pendiente antes de uso operativo

- Aplicar SQL y comprobar RLS con usuarios de los cuatro roles, usuario
  suspendido, otro tenant y sesión anónima.
- Habilitar una clave real y leer PDF escaneado y foto inclinada; comprobar
  fechas estadounidenses MM/DD/YYYY, HBL/MBL, WR y total. El OCR requiere revisión
  humana y no debe completar datos ilegibles por suposición.
- Recorrer carga → lectura → edición → revisión → PDF → guardado → historial.
- Comparar impresión Letter con el formato aprobado por SARI USA. Confirmar
  logotipo a color del Word frente al monocromo de la fotografía, dirección
  y texto fijo del encabezado/Remarks.
- Revisar escritorio/móvil, teclado, pérdida de red, recuperación de errores,
  y documentos con muchas líneas.

## Configuración del servidor — 12/10/2026

El usuario autorizó configurar el servidor después de la validación local.
Se aplicó únicamente la migración `20261012160000` en el proyecto Supabase
`sarierp` (`fwspgdzvlbtbgiupvrzo`), con transacción y registro en el historial.
La migración pendiente de Outlook `20261002120000` se conserva pendiente.

En Production de Vercel, proyecto `sarierp`, se configuraron:

```dotenv
MANUAL_INVOICE_OCR_ENABLED=false
MANUAL_INVOICE_OCR_MODEL=gpt-4.1-mini
```

El usuario confirmó que todavía no tiene una clave API. Para habilitar la
lectura automática más adelante:

1. Crear la clave desde [OpenAI API keys](https://platform.openai.com/api-keys),
   siguiendo la [guía oficial](https://developers.openai.com/api/docs/quickstart).
2. Guardarla como `OPENAI_API_KEY` en las variables de entorno de Production
   del proyecto `sarierp` en Vercel, como secreto. No pegarla en el chat ni
   incorporarla al repositorio.
3. Cambiar `MANUAL_INVOICE_OCR_ENABLED` a `true` y volver a desplegar.
4. Probar la lectura y revisar presupuesto y condiciones de la cuenta API.

La captura manual, el PDF y el historial funcionan de forma independiente de
la clave OCR. La configuración y el resultado de publicación se registran en
`HARDENING.md`, hallazgo UX-066; el OCR real y la UAT siguen pendientes.

El módulo está publicado en
[sari.forwarders.app/manual-invoices](https://sari.forwarders.app/manual-invoices).
La compilación de Production y las verificaciones HTTP fueron exitosas; la
ruta y las API exigen sesión. Se comprobaron las políticas y grants instalados
en Supabase. El recorrido completo con un usuario autenticado y una factura
real aún requiere UAT.

## Activación OCR posterior — 12/10/2026

El usuario agregó `OPENAI_API_KEY` en Production de Vercel y en `.env.local`.
Se verificó su presencia sin mostrar la clave y se activó
`MANUAL_INVOICE_OCR_ENABLED=true` en Production. El entorno local ya tiene
activación `true` y modelo `gpt-4.1-mini`.

La comprobación de conexión con un PDF totalmente ficticio recibió HTTP 429,
`credit_balance_exhausted`. La configuración está preparada, pero la cuenta
API necesita créditos para efectuar lecturas. Agregar saldo desde
[Billing de OpenAI](https://platform.openai.com/settings/organization/billing/overview)
y volver a probar; consultar la
[documentación oficial de límites y saldo](https://developers.openai.com/api/docs/guides/spend-limits).
El módulo muestra un mensaje específico de falta de saldo. La captura manual,
el PDF y el historial continúan disponibles.

No se envió el PDF aportado ni información de clientes durante esta comprobación;
se utilizó un documento generado en memoria con TEST CUSTOMER y USD 1.00.
La lectura exitosa de PDF/fotos y el recorrido autenticado siguen pendientes.
