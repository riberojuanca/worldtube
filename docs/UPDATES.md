# Packaging and Updates

## Current Implementation

- GitHub repository: https://github.com/riberojuanca/worldtube
- `electron-builder` creates installers and update metadata.
- `electron-updater` reads published GitHub Releases from packaged applications.
- Startup checks can be disabled in Account > Application.
- Downloads require an explicit click; automatic installation on quit is disabled.
- Installation requires confirmation and restarts the application.
- Development instances never download or install updates.
- Errors in checking/downloading are reported without stopping video playback.
- Local users, profiles and library data are not sent to GitHub.
- The app name remains `worldtube` to preserve its existing user-data directory.
- Linux desktop identity is `com.riberojuanca.worldtube` in packages and
  `com.riberojuanca.worldtube.dev` during development. `pnpm desktop:install`
  registers a per-user development launcher for GNOME/Wayland dock association.
  It references this checkout and its icon; register it again if the checkout
  or Node executable moves. It does not install the application or pin the dock.
- The BotGuard helper is bundled at packaging time and included as a resource.
- The desktop icon reuses the three worlds and gold play mark. Source and PNG,
  ICO, ICNS and Linux sizes live in `resources/`; `pnpm icons` regenerates them
  with electron-builder's icon conversion tool, without building the app.

The updater does not restore open tabs after restarting. Tab persistence remains a
separate feature. An update also cannot repair an unknown YouTube change unless
the release contains a correction.

## Release Workflow

`.github/workflows/release.yml` runs manually or when a `v*` tag is pushed. It
does not run on ordinary commits. It creates a draft release, packages Windows
NSIS x64 and Linux AppImage/DEB x64, and uploads installers and update metadata.

Before it can run:

1. Complete the source/provenance review in `docs/LICENSE_REVIEW.md`.
2. Choose and add the project LICENSE; preserve third-party notices.
3. Set the GitHub repository variable `DISTRIBUTION_APPROVED=true`.
4. Update `package.json` to the intended version and push the corresponding tag.

The tag must match `package.json`. Published versions cannot be overwritten by
the workflow; increment the version for a correction. Inspect the draft assets,
installation behavior and notes before publishing it in GitHub Releases.
Draft releases are not offered to installed applications.

Publishing needs only the workflow's GitHub token. Never embed a personal GitHub
token in the application. This configuration assumes publicly readable release
assets; private repositories require a different distribution decision.

## macOS

The macOS ARM64 job is opt-in with `ENABLE_MAC_RELEASE=true`. It requires
`MAC_CSC_LINK`, `MAC_CSC_KEY_PASSWORD`, `APPLE_ID`,
`APPLE_APP_SPECIFIC_PASSWORD` and `APPLE_TEAM_ID` secrets. It produces DMG and
ZIP files. Signing is required for macOS auto-updates; no credentials are
included in the repository. Intel macOS and additional architectures are not
configured yet. Windows signing is also pending before broad distribution.

## Local Commands

`pnpm build` still only compiles the application.

`pnpm package` compiles and creates installers without uploading them.

`pnpm release` compiles, packages and uploads a draft using the configured
GitHub provider. Run it only intentionally with appropriate publishing access.

None of these production commands were executed during this implementation. Installers,
platform behavior, CI and the complete update cycle have not been validated yet.

## References

- https://www.electron.build/v26/docs/features/auto-update/
- https://www.electronjs.org/docs/latest/tutorial/updates
