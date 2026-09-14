# Source and License Review

## Current Closure: 2026-09-14

The actionable technical review is complete: see
[Distribution Review](../.github/DISTRIBUTION_REVIEW.md). No additional concrete
copied application block was identified in the current reviewed integration
scope. The owner selected AGPL-3.0-only and explicitly requested publication.
LICENSE and COPYRIGHT.txt are now included with installers and corresponding
source archives. No blanket independent-authorship/legal certification is made.
The older status and remaining-work sections below preserve historical findings;
they do not reopen completed current font/notice/replacement work.

Status: technical comparison and four targeted replacements recorded on
2026-09-13; NOT cleared for distribution or independent authorship certification.
See [replacement details and sources](PROVENANCE_REPLACEMENTS.md).
WorldTube does not yet have a chosen project LICENSE. No project license was
assigned as part of packaging setup, and release CI is gated on approval.

## Concrete Asset and Notice Closure

Completed in the follow-up of 2026-09-13. The owner authorized replacing the
nine local font files whose bytes could not be matched to consulted upstream
versions. All nine are now unmodified official local copies of Inter/Inter Tight,
with source URLs and SHA-256 hashes in `third-party/sources.json`. This resolves
the CURRENT font files' origin; it does not authenticate removed historical files.

Full font OFL, Lucide ISC/MIT and Apache texts are saved in `third-party/` and
font/icon notices also sit beside source assets. The application logo's earth
geometry is explicitly attributed to Pictogrammers, including derived installers'
icons and monochrome buffering artwork. No SF files are included.

An installed dependency traversal recorded 36 runtime/bundled components in
`third-party/dependencies.json`, including transitive packages, bundled Shaka
and Electron. Full npm notices, omitted-file cases, the Protobuf BSD notice,
Go runtime notice and Electron/Chromium notices are prepared by an offline step.
See [Third-Party Notices](../THIRD_PARTY_NOTICES.md) for exact fallback handling.

`pnpm notices` prepares readable installed notices without compiling. Builder's
`beforePack` hook repeats preparation for direct invocations; `extraResources`
copies the results to installed `licenses/`. Hash changes, unreviewed added
fonts, missing required texts/packages and unsupported fallback versions fail
explicitly. Actual final installer contents still await package validation.

The concrete missing-font-origin and incomplete-notice tasks are CLOSED in the
current tree. A project license decision, final package validation and historical
authorship/redistribution questions are separate remaining surfaces; do not keep
reporting the completed asset work as a new generic review blocker.

## Scope and Method

Compared the current WorldTube working tree (base commit
`9ff9deddc2758703fe15e0f4d5892f359dc609df`) with the local FreeTube Lab
working tree (base commit `c038450ed429af3bc8f165aa82c58b2995ae4179`).
Commit IDs identify the bases, not a hash of uncommitted changes.

- Scanned `src` and `scripts` against reference `src`: exact token runs and
  runs with identifiers normalized, using a 24-token minimum.
- Inspected JavaScript/TypeScript regex AST nodes separately, including short
  expressions missed by the token cutoff.
- Compared SHA-256 digests of image, font and CSS assets under WorldTube
  `src` and `resources` against
  reference `src`, `static` and `_icons`.
- Read the flagged metadata, BotGuard, storyboard and MP4 parsing blocks;
  inspected relevant Git history and historical implementation notes.
- Inspected installed direct dependency package metadata, font family metadata
  and the official installed Shaka stylesheet.

Reproduce candidate detection with `node scripts/review-provenance.cjs`.
The tool only reads files and prints JSON. It is NOT a copyright detector.
Its token scanner does not fully parse regex/template contexts; Vue files are
lexically scanned, not structurally parsed. Normalization produces false
positives in imports and field mappings. Small or heavily modified adaptations
may escape detection. Transitive dependencies, all historical revisions,
generated bundles and final installer contents are not cleared by this scan.

## FreeTube Reference

