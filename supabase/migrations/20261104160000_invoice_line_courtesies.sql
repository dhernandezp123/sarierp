-- GOV-COURTESY-02: solicitudes por linea, ligadas a revision y contexto financiero.
create table public.invoice_courtesy_requests (
 id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants(id),
 draft_id uuid not null, draft_revision integer not null, line_key text not null check(length(line_key) between 1 and 120),
 source_pricing_item_id uuid, line_snapshot jsonb not null, context_fingerprint text not null,
 status text not null default 'Pendiente' check(status in ('Pendiente','Aprobada','Rechazada','Revocada','Aplicada')),
 reason text not null check(length(btrim(reason)) between 5 and 1000),
 requested_by uuid not null, requested_at timestamptz not null default now(),
 reviewed_by uuid, reviewed_at timestamptz, review_reason text, reviewer_fingerprint text,
 invoice_id uuid, unique(tenant_id,id), unique(draft_id,draft_revision,line_key),
 foreign key(tenant_id,draft_id) references public.invoice_drafts(tenant_id,id),
 foreign key(tenant_id,requested_by) references public.profiles(tenant_id,id),
 foreign key(tenant_id,reviewed_by) references public.profiles(tenant_id,id),
 foreign key(tenant_id,source_pricing_item_id) references public.pricing_items(tenant_id,id),
 foreign key(tenant_id,invoice_id) references public.invoices(tenant_id,id),
 check((status='Aplicada')=(invoice_id is not null)),
 check(status not in ('Aprobada','Aplicada') or (reviewed_by is not null and reviewed_at is not null and reviewer_fingerprint is not null and reviewed_by<>requested_by))
);
create index invoice_courtesy_pending on public.invoice_courtesy_requests(tenant_id,status,requested_at,id);
alter table public.invoice_courtesy_requests enable row level security;
revoke all on public.invoice_courtesy_requests from public,anon,authenticated;
grant select on public.invoice_courtesy_requests to authenticated;
create policy courtesy_requests_read on public.invoice_courtesy_requests for select to authenticated
using(tenant_id=public.current_tenant_id() and public.is_approved_active_user() and (public.can_manage_finance() or public.can_approve_invoice_courtesy()));

create function public.invoice_courtesy_authority_internal(p_tenant uuid,p_profile uuid) returns text
language sql stable security definer set search_path=public as $$
 select md5(jsonb_build_object('role',p.rol,'profile_version',p.xmin::text,'designation',to_jsonb(a),'master',case when p.rol::text in ('Admin','Contabilidad') then to_jsonb(m) end)::text)
 from public.profiles p
 left join public.invoice_courtesy_approvers a on a.tenant_id=p.tenant_id and a.profile_id=p.id
 left join public.invoice_master_settings m on m.tenant_id=p.tenant_id and m.profile_id=p.id
 where p.id=p_profile and p.tenant_id=p_tenant and p.status='Aprobado' and p.is_active
 and p.rol::text in ('Admin','Contabilidad','Finanzas','Operaciones','Pricing','Ventas')
 and (a.profile_id is not null or (m.profile_id is not null and p.rol::text in ('Admin','Contabilidad')));
$$;
create or replace function public.can_approve_invoice_courtesy() returns boolean language sql stable security definer set search_path=public as $$
 select public.is_approved_active_user() and public.invoice_courtesy_authority_internal(public.current_tenant_id(),auth.uid()) is not null;
$$;
create function public.invoice_courtesy_context_internal(p_draft uuid) returns text
language sql stable security definer set search_path=public as $$
 select md5(jsonb_build_object('revision',d.revision,'payload',d.invoice_payload,'items',d.items,'editor',d.editor_state,
 'quotation',case when d.quotation_id is not null then public.invoice_quotation_fingerprint_internal(d.quotation_id) end,
 'client_issuer',public.invoice_draft_context_internal(d.invoice_payload))::text)
 from public.invoice_drafts d where d.id=p_draft and d.tenant_id=public.current_tenant_id();
