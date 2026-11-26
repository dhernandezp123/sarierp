-- ACC-INVOICE-SERVICE-03 / ACC-DUE-DATE-01. No historical row updates.
create or replace function public.save_service_accounting(p_source_kind text,p_source_code text,p_revision integer,p_variants jsonb,p_reason text) returns integer
language plpgsql security definer set search_path=public as $$
declare profile public.service_accounting_profiles; variant jsonb; account uuid; side text; before_values jsonb;
begin
 if auth.uid() is null or not public.is_invoice_master() then raise exception 'Solo el usuario máster puede configurar las cuentas de servicios' using errcode='42501';end if;
 if p_source_kind is null or p_source_kind not in ('service','product') or nullif(btrim(p_source_code),'') is null or length(p_source_code)>200
  or nullif(btrim(p_reason),'') is null or length(p_reason)>1000 then raise exception 'Indica el concepto y motivo del cambio';end if;
 if jsonb_typeof(p_variants) is distinct from 'array' or jsonb_array_length(p_variants)>3 then raise exception 'Variantes inválidas';end if;
 if p_source_kind='service' then
  perform 1 from public.client_rate_catalog where tenant_id=public.current_tenant_id() and code=p_source_code and active for share;
 else
  perform 1 from public.service_products where tenant_id=public.current_tenant_id() and value=p_source_code and active for share;
 end if;
 if not found then raise exception 'Concepto no disponible en esta empresa';end if;
 perform pg_advisory_xact_lock(hashtextextended('accounts:'||public.current_tenant_id()::text,0));
 perform pg_advisory_xact_lock(hashtextextended('service-accounts:'||public.current_tenant_id()::text||':'||p_source_kind||':'||p_source_code,0));
 select * into profile from public.service_accounting_profiles where tenant_id=public.current_tenant_id() and source_kind=p_source_kind and source_code=p_source_code for update;
 if p_revision is distinct from coalesce(profile.revision,0) then raise exception 'La asignación cambió; recarga antes de guardar';end if;
 select jsonb_agg(to_jsonb(v) order by tax_variant) into before_values from public.service_accounting_variants v where profile_id=profile.id;
 if (select count(*) from jsonb_array_elements(p_variants))<>(select count(distinct value->>'tax_variant') from jsonb_array_elements(p_variants)) then raise exception 'No repitas una variante fiscal';end if;
 for variant in select value from jsonb_array_elements(p_variants) loop
  if variant->>'tax_variant' is null or variant->>'tax_variant' not in ('I','E','Exonerada') or jsonb_typeof(variant->'income_applicable') is distinct from 'boolean'
   or jsonb_typeof(variant->'expense_applicable') is distinct from 'boolean' then raise exception 'Revisa la variante y sus cuentas aplicables';end if;
  foreach side in array array['income','expense'] loop
   account:=nullif(variant->>(side||'_account_id'),'')::uuid;
   if not (variant->>(side||'_applicable'))::boolean and account is not null then raise exception 'Una cuenta no aplicable debe quedar vacía';end if;
   if account is not null and not exists(select 1 from public.accounting_accounts a where a.id=account and a.tenant_id=public.current_tenant_id()
    and a.active and a.postable and a.account_level in ('Auxiliar','SubCuenta') and ((side='income' and a.kind='Ingreso') or (side='expense' and a.kind in ('Costo','Gasto')))) then raise exception 'Selecciona una auxiliar activa de la naturaleza y empresa correspondientes';end if;
  end loop;
 end loop;
 foreach side in array array['income','expense'] loop
  if (select count(distinct nullif(v->>(side||'_account_id'),'')) from jsonb_array_elements(p_variants) v where (v->>(side||'_applicable'))::boolean)>1 then
   raise exception 'Un servicio debe tener una sola cuenta por uso contable, independiente del impuesto';
  end if;
 end loop;
 if profile.id is null then
  insert into public.service_accounting_profiles(source_kind,source_code,updated_by) values(p_source_kind,p_source_code,auth.uid()) returning * into profile;
 else
  update public.service_accounting_profiles set revision=revision+1,updated_at=now(),updated_by=auth.uid() where id=profile.id returning * into profile;
 end if;
 delete from public.service_accounting_variants where profile_id=profile.id and tenant_id=profile.tenant_id
  and tax_variant not in(select value->>'tax_variant' from jsonb_array_elements(p_variants));
 insert into public.service_accounting_variants(tenant_id,profile_id,tax_variant,income_applicable,expense_applicable,income_account_id,expense_account_id)
 select profile.tenant_id,profile.id,v->>'tax_variant',(v->>'income_applicable')::boolean,(v->>'expense_applicable')::boolean,
  nullif(v->>'income_account_id','')::uuid,nullif(v->>'expense_account_id','')::uuid from jsonb_array_elements(p_variants)v where true
 on conflict(tenant_id,profile_id,tax_variant) do update set income_applicable=excluded.income_applicable,expense_applicable=excluded.expense_applicable,
  income_account_id=excluded.income_account_id,expense_account_id=excluded.expense_account_id;
 insert into public.activity_logs(tenant_id,user_id,module,action,entity_type,entity_id,description,metadata)
 values(profile.tenant_id,auth.uid(),'Contabilidad','Asignación de cuentas por servicio','service_accounting_profiles',profile.id,btrim(p_reason),
  jsonb_build_object('source_kind',p_source_kind,'source_code',p_source_code,'revision',profile.revision,'before',before_values,'after',p_variants));
 return profile.revision;
