# WorldTube — Estado al 2026-09-12

App de escritorio propia para YouTube, continuación del laboratorio hecho sobre FreeTube en
`../freetube-audio-lab` (ver su `MINI_PLAYER_HANDOFF.md`). Código propio, aprendizaje reusado.

## Stack

Electron + `electron-vite` + React 18 + TypeScript + Tailwind. `youtubei.js` para hablar con la
API interna de YouTube, `bgutils-js` para el poToken (BotGuard), `shaka-player` para reproducción
y controles, y `googlevideo` para el puente SABR/UMP.

## Forma de trabajo acordada

Cuando algo ya está hecho y funcionando en `../freetube-audio-lab`, no se arregla por tanteo:
primero se revisa el código original, se entiende el patrón exacto y recién después se replica acá
el comportamiento equivalente. Esto aplica especialmente a `Watch`, al player global, al mini
player y a Shaka.

No usar Playwright en este proyecto. La verificación se hace leyendo código, comparando con
FreeTube Lab, mirando logs de la app levantada y corriendo `typecheck`/`build`.

## Arquitectura

Mismo patrón validado en el laboratorio de FreeTube: un único `<video>` (`GlobalPlayerHost.tsx`)
que se mueve vía `createPortal` de React entre `#global-player-watch-slot` (en `/watch/:id`) y
`#global-player-mini-slot` (mini flotante en cualquier otra ruta). Estado en
`GlobalPlayerContext.tsx`. A diferencia del prototipo Vue, acá el `<video>` y su `shaka.Player` son
un solo objeto persistente para toda la vida de la app — cambiar de video llama a `player.load()`
de nuevo en vez de destruir/recrear nada, así que no existe el problema de "destruir el player
async antes de cambiar de instancia" que hubo que arreglar en FreeTube.

Capa de datos (proceso principal, `src/main/`):

- `youtube.ts`: cliente `Innertube` (con `retrieve_player: true`, necesario para poder decifrar
  formatos), dedupe de pedidos concurrentes por `videoId`.
- `poToken.ts`: genera el poToken (proof of origin) vía BotGuard en una `BrowserWindow` oculta,
  con su propia sesión de Electron (headers CORS/Referer inyectados a mano, ver comentarios en el
  archivo) — mismo mecanismo que usa FreeTube (`bgutils-js`), reimplementado con código propio.
- `botguard/script.ts`: el script que corre dentro de esa ventana oculta (scrapea la home de
  YouTube, resuelve el desafío BotGuard, mintea el token). Se bundlea con esbuild en tiempo de
  ejecución (atajo de desarrollo — para un build real conviene bundlearlo en el paso de build, no
  en cada arranque).
- `ipc.ts` (compartido): contrato tipado entre renderer y main.

## Base visual acordada

- Todos los radios visuales deben resolver a **3px**. `tailwind.config.ts` redefine todas las
  variantes `rounded*` a 3px y `index.css` fuerza el mismo radio en controles/elementos externos
  como la UI de Shaka.
- La tipografía base no es Roboto. `index.css` registra Inter e Inter Tight desde
  `src/renderer/src/assets/fonts/`; Inter queda como default y hay presets CSS para `sf`,
  `inter` e `inter-tight`. No encontré archivos SF Pro reales en esta máquina durante la revisión:
  el preset `sf` queda preparado como stack/fallback para cuando exista esa fuente instalada o se
  copie un archivo SF al proyecto.
- Shaka carga un `controls.css` local en `src/renderer/src/player/styles/`, sin la `@font-face`
  remota de Roboto. `shaka-overrides.css` se importa después para forzar la fuente de WorldTube y
  el radio único de 3px en sus controles.

## Usuarios, sesión local y DB portable

- La app no usa nube ni login externo. La base local portable vive en
  `app.getPath('userData')/worldtube-data.json` y se maneja desde `src/main/localDb.ts`.
- La DB local versionada contiene usuarios, hash/salt de contraseña opcional, sesión activa,
  perfiles con foto/color, historial, suscripciones, playlists guardadas, videos guardados y un
  bloque `settings` para preferencias futuras.
