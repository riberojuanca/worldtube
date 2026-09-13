# WorldTube

Cliente de escritorio para YouTube, nacido como continuación del laboratorio hecho sobre
`../freetube-audio-lab`. La app usa el comportamiento probado ahí como referencia, pero el código
de este repo es propio.

No afiliado a Google/YouTube. Nombre provisional.

## Forma de trabajo

Cuando una funcionalidad ya existe en `../freetube-audio-lab`, el flujo correcto es:

1. Revisar el código original de FreeTube Lab.
2. Entender el patrón exacto y el orden de inicialización.
3. Replicar acá el comportamiento equivalente con el menor cambio necesario.
4. Verificar por código, logs, typecheck y build.

No se deben probar correcciones al tanteo ni meter parches visuales inventados. Tampoco se usa
Playwright para este proyecto; la revisión se hace por código y, cuando hace falta, por logs de la
app corriendo.

## Stack

Electron + `electron-vite` + React 18 + TypeScript + Tailwind. `youtubei.js` para datos de YouTube,
`bgutils-js` para poToken/BotGuard, `shaka-player` para reproducción y controles, y `googlevideo`
para el puente SABR/UMP.

## Estado actual

Funciona:

- Base visual: todos los redondeos van a 3px. La fuente base usa Inter local por defecto, con Inter Tight local disponible para comparar; Roboto no se carga desde la nube.
- Usuarios/sesión local: usuario local con contraseña opcional, login/logout, perfil activo arriba a la derecha, edición de nombre/foto/color desde ese menú, panel Cuenta para datos locales y export/import completo.
- Shell Electron con navegación, header, sidebar y mini reproductor flotante arrastrable.
- Un único player global persistente en `GlobalPlayerHost.tsx`, movido por portal entre
  `#global-player-watch-slot` y `#global-player-mini-slot`.
- Mini reproductor: se puede mover, arrastrar hacia abajo para minimizar a barra inferior con
  controles, restaurar con flecha diagonal o arrastrar la barra hacia arriba sin desmontar el
  `<video>`.
- Reproducción SABR/DASH con Shaka, poToken real, CORS ajustado para `googlevideo.com` y timedtext.
- UI oficial de Shaka (`shaka.ui.Overlay`) creada con el mismo orden que FreeTube Lab: Overlay,
  controls/player, attach del `<video>`.
- Página `/watch/:videoId` con layout tipo FreeTube: video, tarjeta de info básica y sidebar
  compacta "A continuación".
- Watch fase 2: vistas/fecha/duración/categoría/likes, canal con avatar y suscriptores,
  suscripción local, copiar enlace y descripción expandible con timestamps clickeables.
- Recomendados de Watch desde `watch_next_feed`, incluyendo `CompactVideo`, `CompactMovie` y
  `LockupView` (`VIDEO`/`STATION`), igual que FreeTube Lab.
- Búsqueda, home feed, historial local, páginas de canal y suscripciones locales.
- Secciones de biblioteca en la barra izquierda: Guardados y Playlists leen la DB del perfil activo.
- Los datos viven en una DB local versionada (`worldtube-data.json`): usuarios, sesión, perfiles, historial, suscripciones, playlists guardadas, videos guardados y settings futuras. Los archivos globales viejos se migran a esa DB al primer arranque.
- Captions como `<track>` WebVTT y storyboards como thumbnails de Shaka.

Pendiente para acercar más la página Watch a FreeTube:

- Capítulos.
- Comentarios.
- Playlist en sidebar.
- Live chat/upcoming/premiere/error states.
- Preferencias de ocultar secciones y modos avanzados.
- Soporte más amplio de `LockupView` fuera de Watch, por ejemplo en shelves de home/canales.

## Desarrollo

```bash
corepack pnpm install
corepack pnpm dev
corepack pnpm run typecheck
corepack pnpm run build
```

El renderer corre en `http://localhost:5173/` durante desarrollo. Si tocás `src/main/` o
`src/preload/` y la app no refleja el cambio, reiniciá `corepack pnpm dev`; Electron/Vite a veces
deja el renderer con HMR activo pero el proceso principal con un build viejo.
