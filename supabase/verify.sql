-- Consultas de verificação para executar no SQL Editor depois da migração.
select c.relname as table_name, c.relrowsecurity as row_security
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('profiles', 'business_groups', 'group_members', 'companies', 'bills', 'reminders', 'checks', 'check_reminders', 'notifications')
order by c.relname;

select schemaname, tablename, policyname, roles, cmd
from pg_policies
where schemaname = 'public'
order by tablename, policyname;
