-- Execute este arquivo no SQL Editor do Supabase para ativar a captura de leads de financiamento.
create extension if not exists pgcrypto;

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

alter table public.financing_leads enable row level security;

drop policy if exists "Publico envia pre-analise" on public.financing_leads;
drop policy if exists "Admin ve leads de financiamento" on public.financing_leads;
drop policy if exists "Admin atualiza leads de financiamento" on public.financing_leads;

create policy "Publico envia pre-analise" on public.financing_leads
  for insert
  with check (status = 'new');

create policy "Admin ve leads de financiamento" on public.financing_leads
  for select
  using (public.is_admin());

create policy "Admin atualiza leads de financiamento" on public.financing_leads
  for update
  using (public.is_admin())
  with check (public.is_admin());

create or replace function public.set_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists financing_leads_updated_at on public.financing_leads;
create trigger financing_leads_updated_at
  before update on public.financing_leads
  for each row execute function public.set_updated_at();
