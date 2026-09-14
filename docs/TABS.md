# Pestanas internas

Implementacion inicial: 2026-09-13.
Actualizada al modelo de reproductores independientes en la misma sesion.

- Barra de pestanas dentro del area principal, sin cubrir la navegacion lateral.
- La barra permanece visible con posicion sticky a 60px, debajo de la cabecera.
  Conserva su espacio en el layout y el scroll horizontal para muchas pestanas.
  Menus de cabecera y busqueda movil se mantienen por encima de la barra.
- Nueva pestana, seleccion, cierre y reordenacion mediante arrastre.
- Ctrl/cmd+clic o clic central sobre enlaces internos abre en segundo plano.
  Con Shift, abre y selecciona la nueva pestana.
- Cada pestana tiene su propio historial; los botones volver/avanzar operan
  sobre la pestana seleccionada.
- Las paginas permanecen montadas al cambiar de pestana, conservando filtros,
  resultados y estado local. El scroll se restaura por pestana.
- Un reproductor Shaka y elemento video independientes por pestana con video.
  Las pestanas sin video no crean instancias multimedia.
- Abrir un Watch en segundo plano no reproduce hasta seleccionarlo por primera
  vez. En esa primera entrada inicia su video y pausa los otros reproductores.
- Cambiar entre pestanas ya abiertas conserva el play/pausa, posicion y
  reproductor de cada una, sin volver a cargar el video.
- Se permite reproducir manualmente varios videos simultaneamente.
- El mini compartido representa el reproductor de la pestana seleccionada
  cuando tiene video, o el ultimo seleccionado con video en otro caso.
- Pulsar el titulo del mini selecciona su pestana de origen y vuelve al Watch
  dentro de ella, nunca reemplaza la pagina de otra pestana.
- Slots, comandos, busqueda temporal y estados multimedia incluyen el ID de
  pestana para que un control no afecte accidentalmente a otros reproductores.
- Cada carga SABR tiene UUID propio en manifest y URIs de init/segmentos.
  El scheme global selecciona un adaptador por UUID; ya no existe un adaptador
  activo unico. Cerrar/recargar una sesion no desregistra las otras.
- Peticiones canceladas y callbacks de cargas reemplazadas no muestran un
  error fatal sobre otro video. Errores de red recuperables quedan en logs;
  errores reales conservan sus mensajes, incluso los no enumerables de Error.
- Los atajos globales controlan solamente el reproductor representado por la
  interfaz actual. Cada pestana reproduciendo tiene un indicador en la barra.
- Cerrar una pestana desmonta su reproductor y termina su reproduccion.

## Alcance pendiente

La lista de pestanas y las posiciones de esta sesion no se restauran al
reiniciar ni se incluyen en el paquete local. No hay cola independiente por
pestana. El audio sigue usando la preferencia
global persistente existente.

## Verificacion

Sin builds, typechecks ni pruebas automatizadas, por indicacion del usuario.
Cambios exclusivos del renderer, disponibles mediante HMR del servidor dev.
El usuario confirmo manualmente que el flujo corregido va muy bien. No se
certifican todas las carreras de carga ni variantes de reproduccion simultanea.
Posteriormente se encontro en logs `SabrAdapterError` severity 2 al alternar
pestanas: el transporte seguia usando un adaptador global unico. Se corrigio
su aislamiento por sesion; pendiente reproduccion manual del caso tras el cambio.

## Proximo trabajo visual

Paleta elegida y aplicada mediante variables CSS; el indicador usa el rol de
acento y la marca muestra tres globos y play dorado. Detalles en `docs/THEME.md`.
