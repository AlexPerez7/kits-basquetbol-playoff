-- PlayOff — Gestión de Producción
-- Ejecutar este script completo en el SQL Editor de tu proyecto Supabase
-- (Project > SQL Editor > New query > pegar todo > Run).

create table if not exists ots (
  id         text primary key,
  club       text not null,
  items      jsonb not null default '[]',
  prio       text not null default 'Media',
  prio_prev  text,
  resp       text default '',
  stage      text not null default 'ot',
  notes      text default '',
  created    date not null,
  returns    jsonb not null default '[]',
  history    jsonb not null default '[]',
  updated_at timestamptz not null default now()
);

create table if not exists comments (
  person text primary key,
  text   text not null default ''
);

create table if not exists meta (
  key   text primary key,
  value int not null
);
insert into meta(key, value) values ('seq', 0)
  on conflict (key) do nothing;

-- Genera el próximo número de secuencia para IDs 'OT-2026-001', de forma
-- atómica aunque dos personas creen una OT al mismo tiempo.
create or replace function next_ot_seq()
returns int
language sql
security definer
set search_path = public
as $$
  update meta set value = value + 1 where key = 'seq' returning value;
$$;

-- Trigger para mantener updated_at al día en cada UPDATE.
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists ots_set_updated_at on ots;
create trigger ots_set_updated_at
  before update on ots
  for each row execute function set_updated_at();

-- Habilita Realtime (broadcast en vivo de INSERT/UPDATE/DELETE) para estas tablas.
alter publication supabase_realtime add table ots;
alter publication supabase_realtime add table comments;

-- Row Level Security: acceso abierto de lectura/escritura.
-- Esta app es un "pizarrón compartido" sin login individual — cualquiera con
-- la URL puede leer y escribir. Mantener esto en una red/URL de confianza
-- (no publicar el link en un canal público) mientras no exista autenticación.
alter table ots enable row level security;
alter table comments enable row level security;
alter table meta enable row level security;

create policy "public read ots"   on ots for select using (true);
create policy "public insert ots" on ots for insert with check (true);
create policy "public update ots" on ots for update using (true) with check (true);
create policy "public delete ots" on ots for delete using (true);

create policy "public read comments"   on comments for select using (true);
create policy "public insert comments" on comments for insert with check (true);
create policy "public update comments" on comments for update using (true) with check (true);

create policy "public read meta" on meta for select using (true);

grant select, insert, update, delete on ots       to anon, authenticated;
grant select, insert, update         on comments  to anon, authenticated;
grant select                         on meta      to anon, authenticated;
grant execute on function next_ot_seq() to anon, authenticated;

-- Nota: no se insertan datos de ejemplo acá. Al abrir la app por primera vez
-- el tablero estará vacío; usá el botón "Reiniciar" para cargar OTs de
-- ejemplo si querés probar la app antes de cargar datos reales.
