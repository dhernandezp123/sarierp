-- Lock existing live lines before reading approval totals/snapshotting them.
do $$
declare v_definition text; v_before text; v_after text;
begin
  v_definition:=pg_get_functiondef('public.transition_quotation(uuid,text,bigint,text,text,text,text,boolean)'::regprocedure);
  v_before:='    select sum(coalesce(pi.cost_amount, 0) * coalesce(nullif(pi.quantity, 0), 1)),';
  v_after:='    perform pi.id from public.pricing_items pi where pi.quotation_id=p_quotation_id and pi.deleted_at is null order by pi.id for update;
    select sum(coalesce(pi.cost_amount, 0) * coalesce(nullif(pi.quantity, 0), 1)),';
  if strpos(v_definition,v_before)=0 then raise exception 'Pricing total guard not found'; end if;
  execute replace(v_definition,v_before,v_after);
end;
$$;
