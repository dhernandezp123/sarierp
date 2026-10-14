-- PostgREST retries SQLSTATE 40001 as a database serialization failure.
-- An expected-version mismatch is an application conflict: PT409 preserves
-- HTTP 409 without retrying the same stale request until a gateway timeout.
do $$
declare v_signature text; v_definition text; v_updated text;
begin
  foreach v_signature in array array[
    'public.transition_quotation(uuid,text,bigint,text,text,text,text,boolean)',
    'public.save_quotation_edit(uuid,text,jsonb,boolean,jsonb,boolean,jsonb,boolean,jsonb,boolean,bigint,text)',
    'public.finalize_quotation_option_selection(uuid,boolean,text,bigint)'
  ] loop
    v_definition := pg_get_functiondef(v_signature::regprocedure);
    v_updated := replace(v_definition, 'errcode = ''40001''', 'errcode = ''PT409''');
    if v_updated = v_definition then
      raise exception 'Expected version-conflict check missing in %', v_signature;
    end if;
    execute v_updated;
  end loop;
end;
$$;