$$;
create function public.request_invoice_courtesy(p_draft_id uuid,p_revision integer,p_line_key text,p_reason text) returns jsonb
language plpgsql security definer set search_path=public as $$
declare d public.invoice_drafts%rowtype; r public.invoice_courtesy_requests%rowtype; line jsonb; source_id uuid; snapshot jsonb; gross numeric; discount numeric; rate numeric; tax numeric;
begin
 if not public.is_approved_active_user() or not public.can_manage_finance() then raise exception 'Sin permiso para solicitar cortesias' using errcode='42501';end if;
 if p_reason is null or length(btrim(p_reason)) not between 5 and 1000 then raise exception 'Indica un motivo de 5 a 1000 caracteres';end if;
 select * into d from public.invoice_drafts where id=p_draft_id and tenant_id=public.current_tenant_id() for update;
 if not found or d.revision<>p_revision or d.status in ('Emitida','Descartada') or d.source_invoice_id is not null then raise exception 'Borrador no disponible para solicitar cortesia';end if;
 if nullif(d.invoice_payload->>'cliente_id','') is null then raise exception 'Selecciona el cliente antes de solicitar una cortesia';end if;
 if d.quotation_id is not null then
   perform 1 from public.quotations where id=d.quotation_id and tenant_id=d.tenant_id for share;
   if d.quotation_fingerprint is distinct from public.invoice_quotation_fingerprint_internal(d.quotation_id) then raise exception 'Actualiza las lineas de la cotizacion y guarda el borrador';end if;
   select jsonb_build_object('description',pi.description,'quantity',pi.quantity,'unit_price',pi.sale_amount,'currency',coalesce(nullif(pi.currency,''),'USD'),'isv_rate',case when pi.taxable then pi.tax_rate else 0 end),pi.id
   into line,source_id from public.pricing_items pi where pi.id::text=p_line_key and pi.quotation_id=d.quotation_id and pi.tenant_id=d.tenant_id and pi.deleted_at is null;
 else
   if jsonb_array_length(d.items)<>jsonb_array_length(d.editor_state->'items')
    or (select count(distinct e->>'id') from jsonb_array_elements(d.editor_state->'items')e)<>jsonb_array_length(d.items) then raise exception 'Guarda el borrador con identificadores de linea unicos';end if;
   select d.items->(e.ordinality::integer-1) into line from jsonb_array_elements(d.editor_state->'items') with ordinality e(value,ordinality) where e.value->>'id'=p_line_key;
 end if;
 if line is null or coalesce((line->>'quantity')::numeric,0)<=0 or coalesce((line->>'unit_price')::numeric,0)<=0 then raise exception 'Selecciona una linea con importe positivo del borrador';end if;
 gross:=round((line->>'quantity')::numeric*(line->>'unit_price')::numeric,2);
 discount:=coalesce((line->>'discount_amount')::numeric,(d.invoice_payload->'line_discounts'->>p_line_key)::numeric,0);
 rate:=case when d.invoice_payload->>'fiscal_mode' in ('Exenta','Exonerada') or line->>'tax_treatment' in ('Exenta','Exonerada') then 0 else coalesce((line->>'isv_rate')::numeric,0) end;
 if gross::text in ('NaN','Infinity','-Infinity') or discount::text in ('NaN','Infinity','-Infinity') or discount<0 or discount>=gross or discount<>round(discount,2) or rate not in (0,15,18) then raise exception 'Completa el importe, descuento parcial e impuesto antes de solicitar la cortesia';end if;
 tax:=round((gross-discount)*rate/100,2);
 snapshot:=line||jsonb_build_object('currency',coalesce(line->>'currency',d.invoice_payload->>'currency'),'line_key',p_line_key);
 if coalesce(snapshot->>'currency','') not in ('USD','HNL') then raise exception 'Completa la moneda del borrador antes de solicitar la cortesia';end if;
 snapshot:=snapshot||jsonb_build_object('gross_amount',gross,'discount_amount',discount,'net_amount',gross-discount,'tax_amount',tax,'total',gross-discount+tax,'fiscal_mode',d.invoice_payload->>'fiscal_mode','isv_rate',rate);
 select * into r from public.invoice_courtesy_requests where draft_id=d.id and draft_revision=d.revision and line_key=p_line_key for update;
 if found and r.status='Aplicada' then raise exception 'La cortesia ya se aplico';end if;
 if found and r.status='Pendiente' and r.reason=btrim(p_reason) and r.context_fingerprint=public.invoice_courtesy_context_internal(d.id) then return to_jsonb(r);end if;
 if found and r.status='Aprobada' and r.context_fingerprint=public.invoice_courtesy_context_internal(d.id)
   and r.reviewer_fingerprint=public.invoice_courtesy_authority_internal(d.tenant_id,r.reviewed_by) then raise exception 'La linea ya tiene una cortesia aprobada vigente';end if;
 insert into public.invoice_courtesy_requests(tenant_id,draft_id,draft_revision,line_key,source_pricing_item_id,line_snapshot,context_fingerprint,reason,requested_by)
 values(d.tenant_id,d.id,d.revision,p_line_key,source_id,snapshot,public.invoice_courtesy_context_internal(d.id),btrim(p_reason),auth.uid())
 on conflict(draft_id,draft_revision,line_key) do update set status='Pendiente',line_snapshot=excluded.line_snapshot,context_fingerprint=excluded.context_fingerprint,
 reason=excluded.reason,requested_by=excluded.requested_by,requested_at=now(),reviewed_by=null,reviewed_at=null,review_reason=null,reviewer_fingerprint=null
 returning * into r;
 perform public.invoice_workflow_event_internal(d.id,'Cortesia solicitada',r.reason,to_jsonb(r));return to_jsonb(r);
