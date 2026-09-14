# Release Closure

## Current Delivery: 2026-09-14

- Owner selected AGPL-3.0-only and requested publication. The actionable
  technical source review is closed in .github/DISTRIBUTION_REVIEW.md;
  historical notes below are retained, not active generic blockers.
- The Pages download site uses the canonical logo, black background and
  Windows/Linux/macOS buttons driven by actual latest-release assets.
- Explicit release tags build Windows/Linux; successful enabled jobs publish
  the release with a corresponding-source archive. No approval variable is
  needed after this recorded owner decision.
- Final installer generation/inspection and remote CI results are recorded
  separately below as they complete. macOS is unavailable without signing.

WorldTube remains a local desktop application. Production readiness here means
an installable, versioned desktop release with safe local-data handling and an
update path, not cloud authentication or a hosted application backend.

## Already Implemented

- Electron Builder configuration, icons and resource inclusion.
- GitHub draft-release workflow and explicit-consent updater.
- Stable desktop identity and existing user-data directory.
- Local accounts/profiles/library export and import.
- English default and optional Spanish preferences.

Implementation is not evidence that installers or the complete updater cycle
work. No installer or production build has been validated in this session.

## Before Distribution

1. Resolve remaining integration/historical provenance questions in
   LICENSE_REVIEW.md. Current token comparison cannot certify authorship.
2. DONE for current source files: official local fonts, full font/icon/style
   notices and installed runtime/transitive inventory. Preparation and Builder
   resource inclusion are configured. Verify the final installer contents in
   step 4; see THIRD_PARTY_NOTICES.md for the concrete receipt.
3. Choose the project license with the owner after resolving provenance.
   No default license should be silently assigned.
4. With the owner's approval for a grouped validation pass, compile/package
   once and verify required runtime modules, native assets and BotGuard resources.
5. Validate fresh installation, launch/playback, rapid tab changes, initial
   loading, previews, audio persistence and local profile/library isolation.
6. Validate export/import and upgrade without losing users, profiles, saved
   videos, playlists, subscriptions or settings. Preserve backups for migration.
7. Test the installed updater against intended release assets, including failure,
   cancellation and restart paths. Development-mode behavior does not cover this.
8. Verify each advertised platform. Linux/Windows jobs are configured; macOS is
   opt-in and requires signing/notarization credentials. Do not claim platforms
   or architectures that have only configuration, not installation validation.
9. Finalize version, release notes and README download links to real assets.
   Obtain publication approval before pushing a release tag or publishing assets.

License choice and signing credentials need owner input. Technical notice,
resource and dependency work can proceed independently; repeated builds during
UI edits are not required. Release validation should be grouped after fixes,
consistent with the owner's request to avoid frequent builds/checks.

Keep `DISTRIBUTION_APPROVED` unset until provenance/license work is resolved.
Do not hide unresolved issues by changing scan thresholds or deleting history.

## Optional Feature Work

Comments, chapters, playlist autoplay/reordering and tab-session restoration
are separate feature decisions. They are not all prerequisites for an initial
release, provided the documented scope accurately reflects actual behavior.

References: [packaging and updater setup](UPDATES.md),
[source review](LICENSE_REVIEW.md), [local playlists](PLAYLISTS.md),
[preview limits](HOME_DISCOVERY.md).
