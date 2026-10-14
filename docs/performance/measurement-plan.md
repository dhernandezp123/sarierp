# Medición de rendimiento y solicitudes de demo

No hay evidencia de navegador/móvil en esta ronda ni datos reales de conversión.
El build no sustituye una medición de experiencia. No diferir componentes ni
cambiar cálculos comerciales basándose solo en el tamaño de una página fuente.

## Evidencia reproducible local

Después de `npm run build`, ejecutar `node scripts/measure-build.mjs`. El JSON
registra SHA de HEAD, si hay cambios sin commit, fecha, tamaños JS/CSS y gzip.
Suma todos los chunks generados: no representa los bytes descargados por una
ruta ni una comparación contra una versión anterior que no se midió.

Las acciones emiten `sari:measurement` en el navegador: `demo_form` al comenzar
edición, `demo_submit`, `quotation_create` y `manual_invoice_pdf` al iniciar y
al terminar con éxito/fallo. Las acciones medidas incluyen RPC o carga dinámica
según corresponda; éxito significa respuesta confirmada, no apertura del correo
ni aceptación comercial. El PDF reutilizado en caché no vuelve a generarse.

El detalle solo admite nombre/etapa/duración en ms. No lleva datos del formulario,
ID de cliente/tenant/usuario, URL, descripción de error o documento. No hay cookies,
persistencia, proveedor ni solicitud de red por estos eventos. Un consumidor
externo requiere revisión/activación explícita; no hay analítica desplegada aquí.

Para una prueba local con datos sintéticos se puede observar:

```js
window.addEventListener('sari:measurement', event => console.table(event.detail))
```

## Aceptación en navegador

1. Preparar candidato y tenant de aceptación con datos sintéticos. Interceptar
   el envío de leads y correo; no enviar solicitudes reales desde la landing.
2. Medir pricing y booking con carga pequeña y grande: navegación fría/caliente,
   consultas, tiempo hasta poder actuar, render y Long Tasks. Registrar navegador,
   dispositivo, red, cantidad de filas, commit y estado de caché.
3. Medir PDF pequeño/grande y OCR en dispositivo por separado. Hacer al menos
   cinco repeticiones y reportar mediana y rango; sin mezclar fases ni tamaños.
4. Para demo verificar inicio, envío, error de red y respuesta exitosa con red
   interceptada. Un doble clic no debe crear otro intento. No usar PII en eventos.
5. Elegir presupuestos y herramienta de analítica con producto/operaciones,
   responsable y retención. Cualquier tasa de conversión necesita un período y
   denominador definidos; no inferir usuarios únicos desde estos eventos.
6. Optimizar únicamente el cuello de botella medido y repetir el mismo ensayo.

AUD-20 queda abierto para medición de pricing/booking/móvil y selección de
analítica aprobada. Esta instrumentación y el baseline estático son preparación,
no resultados observados de usuarios reales.
