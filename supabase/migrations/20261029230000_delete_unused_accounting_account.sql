-- ACC-DELETE-01: only never-used accounts are deleted; used accounts are deactivated instead.
create function public.delete_accounting_account(p_account_id uuid) returns void language plpgsql security definer set search_path=public as $$
declare account public.accounting_accounts%rowtype;
begin
 if auth.uid() is null or not public.can_manage_finance() then raise exception 'No autorizado' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended('accounts:'||public.current_tenant_id()::text,0));
 select * into account from public.accounting_accounts where id=p_account_id and tenant_id=public.current_tenant_id() for update;
 if not found then raise exception 'Cuenta no disponible'; end if;
 if exists(select 1 from public.accounting_accounts where tenant_id=account.tenant_id and parent_id=account.id) then
  raise exception 'La cuenta % tiene cuentas hijas; elimina o reasigna las hijas primero',account.code; end if;
 if exists(select 1 from public.journal_lines where tenant_id=account.tenant_id and account_id=account.id) then
  raise exception 'La cuenta % tiene movimientos contables; desactívala en lugar de eliminarla',account.code; end if;
 -- Las líneas de compra guardan la cuenta dentro del JSON, sin llave foránea.
 if exists(select 1 from public.purchase_documents d,jsonb_array_elements(d.items) item where d.tenant_id=account.tenant_id and item->>'account_id'=account.id::text) then
  raise exception 'La cuenta % está usada en documentos de compra; desactívala en lugar de eliminarla',account.code; end if;
 begin
  delete from public.accounting_accounts where id=account.id;
 exception when foreign_key_violation then
  raise exception 'La cuenta % está asignada en configuración, activos, tesorería o servicios; desactívala en lugar de eliminarla',account.code;
 end;
end $$;
revoke all on function public.delete_accounting_account(uuid) from public,anon;
grant execute on function public.delete_accounting_account(uuid) to authenticated;
notify pgrst,'reload schema';
