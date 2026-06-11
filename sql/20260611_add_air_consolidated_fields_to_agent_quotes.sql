alter table public.agent_quotes
add column if not exists rate_per_kg numeric,
add column if not exists chargeable_weight_kg numeric,
add column if not exists actual_weight_kg numeric,
add column if not exists volumetric_weight_kg numeric;
