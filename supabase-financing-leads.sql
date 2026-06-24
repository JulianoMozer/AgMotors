-- Migração: leads de pré-análise de financiamento da AG Motors.
-- Execute este arquivo uma vez no SQL Editor do Supabase.

create extension if not exists pgcrypto;

create table if not exists public.financing_leads (
  id uuid primary key default gen_random_uuid(),
  vehicle_id text,
  vehicle_title text,
  vehicle_price numeric,
  cpf text not null,
  birth_date date not null,
  has_cnh boolean not null,
  phone text not null,
  status text default 'novo',
  created_at timestamp with time zone default now()
);

alter table public.financing_leads enable row level security;

drop policy if exists "Publico envia pre-analise" on public.financing_leads;
drop policy if exists "Admin ve leads de financiamento" on public.financing_leads;
drop policy if exists "Admin atualiza leads de financiamento" on public.financing_leads;

create policy "Publico envia pre-analise" on public.financing_leads
  for insert
  with check (coalesce(status, 'novo') = 'novo');

create policy "Admin ve leads de financiamento" on public.financing_leads
  for select
  using (public.is_admin());

create policy "Admin atualiza leads de financiamento" on public.financing_leads
  for update
  using (public.is_admin())
  with check (public.is_admin());

notify pgrst, 'reload schema';
