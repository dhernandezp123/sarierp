\set ON_ERROR_STOP on

begin;

create or replace function pg_temp.assert_true(value boolean, message text)
returns void
language plpgsql
as $$
begin
  if not coalesce(value, false) then
    raise exception 'ASSERTION FAILED: %', message;
  end if;
end;
$$;

insert into auth.users (id, aud, role, email, raw_user_meta_data)
values
  ('49500000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'tasks-sales@test.local', '{}'::jsonb),
  ('49500000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'tasks-operations@test.local', '{}'::jsonb);

update public.profiles
set rol = case id
    when '49500000-0000-0000-0000-000000000001' then 'Ventas'::public.user_role
    else 'Operaciones'::public.user_role
  end,
  status = 'Aprobado',
  is_active = true
where id::text like '49500000-%';

insert into public.agents (id, name)
values ('49500000-0000-0000-0000-000000000010', 'Agente tarea contextual');

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"49500000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);

insert into public.user_tasks (
  id, user_id, title, priority, due_date,
  entity_type, entity_id, entity_label, source_module, source_path
)
values (
  '49500000-0000-0000-0000-000000000020',
  '49500000-0000-0000-0000-000000000001',
  'Consultar agente', 'Alta', current_date,
  'agent', '49500000-0000-0000-0000-000000000010',
  'Agente tarea contextual', 'agents',
  '/agents/49500000-0000-0000-0000-000000000010'
);

select pg_temp.assert_true(
  (
    select count(*) = 1
      and bool_and(completed_at is null)
      and bool_and(updated_at is not null)
    from public.user_tasks
    where id = '49500000-0000-0000-0000-000000000020'
  ),
  'Ventas debe crear y consultar su recordatorio contextual'
);

update public.user_tasks
set status = 'Completada'
where id = '49500000-0000-0000-0000-000000000020';

select pg_temp.assert_true(
  (
    select completed_at is not null
    from public.user_tasks
    where id = '49500000-0000-0000-0000-000000000020'
  ),
  'Completar una tarea debe registrar completed_at'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"49500000-0000-0000-0000-000000000002","role":"authenticated"}',
  true
);

select pg_temp.assert_true(
  (
    select count(*) = 0
    from public.user_tasks
    where id = '49500000-0000-0000-0000-000000000020'
  ),
  'Operaciones no debe leer tareas personales de Ventas'
);

delete from public.user_tasks
where id = '49500000-0000-0000-0000-000000000020';

reset role;
select pg_temp.assert_true(
  exists (
    select 1 from public.user_tasks
    where id = '49500000-0000-0000-0000-000000000020'
  ),
  'No debe existir borrado físico autenticado'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"49500000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);

select pg_temp.assert_true(
  public.soft_delete_user_task('49500000-0000-0000-0000-000000000020'),
  'El propietario debe poder borrar lógicamente su tarea'
);

select pg_temp.assert_true(
  (
    select count(*) = 0
    from public.user_tasks
    where id = '49500000-0000-0000-0000-000000000020'
  ),
  'El borrado lógico debe retirar la tarea de la lectura autenticada'
);

reset role;
rollback;

\echo 'phase5_contextual_user_tasks.sql: OK'