end;
$$;
create function public.review_invoice_courtesy(p_id uuid,p_decision text,p_reason text) returns jsonb
language plpgsql security definer set search_path=public as $$
declare r public.invoice_courtesy_requests%rowtype; d public.invoice_drafts%rowtype;
begin
 if not public.is_approved_active_user() then raise exception 'Sin permiso' using errcode='42501';end if;
 if p_decision not in ('Aprobar','Rechazar','Retirar') or p_decision is null or p_reason is null or length(btrim(p_reason)) not between 5 and 1000 then raise exception 'Decision y motivo requeridos';end if;
 select * into r from public.invoice_courtesy_requests where id=p_id and tenant_id=public.current_tenant_id();
 if not found then raise exception 'Solicitud no disponible' using errcode='42501';end if;
 -- Mismo orden de bloqueo que emision/guardado: borrador, solicitud, autoridad.
 select * into d from public.invoice_drafts where id=r.draft_id and tenant_id=r.tenant_id for update;
 select * into r from public.invoice_courtesy_requests where id=p_id for update;
 if d.status in ('Emitida','Descartada') or r.status='Aplicada' then raise exception 'El documento ya no admite decisiones';end if;
 if p_decision='Retirar' then
   if not public.can_manage_finance() then raise exception 'Sin permiso para retirar la solicitud' using errcode='42501';end if;
 else
   if not public.can_approve_invoice_courtesy() then raise exception 'Solo un autorizador vigente puede revisar cortesias' using errcode='42501';end if;
   if r.requested_by=auth.uid() then raise exception 'Otra persona autorizada debe revisar tu solicitud';end if;
   if r.draft_revision<>d.revision or r.context_fingerprint is distinct from public.invoice_courtesy_context_internal(d.id) then raise exception 'El borrador cambio; solicita una nueva cortesia';end if;
   if r.status not in ('Pendiente','Aprobada','Rechazada') then raise exception 'La solicitud no esta pendiente';end if;
   if r.status<>'Pendiente' then
     if r.reviewed_by=auth.uid() and r.review_reason=btrim(p_reason) and r.status=(case when p_decision='Aprobar' then 'Aprobada' else 'Rechazada' end) then return to_jsonb(r);end if;
     raise exception 'La solicitud ya fue revisada';
   end if;
 end if;
 update public.invoice_courtesy_requests set status=case p_decision when 'Aprobar' then 'Aprobada' when 'Rechazar' then 'Rechazada' else 'Revocada' end,
 reviewed_by=case when p_decision='Retirar' then reviewed_by else auth.uid() end,reviewed_at=now(),review_reason=btrim(p_reason),
 reviewer_fingerprint=case when p_decision='Aprobar' then public.invoice_courtesy_authority_internal(r.tenant_id,auth.uid()) else null end where id=r.id returning * into r;
 perform public.invoice_workflow_event_internal(d.id,'Cortesia '||lower(r.status),btrim(p_reason),to_jsonb(r));return to_jsonb(r);
