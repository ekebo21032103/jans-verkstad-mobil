-- Kontrollerar de objekt som redan skapats, utan att ändra något.
select
  c.relname as tabell,
  c.relrowsecurity as rls_aktiverat,
  (select count(*) from pg_policies p
   where p.schemaname = 'public' and p.tablename = c.relname) as antal_regler
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname = 'verkstad_records';

select id, name, public as offentliga_foton
from storage.buckets where id = 'jans-foton';

select schemaname, tablename, policyname, roles, cmd
from pg_policies
where (schemaname = 'public' and tablename = 'verkstad_records')
   or (schemaname = 'storage' and tablename = 'objects' and policyname like 'Own photos%')
order by schemaname, tablename, policyname;