- Primer arranque sin datos: el renderer muestra setup para crear un usuario local. Si hay usuarios
  pero no sesión activa, muestra login local. El menú superior derecho muestra el perfil activo,
  permite cambiarlo y editar nombre/foto/color.
- La barra izquierda separa biblioteca y cuenta: Guardados (`/saved`) y Playlists (`/playlists`)
  leen datos del perfil activo; Cuenta (`/account`) queda abajo y contiene usuarios locales,
  perfiles del usuario, ruta/version de DB, export/import y cierre de sesión. `/profile` redirige a
  `/saved` por compatibilidad.
- Los stores `historyStore.ts` y `subscriptionsStore.ts` son wrappers sobre `localDb.ts`; ya no
  escriben archivos paralelos. Historial y suscripciones quedan asociados al perfil activo.
- Migración: si no existe `worldtube-data.json`, `localDb.ts` intenta importar los archivos viejos
  `profiles.json`, `history.json`, `subscriptions.json` y `profiles/<id>/*.json` a un usuario local
  inicial.
- Renderer: `ProfileProvider` carga la sesión por IPC. `History`, `Subscriptions`, `Channel`,
  `Watch` y el sidebar reaccionan al `activeProfileId`.
- Evento renderer `worldtube:profile-data-changed`: tras suscribirse/desuscribirse o importar datos
  se refresca el sidebar del perfil activo.

## Qué funciona, confirmado con un video real

Pipeline completo de principal a fin, probado contra YouTube real (no mockeado):

1. Se genera un poToken real vía BotGuard (challenge + integrity token + minteo).
2. `getInfo()` de youtubei.js devuelve `playability = OK`.
3. Metadata completa y correcta: título, canal, thumbnail, duración.

## SABR: implementado y confirmado reproduciendo (2026-09-12)

Los videos que requieren SABR (la mayoría) ahora reproducen. Confirmado visualmente en la ventana
de Electron con un video real (`DtVBCG6ThDk`, "Elton John - Rocket Man"): el `<video>` llegó a
disparar su evento nativo `playing` con `shaka.Player.load()` resuelto sin errores.

Arquitectura (código propio; FreeTube solo se usó como referencia de protocolo, no se copió nada de
su código, tal como pide la sección de licencia más abajo):

- `src/main/sabrManifest.ts`: arma el payload SABR (`SabrManifestInfo` + `SabrStreamInfo`, ver
  `src/shared/ipc.ts`) desde la `VideoInfo` de youtubei.js — URL de `server_abr_streaming_url` ya
  descifrada, poToken, `video_playback_ustreamer_config`, y la lista de `adaptive_formats` con sus
  `init_range`/`index_range`.
- `src/renderer/src/player/sabr/`:
  - `mp4Sidx.ts` / `webmCues.ts`: parsers propios (from scratch, mirando las specs ISO-BMFF/EBML,
    no el código de FreeTube) para convertir el `indexRange` de un formato en segmentos
    reproducibles.
  - `manifestParser.ts`: `shaka.extern.ManifestParser` para un mime propio
    (`application/sabr+json`) que arma el `shaka.extern.Manifest` (variants/streams) a partir del
    JSON de `sabrManifest.ts`.
  - `playerAdapter.ts` + `index.ts`: conectan shaka con `SabrStreamingAdapter`/`SabrUmpProcessor` de
    la librería **`googlevideo`** (ya era dependencia del proyecto) — esa librería expone una clase
    pensada exactamente para esto ("Adapter class that handles YouTube SABR integration with media
    players (e.g., Shaka Player)") y ya implementa el protocolo UMP/SABR completo (parsing de
    partes, contexts, redirects, backoff, reload). Lo que hay que escribir por fuera es el
    "player adapter": el puente entre el scheme `sabr:` de shaka y esa librería (hacer el `fetch()`
    real, alimentar `SabrUmpProcessor`, traducir Request/Response).

Dos bugs no obvios que costó encontrar, por si vuelven a aparecer en otro contexto:

