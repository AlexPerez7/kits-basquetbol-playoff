# Migraciones

Estos scripts son **incrementales**, para un proyecto Supabase que ya corrió
una versión anterior de [`../schema.sql`](../schema.sql). Un proyecto nuevo
**no necesita nada de esta carpeta** — `schema.sql` ya incluye todos estos
cambios al día.

Si tu proyecto es de antes de que existiera esta carpeta, corré los que te
falten en el SQL Editor de Supabase, **en este orden** (cada uno depende de
que el anterior ya se haya ejecutado):

| # | Archivo | Qué hace |
|---|---------|----------|
| 1 | [`002_responsables.sql`](002_responsables.sql) | Agrega la tabla `responsables` (persona ↔ etapa) y la llena con el equipo actual. |
| 2 | [`003_next_ot_seq_self_healing.sql`](003_next_ot_seq_self_healing.sql) | Corrige `next_ot_seq()` para que nunca repita un ID de OT aunque el contador interno se desincronice (arregla el error 23505 al crear una OT). |

Ninguno borra ni modifica las OT que ya tengas guardadas. Si no estás
seguro de cuáles ya corriste, es seguro re-ejecutarlos: todos usan
`create table if not exists`, `on conflict do nothing` o `create or replace
function`, así que repetirlos no rompe nada.
