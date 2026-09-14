# Distribution Research

Current packaging and updater implementation: [UPDATES.md](UPDATES.md).
The Spanish research below predates that implementation and is retained as
history. No installers or update cycle have been validated yet.

## Previous Research

Revision: 2026-09-13. Propuesta, no instaladores implementados.

## Estado de WorldTube

- `package.json` tiene dev, build, preview y typecheck. No tiene electron-builder,
  Electron Forge ni comandos para generar instaladores.
- `electron-vite build` compila la app a `out/`; no produce por si solo un
  instalador para usuarios.
- No hay workflows de GitHub Actions ni remoto Git configurado en esta copia.
  No se verifico una publicacion externa de releases.
- No hay licencia general del proyecto definida en un archivo raiz. Los
  iconos locales conservan sus avisos de terceros.
- El uso desde codigo requiere herramientas de desarrollo; no es el flujo
  deseado para usuarios finales.

## Referencia FreeTube

Su [README](https://github.com/FreeTubeApp/FreeTube/blob/development/README.md)
presenta la app, capturas, funciones y enlaces a descargas/documentacion;
distingue releases oficiales de builds experimentales.

Su [pagina de descargas](https://freetubeapp.io/#download) organiza archivos
por sistema y arquitectura: instaladores y portables Windows, DMG para Mac,
DEB/RPM/AppImage y otras opciones Linux. Flatpak se ofrece mediante Flathub.

Su [configuracion de electron-builder](https://github.com/FreeTubeApp/FreeTube/blob/development/_scripts/ebuilder.config.mjs)
define identidad, iconos, archivos incluidos y targets. El
[workflow](https://github.com/FreeTubeApp/FreeTube/blob/development/.github/workflows/build.yml)
ejecuta builds en runners Linux, Windows y macOS, con variantes x64 y ARM.

No copiar la configuracion completa: FreeTube empaqueta dependencias con
webpack y excluye node_modules. WorldTube usa externalizeDepsPlugin para
main/preload; hay que incluir las dependencias runtime necesarias.

## Propuesta inicial para WorldTube

| Plataforma | Archivos propuestos | Arquitecturas propuestas |
| --- | --- | --- |
| Linux | AppImage y DEB; RPM despues | x64; ARM64 despues de validacion |
| Windows | Instalador EXE y portable | x64; ARM64 despues de validacion |
| macOS | DMG y ZIP | Apple Silicon y Intel |

Esta tabla no declara soporte ya probado ni archivos disponibles.

1. Elegir nombre definitivo, appId estable, licencia y formatos iniciales.
2. Configurar electron-builder, iconos del sistema y inclusion de recursos,
   dependencias runtime y avisos de licencia. No incluir datos del desarrollador.
3. Separar compilacion de empaquetado con comandos explicitos por plataforma.
4. Preparar CI por plataforma y publicar archivos versionados en GitHub Releases.
   Para empezar, activacion manual o por tag, no builds en cada cambio visual.
5. Validar instalacion, reproduccion, almacenamiento local y export/import en
   cada plataforma antes de declararla soportada.
6. Evaluar firma Windows y firma/notarizacion macOS. No prometer instalaciones
   sin advertencias mientras no se haya preparado y validado esa parte.

Electron-vite documenta [distribucion con builder o Forge](https://electron-vite.org/guide/distribution).
Electron documenta [firma y notarizacion](https://www.electronjs.org/docs/latest/tutorial/code-signing).

## Instalador y paquete de datos son cosas diferentes

El instalador contiene la aplicacion. El paquete local exportado desde Cuenta
contiene datos y ajustes migrables. Un futuro portable no garantiza por si
solo que los datos se almacenen al lado del ejecutable; ese modo de datos
portables tambien requiere una decision e implementacion explicitas.

Las pestanas abiertas y posiciones de reproduccion de la sesion siguen fuera
del export/import. No publicar datos personales, sesiones o bibliotecas en
los archivos de instalacion.

## README publico propuesto

Descripcion breve y captura real; estado del proyecto; Descargas con tabla
por plataforma; inicio rapido; datos locales y migracion; atajos/documentacion;
desarrollo; como reportar errores; licencia y creditos. Los acuerdos internos
de trabajo y el historial tecnico deben vivir en HANDOFF/documentacion, no
ocupar el comienzo de la pagina dirigida a usuarios.

## Trabajo realizado en esta revision

Lectura del codigo/configuracion local y fuentes oficiales. Sin instalar
herramientas de empaquetado, ejecutar builds, crear workflows ni publicar releases.
# Implementation Update

The earlier research below is retained as history. Packaging configuration,
GitHub draft-release CI and an in-app updater are now implemented, but have not
been built or validated. Current setup is in [UPDATES.md](UPDATES.md).
Project licensing and distribution approval remain pending.