1. **`Platform.shim.eval` de youtubei.js tira siempre por defecto** ("you must provide your own
   JavaScript evaluator") — `player.decipher()` (necesario para el `server_abr_streaming_url` y
   para formatos legacy con firma) no funciona sin proveer un evaluador. Se agregó
   `src/main/jsEvaluator.ts`, que corre el script de deciphering de YouTube dentro de un contexto
   de Node `vm` aislado (no `new Function()`, que correría ese script de terceros con privilegios
   completos del proceso principal) y se registra una vez en `youtube.ts` vía
   `Platform.shim.eval = evaluatePlayerScript`.
2. **CORS**: el `fetch()` del renderer hacia `*.googlevideo.com` es bloqueado por el navegador
   (esos servidores no mandan `Access-Control-Allow-Origin` para un origen `http://localhost:5173`
   o el que tenga la app empaquetada). Se resuelve en `src/main/index.ts` inyectando
   `Referer`/`Origin: https://www.youtube.com` en el request y forzando
   `Access-Control-Allow-Origin: *` en la respuesta, scoped a `https://*.googlevideo.com/*` vía
   `session.webRequest` — mismo mecanismo que ya usa `poToken.ts` para su ventana oculta de
   BotGuard. Importante: si el servidor ya devuelve un `Access-Control-Allow-Origin` propio (lo
   hace, ecoa el `Origin` que mandamos), hay que reemplazarlo, no agregarlo — un header
   multi-valor (`"https://www.youtube.com, *"`) es inválido y el fetch se sigue bloqueando.

## Navegación y datos locales (agregado 2026-09-12, sesión posterior)

Sobre la base del player, se agregó la capa de "app de YouTube" propiamente dicha — todo código
propio, usando `youtubei.js` como cliente de datos, sin copiar nada de `freetube-audio-lab`:

- **Búsqueda** (`src/main/youtube.ts#searchVideos`, página `Search.tsx`): `yt.search(query, {
  type: 'video' })`, resultados mapeados con `mapVideoNodes` (ver abajo) y mostrados en grilla.
  Barra de búsqueda persistente en el header (`App.tsx`).
- **Historial local** (`src/main/historyStore.ts`, página `History.tsx`): archivo JSON propio en
  `app.getPath('userData')/history.json` (sin librería externa), se graba automáticamente al
  final de `fetchVideoInfo` (best-effort, no bloquea la reproducción si falla). Dedupe por
  `videoId`, cap de 300 entradas, orden por más reciente. Botón para borrar todo.
- **Canal** (`src/main/youtube.ts#getChannelInfo`, página `Channel.tsx`, ruta
  `/channel/:channelId`): `yt.getChannel(id).getVideos()`, muestra avatar, nombre, contador de
  subs (si el header lo expone) y grilla de videos del canal.
- **Suscripciones locales** (`src/main/subscriptionsStore.ts`, página `Subscriptions.tsx`): mismo
  patrón de store JSON que el historial (`subscriptions.json`). **No son suscripciones reales de
  una cuenta de YouTube** — no hay login. Es una lista local de canales guardados, el botón
  "Suscribirse" en `Channel.tsx` solo agrega/quita de ese archivo. Sirve para tener un acceso
  directo a canales, no para recibir notificaciones ni feed combinado (eso no existe todavía, ver
  "Qué falta").
- **Feed de inicio** (`src/main/youtube.ts#getHomeFeed`, en `Home.tsx` debajo del input de
  URL/ID): `yt.getHomeFeed()` sin sesión logueada, mismo mapeo de nodos.
- `mapVideoNodes` (`youtube.ts`): búsqueda, home y tabs de canal mapean los layouts comunes
  (`Video`, `GridVideo`; Watch agrega `CompactVideo`/`CompactMovie`). El feed de recomendados de
  Watch usa además `mapWatchNextFeed`, que replica el filtro de FreeTube Lab y acepta
  `LockupView` cuando `content_type` es `VIDEO` o `STATION`. Caveat: shelves de home/canal que
  vengan como `LockupView` fuera de Watch todavía pueden aparecer vacíos; ese soporte general
  queda pendiente.

