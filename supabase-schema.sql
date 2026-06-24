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
  model text not null,
  year integer not null check (year between 1900 and 2100),
  model_year integer not null check (model_year between 1900 and 2100),
  price numeric(12,2) not null check (price >= 0),
  mileage integer check (mileage >= 0),
  transmission text,
  fuel text,
  color text,
  status text not null default 'available' check (status in ('available','reserved','sold')),
  featured boolean not null default false,
  description text,
  features text[] not null default '{}',
  cover text not null,
  images text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.financing_leads (
  id uuid primary key default gen_random_uuid(),
  vehicle_code text not null,
  vehicle_title text not null,
  vehicle_price numeric(12,2) not null check (vehicle_price >= 0),
  cpf text not null,
  birth_date date not null,
  has_cnh boolean not null,
  phone text not null,
  status text not null default 'new' check (status in ('new','contacting','finished')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.is_admin() returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.admins where user_id = auth.uid());
$$;

alter table public.admins enable row level security;
alter table public.vehicles enable row level security;
alter table public.financing_leads enable row level security;
create policy "Admin vê o próprio acesso" on public.admins for select using (user_id = auth.uid());
create policy "Público vê veículos disponíveis" on public.vehicles for select using (status = 'available');
create policy "Admin vê todo o estoque" on public.vehicles for select using (public.is_admin());
create policy "Admin cadastra veículos" on public.vehicles for insert with check (public.is_admin());
create policy "Admin edita veículos" on public.vehicles for update using (public.is_admin()) with check (public.is_admin());
create policy "Admin exclui veículos" on public.vehicles for delete using (public.is_admin());
create policy "Publico envia pre-analise" on public.financing_leads for insert with check (status = 'new');
create policy "Admin ve leads de financiamento" on public.financing_leads for select using (public.is_admin());
create policy "Admin atualiza leads de financiamento" on public.financing_leads for update using (public.is_admin()) with check (public.is_admin());

insert into storage.buckets (id,name,public) values ('vehicle-images','vehicle-images',true) on conflict (id) do update set public = true;
create policy "Imagens públicas" on storage.objects for select using (bucket_id = 'vehicle-images');
create policy "Admin envia imagens" on storage.objects for insert with check (bucket_id = 'vehicle-images' and public.is_admin());
create policy "Admin atualiza imagens" on storage.objects for update using (bucket_id = 'vehicle-images' and public.is_admin());
create policy "Admin exclui imagens" on storage.objects for delete using (bucket_id = 'vehicle-images' and public.is_admin());

create or replace function public.set_updated_at() returns trigger language plpgsql as $$ begin new.updated_at = now(); return new; end; $$;
drop trigger if exists vehicles_updated_at on public.vehicles;
create trigger vehicles_updated_at before update on public.vehicles for each row execute function public.set_updated_at();
drop trigger if exists financing_leads_updated_at on public.financing_leads;
create trigger financing_leads_updated_at before update on public.financing_leads for each row execute function public.set_updated_at();

-- Após criar o usuário em Authentication > Users, torne-o administrador:
-- insert into public.admins (user_id) values ('UUID_DO_USUARIO');