The sibling FreeTube Lab repository was used as a behavioral and technical
reference. The sibling package declares `AGPL-3.0-or-later`; the upstream
[license](https://github.com/FreeTubeApp/FreeTube/blob/development/LICENSE)
contains the GNU Affero General Public License version 3.

Before replacement, inspection found concrete similarities. The list below
preserves historical evidence; the four targeted implementations have since
been replaced as documented in the linked report:

- `src/main/youtube.ts` contains four regular expressions named
  `VIEWS_OR_WATCHING_REGEX`, `VIEWS_IN_NUMBER_ONLY`, `PREMIERES_TIME_REGEX` and
  `PUBLISH_TIME_REGEX` with the same names and expressions as FreeTube Lab's
  `src/renderer/helpers/api/local.js` around lines 1759-1763.
- The associated `isViewCountText`, `isPremieresTimeText` and
  `isPublishTimeText` predicates have equivalent bodies, with TypeScript types
  and formatting differences, around FreeTube Lab lines 1768-1790.
- The duration expression `/^[\d:]+$/` also matches FreeTube Lab's
  `local.js:1866`. This short generic expression is not by itself evidence of
  copying, but belongs in the surrounding metadata review.
- `src/main/botguard/script.ts:62,68` uses the identical expressions for
  extracting `ytcfg.set(...)` and `window.ytAtN(...)` as reference
  `local.js:398,406`. Surrounding comments explicitly identify that reference.
  The broader page extraction flow must be included in remediation.
- `src/main/poToken.ts:67` shares an exact 46-token run with reference
  `src/main/poTokenGenerator.js:96`: the request-header callback and YouTube
  Referer/Origin/Sec-Fetch assignments. The session policies are not identical,
  but this is a concrete shared block requiring provenance resolution.
- `buildStoryboardVtt` shares the nested sprite-page/tile traversal, padded
  interval fallback and coordinate advancement with reference
  `src/renderer/helpers/utils.js:101-157`. WorldTube commit `f178602` changed
  the original per-thumbnail indexing to this structure. Timestamp formatting
  differs; the adaptation concern extends beyond the `#xywh` fragment.
- WorldTube's LockupView mapping, SABR initialization and Shaka UI lifecycle
  explicitly document FreeTube as a reference. `HANDOFF.md` also records
  copying its node-selection criterion. Behavioral reference does not alone
  establish copied expression, but these areas cannot be certified independent
  from a similarity scan. Include them in the replacement/provenance scope.

### Candidate Classification

The pre-replacement scan returned one exact token-run candidate, fifteen normalized
run candidates, seven shared regex literals and no byte-identical assets in
the stated scope. These counts describe candidates, not ownership findings.

The normalized candidates additionally include import lists, `Promise.all`
destructuring, null-initialized metadata fields, error serialization, client
info and media-format field maps. Manual inspection found common syntax/API
shapes rather than evidence sufficient to label those blocks copied. The MP4
candidate follows `sidx` binary field order; wire-format compatibility naturally
shares offsets, constants and field names. Do not rewrite protocol constants
or change behavior solely to suppress these matches.

These findings do not establish the legal status of the entire codebase, but
the earlier blanket claim that no FreeTube code was shared is not established.
Do not choose a permissive license on the assumption of complete independence.
Determine what was adapted, its provenance and applicable obligations before
distribution. Superficial renaming or deleting references is not a solution.

## Other Third-Party Material

- `player/styles/shaka-controls.css` includes Google Apache-2.0 and Felipe
  Fialho MIT notices. Preserve both notices.
- Local Lucide and Pictogrammers icons have notice files alongside the assets.
  Confirm that the complete required license texts accompany distributions.
- Inter and Inter Tight fonts are bundled locally. Initially, `fc-scan` family
  metadata did not authenticate their origin and no OFL files were present.
  The current files have been replaced with official copies and full notices,
  as described in the closure section above. Historical copies are not certified.
  Official notices: [Inter](https://github.com/rsms/inter/blob/master/LICENSE.txt)
  and [Inter Tight](https://github.com/google/fonts/blob/main/ofl/intertight/OFL.txt).
- `LICENSE-PICTOGRAMMERS.txt` describes licensing and links Apache-2.0. The
  complete Apache text is now included separately next to icons and in installed
  notices, with explicit SVG/application PNG/ICO/ICNS attribution.
  The application mark includes the same Pictogrammers earth path as the UI.
- Runtime and development dependencies have their own licenses. Packaging a
  dependency does not make it WorldTube-owned source.
- The SF option is a system fallback; no SF font files are included in the
  project font directory inspected in this session.
- The local Shaka stylesheet closely follows the installed official
  `shaka-player/dist/controls.css` with WorldTube customization (including the
  font variable). It is third-party Google/Shaka material, not WorldTube-owned
  CSS. A different file hash does not remove its attribution obligations.
- The original 21 installed direct dependency manifests report MIT or Apache-2.0.
  The two added parser packages, Acorn and acorn-walk, report MIT.
  No direct FreeTube package is declared. This does not clear transitive
  dependencies or the downloaded Electron binary's bundled components.

## Remaining Work

1. Validate the four targeted replacements and resolve the surrounding
   reference-derived integration provenance and historical distribution scope.
   The owner's requested direction is to remove FreeTube-derived application
   code, not merely rename it or select a license that conceals its origin.
2. Use documented requirements and independently licensed upstream APIs for
   replacement work; record sources. Rewriting after inspecting reference code
   is not automatically a clean-room implementation or legal clearance.
3. Preserve Git history and correct blanket authorship claims. Current files
   and already existing commits are separate distribution surfaces.
4. Font origins, asset texts and the installed transitive dependency inventory
   are complete for the current tree. Verify notice/resource inclusion in an
   actual installer in the grouped package validation pass.
5. Choose the project license with the repository owner only after resolving
   provenance. Do not assign a root LICENSE as part of this inspection.

Keep `DISTRIBUTION_APPROVED` unset. No production build, test suite, installer,
release or push was performed for this review. A guarantee of literally zero
coincidences is not possible: syntax, upstream libraries and public protocols
remain shared. The relevant goal is resolved provenance and no unresolved
FreeTube-derived application code. Targeted replacements do not establish
that broader goal or clear the existing history for distribution.