## Captions (agregado 2026-09-12, misma sesión que Suscripciones/Historial)

Los subtítulos/CC ya andan, para **ambos** caminos de reproducción (SABR y DASH legacy) — no se
metió en `sabrManifest.ts`/shaka como se había anotado originalmente, terminó siendo más simple:

- `youtube.ts#extractCaptionTracks`: lee `info.captions.caption_tracks` (youtubei.js), arma la URL
  de cada pista agregando `&fmt=vtt` al `base_url` (por default YouTube devuelve XML timedtext; con
  ese parámetro devuelve WebVTT nativo). Va en `VideoInfoResult.captions`, no en el payload SABR —
  es información del video, no del streaming SABR en sí, así que aplica también al camino DASH.
- `GlobalPlayerHost.tsx`: un `<track kind="subtitles">` por pista, hijo directo del `<video>`.
  Los controles visuales ahora son de `shaka.ui.Overlay`; las pistas siguen siendo nativas del
  elemento de video, así que hay que verificar/ajustar la integración fina del botón CC de Shaka si
  se quiere paridad total.
- `main/index.ts`: el fetch de esas URLs (`www.youtube.com/api/timedtext`) pegaba con el mismo
  problema de CORS que ya tenía `*.googlevideo.com` — se agregó ese host a los mismos listeners de
  `webRequest` que ya inyectaban Referer/Origin y forzaban `Access-Control-Allow-Origin`.
- Los `<track>` se key-ean como `` `${videoId}:${languageCode}` `` en vez de solo el idioma — dos
  videos pueden compartir código de idioma ("en"), y un navegador no siempre recarga las cues de un
  `<track>` ya montado solo porque cambió su `src`; con esa key React fuerza un remount real al
  cambiar de video.
- Probado en la app real a nivel de carga/reproducción; la interacción fina del selector CC queda
  pendiente de revisión.

## Reload SABR: ahora restaura posición (agregado 2026-09-12, misma sesión)

`GlobalPlayerHost.tsx`: cuando el servidor ABR pide reload (`onReloadRequested`), antes de volver a
llamar a `playVideo(videoId)` se guarda `player.getMediaElement()?.currentTime` en
`pendingResumeRef`, junto con el `videoId` (para no aplicar el resume si el usuario navegó a otro
video mientras el reload estaba en curso). Cuando el nuevo manifest termina de cargar
(`player.load(...).then(...)`), si el pending sigue siendo para ese mismo `videoId` se setea
`element.currentTime` y se limpia el ref. Sigue perdiéndose tiempo real durante el reload (todo el
pipeline de `getVideoInfo` — poToken vía BotGuard incluido — se vuelve a correr), pero ya no se
pierde la posición de reproducción.

## Watch: layout y relacionados (agregado/actualizado 2026-09-12)

`Watch.tsx` ahora sigue la estructura visual base de FreeTube Lab: grilla con área de video,
área de info y sidebar (`watch-layout`, `watch-video-area`, `watch-info-area`,
`watch-sidebar-area`). En desktop la sidebar queda a la derecha; en tamaños chicos se apila debajo.

`info.watch_next_feed` viaja como `VideoInfoResult.relatedVideos` y se muestra como lista compacta
"A continuación". Importante: YouTube ya no devuelve siempre `CompactVideo`; en pruebas reales la
mayoría venía como `LockupView`. Se corrigió copiando el criterio de FreeTube Lab:
`CompactVideo`, `CompactMovie` y `LockupView` con `content_type === 'VIDEO' || 'STATION'`, filtrando
members-only.

## Watch fase 2: detalles, acciones y descripción (agregado 2026-09-12)

La tarjeta de Watch ya muestra metadatos más completos desde `VideoInfoResult`: vistas, fecha,
duración, categoría, likes disponibles, avatar del canal, contador de suscriptores si YouTube lo
expone, botón de suscripción local y botón para copiar enlace. La suscripción sigue siendo local
(`subscriptions.json`), igual que en `Channel.tsx`; no es login real de YouTube.

