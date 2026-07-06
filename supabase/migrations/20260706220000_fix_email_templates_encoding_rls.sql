-- Correccion posterior a la semilla inicial de plantillas:
-- 1) normaliza textos UTF-8 si la migracion anterior ya fue aplicada;
-- 2) endurece RLS con helpers versionados del ERP.

insert into public.email_templates (template_key, nombre, descripcion, asunto, cuerpo)
values (
  'cotizacion_cliente',
  'Cotización al cliente',
  'Correo que acompaña el PDF de cotización enviado al cliente. Las líneas cuyas variables queden vacías (por ejemplo el bloque de tarifa cuando no hay tarifa seleccionada) se omiten automáticamente.',
  'Cotización {{numero_cotizacion}} - Sari Express',
  E'Buen día {{cliente}},\n\nEspero que se encuentre bien.\nEn adjunto encontrarán nuestra cotización para el movimiento de su carga con origen {{origen}} y destino {{destino}}.\n\nCotización #: {{numero_cotizacion}}\nServicio: {{servicio}}\nIncoterm: {{incoterm}}\nOrigen: {{origen}}\nDestino: {{destino}}\nCommodity: {{commodity}}\nContenedores: {{contenedores}}\n\n{{titulo_tarifa}}\n{{etiqueta_carrier}}: {{carrier}}\nTránsito: {{transito}}\nETD estimado: {{etd}}\nDías libres: {{dias_libres}}\nTarifa comercial: {{tarifa_comercial}}\nTarifa válida hasta: {{valida_hasta}}\n\nQuedamos atentos a su confirmación y a cualquier consulta adicional.\n\n{{cierre}}'
)
on conflict (template_key) do update
set nombre = excluded.nombre,
    descripcion = excluded.descripcion,
    asunto = excluded.asunto,
    cuerpo = excluded.cuerpo,
    updated_at = now();

insert into public.email_templates (template_key, nombre, descripcion, asunto, cuerpo)
values (
  'seguimiento_cotizacion',
  'Seguimiento de cotización',
  'Correo de seguimiento que el vendedor envía cuando la cotización lleva días sin respuesta. Se genera desde el detalle de la cotización.',
  'Seguimiento Cotización {{numero_cotizacion}} - Sari Express',
  E'Buen día {{cliente}},\n\nEspero que se encuentre muy bien.\n\nLe escribo para dar seguimiento a la tarifa ofertada según nuestra referencia {{numero_cotizacion}}.\nPara nosotros es muy importante contar con su retroalimentación, ya que nos permitirá atender cualquier ajuste o comentario que considere necesario.\n\nQuedo atento(a) a sus observaciones y a cualquier información adicional que requiera para la evaluación o aprobación de la propuesta.\n\nAgradezco de antemano su atención y quedo pendiente de su respuesta.\n\n{{cierre}}'
)
on conflict (template_key) do update
set nombre = excluded.nombre,
    descripcion = excluded.descripcion,
    asunto = excluded.asunto,
    cuerpo = excluded.cuerpo,
    updated_at = now();

drop policy if exists "email_templates_select" on public.email_templates;
drop policy if exists "email_templates_insert" on public.email_templates;
drop policy if exists "email_templates_update" on public.email_templates;
drop policy if exists "email_templates_delete" on public.email_templates;

create policy "email_templates_select" on public.email_templates
  for select to authenticated
  using (public.is_approved_active_user());

create policy "email_templates_insert" on public.email_templates
  for insert to authenticated
  with check (public.is_admin());

create policy "email_templates_update" on public.email_templates
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "email_templates_delete" on public.email_templates
  for delete to authenticated
  using (public.is_admin());