end;
$$;
create function public.get_invoice_courtesies(p_draft_id uuid default null,p_offset integer default 0,p_limit integer default 50,p_status text default null) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare result jsonb;
begin
 if not public.is_approved_active_user() or not (public.can_manage_finance() or public.can_approve_invoice_courtesy()) then raise exception 'Sin permiso' using errcode='42501';end if;
 if p_offset is null or p_limit is null or p_offset<0 or p_limit not between 1 and 100 then raise exception 'Paginacion invalida';end if;
 if p_status is not null and p_status not in ('Pendiente','Aprobada','Rechazada','Revocada','Aplicada') then raise exception 'Estado de cortesia invalido';end if;
 with records as (
  select r.*,d.revision as current_revision,d.status as draft_status,d.invoice_payload->>'cliente_id' as client_id,
   coalesce(c.nombre,'Sin cliente') as client_name,concat_ws(' ',p.nombre,p.apellido) as requester_name,
   (r.draft_revision=d.revision and r.context_fingerprint=public.invoice_courtesy_context_internal(d.id)) as is_current,
   (r.status in ('Aprobada','Aplicada') and r.reviewer_fingerprint=public.invoice_courtesy_authority_internal(r.tenant_id,r.reviewed_by)) as approval_effective
  from public.invoice_courtesy_requests r join public.invoice_drafts d on d.id=r.draft_id and d.tenant_id=r.tenant_id
  join public.profiles p on p.id=r.requested_by and p.tenant_id=r.tenant_id
  left join public.clientes c on c.id=nullif(d.invoice_payload->>'cliente_id','')::uuid and c.tenant_id=d.tenant_id
  where r.tenant_id=public.current_tenant_id() and (p_draft_id is null or r.draft_id=p_draft_id) and (p_status is null or r.status=p_status)
 ), page as (select * from records order by requested_at desc,id limit p_limit offset p_offset)
 select jsonb_build_object('requests',coalesce((select jsonb_agg(to_jsonb(page)) from page),'[]'::jsonb),'total',(select count(*) from records)) into result;
 return result;
end;
$$;
create function public.invalidate_invoice_courtesies_internal() returns trigger language plpgsql security definer set search_path=public as $$
declare r record;
begin
 if old.revision<>new.revision or new.status='Descartada' then
  for r in update public.invoice_courtesy_requests set status='Revocada' where draft_id=new.id and status in ('Pendiente','Aprobada') returning * loop
   perform public.invoice_workflow_event_internal(new.id,'Cortesia invalidada','El borrador cambio',to_jsonb(r));
  end loop;
 end if;return new;
end $$;
create trigger invalidate_invoice_courtesies after update on public.invoice_drafts for each row execute function public.invalidate_invoice_courtesies_internal();

