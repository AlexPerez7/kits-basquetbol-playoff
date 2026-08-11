# Produccion-kits-basquetbol

Tablero Kanban de producción para **PlayOff** (kits de básquetbol). Es una
pizarra digital compartida: cualquiera con el link ve el mismo tablero en
vivo, desde cualquier dispositivo, y los cambios (mover una tarjeta, crear
una OT, asignar un responsable, etc.) se reflejan al instante en todas las
demás pantallas — sin recargar y sin login.

**Sitio en vivo:** https://kits-basquetbol-playoff.netlify.app

## Cómo funciona

No hay backend propio ni build. El navegador habla directo con
[Supabase](https://supabase.com) (Postgres gratuito + sincronización en
tiempo real vía WebSockets) usando su librería `supabase-js`, cargada por
CDN. [Netlify](https://www.netlify.com) sirve los archivos estáticos y
redespliega solo con cada `git push` a la rama `Alex`.

```
Navegador (index.html/app.js) → Supabase (Postgres + Realtime)
        ↑                              ↓
   Netlify sirve                  todas las pestañas/pantallas
   los archivos                   conectadas reciben el cambio
   estáticos                      en vivo por WebSocket
```

- Cada mutación (crear/editar/eliminar una OT, avanzar o retroceder de
  etapa, asignar responsable, dejar un comentario) escribe directo en
  Supabase desde el navegador con `supabase-js`.
- Supabase Realtime avisa por WebSocket a todas las pantallas conectadas
  cuando algo cambia en las tablas, así que no hace falta recargar para ver
  lo que hizo otra persona.
- Si dos personas editan la misma OT casi al mismo tiempo, no se pisan los
  campos en pantalla: aparece un aviso para recargar los valores nuevos.
- Si se corta la conexión (wifi, pantalla que estuvo horas abierta),
  `supabase-js` reconecta solo y aparece un banner rojo mientras tanto.

## Estructura del proyecto

```
index.html                          shell HTML de la app
styles.css                          estilos (extraídos del original)
app.js                              toda la lógica: estado, render, Supabase, realtime
supabase-config.js                  credenciales del proyecto Supabase (URL + anon key)
supabase/
  schema.sql                        esquema completo y al dia, para un proyecto Supabase nuevo
  migrations/
    README.md                       que migracion correr y en que orden
    002_responsables.sql            agrega la tabla responsables (ejecutar antes que 003)
    003_next_ot_seq_self_healing.sql corrige la generacion de IDs de OT (ejecutar despues de 002)
legacy/
  gestion-produccion-clubes.html    versión original de un solo archivo (ya no se usa)
```

### Datos en Supabase (Postgres)

| Tabla          | Qué guarda                                                                 |
|----------------|------------------------------------------------------------------------------|
| `ots`          | Cada orden de trabajo: club, productos, prioridad, etapa, responsable, notas, historial de retrocesos y de etapas por las que pasó. |
| `comments`     | Un comentario de texto libre por persona (pestaña Resumen).                 |
| `meta`         | Contador interno para generar los IDs `OT-2026-XXX`.                        |
| `responsables` | Qué personas pueden ser responsables de cada etapa (una persona puede cubrir más de una etapa). |

`STAGES`/`PRIOS`/`PRODUCTS` (las 7 etapas del pipeline, las prioridades y los
productos) siguen definidos en `app.js` porque son configuración fija de la
app, no datos que cambien en el uso diario. `PEOPLE` (la lista de personas) y
el equipo de cada etapa sí salen de la tabla `responsables`, cargados una vez
al abrir la app.

No hay autenticación: cualquiera con la URL puede leer y escribir. Es
intencional (pizarra compartida sin login), protegido por políticas RLS
abiertas en Supabase — ver la nota de seguridad más abajo.

## Puesta en marcha desde cero (proyecto Supabase nuevo)

1. Crear una cuenta gratuita en [supabase.com](https://supabase.com) y un
   proyecto nuevo (no hace falta conectar GitHub, alcanza con lo manual).
2. En el proyecto, ir a **SQL Editor > New query**, pegar todo el contenido
   de [`supabase/schema.sql`](supabase/schema.sql) y ejecutarlo. Esto crea
   las tablas (`ots`, `comments`, `meta`, `responsables`), activa Realtime,
   configura las políticas de acceso (RLS) y carga el equipo por etapa.
3. Ir a **Settings > API** y copiar el **Project URL** y la **anon /
   publishable key** (Supabase la puede llamar `anon key` o
   `sb_publishable_...` según la versión).
4. Abrir [`supabase-config.js`](supabase-config.js) y reemplazar
   `SUPABASE_URL` y `SUPABASE_ANON_KEY` con esos valores.
5. Abrir `index.html` en el navegador (doble clic alcanza) para probarlo
   localmente. El tablero arranca vacío — usá el botón **Reiniciar** si
   querés cargar datos de ejemplo para probar.

**Proyecto nuevo:** con el paso 2 (correr `schema.sql` una vez) alcanza, ya
incluye todo al día — no toques nada de `supabase/migrations/`.

**Proyecto que ya existía** antes de estos cambios (ya habías corrido una
versión vieja de `schema.sql`): no hace falta re-correr todo, pegá y
ejecutá en el SQL Editor, **en este orden**, los scripts de
[`supabase/migrations/`](supabase/migrations/README.md) que todavía no
hayas corrido:

1. `002_responsables.sql` — agrega la tabla `responsables`.
2. `003_next_ot_seq_self_healing.sql` — corrige la generación de IDs de OT.

Ninguno de los dos toca las OT que ya tengas guardadas.

## Desplegado en Netlify (ya configurado)

El sitio ya está conectado: Netlify sigue la rama `Alex` de
`AlexPerez7/kits-basquetbol-playoff` y redespliega automáticamente con cada
push, sin build command (es HTML/CSS/JS plano, publish directory `.`).

Para que otra persona lo replique desde cero en su propia cuenta:

1. [app.netlify.com](https://app.netlify.com) > **Add new site > Import an
   existing project > Deploy with GitHub**, elegir el repo.
2. **Branch to deploy**: la rama que corresponda. **Build command**: vacío.
   **Publish directory**: `.`.
3. Deploy — Netlify da una URL fija (`algo.netlify.app`, renombrable en
   Site settings).

Como `supabase-config.js` va commiteado en el repo (la anon/publishable key
está pensada para ser pública, ver nota de seguridad), no hace falta
configurar variables de entorno aparte en Netlify.

## Actualizar la app

Cualquier cambio en `index.html`, `styles.css`, `app.js` o
`supabase-config.js` que se pushee a la rama `Alex` se refleja solo en
Netlify en un par de minutos. Si el cambio agrega o modifica tablas de
Supabase, hay que correr el SQL correspondiente a mano en el SQL Editor del
proyecto — Netlify no toca la base de datos, solo sirve los archivos
estáticos.

## Nota de seguridad

Hoy no hay autenticación: cualquiera con la URL puede ver y modificar el
tablero (pensado como pizarra compartida para el equipo interno, sin fricción
de login). Esto está protegido únicamente por políticas RLS abiertas en
Supabase, no por control de acceso real. No compartas el link en canales
públicos mientras no se agregue autenticación.
