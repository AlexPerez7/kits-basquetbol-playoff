-- Migración incremental: agrega la tabla "responsables" a un proyecto que ya
-- corrió supabase/schema.sql antes. Pegar y ejecutar en SQL Editor > New query.
-- (Los proyectos nuevos no necesitan esto: ya viene incluido en schema.sql).

create table if not exists responsables (
  id    bigserial primary key,
  name  text not null,
  stage text not null
);
create unique index if not exists responsables_name_stage_idx on responsables(name, stage);

insert into responsables(name, stage) values
  ('Valentina','ot'), ('Nohemi','ot'),
  ('Alejandro','diseno'), ('Joaquín','diseno'),
  ('Gonzi','impresion'),
  ('Maxi','estampado'),
  ('Cami','corte'),
  ('Bernardita','modista'), ('Mirtha','modista'), ('Romane','modista'), ('Jimena','modista'),
  ('Nohemi','entrega'), ('Valentina','entrega'), ('César','entrega')
on conflict (name, stage) do nothing;

alter table responsables enable row level security;
create policy "public read responsables" on responsables for select using (true);
grant select on responsables to anon, authenticated;