create function public.invoice_courtesy_exclusions_internal(p_invoice jsonb,p_quotation uuid default null) returns text[]
language plpgsql security definer set search_path=public as $$
declare d public.invoice_drafts%rowtype; r public.invoice_courtesy_requests%rowtype; result text[]:='{}';
begin
 if nullif(p_invoice->>'courtesy_draft_id','') is null then return result;end if;
 select * into d from public.invoice_drafts where id=(p_invoice->>'courtesy_draft_id')::uuid and tenant_id=public.current_tenant_id() for update;
 if not found or d.status in ('Emitida','Descartada') or d.source_invoice_id is not null or d.quotation_id is distinct from p_quotation
  or (p_invoice-array['courtesy_draft_id','quotation_id']) is distinct from (d.invoice_payload||jsonb_build_object('invoice_type','Factura')) then raise exception 'El contexto de cortesia no coincide con el borrador';end if;
 for r in select * from public.invoice_courtesy_requests where draft_id=d.id and draft_revision=d.revision and status='Aprobada' order by id for update loop
  perform 1 from public.profiles where id=r.reviewed_by and tenant_id=d.tenant_id for share;
  perform 1 from public.invoice_courtesy_approvers where profile_id=r.reviewed_by and tenant_id=d.tenant_id for share;
  perform 1 from public.invoice_master_settings where profile_id=r.reviewed_by and tenant_id=d.tenant_id for share;
  if r.context_fingerprint is distinct from public.invoice_courtesy_context_internal(d.id)
    or r.reviewer_fingerprint is distinct from public.invoice_courtesy_authority_internal(d.tenant_id,r.reviewed_by) then raise exception 'La aprobacion de cortesia ya no es vigente; solicita una nueva revision';end if;
  result:=array_append(result,r.line_key);
 end loop;return result;
end;
$$;
create function public.guard_invoice_full_discount_internal(p_invoice jsonb,p_items jsonb) returns void
language plpgsql security definer set search_path=public as $$
declare item jsonb; gross numeric; discount numeric;
begin
 if p_invoice->>'invoice_type' is distinct from 'Factura' or jsonb_typeof(p_items) is distinct from 'array' then return;end if;
 for item in select value from jsonb_array_elements(p_items) loop
  gross:=round(coalesce((item->>'quantity')::numeric,0)*coalesce((item->>'unit_price')::numeric,0),2);
  discount:=coalesce((item->>'discount_amount')::numeric,(p_invoice->'line_discounts'->>(item->>'source_pricing_item_id'))::numeric,0);
  if gross>0 and gross::text not in ('NaN','Infinity','-Infinity') and discount=gross then raise exception 'El descuento completo de una linea con importe positivo requiere solicitar y aprobar una cortesia';end if;
 end loop;
end $$;

-- La cola canonica conserva todos sus controles y calcula orden continuo tras excluir.
do $$ declare definition text; needle text:=E'      and pi.deleted_at is null\n  ) source_lines;';begin
 definition:=replace(pg_get_functiondef('public.create_invoice_from_quotation_tenant_internal(jsonb,uuid)'::regprocedure),E'\r\n',E'\n');
 if position(needle in definition)=0 then raise exception 'No se reconocio el constructor canonico de lineas';end if;
 definition:=replace(definition,needle,E'      and pi.deleted_at is null\n      and not (pi.id::text=any(public.invoice_courtesy_exclusions_internal(p_invoice,p_quotation_id)))\n  ) source_lines;');
 needle:=E'  select * into v_quotation\n';
 if position(needle in definition)=0 then raise exception 'No se reconocio el bloqueo de cotizacion';end if;
 definition:=replace(definition,needle,E'  perform public.invoice_courtesy_exclusions_internal(p_invoice,p_quotation_id);\n'||needle);
 execute definition;
 definition:=pg_get_functiondef('public.issue_invoice_draft(uuid,integer)'::regprocedure);
 needle:='payload:=draft.invoice_payload||jsonb_build_object(''invoice_type'',''Factura'');';
 if position(needle in definition)=0 then raise exception 'No se reconocio la emision canonica de borradores';end if;
 definition:=replace(definition,needle,needle||E'\n if draft.source_invoice_id is null then payload:=payload||jsonb_build_object(''courtesy_draft_id'',draft.id);end if;');execute definition;
 -- Punto fiscal comun, tambien para conversion de proformas: ninguna ruta puede eludir el 100%.
 definition:=pg_get_functiondef('public.create_invoice_fiscal_base(jsonb,jsonb)'::regprocedure);
 if definition !~* '\mbegin[[:space:]]' then raise exception 'No se reconocio el nucleo fiscal';end if;
 definition:=regexp_replace(definition,'(?i)\mbegin[[:space:]]',E'begin\n perform public.guard_invoice_full_discount_internal(p_invoice,p_items);\n');execute definition;
