# Agenda y reporte de visitas

En `/ventas`, **Nueva Actividad → Visita** permite elegir una cuenta existente
por nombre/código o registrar un prospecto. Indica fecha programada, horario,
objetivo en Comentarios y estado de ejecución. Las nuevas actividades comienzan
en **Pendiente**. Después de la visita, edita la actividad para marcarla
**Realizada**, registrar el resultado y la próxima acción. Usa **Cancelada**
cuando la visita no se ejecutará.

El vendedor puede modificar sus propias actividades; Admin puede modificar las
del equipo. Las actividades de otros vendedores se abren solo para consulta.
Todos los accesos siguen limitados a la empresa del usuario aprobado y activo.

## Obtener el informe

1. Abre **Reporte de visitas** desde `/ventas`, o **Reportes → Visitas**.
2. El reporte inicia con **Pendiente** y el mes completo, para planificar.
3. Elige **Hoy**, **Esta semana** (lunes a domingo), **Este mes completo** o
   introduce **Desde/Hasta** para cualquier día, semana o mes pasado/futuro.
4. Filtra por cliente/prospecto, vendedor y estado. La búsqueda incluye el código,
   cuenta, objetivo, resultado y seguimiento.
5. Usa **Exportar CSV**, **Descargar PDF** o **Abrir PDF para imprimir**.
   La exportación incluye todos los registros filtrados, no solo la página visible.

Los períodos se calculan por **fecha programada de la visita** y ambos extremos
son inclusivos. El estado mostrado es el actual, no una reconstrucción histórica
al cierre del período. Una pendiente de fecha anterior a hoy aparece vencida;
una visita de hoy no se considera vencida por su hora.

Las actividades anteriores a esta mejora conservan estado **Sin clasificar**.
Revísalas con ese filtro y asigna su estado real; no se deduce por la fecha ni
por tener un resultado escrito. **Todos** permite verlas junto al resto.

Los indicadores, la tabla y las exportaciones respetan los mismos filtros.
Una consulta incompleta muestra un error y bloquea las exportaciones; usa
**Reintentar** para volver a obtener el informe completo.
