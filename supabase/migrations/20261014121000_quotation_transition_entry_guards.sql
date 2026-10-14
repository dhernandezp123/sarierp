-- AUD-05: keep newly inserted rows on the current creation path too.
create function public.guard_quotation_initial_state()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  if current_user in ('authenticated', 'anon') then
    if not public.is_approved_active_user() or not public.is_role(array['Admin', 'Ventas']) then
      raise exception 'No tienes permiso para crear cotizaciones' using errcode = '42501';
    end if;
    if new.status not in ('Borrador', 'Pendiente de Fijar Precios', 'Pricing Aprobado')
      or new.status is null
      or (new.status = 'Pricing Aprobado' and coalesce(new.service_product, '') not in ('miami_lcl', 'miami_air')) then
      raise exception 'Estado inicial no permitido para este producto' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.guard_quotation_initial_state() from public, anon, authenticated;
create trigger guard_quotation_initial_state before insert on public.quotations
for each row execute function public.guard_quotation_initial_state();
revoke truncate, references, trigger on public.quotation_status_history from authenticated, anon;

-- Only recover a legacy reopen when its latest recorded transition proves
-- Ganada -> Pending. Missing/ambiguous audit is reviewed manually, not guessed.
update public.quotations q set repricing_return_status = 'Ganada'
where q.status = 'Pendiente de Fijar Precios' and q.repricing_return_status is null
  and (select h.old_status = 'Ganada' and h.new_status = 'Pendiente de Fijar Precios'
    from public.quotation_status_history h where h.quotation_id = q.id
    order by h.created_at desc, h.id desc limit 1);
