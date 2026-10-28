-- AUD-02: conservar tambien una AP anulada que nunca tuvo pagos/notas.
-- Forward-fix separado: la migracion atomica ya fue aplicada en validacion local.
create function public.guard_cancelled_supplier_document()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  if old.status = 'Anulada' then
    if tg_op = 'DELETE' then
      raise exception 'Conserva el documento anulado para auditoria' using errcode = '42501';
    end if;
    if (new.monto,new.moneda,new.proveedor_id,new.tipo,new.parent_ap_id)
      is distinct from (old.monto,old.moneda,old.proveedor_id,old.tipo,old.parent_ap_id) then
      raise exception 'La base financiera de un documento anulado es inmutable' using errcode = '42501';
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
create trigger guard_cancelled_supplier_document_trigger before update or delete
  on public.cuentas_pagar for each row execute function public.guard_cancelled_supplier_document();
revoke all on function public.guard_cancelled_supplier_document() from public,anon,authenticated,service_role;
