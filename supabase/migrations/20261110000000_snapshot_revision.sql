-- Apply after supabase-schema.sql. Preserves every existing snapshot.
begin;

alter table public.forge_snapshots add column if not exists revision bigint not null default 1;

create or replace function public.forge_snapshot_next_revision()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.revision := 1;
  else
    new.revision := old.revision + 1;
  end if;
  new.updated_at := pg_catalog.clock_timestamp();
  return new;
end
$$;

drop trigger if exists forge_snapshot_revision on public.forge_snapshots;
create trigger forge_snapshot_revision
before insert or update on public.forge_snapshots
for each row execute function public.forge_snapshot_next_revision();

revoke all on function public.forge_snapshot_next_revision() from public;
notify pgrst, 'reload schema';
commit;