end $$;

create or replace function public.create_invoice_with_items(p_invoice jsonb,p_items jsonb) returns table(invoice_id uuid,invoice_number text)
language plpgsql security definer set search_path=public as $$
declare result record; q public.quotations%rowtype; d public.invoice_drafts%rowtype; exclusions text[]:='{}'; items jsonb:=p_items; item jsonb; idx integer:=0; expected integer; r record; source_currency text; currencies integer;
begin
 if not public.is_approved_active_user() or not public.can_manage_finance() then raise exception 'Sin permiso para emitir' using errcode='42501';end if;
 if p_invoice->>'invoice_type'='Factura' then
  exclusions:=public.invoice_courtesy_exclusions_internal(p_invoice,nullif(p_invoice->>'quotation_id','')::uuid);
  if nullif(p_invoice->>'quotation_id','') is not null then
   select * into q from public.quotations where id=(p_invoice->>'quotation_id')::uuid and tenant_id=public.current_tenant_id() and deleted_at is null for update;
   if not found or q.status<>'Ganada' or q.financial_validation_status<>'Validado' or q.cliente_id is distinct from nullif(p_invoice->>'cliente_id','')::uuid then raise exception 'Cotizacion no disponible para facturar';end if;
   if exists(select 1 from public.invoices i where i.quotation_id=q.id and i.tenant_id=q.tenant_id and i.invoice_type='Factura' and i.status<>'Anulada' and i.deleted_at is null) then raise exception 'La cotizacion ya tiene una factura activa';end if;
   select count(distinct coalesce(nullif(pi.currency,''),'USD')),min(coalesce(nullif(pi.currency,''),'USD')) into currencies,source_currency
    from public.pricing_items pi where pi.quotation_id=q.id and pi.tenant_id=q.tenant_id and pi.deleted_at is null;
   if currencies<>1 or source_currency not in ('USD','HNL') then raise exception 'La cotizacion debe tener una sola moneda valida';end if;
   if (coalesce(nullif(p_invoice->>'currency',''),'USD')<>source_currency or (p_invoice->'conversion' is not null and p_invoice->'conversion'<>'null'::jsonb))
    and p_invoice->'conversion'->>'source_currency' is distinct from source_currency then raise exception 'Confirma la moneda original y la conversion';end if;
   select count(*) into expected from public.pricing_items pi where pi.quotation_id=q.id and pi.tenant_id=q.tenant_id and pi.deleted_at is null and not(pi.id::text=any(exclusions));
   if jsonb_typeof(items) is distinct from 'array' or jsonb_array_length(items)<>expected or exists(
    select 1 from jsonb_array_elements(items) x left join public.pricing_items pi on pi.id::text=x->>'source_pricing_item_id' and pi.quotation_id=q.id and pi.tenant_id=q.tenant_id and pi.deleted_at is null
    where pi.id is null or pi.id::text=any(exclusions) or pi.quantity is distinct from (x->>'quantity')::numeric or pi.sale_amount is distinct from (x->>'unit_price')::numeric
     or pi.description is distinct from x->>'description' or (case when coalesce(pi.taxable,false) then coalesce(pi.tax_rate,0) else 0 end) is distinct from (x->>'isv_rate')::numeric
   ) or (select count(distinct x->>'source_pricing_item_id') from jsonb_array_elements(items)x)<>expected
   or exists(select 1 from jsonb_array_elements(items) with ordinality x(value,ordinality) where coalesce((x.value->>'sort_order')::integer,x.ordinality::integer-1)<>x.ordinality-1)
   then raise exception 'Las lineas de factura deben coincidir con la cotizacion y sus cortesias aprobadas';end if;
  elsif nullif(p_invoice->>'courtesy_draft_id','') is not null and cardinality(exclusions)>0 then
   select * into d from public.invoice_drafts where id=(p_invoice->>'courtesy_draft_id')::uuid and tenant_id=public.current_tenant_id() for update;
   if items is distinct from d.items then raise exception 'Las lineas no coinciden con el borrador autorizado';end if;
   if jsonb_array_length(items)<>jsonb_array_length(d.editor_state->'items') or (select count(distinct e->>'id') from jsonb_array_elements(d.editor_state->'items')e)<>jsonb_array_length(items)
    or exists(select 1 from jsonb_array_elements(items) with ordinality x(value,ordinality)
      where nullif(x.value->>'source_editor_item_id','') is not null and x.value->>'source_editor_item_id' is distinct from d.editor_state->'items'->(x.ordinality::integer-1)->>'id') then raise exception 'Identificadores de linea del borrador invalidos';end if;
   items:='[]';
   for item,expected in select e.value,e.ordinality::integer-1 from jsonb_array_elements(p_items) with ordinality e(value,ordinality) loop
    if not(coalesce(item->>'source_editor_item_id',d.editor_state->'items'->expected->>'id','')=any(exclusions)) then
      items:=items||jsonb_build_array(item||jsonb_build_object('sort_order',idx));idx:=idx+1;
    end if;
   end loop;
  end if;
 end if;
 if jsonb_typeof(items) is distinct from 'array' or jsonb_array_length(items)=0 then raise exception 'La factura debe conservar al menos una linea facturable';end if;
 select * into result from public.create_invoice_with_items_trusted(p_invoice-array['courtesy_draft_id'],items);
 if q.id is not null then
  update public.invoice_items ii set source_pricing_item_id=(x.value->>'source_pricing_item_id')::uuid
  from jsonb_array_elements(items) with ordinality x(value,ordinality) where ii.invoice_id=result.invoice_id and ii.tenant_id=q.tenant_id and ii.sort_order=x.ordinality-1;
 end if;
 if cardinality(exclusions)>0 then
  for r in update public.invoice_courtesy_requests set status='Aplicada',invoice_id=result.invoice_id
   where draft_id=(p_invoice->>'courtesy_draft_id')::uuid and status='Aprobada' and line_key=any(exclusions) returning * loop
    perform public.invoice_workflow_event_internal(r.draft_id,'Cortesia aplicada',r.reason,to_jsonb(r));
  end loop;
  update public.invoice_drafts set status='Emitida',invoice_id=result.invoice_id,updated_at=now() where id=(p_invoice->>'courtesy_draft_id')::uuid and tenant_id=public.current_tenant_id();
 end if;
 return query select i.id,i.invoice_number from public.invoices i where i.id=result.invoice_id and i.tenant_id=public.current_tenant_id();
end $$;

revoke all on function public.invoice_courtesy_authority_internal(uuid,uuid),public.invoice_courtesy_context_internal(uuid),public.invoice_courtesy_exclusions_internal(jsonb,uuid),public.guard_invoice_full_discount_internal(jsonb,jsonb),public.invalidate_invoice_courtesies_internal() from public,anon,authenticated;
revoke all on function public.request_invoice_courtesy(uuid,integer,text,text),public.review_invoice_courtesy(uuid,text,text),public.get_invoice_courtesies(uuid,integer,integer,text) from public,anon;
grant execute on function public.request_invoice_courtesy(uuid,integer,text,text),public.review_invoice_courtesy(uuid,text,text),public.get_invoice_courtesies(uuid,integer,integer,text) to authenticated;
notify pgrst,'reload schema';
