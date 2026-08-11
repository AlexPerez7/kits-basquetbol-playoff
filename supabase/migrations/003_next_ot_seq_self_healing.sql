-- Migración incremental: corrige next_ot_seq() para que sea autocorrectiva.
-- Pegar y ejecutar en SQL Editor > New query.
--
-- Bug que arregla: el botón "Reiniciar" actualizaba "meta.value" con un
-- UPDATE directo desde el navegador, pero la tabla "meta" solo tenía una
-- política RLS de lectura — el UPDATE no daba error, simplemente no
-- afectaba ninguna fila. Eso dejaba el contador desincronizado del
-- contenido real de "ots", y la siguiente OT creada intentaba reusar un ID
-- ya existente (error 23505 "duplicate key value violates unique
-- constraint ots_pkey" al guardar una OT nueva).
--
-- Con este cambio, next_ot_seq() ya no confía ciegamente en "meta.value":
-- calcula el mayor número de OT realmente usado en la tabla "ots" y toma el
-- máximo entre ambos antes de incrementar, así nunca repite un ID aunque el
-- contador haya quedado atrasado.

create or replace function next_ot_seq()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  max_used int;
  next_val int;
begin
  select coalesce(max((regexp_match(id, 'OT-\d{4}-(\d+)'))[1]::int), 0) into max_used from ots;
  update meta set value = greatest(value, max_used) + 1 where key = 'seq' returning value into next_val;
  return next_val;
end;
$$;
