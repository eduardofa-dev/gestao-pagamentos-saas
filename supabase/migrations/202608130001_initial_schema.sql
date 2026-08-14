-- Gestão de Pagamentos — esquema inicial para Supabase/Postgres
-- Execute pelo Supabase CLI (`supabase db push`) ou cole no SQL Editor.

create extension if not exists pgcrypto;

create type public.member_role as enum ('admin', 'financeiro', 'aprovador');
create type public.company_kind as enum ('matriz', 'filial');
create type public.bill_status as enum ('pending', 'reminder_sent', 'paid', 'cancelled');
create type public.approval_status as enum ('pending', 'approved', 'rejected');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  whatsapp text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.business_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 120),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.group_members (
  group_id uuid not null references public.business_groups(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.member_role not null,
  is_group_approver boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

create unique index one_approver_per_group_idx
  on public.group_members(group_id)
  where is_group_approver;

create table public.companies (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.business_groups(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 120),
  kind public.company_kind not null default 'matriz',
  parent_company_id uuid references public.companies(id) on delete set null,
  cnpj text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.bills (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.business_groups(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete restrict,
  supplier text not null check (char_length(supplier) between 2 and 160),
  category text not null default 'Outros',
  cost_center text,
  amount_cents bigint not null check (amount_cents > 0),
  due_date date not null,
  status public.bill_status not null default 'pending',
  approval_status public.approval_status not null default 'pending',
  late_fee_bps integer not null default 0 check (late_fee_bps between 0 and 10000),
  monthly_interest_bps integer not null default 0 check (monthly_interest_bps between 0 and 10000),
  protest_days integer check (protest_days between 1 and 365),
  barcode text,
  attachment_path text,
  notes text,
  created_by uuid not null references auth.users(id),
  approved_by uuid references auth.users(id),
  approved_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.reminders (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.business_groups(id) on delete cascade,
  bill_id uuid not null references public.bills(id) on delete cascade,
  sent_by uuid not null references auth.users(id),
  recipient_name text not null,
  recipient_phone text not null,
  channel text not null default 'whatsapp' check (channel = 'whatsapp'),
  message text not null,
  status text not null default 'prepared' check (status in ('prepared', 'opened', 'sent')),
  created_at timestamptz not null default now()
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.business_groups(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  bill_id uuid references public.bills(id) on delete cascade,
  kind text not null check (kind in ('near_due', 'overdue', 'protest')),
  title text not null,
  body text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index group_members_user_idx on public.group_members(user_id, group_id);
create index companies_group_idx on public.companies(group_id, active);
create index bills_group_due_idx on public.bills(group_id, due_date);
create index bills_company_idx on public.bills(company_id);
create index bills_status_idx on public.bills(group_id, status);
create index reminders_bill_idx on public.reminders(bill_id, created_at desc);
create index notifications_user_idx on public.notifications(user_id, read_at, created_at desc);

create schema if not exists private;
revoke all on schema private from public;

create or replace function private.is_group_member(target_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.group_members
    where group_id = target_group_id
      and user_id = (select auth.uid())
  );
$$;

create or replace function private.has_group_role(
  target_group_id uuid,
  allowed_roles public.member_role[]
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.group_members
    where group_id = target_group_id
      and user_id = (select auth.uid())
      and role = any(allowed_roles)
  );
$$;

revoke all on function private.is_group_member(uuid) from public;
revoke all on function private.has_group_role(uuid, public.member_role[]) from public;
grant usage on schema private to authenticated;
grant execute on function private.is_group_member(uuid) to authenticated;
grant execute on function private.has_group_role(uuid, public.member_role[]) to authenticated;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at before update on public.profiles
for each row execute function public.set_updated_at();
create trigger business_groups_set_updated_at before update on public.business_groups
for each row execute function public.set_updated_at();
create trigger companies_set_updated_at before update on public.companies
for each row execute function public.set_updated_at();
create trigger bills_set_updated_at before update on public.bills
for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function public.create_group_with_admin(
  p_group_name text,
  p_company_name text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  new_group_id uuid;
begin
  if current_user_id is null then
    raise exception 'Usuário não autenticado';
  end if;
  if char_length(trim(p_group_name)) < 2 or char_length(trim(p_company_name)) < 2 then
    raise exception 'Informe nomes válidos para o grupo e a empresa';
  end if;

  insert into public.profiles (id, full_name)
  values (current_user_id, '')
  on conflict (id) do nothing;

  insert into public.business_groups (name, created_by)
  values (trim(p_group_name), current_user_id)
  returning id into new_group_id;

  insert into public.group_members (group_id, user_id, role)
  values (new_group_id, current_user_id, 'admin');

  insert into public.companies (group_id, name, kind)
  values (new_group_id, trim(p_company_name), 'matriz');

  return new_group_id;
end;
$$;

create or replace function public.approve_bill(p_bill_id uuid, p_approved boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_group_id uuid;
  can_approve boolean;
begin
  select group_id into target_group_id from public.bills where id = p_bill_id;
  select exists (
    select 1 from public.group_members
    where group_id = target_group_id
      and user_id = auth.uid()
      and role = 'aprovador'
      and is_group_approver
  ) into can_approve;

  if not coalesce(can_approve, false) then
    raise exception 'Usuário não é o aprovador do grupo';
  end if;

  update public.bills
  set approval_status = case when p_approved then 'approved'::public.approval_status else 'rejected'::public.approval_status end,
      approved_by = auth.uid(),
      approved_at = now()
  where id = p_bill_id;
end;
$$;

revoke all on function public.create_group_with_admin(text, text) from public;
revoke all on function public.approve_bill(uuid, boolean) from public;
grant execute on function public.create_group_with_admin(text, text) to authenticated;
grant execute on function public.approve_bill(uuid, boolean) to authenticated;

alter table public.profiles enable row level security;
alter table public.business_groups enable row level security;
alter table public.group_members enable row level security;
alter table public.companies enable row level security;
alter table public.bills enable row level security;
alter table public.reminders enable row level security;
alter table public.notifications enable row level security;

create policy profiles_select_own on public.profiles
for select to authenticated using (id = (select auth.uid()));
create policy profiles_update_own on public.profiles
for update to authenticated using (id = (select auth.uid()))
with check (id = (select auth.uid()));

create policy groups_select_member on public.business_groups
for select to authenticated using ((select private.is_group_member(id)));
create policy groups_update_admin on public.business_groups
for update to authenticated using ((select private.has_group_role(id, array['admin']::public.member_role[])))
with check ((select private.has_group_role(id, array['admin']::public.member_role[])));

create policy members_select_group on public.group_members
for select to authenticated using ((select private.is_group_member(group_id)));
create policy members_insert_admin on public.group_members
for insert to authenticated with check ((select private.has_group_role(group_id, array['admin']::public.member_role[])));
create policy members_update_admin on public.group_members
for update to authenticated using ((select private.has_group_role(group_id, array['admin']::public.member_role[])))
with check ((select private.has_group_role(group_id, array['admin']::public.member_role[])));
create policy members_delete_admin on public.group_members
for delete to authenticated using ((select private.has_group_role(group_id, array['admin']::public.member_role[])));

create policy companies_select_member on public.companies
for select to authenticated using ((select private.is_group_member(group_id)));
create policy companies_insert_staff on public.companies
for insert to authenticated with check ((select private.has_group_role(group_id, array['admin','financeiro']::public.member_role[])));
create policy companies_update_staff on public.companies
for update to authenticated using ((select private.has_group_role(group_id, array['admin','financeiro']::public.member_role[])))
with check ((select private.has_group_role(group_id, array['admin','financeiro']::public.member_role[])));
create policy companies_delete_admin on public.companies
for delete to authenticated using ((select private.has_group_role(group_id, array['admin']::public.member_role[])));

create policy bills_select_member on public.bills
for select to authenticated using ((select private.is_group_member(group_id)));
create policy bills_insert_staff on public.bills
for insert to authenticated with check (
  created_by = (select auth.uid())
  and (select private.has_group_role(group_id, array['admin','financeiro']::public.member_role[]))
);
create policy bills_update_staff on public.bills
for update to authenticated using ((select private.has_group_role(group_id, array['admin','financeiro']::public.member_role[])))
with check ((select private.has_group_role(group_id, array['admin','financeiro']::public.member_role[])));
create policy bills_delete_admin on public.bills
for delete to authenticated using ((select private.has_group_role(group_id, array['admin']::public.member_role[])));

create policy reminders_select_member on public.reminders
for select to authenticated using ((select private.is_group_member(group_id)));
create policy reminders_insert_admin on public.reminders
for insert to authenticated with check (
  sent_by = (select auth.uid())
  and (select private.has_group_role(group_id, array['admin']::public.member_role[]))
);

create policy notifications_select_own on public.notifications
for select to authenticated using (user_id = (select auth.uid()));
create policy notifications_update_own on public.notifications
for update to authenticated using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

revoke all on all tables in schema public from anon;
grant select, insert, update, delete on all tables in schema public to authenticated;

comment on column public.bills.late_fee_bps is 'Multa em pontos-base: 200 = 2%';
comment on column public.bills.monthly_interest_bps is 'Juros mensais em pontos-base: 100 = 1%';
