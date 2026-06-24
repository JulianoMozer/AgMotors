-- Migration: financing pre-analysis leads for AG Motors.
-- Run this file in the Supabase SQL Editor.
-- It is safe to run more than once.

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

alter table public.financing_leads add column if not exists vehicle_id text;
alter table public.financing_leads add column if not exists vehicle_title text;
alter table public.financing_leads add column if not exists vehicle_price numeric;
alter table public.financing_leads add column if not exists cpf text;
alter table public.financing_leads add column if not exists birth_date date;
alter table public.financing_leads add column if not exists has_cnh boolean;
alter table public.financing_leads add column if not exists phone text;
alter table public.financing_leads add column if not exists status text default 'novo';
alter table public.financing_leads add column if not exists created_at timestamp with time zone default now();

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'financing_leads'
      and column_name = 'vehicle_code'
  ) then
    alter table public.financing_leads alter column vehicle_code drop not null;
  end if;
end $$;

do $$
declare
  constraint_record record;
begin
  for constraint_record in
    select conname
    from pg_constraint
    where conrelid = 'public.financing_leads'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%status%'
  loop
    execute format('alter table public.financing_leads drop constraint if exists %I', constraint_record.conname);
  end loop;
end $$;

update public.financing_leads
set status = case status
  when 'new' then 'novo'
  when 'contacting' then 'em_atendimento'
  when 'finished' then 'finalizado'
  when 'em atendimento' then 'em_atendimento'
  when 'novo' then 'novo'
  when 'em_atendimento' then 'em_atendimento'
  when 'finalizado' then 'finalizado'
  else 'novo'
end;

alter table public.financing_leads alter column status set default 'novo';
alter table public.financing_leads
  add constraint financing_leads_status_check
  check (status in ('novo', 'em_atendimento', 'finalizado'));

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

grant usage on schema public to anon, authenticated;
grant insert on table public.financing_leads to anon, authenticated;
grant select, update on table public.financing_leads to authenticated;

notify pgrst, 'reload schema';
