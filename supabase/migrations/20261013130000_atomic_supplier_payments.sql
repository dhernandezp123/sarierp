-- AUD-02: pagos/ajustes de proveedores atomicos, idempotentes y auditados.
-- Los movimientos historicos permanecen; no se recalculan cuentas al migrar.
alter table public.pagos_proveedor
  add column status text not null default 'Aplicado',
  add column request_key uuid,
  add column request_payload jsonb,
  add column reversed_at timestamptz,
  add column reversed_by uuid,
  add column reversal_reason text,
  add constraint supplier_payment_status_check check (status in ('Aplicado','Reversado')),
  add constraint supplier_payment_reversal_check check (
    (status = 'Aplicado' and reversed_at is null and reversed_by is null and reversal_reason is null)
    or (status = 'Reversado' and reversed_at is not null and reversed_by is not null
      and nullif(btrim(reversal_reason),'') is not null)
  ),
  add constraint supplier_payment_request_check check (
    (request_key is null and request_payload is null)
    or (request_key is not null and request_payload is not null and jsonb_typeof(request_payload) = 'object')
  ),
  add constraint supplier_payment_reversal_actor_fkey foreign key (tenant_id,reversed_by)
    references public.profiles(tenant_id,id);
create unique index supplier_payment_request_idx
  on public.pagos_proveedor(tenant_id,cuenta_pagar_id,request_key) where request_key is not null;

alter table public.cuentas_pagar
  add column request_key uuid,
  add column request_payload jsonb,
  add column cancelled_at timestamptz,
  add column cancelled_by uuid,
  add column cancellation_reason text,
  add constraint supplier_adjustment_request_check check (
    (request_key is null and request_payload is null)
    or (request_key is not null and request_payload is not null and jsonb_typeof(request_payload) = 'object')
  ),
  add constraint supplier_adjustment_actor_fkey foreign key (tenant_id,cancelled_by)
    references public.profiles(tenant_id,id);
create unique index supplier_adjustment_request_idx
  on public.cuentas_pagar(tenant_id,parent_ap_id,request_key)
  where parent_ap_id is not null and request_key is not null;

create policy supplier_payments_rpc_insert_only on public.pagos_proveedor
  as restrictive for insert to authenticated with check (false);
create policy supplier_payments_rpc_update_only on public.pagos_proveedor
  as restrictive for update to authenticated using (false) with check (false);
create policy supplier_payments_no_delete on public.pagos_proveedor
  as restrictive for delete to authenticated using (false);

-- No excepciones por GUC: el rol de ejecucion de una RPC validada es su
-- propietario, mientras una escritura directa sigue siendo authenticated.
create function public.guard_supplier_payment_ledger()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Los pagos se reversan con motivo; no se eliminan' using errcode = '42501';
  end if;
  if current_user in ('authenticated','anon') then
    raise exception 'Usa el registro o reverso atomico de pagos' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and (
    (to_jsonb(new) - array['status','reversed_at','reversed_by','reversal_reason'])
      is distinct from (to_jsonb(old) - array['status','reversed_at','reversed_by','reversal_reason'])
    or old.status <> 'Aplicado' or new.status <> 'Reversado'
  ) then
    raise exception 'El movimiento original es inmutable' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger guard_supplier_payment_ledger_trigger before insert or update or delete
on public.pagos_proveedor for each row execute function public.guard_supplier_payment_ledger();