end $$;
revoke all on function public.save_service_accounting(text,text,integer,jsonb,text) from public,anon;
grant execute on function public.save_service_accounting(text,text,integer,jsonb,text) to authenticated;


create or replace function public.resolve_service_account(p_kind text,p_code text,p_variant text,p_side text) returns uuid
language plpgsql security definer set search_path=public as $$
declare account uuid; source_active boolean; assignments integer;
begin
 if p_kind is null or p_code is null then return null;end if;
 if p_kind not in ('service','product') or p_variant not in ('I','E','Exonerada') or p_side not in ('income','expense') then raise exception 'Referencia de servicio invalida';end if;
 if p_kind='service' then select active into source_active from public.client_rate_catalog where tenant_id=public.current_tenant_id() and code=p_code;
 else select active into source_active from public.service_products where tenant_id=public.current_tenant_id() and value=p_code;end if;
 if not found then raise exception 'Servicio no disponible en esta empresa';end if;
 if not source_active then return null;end if;
 select count(distinct case when p_side='income' then v.income_account_id else v.expense_account_id end) into assignments
 from public.service_accounting_profiles p join public.service_accounting_variants v on v.profile_id=p.id and v.tenant_id=p.tenant_id
 where p.tenant_id=public.current_tenant_id() and p.source_kind=p_kind and p.source_code=p_code
 and case when p_side='income' then v.income_applicable else v.expense_applicable end;
 if assignments>1 then raise exception 'Un servicio debe tener una sola cuenta por uso contable, independiente del impuesto';end if;
 if assignments=0 then return null;end if;
 select case when p_side='income' then v.income_account_id else v.expense_account_id end into account
 from public.service_accounting_profiles p join public.service_accounting_variants v on v.profile_id=p.id and v.tenant_id=p.tenant_id
 where p.tenant_id=public.current_tenant_id() and p.source_kind=p_kind and p.source_code=p_code
 and case when p_side='income' then v.income_applicable else v.expense_applicable end
 and case when p_side='income' then v.income_account_id else v.expense_account_id end is not null limit 1;
 if not exists(select 1 from public.accounting_accounts a where a.id=account and a.tenant_id=public.current_tenant_id() and a.active and a.postable and a.account_level in ('Auxiliar','SubCuenta')
  and ((p_side='income' and a.kind='Ingreso') or (p_side='expense' and a.kind in ('Costo','Gasto')))) then return null;end if;
 return account;
end $$;
revoke all on function public.resolve_service_account(text,text,text,text) from public,anon,authenticated;

create or replace function public.set_invoice_credit_terms()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_condition text;
  v_credit_days integer;
  v_is_credit boolean;
begin
  if new.invoice_type not in ('Factura', 'Proforma') then
    new.payment_condition := null;
    new.credit_days := null;
    new.due_date := null;
    return new;
  end if;

  select client.condicion_pago, coalesce(client.dias_credito, 0)
  into v_condition, v_credit_days
  from public.clientes client
  where client.id = new.cliente_id and client.tenant_id = new.tenant_id
    and client.deleted_at is null;

  if not found then
    raise exception 'El cliente de la factura no existe o fue eliminado';
  end if;

  v_is_credit := v_credit_days > 0
    or lower(btrim(coalesce(v_condition, 'Contado'))) <> 'contado';

  if v_is_credit and v_credit_days <= 0 then
    raise exception 'El cliente de credito debe tener dias de credito configurados';
  end if;

  -- The client supplies a default; a document-specific due date is preserved.
  new.due_date := coalesce(new.due_date,case when v_is_credit then new.issue_date + v_credit_days else new.issue_date end);
  if new.due_date < new.issue_date then
    raise exception 'El vencimiento no puede ser anterior a la fecha de emision';
  end if;
  new.credit_days := new.due_date - new.issue_date;
  new.payment_condition := case when new.credit_days > 0 then 'Credito' else 'Contado' end;

  return new;
end;
$$;
