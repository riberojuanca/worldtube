# WorldTube

Cliente local de escritorio para YouTube, desarrollado usando FreeTube Lab como referencia.
Las fuentes actuales tienen origen oficial local y los avisos de terceros están
completados; ver [THIRD_PARTY_NOTICES](THIRD_PARTY_NOTICES.md). La licencia general,
WorldTube usa AGPL-3.0-only. La revisión técnica concreta está cerrada en
[Distribution Review](.github/DISTRIBUTION_REVIEW.md); no constituye una certificación legal.

El [README principal en inglés](README.md) contiene el estado actual de empaquetado y
actualizaciones. Este documento conserva los detalles de desarrollo previos en español.

No afiliado a Google/YouTube. Nombre provisional.

## Instalación

Descargas: [WorldTube](https://riberojuanca.github.io/worldtube/) y
[GitHub Releases](https://github.com/riberojuanca/worldtube/releases).
Los botones se habilitan cuando exista un instalador publicado.
Los comandos de abajo son para ejecutar desde el código, no una instalación para
usuarios finales. Compilar con `pnpm build` tampoco genera un instalador.

Hoy se requiere una copia del código, Node.js compatible con las herramientas del
proyecto y pnpm instalado (o Corepack instalado para ejecutar pnpm). Ver [Desarrollo](#desarrollo).

Windows, macOS y Linux son objetivos de distribución, no plataformas certificadas
por esta sesión. Formatos propuestos y trabajo pendiente en
[docs/DISTRIBUTION.md](docs/DISTRIBUTION.md).

## Forma de trabajo

Los siguientes pasos conservan el flujo histórico previo; están reemplazados
por implementar desde los contratos de WorldTube y las APIs/documentación
oficiales, sin usar código de aplicación de FreeTube como plantilla:

1. Revisar el código original de FreeTube Lab.
2. Entender el patrón exacto y el orden de inicialización.
3. Replicar acá el comportamiento equivalente con el menor cambio necesario.
4. Revisar el cambio por código y, cuando hace falta, por logs del proceso de desarrollo.

Por pedido del usuario, no ejecutar builds, typechecks ni suites de pruebas durante las
iteraciones salvo que los solicite. Acumular cambios para una validación posterior. Reiniciar
Electron cuando cambien main/preload: el HMR del renderer no actualiza esas APIs por sí solo.

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
- Paleta de acentos centralizada en variables CSS: #1C4859, #196273 y #166973 para
  selección/controles; #BF8D30 para acciones importantes. Logo con tres mundos sólidos
  locales y un símbolo de play dorado. Roles y edición en [docs/THEME.md](docs/THEME.md).
- Usuarios/sesión local: usuario local con contraseña opcional, login/logout, perfil activo arriba a la derecha, edición de nombre/foto/color desde ese menú, panel Cuenta para datos locales y export/import completo.
- Shell Electron con navegación, header, sidebar y mini reproductor flotante arrastrable.
- Pestañas internas: crear, cerrar, reordenar, historial y scroll independientes. Ctrl/cmd+clic
  o clic central abre enlaces en segundo plano; con Shift selecciona la pestaña nueva.
- Un reproductor persistente por pestaña con video en `GlobalPlayerHost.tsx`; slots Watch,
  mini y Shorts identificados por pestaña. Las pestañas sin video no crean reproductores.
  La primera entrada a un video abierto en segundo plano inicia ese video y pausa los demás;
  después cada pestaña conserva su play/pausa sin recargar. Se permite play simultáneo manual.
- Mini compartido vinculado a su pestaña de origen: pulsar el título vuelve a esa pestaña,
  sin reemplazar el contenido de otra. Cerrar una pestaña detiene su reproductor.
  Detalles y límites en [docs/TABS.md](docs/TABS.md).
- Mini reproductor: se puede mover, arrastrar hacia abajo para minimizar a barra inferior con
  controles, restaurar con flecha diagonal o arrastrar la barra hacia arriba sin desmontar el
  `<video>`.
- Mini ampliado a 480px en desktop, con tamaño responsive, flecha de minimizar hacia abajo a
  la izquierda, timeline y volumen en la barra minimizada; cursores separados para controles y drag.
- Canales con banner y pestañas disponibles: Inicio, Videos, Shorts, Directos, Playlists,
  Podcasts, Lanzamientos, Cursos, Comunidad e Información; búsqueda interna y filtros del canal.
  Tres tandas automáticas por sección y después botón Cargar más. Playlists públicas navegables
  dentro del canal y playlist de subidas para canales musicales Topic sin pestaña Videos.
- Shorts en modal vertical del mismo ancho que el video, sin scroll del modal. Barra derecha:
  cerrar/conteo arriba, anterior/siguiente al centro, Guardar y agregar a playlists abajo.
  Deslizamiento vertical al usar las flechas y avance automático entre los Shorts cargados.
- Guardar y agregar a playlists son acciones separadas en miniaturas, relacionados, Watch y
  Shorts. Guardar agrega/quita en Guardados; el signo + permite elegir o crear playlists locales.
  Si el video ya está en alguna playlist, el + cambia por un tick y toma el acento de Guardar.
- Suscribirse queda junto al canal; al activarlo mantiene dorado y añade segmento azul verdoso
  con tick. Compartir queda al extremo derecho, solo icono; me gusta va entre las estadísticas.
- Scroll oscuro neutro, incluyendo barras internas de Shaka, sin cambiar ancho ni forma.
- Volumen y silencio globales persistidos en `settings.playerAudio`; prioridad al audio original
  en SABR/DASH. Volumen horizontal expandible, sin barra flotante, en controles compactos.
- Búsqueda general con historial por perfil y sugerencias remotas; fallback de miniaturas de
  video y avatares con iniciales cuando la imagen falla.
- Atajos globales Espacio/K para play-pausa en Watch, mini, barra minimizada y Shorts.
  Los comandos y estados llevan ID de pestaña; los atajos actúan sobre el reproductor
  representado en la interfaz, sin controlar todos los videos simultáneamente.
  Se respetan campos de texto y Espacio sobre botones seleccionados; una pulsación no dispara
  dos toggles aunque Shaka tenga sus propios listeners de teclado.
- Reproducción por teclado: J/L (10s), izquierda/derecha (5s), arriba/abajo (volumen 5%),
  M (silencio), F (fullscreen), C (subtítulos), 0–9 (porcentaje), Home/End (inicio/final),
  < y > (velocidad 0.25x–2x), coma/punto (fotogramas en pausa). Shift+N/P y teclas multimedia
  cambian entre Shorts cargados; Shift+N en Watch abre el primer recomendado. Anterior fuera
  de Shorts y capítulos no se implementan hasta tener una cola/capítulos reales.
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
- Los datos viven en una DB local versionada (`worldtube-data.json`): usuarios, sesión, perfiles,
  historial, historial de búsquedas, suscripciones, playlists locales, videos guardados y ajustes
  globales de audio. Todos viajan en export/import; los archivos viejos se migran al primer arranque.
- Captions como `<track>` WebVTT y storyboards como thumbnails de Shaka.

Pendiente para acercar más la página Watch a FreeTube:

- Capítulos.
- Comentarios.
- Playlist en sidebar.
- Live chat/upcoming/premiere/error states.
- Preferencias de ocultar secciones y modos avanzados.
- Validación acumulada de pestañas especiales, filtros, audio original y tamaños compactos.
- Restaurar pestañas y posiciones al reiniciar e incluirlas en el paquete local.
- Validación visual acumulada en otras pantallas y plataformas.
- Empaquetado, instaladores y publicación de releases; ver [distribución](docs/DISTRIBUTION.md).

El estado anterior describe lo implementado, no una certificación de cada variante de YouTube.
En la sesión del 2026-09-13 se confirmó arranque/reproducción por logs y hubo revisión manual del
usuario; no se ejecutaron builds de producción, typechecks ni suites automatizadas.
El usuario también confirmó manualmente el buen funcionamiento del flujo de pestañas y mini.

## Desarrollo

```bash
pnpm install --frozen-lockfile
pnpm dev
```

El renderer corre en `http://localhost:5173/` durante desarrollo. Si tocás `src/main/` o
`src/preload/` y la app no refleja el cambio, reiniciá `pnpm dev`; Electron/Vite a veces
deja el renderer con HMR activo pero el proceso principal con un build viejo.

`pnpm typecheck` y `pnpm build` son comandos disponibles para validación/compilación
cuando se soliciten; no son pasos que haya que ejecutar en cada cambio ni generan instaladores.
