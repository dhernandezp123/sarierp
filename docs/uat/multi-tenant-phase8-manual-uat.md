# UAT manual autenticado multiempresa — Fase 8

Estado: preparado, no ejecutado.
Alcance: candidato Sari en un entorno aislado; no autoriza SQL remoto,
despliegue, DNS, TLS ni el alta real de MYA.

## Condiciones de entrada

No comenzar hasta disponer de:

- una copia reciente y restaurada de Production en un proyecto aislado;
- las 18 migraciones multiempresa aplicadas sobre esa copia;
- usuarios de prueba para Ventas, Pricing, Operaciones, Contabilidad, Finanzas,
  Admin, Cliente y administrador de plataforma;
- hostnames locales o de preview que representen `sari.forwarders.app` y
  `forwarders.app`, sin publicar DNS;
- un expediente de control identificable y autorización para modificar solo la
  copia aislada;
- evidencia inicial de conteos, versión máxima de migración y hora de inicio.

No usar cuentas, contraseñas, tokens ni datos personales reales en este archivo.

## Criterio de evidencia

Cada caso debe registrar fecha, ejecutor, rol, resultado, captura o referencia
de evidencia y cualquier incidencia. `Aprobado` exige que la acción positiva
funcione y que la prueba negativa asociada falle de forma controlada.

| ID | Rol / contexto | Validación | Estado |
| --- | --- | --- | --- |
| MT-UAT-01 | Hostname Sari | Login muestra branding Sari y el perfil pertenece al tenant Sari | Pendiente |
| MT-UAT-02 | Ventas | Crear cliente y cotización, editarla y enviarla a Pricing | Pendiente |
| MT-UAT-03 | Pricing | Registrar múltiples tarifas, seleccionar una, publicar opción y revisar PDF comercial | Pendiente |
| MT-UAT-04 | Operaciones | Crear Shipment y SI, aceptar expediente, crear Booking y evento operativo | Pendiente |
| MT-UAT-05 | Contabilidad | Validar costos y revisar que los datos visibles pertenecen a Sari | Pendiente |
| MT-UAT-06 | Finanzas | Crear proforma/factura de control y revisar CxC/CxP sin mezclar monedas | Pendiente |
| MT-UAT-07 | Cliente | Consultar solo sus cotizaciones, envíos, paquetes y documentos | Pendiente |
| MT-UAT-08 | Admin Sari | Editar configuración, invitar usuario y comprobar que dominio y tenant quedan fijados | Pendiente |
| MT-UAT-09 | Plataforma | Entrar por `forwarders.app/login`, consultar y responder soporte transversal | Pendiente |
| MT-UAT-10 | Plataforma | Confirmar que no aparecen dashboard, cotizaciones, finanzas, perfil ni creación de tickets | Pendiente |
| MT-UAT-11 | Aislamiento | Usuario Sari no puede iniciar sesión en otro hostname y plataforma no puede entrar al hostname Sari | Pendiente |
| MT-UAT-12 | Hostnames negativos | Raíz fuera de rutas de plataforma, dominio desconocido, reservado e inactivo fallan cerrados | Pendiente |
| MT-UAT-13 | Storage | Cargar, leer y borrar archivos permitidos; una ruta de otro tenant es rechazada | Pendiente |
| MT-UAT-14 | Comunicaciones | Invitación, recuperación y enlaces generados conservan el hostname correcto | Pendiente |
| MT-UAT-15 | Integridad | Conteos y relaciones del expediente de control permanecen correctos al finalizar | Pendiente |

## Recorrido canónico

Usar un solo expediente trazable para validar:

```text
Cliente
→ Cotización
→ Pricing y opción comercial
→ PDF
→ Shipment
→ Shipping Instruction
→ Booking
→ Evento operativo
→ Validación de costos
→ Facturación
→ Consulta del Cliente
```

El PDF debe mostrar ETD, carrier, tránsito, días libres, transbordo, Incoterm,
origen, destino y `client_notes`; no debe mostrar `pricing_notes`.

## Pruebas negativas obligatorias

- Cambiar manualmente un ID por el de otro tenant no entrega datos.
- Enviar `tenant_id`, hostname o headers manipulados no altera el tenant efectivo.
- Un administrador de plataforma solo ve soporte explícitamente autorizado.
- `forwarders.app/dashboard` y `forwarders.app/support/new` responden cerrado.
- Un usuario operativo no puede usar `forwarders.app/login`.
- Una cuenta de plataforma no puede usar `sari.forwarders.app/login`.
- Una URL de Storage de otro tenant no se descarga ni se reemplaza.

## Salida y firma

La fase solo puede cerrarse cuando los 15 casos estén aprobados, las incidencias
bloqueantes estén corregidas y repetidas, y se adjunten:

- huella de la copia y migraciones;
- duración total y observaciones de locks;
- conteos antes/después;
- responsable funcional y técnico;
- decisión explícita de avanzar o no a una ventana futura.

Si falta cualquiera de esos elementos, el estado continúa `Pendiente`.
