-- The historical Demo function was stored with Windows line endings. The
-- canonical customs migration validates a literal LF fragment before extending
-- it. Normalize this one definition without changing its logic or privileges.
do $$ declare definition text;begin
 if not public.is_demo_environment() then raise exception 'Demo-only source bridge';end if;
 definition:=pg_get_functiondef('public.guard_quotation_financial_validation()'::regprocedure);
 execute replace(definition,chr(13)||chr(10),chr(10));
end $$;
