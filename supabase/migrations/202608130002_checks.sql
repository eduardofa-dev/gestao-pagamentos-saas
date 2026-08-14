-- Módulo de cheques pré-datados e histórico de lembretes.
-- Execute depois de 202608130001_initial_schema.sql.

create type public.check_status as enum ('scheduled', 'reminder_sent', 'compensated', 'cancelled');

create table public.checks (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.business_groups(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete restrict,
  beneficiary text not null check (char_length(beneficiary) between 2 and 160),
  bank_name text not null check (char_length(bank_name) between 2 and 120),
  branch text,
  account_number text,
  check_number text not null check (char_length(check_number) between 1 and 40),
  amount_cents bigint not null check (amount_cents > 0),
  issue_date date not null,
  compensation_date date not null,
  reminder_days integer not null default 1 check (reminder_days between 0 and 90),
  status public.check_status not null default 'scheduled',
  notes text,
  created_by uuid not null references auth.users(id),
  compensated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (compensation_date >= issue_date)
);

create table public.check_reminders (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.business_groups(id) on delete cascade,
  check_id uuid not null references public.checks(id) on delete cascade,
  sent_by uuid not null references auth.users(id),
  recipient_name text not null,
  recipient_phone text not null,
  channel text not null default 'whatsapp' check (channel = 'whatsapp'),
  message text not null,
  status text not null default 'prepared' check (status in ('prepared', 'opened', 'sent')),
  created_at timestamptz not null default now()
);

create index checks_group_compensation_idx on public.checks(group_id, compensation_date);
create index checks_company_idx on public.checks(company_id);
create index checks_status_idx on public.checks(group_id, status);
create index check_reminders_check_idx on public.check_reminders(check_id, created_at desc);

create trigger checks_set_updated_at before update on public.checks
for each row execute function public.set_updated_at();

alter table public.checks enable row level security;
alter table public.check_reminders enable row level security;

create policy checks_select_member on public.checks
for select to authenticated using ((select private.is_group_member(group_id)));

create policy checks_insert_staff on public.checks
for insert to authenticated with check (
  created_by = (select auth.uid())
  and (select private.has_group_role(group_id, array['admin','financeiro']::public.member_role[]))
);

create policy checks_update_staff on public.checks
for update to authenticated
using ((select private.has_group_role(group_id, array['admin','financeiro']::public.member_role[])))
with check ((select private.has_group_role(group_id, array['admin','financeiro']::public.member_role[])));

create policy checks_delete_admin on public.checks
for delete to authenticated
using ((select private.has_group_role(group_id, array['admin']::public.member_role[])));

create policy check_reminders_select_member on public.check_reminders
for select to authenticated using ((select private.is_group_member(group_id)));

create policy check_reminders_insert_admin on public.check_reminders
for insert to authenticated with check (
  sent_by = (select auth.uid())
  and (select private.has_group_role(group_id, array['admin']::public.member_role[]))
);

revoke all on public.checks, public.check_reminders from anon;
grant select, insert, update, delete on public.checks to authenticated;
grant select, insert on public.check_reminders to authenticated;

comment on column public.checks.compensation_date is 'Data prevista para apresentação ou compensação do cheque';
comment on column public.checks.reminder_days is 'Antecedência em dias corridos para destacar o lembrete';
