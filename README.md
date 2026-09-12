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

- Shell Electron con navegación, header, sidebar y mini reproductor flotante.
- Un único player global persistente en `GlobalPlayerHost.tsx`, movido por portal entre
  `#global-player-watch-slot` y `#global-player-mini-slot`.
- Reproducción SABR/DASH con Shaka, poToken real, CORS ajustado para `googlevideo.com` y timedtext.
- UI oficial de Shaka (`shaka.ui.Overlay`) creada con el mismo orden que FreeTube Lab: Overlay,
  controls/player, attach del `<video>`.
- Página `/watch/:videoId` con layout tipo FreeTube: video, tarjeta de info básica y sidebar
  compacta "A continuación".
- Recomendados de Watch desde `watch_next_feed`, incluyendo `CompactVideo`, `CompactMovie` y
  `LockupView` (`VIDEO`/`STATION`), igual que FreeTube Lab.
- Búsqueda, home feed, historial local, páginas de canal y suscripciones locales.
- Captions como `<track>` WebVTT y storyboards como thumbnails de Shaka.

Pendiente para acercar más la página Watch a FreeTube:

- Detalles completos del video: vistas, fecha, likes, subscribe, compartir, playlists.
- Descripción expandible con timestamps clickeables.
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