La descripción ya es expandible/colapsable y detecta timestamps (`mm:ss` / `hh:mm:ss`). Al tocar
un timestamp, `Watch.tsx` emite `PLAYER_SEEK_EVENT` (`src/renderer/src/player/events.ts`) y
`GlobalPlayerHost.tsx` mueve el único `<video>` persistente sin recrear Shaka.

## Controles del player: shaka.ui.Overlay (agregado 2026-09-12, sesión de "el player es lento/distinto")

Reemplazado el control bar hecho a mano (`PlayerControls.tsx`, ya borrado) por la **UI oficial de
shaka-player** (`shaka.ui.Overlay`, Apache-2.0, ya era nuestra dependencia) — la misma pieza que
usa `freetube-audio-lab` en `ft-shaka-video-player.vue` (`style src="shaka-player/dist/controls.css"`).
Cambios:

- Todos los archivos que tocan shaka (`GlobalPlayerHost.tsx`, `player/sabr/*.ts`) ahora importan
  de `shaka-player/dist/shaka-player.ui.js` (el build combinado core+ui), no del entry point
  `shaka-player` (core-only) — **tienen que ser el mismo import en todos lados**, dos copias
  separadas del namespace `shaka` en la misma página no se reconocen entre sí.
- `shaka.ui.Overlay` se crea una sola vez (mismo patrón que el `shaka.Player`: vive toda la vida
  de la app), en un efecto que espera a tener `<video>` + su contenedor.
- **Mini player**: el `<video>` y el Overlay son una instancia única que se portea entre Watch y
  el mini flotante. El fix que dejó controles usables fue replicar el orden de FreeTube Lab:
  `new shaka.Player()`, `new shaka.ui.Overlay(localPlayer, container, video)`,
  `ui.getControls().getPlayer()`, y recién después `attach(video)`. Además el portal usa un
  `portalMount` estable que se mueve con `appendChild`, para no remontar/destruir Shaka al pasar
  de Watch al mini.
- **Mini player drag/minimize**: el mini se arrastra desde su encabezado. Un arrastre hacia abajo
  mayor a `90px` lo minimiza a una barra inferior con controles; durante el gesto solo se ve la
  barra translúcida y el slot del video queda montado fuera de pantalla para no cortar audio ni
  recrear Shaka. La barra respeta el ancho del sidebar en desktop, tiene play/pausa y saltos por
  eventos (`PLAYER_COMMAND_EVENT`/`PLAYER_STATE_EVENT`), se restaura al lugar ideal con la flecha
  diagonal y también puede arrastrarse hacia arriba para volver a mini siguiendo el movimiento del
  mouse. El click sin arrastre en el título vuelve a `/watch/:videoId`.
- **Miniatura al hacer hover en la barra** (storyboard): `youtube.ts#buildStoryboardVtt` convierte
  `info.storyboards` (youtubei.js) al formato WebVTT de thumbnails (`url#xywh=x,y,w,h` por cue) y
  viaja en `VideoInfoResult.storyboardVtt`. `GlobalPlayerHost.tsx#loadThumbnailsTrack` lo pasa a
  `player.addThumbnailsTrack(dataUri)` después de cada `load()` — la UI de shaka muestra el
  preview solo con eso, no hace falta ninguna UI de scrubbing propia. Usa el último nivel de
  `storyboards.boards` (el más detallado).
- **Errores de carga ahora se ven**: antes un `player.load()` rechazado solo se logueaba a
  consola — la pantalla quedaba negra sin ningún aviso. Ahora hay un overlay con el error y botón
  "Reintentar" (mismo componente, estado `loadError`). También se mejoró el logging de errores de
  shaka (`describeError`): antes `console.error('...', error)` llegaba a la consola de la terminal
  como `[object Object]` (el relay de `console-message` en `main/index.ts` solo expone
  `details.message`, un string) — ahora se arma un string explícito con `code`/`category`/`severity`/`data`.
- **Resuelto**: el CSS de shaka ahora se sirve localmente y se le quitó la `@font-face` remota de
  Roboto. La CSP puede quedarse con `font-src 'self'`; las fuentes de la app viven dentro del repo.
