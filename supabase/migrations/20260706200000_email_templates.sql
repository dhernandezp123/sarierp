-- Plantillas de correo editables: sustituye el cuerpo hardcodeado del
-- correo de cotizacion por plantillas con variables {{...}} administrables
-- desde Settings.

create table if not exists email_templates (
  id            uuid default gen_random_uuid() primary key,
  template_key  text not null unique,
  nombre        text not null,
  descripcion   text,
  asunto        text not null,
  cuerpo        text not null,
  is_active     boolean not null default true,
  updated_by    uuid references profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

alter table email_templates enable row level security;

drop policy if exists "email_templates_select" on email_templates;
drop policy if exists "email_templates_insert" on email_templates;
drop policy if exists "email_templates_update" on email_templates;
drop policy if exists "email_templates_delete" on email_templates;

-- Todos los roles internos leen las plantillas para componer correos.
create policy "email_templates_select" on email_templates
  for select using (public.is_approved_active_user());

-- Solo Admin administra las plantillas.
create policy "email_templates_insert" on email_templates
  for insert with check (public.is_admin());

create policy "email_templates_update" on email_templates
  for update using (public.is_admin())
  with check (public.is_admin());

create policy "email_templates_delete" on email_templates
  for delete using (public.is_admin());

-- Semilla: plantilla del correo de cotizacion equivalente al texto que
-- estaba hardcodeado en quotations/[id]. Las lineas cuyos {{placeholders}}
-- resuelven vacios se eliminan al renderizar (bloque de tarifa condicional).
insert into email_templates (template_key, nombre, descripcion, asunto, cuerpo)
values (
  'cotizacion_cliente',
  'Cotización al cliente',
  'Correo que acompaña el PDF de cotización enviado al cliente. Las líneas cuyas variables queden vacías (por ejemplo el bloque de tarifa cuando no hay tarifa seleccionada) se omiten automáticamente.',
  'Cotización {{numero_cotizacion}} - Sari Express',
  E'Buen día {{cliente}},\n\nEspero que se encuentre bien.\nEn adjunto encontrarán nuestra cotización para el movimiento de su carga con origen {{origen}} y destino {{destino}}.\n\nCotización #: {{numero_cotizacion}}\nServicio: {{servicio}}\nIncoterm: {{incoterm}}\nOrigen: {{origen}}\nDestino: {{destino}}\nCommodity: {{commodity}}\nContenedores: {{contenedores}}\n\n{{titulo_tarifa}}\n{{etiqueta_carrier}}: {{carrier}}\nTránsito: {{transito}}\nETD estimado: {{etd}}\nDías libres: {{dias_libres}}\nTarifa comercial: {{tarifa_comercial}}\nTarifa válida hasta: {{valida_hasta}}\n\nQuedamos atentos a su confirmación y a cualquier consulta adicional.\n\n{{cierre}}'
)
on conflict (template_key) do nothing;