create function public.guard_supplier_payable_ledger()
returns trigger language plpgsql security invoker set search_path = public as $$
declare v_parent public.cuentas_pagar%rowtype;
begin
  if tg_op = 'DELETE' then
    if old.tipo <> 'AP' or exists (select 1 from public.pagos_proveedor where cuenta_pagar_id = old.id)
      or exists (select 1 from public.cuentas_pagar where parent_ap_id = old.id) then
      raise exception 'Conserva el historial financiero; anula el documento' using errcode = '42501';
    end if;
    return old;
  end if;
  if tg_op = 'INSERT' or new.monto is distinct from old.monto then
    if new.monto::text in ('NaN','Infinity','-Infinity') then
      raise exception 'Monto financiero invalido' using errcode = '23514';
    end if;
  end if;
  if (new.tipo = 'AP' and new.parent_ap_id is not null)
    or (new.tipo in ('NC','ND') and new.parent_ap_id is null) then
    raise exception 'Las notas requieren una cuenta principal; AP no tiene padre' using errcode = '23514';
  end if;
  if tg_op = 'INSERT' then
    if current_user = 'authenticated' and (new.tipo <> 'AP' or new.status <> 'Pendiente'
      or new.request_key is not null or new.request_payload is not null or new.cancelled_at is not null
      or new.cancelled_by is not null or new.cancellation_reason is not null) then
      raise exception 'Registra los ajustes mediante el flujo atomico' using errcode = '42501';
    end if;
    if new.parent_ap_id is not null then
      select * into v_parent from public.cuentas_pagar where id = new.parent_ap_id for update;
      if not found or v_parent.tipo <> 'AP' or v_parent.parent_ap_id is not null
        or v_parent.tenant_id is distinct from new.tenant_id
        or v_parent.proveedor_id is distinct from new.proveedor_id
        or v_parent.moneda is distinct from new.moneda
        or (v_parent.status = 'Anulada' and new.status <> 'Anulada') then
        raise exception 'El ajuste no coincide con una cuenta principal activa' using errcode = '23514';
      end if;
    end if;
  else
    if current_user = 'authenticated' and (
      new.status is distinct from old.status or new.cancelled_at is distinct from old.cancelled_at
      or new.cancelled_by is distinct from old.cancelled_by
      or new.cancellation_reason is distinct from old.cancellation_reason
      or new.request_key is distinct from old.request_key
      or new.request_payload is distinct from old.request_payload
    ) then
      raise exception 'El estado financiero se modifica mediante una RPC atomica' using errcode = '42501';
    end if;
    if old.tipo in ('NC','ND') and (
      (to_jsonb(new) - array['status','cancelled_at','cancelled_by','cancellation_reason','updated_at','documento_url','notas'])
        is distinct from (to_jsonb(old) - array['status','cancelled_at','cancelled_by','cancellation_reason','updated_at','documento_url','notas'])
      or (new.status is distinct from old.status and (old.status = 'Anulada' or new.status <> 'Anulada'))
    ) then
      raise exception 'El ajuste original es inmutable; anula y registra otro' using errcode = '42501';
    end if;
    if (new.monto,new.moneda,new.proveedor_id,new.tipo,new.parent_ap_id)
      is distinct from (old.monto,old.moneda,old.proveedor_id,old.tipo,old.parent_ap_id)
      and (exists (select 1 from public.pagos_proveedor where cuenta_pagar_id = old.id)
        or exists (select 1 from public.cuentas_pagar where parent_ap_id = old.id)) then
      raise exception 'No cambies la base de una cuenta con historial financiero' using errcode = '42501';
    end if;
    if old.status = 'Anulada' and (new.status is distinct from old.status
      or new.cancelled_at is distinct from old.cancelled_at or new.cancelled_by is distinct from old.cancelled_by
      or new.cancellation_reason is distinct from old.cancellation_reason) then
      raise exception 'La anulacion registrada es inmutable' using errcode = '42501';
    end if;
    if new.status = 'Anulada' and old.status <> 'Anulada'
      and (new.cancelled_at is null or new.cancelled_by is null or nullif(btrim(new.cancellation_reason),'') is null) then
      raise exception 'La anulacion requiere responsable, fecha y motivo' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;
-- Despues del guard de tenant existente: los inserts directos derivan tenant.
create trigger zz_supplier_payable_ledger_guard before insert or update or delete
on public.cuentas_pagar for each row execute function public.guard_supplier_payable_ledger();

create function public.lock_supplier_payable_internal(p_account_id uuid)
returns public.cuentas_pagar language plpgsql security definer set search_path = public as $$
declare v_account public.cuentas_pagar%rowtype;
begin
  if auth.uid() is null or public.current_tenant_id() is null or not public.can_manage_finance() then
    raise exception 'No tienes permiso para gestionar pagos de proveedores' using errcode = '42501';
  end if;
  select * into v_account from public.cuentas_pagar
    where id = p_account_id and tenant_id = public.current_tenant_id() for update;
  if not found or v_account.tipo <> 'AP' or v_account.parent_ap_id is not null then
    raise exception 'Cuenta principal no disponible' using errcode = '42501';
  end if;
  return v_account;
end;
$$;

