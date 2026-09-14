# Tema y marca

La paleta se define en `src/renderer/src/index.css`, dentro de `:root`:

| Variable | Valor | Uso |
| --- | --- | --- |
| `--wt-palette-1` | `#1C4859` | Seleccion de navegacion y pestanas |
| `--wt-palette-2` | `#196273` | Hover de seleccion y acciones |
| `--wt-palette-3` | `#166973` | Acciones habituales y progreso multimedia |
| `--wt-palette-4` | `#BF8D30` | Acciones importantes |

Cambiar estas cuatro variables actualiza sus usos y los tonos derivados, sin
editar cada componente. Los fondos oscuros y los colores de error/eliminacion
se mantienen separados de la paleta de acentos, al igual que colores de
perfil elegidos por el usuario.

## Roles

- `wt-selected`: seleccion con fondo del primer color y hover del segundo.
- `wt-action`: boton habitual, tercer color con texto claro.
- `wt-action-important`: boton dorado con texto oscuro; Suscribirse, acceso
  local y exportacion del paquete. El hover deriva del dorado.
- `SubscribeButton`: al suscribirse mantiene el texto sobre fondo dorado y
  agrega a la derecha un segmento de acento azul verdoso con tick. Watch y
  canal comparten el componente; todo el boton sigue alternando suscripcion.
- `wt-accent-text`, `wt-link`, `wt-tab-selected`: indicadores, enlaces y
  secciones activas, con tono mas claro derivado para lectura en fondo oscuro.
- `--wt-track`, `--wt-buffered`: fondos de barras multimedia. Shaka recibe
  referencias CSS a los mismos roles que usan las barras de la app.
- Los radios siguen usando `--wt-radius: 3px`.

## Acciones y estadisticas de Watch

- Suscribirse se ubica junto al avatar, nombre y suscriptores del canal.
- Guardar/Playlists quedan a la derecha; Compartir es solo un icono al extremo
  derecho. Copia el enlace y muestra un tick temporal como confirmacion.
- Playlists muestra tick en vez de + y el mismo acento activo que Guardar
  cuando el video pertenece a alguna playlist. Sigue abriendo el selector;
  al quitarlo de todas las playlists vuelve al +. El estado se carga sin
  abrir el selector y se actualiza ante cambios de biblioteca/perfil.
- El componente compartido aplica estos estados tambien en miniaturas y Shorts.
- Los me gusta aparecen junto a visualizaciones, fecha y duracion, no entre
  las acciones: son una estadistica, no un boton interactivo.

## Scroll oscuro

`color-scheme: dark` activa controles nativos oscuros. Las barras internas
reciben `--wt-scroll-thumb: #525252` y `--wt-scroll-track: #171717`, para
anular tambien el blanco de los estilos propios de Shaka. Sin cambios de
ancho, forma o redondeo del scroll; no usa los colores de la paleta.

## Logo

`BrandMark.tsx` muestra tres copias cercanas del icono Earth solido de Material Design,
una por tono azul verdoso, y un simbolo de play dorado con radio global.
Los mundos se solapan en 13px y el play mide 24x16px. El play forma parte
de la marca enlazada a Inicio, no es un control del reproductor.
La mascara CSS usa el SVG local `assets/icons/world-solid.svg`; no depende de CDN ni de un paquete
de iconos adicional. Licencia Pictogrammers/Apache 2.0 conservada junto al recurso.

Fuente: https://github.com/Templarian/MaterialDesign/blob/master/svg/earth.svg

## Verificacion

Sin builds, typechecks ni pruebas automatizadas, por indicacion del usuario.
Cambios de renderer disponibles mediante HMR para revision visual conjunta.
Hubo revision manual iterativa del usuario, incluyendo confirmacion final
del scroll oscuro. No se certifican todas las pantallas ni casos multimedia.
