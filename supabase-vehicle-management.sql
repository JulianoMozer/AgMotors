-- Execute este arquivo no SQL Editor do Supabase em projetos existentes.
alter table public.vehicles add column if not exists plate text;
alter table public.vehicles add column if not exists internal_code text;
alter table public.vehicles add column if not exists renavam text;
alter table public.vehicles add column if not exists chassis text;
alter table public.vehicles add column if not exists model_year integer;
alter table public.vehicles add column if not exists status text not null default 'available';
alter table public.vehicles add column if not exists purchase_price numeric(12,2);
alter table public.vehicles add column if not exists purchase_date date;
alter table public.vehicles add column if not exists sale_price numeric(12,2);
alter table public.vehicles add column if not exists sale_date date;
alter table public.vehicles add column if not exists sale_buyer text;
alter table public.vehicles add column if not exists sale_channel text;
alter table public.vehicles add column if not exists payment_method text;
alter table public.vehicles add column if not exists payment_terms text;
alter table public.vehicles add column if not exists down_payment numeric(12,2);
alter table public.vehicles add column if not exists repair_allowance_amount numeric(12,2);
alter table public.vehicles add column if not exists repair_allowance_description text;
alter table public.vehicles add column if not exists sale_notes text;
alter table public.vehicles add column if not exists buyer_name text;
alter table public.vehicles add column if not exists buyer_cpf text;
alter table public.vehicles add column if not exists buyer_address text;
alter table public.vehicles add column if not exists buyer_email text;
alter table public.vehicles add column if not exists buyer_phone text;
alter table public.vehicles add column if not exists cost_items jsonb not null default '[]'::jsonb;
alter table public.vehicles add column if not exists views_count integer not null default 0;
alter table public.vehicles add column if not exists whatsapp_clicks integer not null default 0;
alter table public.vehicles add column if not exists financing_clicks integer not null default 0;
alter table public.vehicles add column if not exists traffic_sources jsonb not null default '{}'::jsonb;

update public.vehicles set model_year = year where model_year is null;

create unique index if not exists vehicles_plate_unique
on public.vehicles (upper(regexp_replace(plate, '[^A-Za-z0-9]', '', 'g')))
where plate is not null and btrim(plate) <> '';

create table if not exists public.store_expenses (
  id uuid primary key default gen_random_uuid(),
  expense_date date not null default current_date,
  category text not null,
  description text,
  amount numeric(12,2) not null check (amount > 0),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.store_expenses enable row level security;
drop policy if exists "Admin ve despesas gerais" on public.store_expenses;
drop policy if exists "Admin cadastra despesas gerais" on public.store_expenses;
drop policy if exists "Admin edita despesas gerais" on public.store_expenses;
drop policy if exists "Admin exclui despesas gerais" on public.store_expenses;
create policy "Admin ve despesas gerais" on public.store_expenses for select using (public.is_admin());
create policy "Admin cadastra despesas gerais" on public.store_expenses for insert with check (public.is_admin());
create policy "Admin edita despesas gerais" on public.store_expenses for update using (public.is_admin()) with check (public.is_admin());
create policy "Admin exclui despesas gerais" on public.store_expenses for delete using (public.is_admin());
grant select, insert, update, delete on table public.store_expenses to authenticated;

create or replace function public.track_vehicle_event(p_vehicle_id uuid, p_event text, p_source text default 'direct')
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  source_key text := left(coalesce(nullif(regexp_replace(lower(p_source), '[^a-z0-9_-]', '', 'g'), ''), 'direct'), 40);
begin
  if p_event = 'view' then
    update public.vehicles
       set views_count = views_count + 1,
           traffic_sources = jsonb_set(
             coalesce(traffic_sources, '{}'::jsonb),
             array[source_key],
             to_jsonb(coalesce((traffic_sources ->> source_key)::integer, 0) + 1),
             true
           )
     where id = p_vehicle_id and status = 'available';
  elsif p_event = 'whatsapp' then
    update public.vehicles set whatsapp_clicks = whatsapp_clicks + 1 where id = p_vehicle_id;
  elsif p_event = 'financing' then
    update public.vehicles set financing_clicks = financing_clicks + 1 where id = p_vehicle_id;
  end if;
end;
$$;

revoke all on function public.track_vehicle_event(uuid, text, text) from public;
grant execute on function public.track_vehicle_event(uuid, text, text) to anon, authenticated;
notify pgrst, 'reload schema';