- El botón de CC de shaka lee `player.getTextTracks()` (pistas declaradas en el manifest), pero
  nuestros subtítulos son `<track>` nativos del `<video>` (fuera del manifest, ver sección de
  Captions más arriba). Si se quiere paridad total de CC, hay que decidir entre mover captions al
  manifest de shaka o exponer un control propio solo para subtítulos.

## Qué falta

- **Chapters** siguen sin implementar (los storyboards de scrubbing ya están, ver arriba). A
  diferencia de captions, esto necesita integrar datos de capítulos con la UI/player, no es un
  simple `<track>`.
- No se probó formalmente seek, cambio de calidad manual, ni un video que **no** requiera SABR
  (para confirmar que el camino DASH viejo sigue andando sin romperse con los cambios de esta
  sesión).
- El poToken se genera una vez por video y se reutiliza para toda la sesión SABR de ese video; no
  hay refresco automático si una reproducción es muy larga.
- **Soporte general de `LockupView` fuera de Watch**: Watch recommendations ya lo soportan con el
  mismo filtro de FreeTube Lab; falta extender home/canales/shelves si aparecen vacíos.
- **Feed combinado de suscripciones**: hoy `Subscriptions.tsx` solo lista los canales guardados;
  no trae los videos recientes de esos canales a un feed único.
- La página Watch ya tiene layout, recomendados, detalles y descripción expandible. Faltan
  capítulos, comentarios, playlist, live chat/upcoming/premiere y preferencias para ocultar
  secciones.

## Cómo correr

```bash
corepack pnpm install   # ya corrido
corepack pnpm dev       # levanta Vite + Electron
corepack pnpm run typecheck
corepack pnpm run build
```

Para probar el pipeline de `fetchVideoInfo` sin tocar la UI, hay un hook de desarrollo activable
por variable de entorno (no hace nada si no está seteada):

```bash
WORLDTUBE_AUTOTEST_VIDEO_ID=<id-de-video> corepack pnpm dev
```

Dispara `fetchVideoInfo` una vez al arrancar y loguea el resultado (`[autotest] RESULT_OK/ERROR`)
en la misma consola. Los logs del renderer (React, errores de la UI) también se ven en esa misma
consola — se reenvían desde `console-message` del `webContents` en `src/main/index.ts`.

### Nota sobre el proceso de dev en background (visto 2026-09-12)

Si `pnpm dev` viene corriendo desde hace rato (por ejemplo, arrancado en una sesión de agente
anterior y dejado de fondo), **su build de `main`/`preload` puede haber quedado desactualizado**
sin ningún error visible: en esta sesión el watcher de `electron-vite` dejó de reconstruir
`main`/`preload` en algún momento después del arranque inicial — el renderer seguía haciendo HMR
normal (son watchers separados), pero `out/main/index.js` y `out/preload/index.js` quedaron
congelados en el primer build, con la consecuencia de que `window.api.*` en la ventana real seguía
siendo el de antes de los cambios, sin ningún IPC nuevo disponible. Se confirmó revisando:

- `stat` de `out/main/index.js` / `out/preload/index.js` vs. la fecha de los `.ts` fuente — el
  build era muy anterior a la última edición.
- `/proc/<pid_de_electron-vite>/fd` y su `fdinfo` — la instancia de `inotify` del watcher de
  main/preload tenía **0 watches registrados**, es decir, dejó de observar archivos.

Si algo tocado en `src/main/` o `src/preload/` no aparece en la app aunque el `typecheck` esté
limpio, **antes de asumir un bug** comparar esas fechas o simplemente reiniciar `pnpm dev` (Ctrl+C
y volver a correrlo) — un restart limpio reconstruye todo desde cero.

## Próximo paso sugerido

El trabajo grande (SABR reproduciendo) ya está, hay navegación básica y Watch quedó en fase 1
(layout + recomendados) más fase 2 (detalles + descripción). Lo que sigue:

1. Capítulos.
2. Comentarios, playlist/sidebar avanzada y live chat/upcoming.
3. Probar formalmente seek, cambio de calidad manual y un video sin SABR.
