-- The destination column and SPS/TGU constraints already exist. Persist the
-- quote-specific choice in the canonical atomic create/edit functions without
-- changing their roles, tenancy, revision locks, grants or child-line workflow.
begin;
do $$
declare definition text; before_text text; after_text text;
begin
  definition := pg_get_functiondef('public.create_quotation_with_child_lines_aud01_internal(jsonb,jsonb,jsonb,jsonb)'::regprocedure);
  before_text := 'service_product, trade_direction, peso_lbs, volumen_ft3,';
  after_text := 'miami_rate_destination, service_product, trade_direction, peso_lbs, volumen_ft3,';
  if strpos(definition, before_text) = 0 or strpos(definition, after_text) > 0 then
    raise exception 'Unexpected quotation creation columns; review canonical function';
  end if;
  definition := replace(definition, before_text, after_text);
  before_text := 'nullif(p_quotation_data->>''service_product'', ''''),';
  if strpos(definition, before_text) = 0 then raise exception 'Quotation creation values missing'; end if;
  definition := replace(definition, before_text,
    'nullif(p_quotation_data->>''miami_rate_destination'', ''''), ' || before_text);
  execute definition;

  definition := pg_get_functiondef('public.save_quotation_edit(uuid,text,jsonb,boolean,jsonb,boolean,jsonb,boolean,jsonb,boolean,bigint,text)'::regprocedure);
  before_text := '''cliente_id'', ''service_product'', ''quote_type''';
  if strpos(definition, before_text) = 0 then raise exception 'Quotation edit allowlist missing'; end if;
  definition := replace(definition, before_text, '''miami_rate_destination'', ' || before_text);
  before_text := 'service_product = v_new.service_product,';
  if strpos(definition, before_text) = 0 then raise exception 'Quotation edit assignment missing'; end if;
  definition := replace(definition, before_text,
    'miami_rate_destination = v_new.miami_rate_destination, ' || before_text);
  execute definition;
end;
$$;
commit;
