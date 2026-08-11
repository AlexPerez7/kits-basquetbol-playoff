# Produccion-kits-basquetbol

Tablero Kanban de producción para PlayOff (kits de básquetbol). Pizarra digital
compartida: cualquiera con el link ve el mismo tablero en vivo, en cualquier
dispositivo, y los cambios (mover una tarjeta, crear una OT, etc.) se reflejan
al instante en todas las demás pantallas — sin recargar y sin login.

## Cómo funciona

- **Frontend estático** (`index.html`, `styles.css`, `app.js`): sin build ni
  dependencias que instalar, se puede abrir el `index.html` directamente o
  publicarlo en cualquier hosting de archivos estáticos.
- **Backend**: [Supabase](https://supabase.com) (Postgres gratuito + sincronización
  en tiempo real). El frontend habla directo con Supabase desde el navegador,
  usando su librería `supabase-js` (cargada por CDN en `index.html`).
- `legacy/gestion-produccion-clubes.html` es la versión original de un solo
  archivo (guardaba todo localmente en el navegador) — se conserva como
  referencia, ya no se usa.

## Puesta en marcha (una sola vez)

1. Crear una cuenta gratuita en [supabase.com](https://supabase.com) y un
   proyecto nuevo.
2. En el proyecto, ir a **SQL Editor > New query**, pegar todo el contenido
   de [`supabase/schema.sql`](supabase/schema.sql) y ejecutarlo. Esto crea las
   tablas, activa Realtime y configura los permisos de acceso.
3. Ir a **Settings > API** y copiar el **Project URL** y la **anon public key**.
4. Abrir [`supabase-config.js`](supabase-config.js) y reemplazar
   `SUPABASE_URL` y `SUPABASE_ANON_KEY` con esos valores.
5. Abrir `index.html` en el navegador (doble clic alcanza) para probarlo
   localmente. El tablero arranca vacío — usá el botón **Reiniciar** si querés
   cargar datos de ejemplo para probar.

## Publicarlo para que todos lo vean

Como es un sitio estático, cualquier hosting gratuito de archivos sirve, por
ejemplo [Cloudflare Pages](https://pages.cloudflare.com/),
[Netlify](https://www.netlify.com/) o [GitHub Pages](https://pages.github.com/):
conectá el repositorio (rama que corresponda) y estos servicios publican una
URL fija. Esa URL es la que se abre en cada pantalla/dispositivo del equipo.

**Nota de seguridad:** hoy no hay login — cualquiera con la URL puede ver y
modificar el tablero (pensado como "pizarra compartida" para el equipo
interno). No compartas el link en canales públicos mientras no se agregue
autenticación.
