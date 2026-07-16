-- Execute este arquivo no SQL Editor do Supabase uma única vez.
create extension if not exists pgcrypto;

create table if not exists public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.vehicles (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  brand text not null,
  plate text,
  internal_code text,
  renavam text,
  chassis text,
  model text not null,
  year integer not null check (year between 1900 and 2100),
  model_year integer not null check (model_year between 1900 and 2100),
  price numeric(12,2) not null check (price >= 0),
  mileage integer check (mileage >= 0),
  transmission text,
  fuel text,
  color text,
  status text not null default 'available' check (status in ('available','reserved','sold','hidden')),
  featured boolean not null default false,
  purchase_price numeric(12,2) check (purchase_price is null or purchase_price >= 0),
  purchase_date date,
  sale_price numeric(12,2) check (sale_price is null or sale_price >= 0),
  sale_date date,
  sale_buyer text,
  sale_channel text,
  payment_method text,
  payment_terms text,
  down_payment numeric(12,2) check (down_payment is null or down_payment >= 0),
  repair_allowance_amount numeric(12,2) check (repair_allowance_amount is null or repair_allowance_amount >= 0),
  repair_allowance_description text,
  sale_notes text,
  buyer_name text,
  buyer_cpf text,
  buyer_address text,
  buyer_email text,
  buyer_phone text,
  cost_items jsonb not null default '[]'::jsonb,
  views_count integer not null default 0 check (views_count >= 0),
  whatsapp_clicks integer not null default 0 check (whatsapp_clicks >= 0),
  financing_clicks integer not null default 0 check (financing_clicks >= 0),
  traffic_sources jsonb not null default '{}'::jsonb,
  description text,
  features text[] not null default '{}',
  cover text not null,
  images text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.financing_leads (
  id uuid primary key default gen_random_uuid(),
  vehicle_id text,
  vehicle_title text,
  vehicle_price numeric,
  cpf text not null,
  birth_date date not null,
  has_cnh boolean not null,
  phone text not null,
  status text default 'novo' check (status in ('novo','em_atendimento','finalizado')),
  created_at timestamptz default now()
);

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

create unique index if not exists vehicles_plate_unique
on public.vehicles (upper(regexp_replace(plate, '[^A-Za-z0-9]', '', 'g')))
where plate is not null and btrim(plate) <> '';

create or replace function public.is_admin() returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.admins where user_id = auth.uid());
$$;

alter table public.admins enable row level security;
alter table public.vehicles enable row level security;
alter table public.financing_leads enable row level security;
alter table public.store_expenses enable row level security;
create policy "Admin vê o próprio acesso" on public.admins for select using (user_id = auth.uid());
create policy "Público vê veículos disponíveis" on public.vehicles for select using (status = 'available');
create policy "Admin vê todo o estoque" on public.vehicles for select using (public.is_admin());
create policy "Admin cadastra veículos" on public.vehicles for insert with check (public.is_admin());
create policy "Admin edita veículos" on public.vehicles for update using (public.is_admin()) with check (public.is_admin());
create policy "Admin exclui veículos" on public.vehicles for delete using (public.is_admin());
create policy "Publico envia pre-analise" on public.financing_leads for insert with check (coalesce(status, 'novo') = 'novo');
create policy "Admin ve leads de financiamento" on public.financing_leads for select using (public.is_admin());
create policy "Admin atualiza leads de financiamento" on public.financing_leads for update using (public.is_admin()) with check (public.is_admin());
create policy "Admin ve despesas gerais" on public.store_expenses for select using (public.is_admin());
create policy "Admin cadastra despesas gerais" on public.store_expenses for insert with check (public.is_admin());
create policy "Admin edita despesas gerais" on public.store_expenses for update using (public.is_admin()) with check (public.is_admin());
create policy "Admin exclui despesas gerais" on public.store_expenses for delete using (public.is_admin());

grant usage on schema public to anon, authenticated;
grant insert on table public.financing_leads to anon, authenticated;
grant select, update on table public.financing_leads to authenticated;
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

insert into storage.buckets (id,name,public) values ('vehicle-images','vehicle-images',true) on conflict (id) do update set public = true;
create policy "Imagens públicas" on storage.objects for select using (bucket_id = 'vehicle-images');
create policy "Admin envia imagens" on storage.objects for insert with check (bucket_id = 'vehicle-images' and public.is_admin());
create policy "Admin atualiza imagens" on storage.objects for update using (bucket_id = 'vehicle-images' and public.is_admin());
create policy "Admin exclui imagens" on storage.objects for delete using (bucket_id = 'vehicle-images' and public.is_admin());

create or replace function public.set_updated_at() returns trigger language plpgsql as $$ begin new.updated_at = now(); return new; end; $$;
drop trigger if exists vehicles_updated_at on public.vehicles;
create trigger vehicles_updated_at before update on public.vehicles for each row execute function public.set_updated_at();
notify pgrst, 'reload schema';

-- Após criar o usuário em Authentication > Users, torne-o administrador:
-- insert into public.admins (user_id) values ('UUID_DO_USUARIO');
