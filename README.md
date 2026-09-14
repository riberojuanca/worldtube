# WorldTube

A local-first YouTube desktop client with independent tabs, persistent players
and a movable mini player. Not affiliated with Google or YouTube.

[Spanish development notes](README.es.md)

## Demo

Watch the short [WorldTube demo on YouTube](https://youtu.be/ccULEv3KD28).

## Installation

Download installers from the [WorldTube download page](https://riberojuanca.github.io/worldtube/)
or [GitHub Releases](https://github.com/riberojuanca/worldtube/releases).
Downloads become available only after a release is successfully published.

Initial public release: [v0.0.3](https://github.com/riberojuanca/worldtube/releases/tag/v0.0.3),
with Windows x64 and Linux x64 installers plus corresponding source.

The release configuration prepares Windows NSIS x64 and Linux AppImage/DEB x64.
macOS DMG/ZIP ARM64 is opt-in and requires signing credentials. See
[Packaging and Updates](docs/UPDATES.md) for setup and outstanding work.

Windows: download the x64 `.exe` and follow the installer.
Linux: download the x64 `.AppImage`, make it executable (`chmod +x WorldTube-*.AppImage`),
then run it. Debian/Ubuntu users can instead install the `.deb` from Releases.
AppImage may require FUSE 2; `--appimage-extract-and-run` is an alternative on
systems without it. Windows packages are initially unsigned; verify the source
and download location. macOS downloads remain unavailable until signed builds exist.

## Features

- Local users with optional passwords, local sessions and editable profiles.
- Separate saved videos and playlists, subscriptions, history and search history.
- Full local data export/import, including global volume and application settings.
- Independent tabs with per-tab navigation and persistent playback sessions.
- Draggable mini player that minimizes into a bottom playback bar and restores
  without recreating its video element.
- Channel sections, available filters, public playlists and channel search.
- Three automatic continuation loads followed by a Load more button.
- Vertical Shorts dialog with animated navigation and automatic progression
  through loaded Shorts.
- Search suggestions and recent searches per profile.
- English interface by default, with Spanish selectable in Account > Application.
- Centralized theme variables, local fonts and consistent 3px corner radii.

The updater is integrated for packaged builds: optional startup checks, explicit
downloads and confirmed installation from published GitHub releases. The complete
installation/update cycle is not validated yet.

YouTube is queried directly using the local extraction method. An Invidious
fallback is not implemented or configured in WorldTube yet. External YouTube
changes can require a compatibility update.

## Playback Shortcuts

Space/K toggle playback; J/L seek 10 seconds; Left/Right seek 5 seconds;
Up/Down adjust volume; M toggles mute; F toggles fullscreen; C toggles captions.
Digits seek by percentage; Home/End seek to the beginning/end; < and > adjust
speed; comma/period step frames while paused.

Shift+N/P navigate loaded Shorts. Shift+N in Watch opens the first recommendation.
Shortcuts respect text fields and act on the player represented in the interface.

## Local Data

`worldtube-data.json` is stored in Electron's user-data directory. Account exposes
its path, data totals and full-data export/import. Profiles and library contents
are not uploaded to a WorldTube server or GitHub.

Exports include local users, password hashes, the active session, profile photos,
subscriptions, playlists, saved videos, history, search history and settings.
Treat exported files as private. They do not include video downloads, temporary
playback tokens, build files or open tabs.

## Development

Use Node.js compatible with the project tools and Corepack/pnpm. The release
workflow uses Node.js 24 and the pnpm version pinned in `package.json`.

```sh
pnpm install --frozen-lockfile
pnpm dev
```

`pnpm build` compiles the app only. `pnpm package` creates local installers.
`pnpm release` packages and uploads a draft release; use it only intentionally.
The version-tag workflow publishes after all enabled packaging jobs succeed,
including a matching corresponding-source archive. Failed jobs leave a draft.
Ordinary commits do not trigger release builds.

During collaborative iterations, builds, typechecks and automated test suites
are run only when requested. Main/preload changes require restarting Electron;
renderer HMR alone cannot update the desktop APIs.

Stack: Electron, electron-vite, React, TypeScript, Tailwind, youtubei.js,
bgutils-js, googlevideo, Shaka Player, electron-builder and electron-updater.

## Documentation

- [Languages](docs/I18N.md)
- [Packaging and Updates](docs/UPDATES.md)
- [Source and License Review](docs/LICENSE_REVIEW.md)
- [Tabs](docs/TABS.md)
- [Theme](docs/THEME.md)
- [Earlier Distribution Research](docs/DISTRIBUTION.md)
- [Development Handoff](HANDOFF.md)

Earlier technical documents contain Spanish development history.

## License

WorldTube's own code is licensed under [AGPL-3.0-only](LICENSE).
Copyright (c) 2026 Juanca Ribero. Third-party notices and official local font
origins are recorded in [Third-Party Notices](THIRD_PARTY_NOTICES.md).
The actionable technical review is closed in
[Distribution Review](.github/DISTRIBUTION_REVIEW.md); historical findings remain
recorded in [Source Review](docs/LICENSE_REVIEW.md).