create function public.supplier_payable_balance_internal(p_account_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_account public.cuentas_pagar%rowtype;
  v_total numeric; v_paid numeric; v_status text;
begin
  select * into v_account from public.cuentas_pagar
    where id = p_account_id and tenant_id = public.current_tenant_id() and tipo = 'AP' and parent_ap_id is null;
  if not found then raise exception 'Cuenta principal no disponible' using errcode = '42501'; end if;
  if v_account.monto::text in ('NaN','Infinity','-Infinity') or exists (
    select 1 from public.pagos_proveedor p where p.cuenta_pagar_id = v_account.id and p.status = 'Aplicado'
      and (p.moneda is distinct from v_account.moneda or p.monto::text in ('NaN','Infinity','-Infinity'))
  ) or exists (
    select 1 from public.cuentas_pagar n where n.parent_ap_id = v_account.id and n.status <> 'Anulada'
      and (n.moneda is distinct from v_account.moneda or n.proveedor_id is distinct from v_account.proveedor_id
        or n.tipo not in ('NC','ND') or n.monto::text in ('NaN','Infinity','-Infinity'))
  ) then raise exception 'La cuenta tiene movimientos inconsistentes; concilia sus datos' using errcode = '23514'; end if;
  select v_account.monto + coalesce(sum(case when n.tipo = 'NC' then -n.monto else n.monto end),0)
    into v_total from public.cuentas_pagar n where n.parent_ap_id = v_account.id and n.status <> 'Anulada';
  if v_total < 0 then raise exception 'Los ajustes superan la obligacion; concilia la cuenta' using errcode = '23514'; end if;
  select coalesce(sum(monto),0) into v_paid from public.pagos_proveedor
    where cuenta_pagar_id = v_account.id and status = 'Aplicado';
  v_status := case when v_account.status = 'Anulada' then 'Anulada'
    when v_paid >= v_total then 'Pagada' when v_paid > 0 then 'Parcialmente Pagada'
    when v_account.fecha_vencimiento < (now() at time zone 'America/Tegucigalpa')::date then 'Vencida'
    else 'Pendiente' end;
  return jsonb_build_object('account_id',v_account.id,'status',v_status,
    'total_adjusted',v_total,'paid_total',v_paid,'pending_balance',v_total-v_paid);
end;
$$;

create function public.finish_supplier_action_internal(p_account_id uuid,p_action text,p_metadata jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_result jsonb;
begin
  v_result := public.supplier_payable_balance_internal(p_account_id);
  update public.cuentas_pagar set status = v_result->>'status', updated_at = now() where id = p_account_id;
  insert into public.activity_logs(user_id,module,action,entity_type,entity_id,description,metadata)
  values(auth.uid(),'accounts-payable',p_action,'cuenta_pagar',p_account_id,
    'Movimiento financiero de proveedor registrado atomicamente',p_metadata || v_result);
  return v_result;
end;
$$;

create function public.register_supplier_payment(
  p_account_id uuid,p_request_key uuid,p_amount numeric,p_currency text,p_payment_date date,
  p_payment_method text,p_reference text default null,p_notes text default null
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_account public.cuentas_pagar%rowtype; v_previous public.pagos_proveedor%rowtype;
  v_payload jsonb; v_balance jsonb; v_payment_id uuid;
begin
  v_account := public.lock_supplier_payable_internal(p_account_id);
  if p_request_key is null then raise exception 'Falta el identificador del registro' using errcode = '23514'; end if;
  v_payload := jsonb_build_object('amount',p_amount,'currency',p_currency,'date',p_payment_date,
    'method',p_payment_method,'reference',nullif(btrim(p_reference),''),'notes',nullif(btrim(p_notes),''));
  select * into v_previous from public.pagos_proveedor where cuenta_pagar_id = p_account_id
    and tenant_id = v_account.tenant_id and request_key = p_request_key;
  if found then
    if v_previous.request_payload is distinct from v_payload then
      raise exception 'El registro ya existe con otros datos; revisa el historial' using errcode = '23514';
    end if;
    return public.supplier_payable_balance_internal(p_account_id) || jsonb_build_object(
      'payment_id',v_previous.id,'payment_status',v_previous.status,'already_applied',true);
  end if;
  if v_account.status = 'Anulada' then raise exception 'La cuenta esta anulada' using errcode = '23514'; end if;
  if p_amount is null or p_amount::text in ('NaN','Infinity','-Infinity') or p_amount <= 0 or p_amount <> round(p_amount,2) then
    raise exception 'El monto debe ser positivo y tener hasta dos decimales' using errcode = '23514';
  end if;
  if p_currency is distinct from v_account.moneda then raise exception 'La moneda no coincide con la cuenta' using errcode = '23514'; end if;
  if p_payment_date is null or p_payment_date > (now() at time zone 'America/Tegucigalpa')::date
    or extract(year from p_payment_date) not between 1000 and 9999 then
    raise exception 'La fecha del pago es requerida, valida y no puede ser futura' using errcode = '23514';
  end if;
  if p_payment_method is null or p_payment_method not in ('Transferencia','Cheque','Efectivo','Otro') then
    raise exception 'Selecciona un metodo de pago valido' using errcode = '23514';
  end if;
  v_balance := public.supplier_payable_balance_internal(p_account_id);
  if p_amount > (v_balance->>'pending_balance')::numeric then
    raise exception 'El pago supera el saldo pendiente actualizado' using errcode = '23514';
  end if;
  insert into public.pagos_proveedor(tenant_id,cuenta_pagar_id,monto,moneda,fecha_pago,metodo_pago,
    referencia,notas,created_by,request_key,request_payload)
  values(v_account.tenant_id,p_account_id,p_amount,p_currency,p_payment_date,p_payment_method,
    nullif(btrim(p_reference),''),nullif(btrim(p_notes),''),auth.uid(),p_request_key,v_payload)
  returning id into v_payment_id;
  return public.finish_supplier_action_internal(p_account_id,'supplier_payment_registered',
    jsonb_build_object('payment_id',v_payment_id,'request_key',p_request_key,'amount',p_amount,'currency',p_currency))
    || jsonb_build_object('payment_id',v_payment_id,'payment_status','Aplicado','already_applied',false);
end;
$$;

create function public.reverse_supplier_payment(p_payment_id uuid,p_reason text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_root uuid; v_account public.cuentas_pagar%rowtype; v_payment public.pagos_proveedor%rowtype;
begin
  if nullif(btrim(p_reason),'') is null or char_length(p_reason) > 1000 then
    raise exception 'Indica un motivo de reverso de hasta 1000 caracteres' using errcode = '23514'; end if;
  select cuenta_pagar_id into v_root from public.pagos_proveedor
    where id = p_payment_id and tenant_id = public.current_tenant_id();
  if not found then raise exception 'Pago no disponible' using errcode = '42501'; end if;
  v_account := public.lock_supplier_payable_internal(v_root);
  select * into v_payment from public.pagos_proveedor where id = p_payment_id and cuenta_pagar_id = v_root for update;
  if v_payment.status = 'Reversado' then
    if v_payment.reversal_reason is distinct from btrim(p_reason) then
      raise exception 'Este pago ya fue reversado; su motivo no puede cambiar' using errcode = '23514'; end if;
    return public.supplier_payable_balance_internal(v_root) || jsonb_build_object('payment_id',p_payment_id,'already_applied',true);
  end if;
  update public.pagos_proveedor set status = 'Reversado',reversed_at = now(),reversed_by = auth.uid(),
    reversal_reason = btrim(p_reason) where id = p_payment_id;
  return public.finish_supplier_action_internal(v_root,'supplier_payment_reversed',
    jsonb_build_object('payment_id',p_payment_id,'amount',v_payment.monto,'reason',btrim(p_reason)))
    || jsonb_build_object('payment_id',p_payment_id,'already_applied',false);
end;
$$;

create function public.register_supplier_adjustment(
  p_account_id uuid,p_request_key uuid,p_type text,p_description text,p_amount numeric,p_document_date date default null
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_account public.cuentas_pagar%rowtype; v_previous public.cuentas_pagar%rowtype;
  v_payload jsonb; v_balance jsonb; v_note_id uuid;
begin
  v_account := public.lock_supplier_payable_internal(p_account_id);
  if p_request_key is null then raise exception 'Falta el identificador del registro' using errcode = '23514'; end if;
  v_payload := jsonb_build_object('type',p_type,'description',btrim(p_description),'amount',p_amount,'date',p_document_date);
  select * into v_previous from public.cuentas_pagar where parent_ap_id = p_account_id
    and tenant_id = v_account.tenant_id and request_key = p_request_key;
  if found then
    if v_previous.request_payload is distinct from v_payload then
      raise exception 'El ajuste ya existe con otros datos; revisa el historial' using errcode = '23514'; end if;
    return public.supplier_payable_balance_internal(p_account_id) || jsonb_build_object('adjustment_id',v_previous.id,'already_applied',true);
  end if;
  if v_account.status = 'Anulada' then raise exception 'La cuenta esta anulada' using errcode = '23514'; end if;
  if p_type is null or p_type not in ('NC','ND') or nullif(btrim(p_description),'') is null then
    raise exception 'Tipo y descripcion del ajuste son requeridos' using errcode = '23514'; end if;
  if p_amount is null or p_amount::text in ('NaN','Infinity','-Infinity') or p_amount <= 0 or p_amount <> round(p_amount,2) then
    raise exception 'El monto debe ser positivo y tener hasta dos decimales' using errcode = '23514'; end if;
  if p_document_date > (now() at time zone 'America/Tegucigalpa')::date
    or extract(year from p_document_date) not between 1000 and 9999 then
    raise exception 'Fecha del ajuste invalida o futura' using errcode = '23514'; end if;
  v_balance := public.supplier_payable_balance_internal(p_account_id);
  if p_type = 'NC' and p_amount > (v_balance->>'pending_balance')::numeric then
    raise exception 'La nota de credito supera el saldo pendiente actualizado' using errcode = '23514'; end if;
  insert into public.cuentas_pagar(tenant_id,proveedor_id,parent_ap_id,tipo,descripcion,monto,moneda,
    fecha_factura,created_by,request_key,request_payload)
  values(v_account.tenant_id,v_account.proveedor_id,p_account_id,p_type,btrim(p_description),p_amount,
    v_account.moneda,coalesce(p_document_date,(now() at time zone 'America/Tegucigalpa')::date),auth.uid(),p_request_key,v_payload)
  returning id into v_note_id;
  return public.finish_supplier_action_internal(p_account_id,'supplier_adjustment_registered',
    jsonb_build_object('adjustment_id',v_note_id,'type',p_type,'amount',p_amount,'request_key',p_request_key))
    || jsonb_build_object('adjustment_id',v_note_id,'already_applied',false);
end;
$$;

create function public.cancel_supplier_payable(p_document_id uuid,p_reason text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_target public.cuentas_pagar%rowtype; v_account public.cuentas_pagar%rowtype; v_balance jsonb; v_root uuid;
begin
  if nullif(btrim(p_reason),'') is null or char_length(p_reason) > 1000 then
    raise exception 'Indica un motivo de anulacion de hasta 1000 caracteres' using errcode = '23514'; end if;
  select * into v_target from public.cuentas_pagar where id = p_document_id and tenant_id = public.current_tenant_id();
  if not found then raise exception 'Documento no disponible' using errcode = '42501'; end if;
  v_root := coalesce(v_target.parent_ap_id,v_target.id);
  v_account := public.lock_supplier_payable_internal(v_root);
  select * into v_target from public.cuentas_pagar where id = p_document_id for update;
  if v_target.status = 'Anulada' then
    return public.supplier_payable_balance_internal(v_root) || jsonb_build_object('document_id',p_document_id,'already_applied',true);
  end if;
  v_balance := public.supplier_payable_balance_internal(v_root);
  if v_target.tipo = 'AP' and ((v_balance->>'paid_total')::numeric > 0
    or exists (select 1 from public.cuentas_pagar where parent_ap_id = v_root and status <> 'Anulada')) then
    raise exception 'Revierte los pagos y anula las notas activas antes de anular la cuenta' using errcode = '23514'; end if;
  update public.cuentas_pagar set status = 'Anulada',cancelled_at = now(),cancelled_by = auth.uid(),
    cancellation_reason = btrim(p_reason),updated_at = now() where id = p_document_id;
  v_balance := public.supplier_payable_balance_internal(v_root);
  if v_target.tipo = 'ND' and (v_balance->>'pending_balance')::numeric < 0 then
    raise exception 'Revertir esta nota dejaria pagos por encima de la obligacion; revierte pagos primero' using errcode = '23514'; end if;
  return public.finish_supplier_action_internal(v_root,'supplier_document_cancelled',
    jsonb_build_object('document_id',p_document_id,'type',v_target.tipo,'reason',btrim(p_reason)))
    || jsonb_build_object('document_id',p_document_id,'already_applied',false);
end;
$$;

revoke all on function public.guard_supplier_payment_ledger(), public.guard_supplier_payable_ledger(),
  public.lock_supplier_payable_internal(uuid),public.supplier_payable_balance_internal(uuid),
  public.finish_supplier_action_internal(uuid,text,jsonb) from public,anon,authenticated,service_role;
revoke all on function public.register_supplier_payment(uuid,uuid,numeric,text,date,text,text,text),
  public.reverse_supplier_payment(uuid,text), public.register_supplier_adjustment(uuid,uuid,text,text,numeric,date),
  public.cancel_supplier_payable(uuid,text) from public,anon;
grant execute on function public.register_supplier_payment(uuid,uuid,numeric,text,date,text,text,text),
  public.reverse_supplier_payment(uuid,text), public.register_supplier_adjustment(uuid,uuid,text,text,numeric,date),
  public.cancel_supplier_payable(uuid,text) to authenticated;
notify pgrst, 'reload schema';
