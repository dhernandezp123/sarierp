-- Plantilla de seguimiento de cotizacion: correo que Ventas copia desde el
-- detalle de la cotizacion para pedir retroalimentacion de la tarifa ofertada.

insert into email_templates (template_key, nombre, descripcion, asunto, cuerpo)
values (
  'seguimiento_cotizacion',
  'Seguimiento de cotización',
  'Correo de seguimiento que el vendedor envía cuando la cotización lleva días sin respuesta. Se genera desde el detalle de la cotización.',
  'Seguimiento Cotización {{numero_cotizacion}} - Sari Express',
  E'Buen día {{cliente}},\n\nEspero que se encuentre muy bien.\n\nLe escribo para dar seguimiento a la tarifa ofertada según nuestra referencia {{numero_cotizacion}}.\nPara nosotros es muy importante contar con su retroalimentación, ya que nos permitirá atender cualquier ajuste o comentario que considere necesario.\n\nQuedo atento(a) a sus observaciones y a cualquier información adicional que requiera para la evaluación o aprobación de la propuesta.\n\nAgradezco de antemano su atención y quedo pendiente de su respuesta.\n\n{{cierre}}'
)
on conflict (template_key) do nothing;
