-- FORGE Training 10: личная облачная копия дневника.
-- Запустить один раз в SQL Editor собственного проекта Supabase.
-- Не вставляйте service_role или secret key в клиентское приложение.
create table if not exists public.forge_snapshots (
  user_id uuid primary key references auth.users(id) on delete cascade,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.forge_snapshots enable row level security;
revoke all on table public.forge_snapshots from anon, authenticated;
grant select, insert, update, delete on table public.forge_snapshots to authenticated;

drop policy if exists "forge_own_select" on public.forge_snapshots;
drop policy if exists "forge_own_insert" on public.forge_snapshots;
drop policy if exists "forge_own_update" on public.forge_snapshots;
drop policy if exists "forge_own_delete" on public.forge_snapshots;

create policy "forge_own_select" on public.forge_snapshots
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "forge_own_insert" on public.forge_snapshots
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "forge_own_update" on public.forge_snapshots
  for update to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "forge_own_delete" on public.forge_snapshots
  for delete to authenticated using ((select auth.uid()) = user_id);

comment on table public.forge_snapshots is 'Персональная копия тренировок и питания пользователя FORGE Training';
-- Проверка: войти пользователем А, создать/прочитать свою строку;
-- от имени пользователя Б чтение, UPDATE и DELETE строки А должны возвращать отказ/0 строк.
