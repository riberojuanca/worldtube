# Provenance Replacements

Implemented on 2026-09-13. Technical replacements are not a clean-room
authorship certification. Historical evidence remains in LICENSE_REVIEW.md.

## Lockup Metadata

Removed the four metadata regexes and their predicates. Author identity now
comes from YouTube.js Text endpoints/runs targeting channel browse IDs or
avatar labels, with the existing channel-scoped fallback. Names are not
primarily guessed from the first metadata string. Later author-name fixes add a
guarded plain-label fallback that excludes a small set of statistic tokens;
this does not restore the removed FreeTube regexes/predicates. Missing names
with a channel ID are supplemented by cached YouTube.js channel headers.

Publication labels use numeric amount, known time unit and the `ago` token.
This remains a textual fallback on English source metadata, not an absolute
timestamp or an all-language parser. UI language does not change that input.
Duration badges are validated as clock components, without the shared regex.

Sources: installed YouTube.js 18.0.0 `Text.d.ts`, `TextRun.d.ts`,
`ContentMetadataView.d.ts`, `LockupMetadataView.d.ts`;
[LockupView API](https://ytjs.dev/api/youtubei.js/namespaces/YTNodes/classes/LockupView).

## BotGuard Page Data

`src/main/botguard/pageData.ts` parses HTML into an inert DOM and relevant
inline JavaScript into an Acorn AST, traversed with acorn-walk. Configuration
and attestation call arguments are decoded as data, not executed. Multiple
configuration calls are merged. Literals, arrays, objects and signed numbers
are supported; executable expressions, methods, spreads and computed object
keys are rejected. The two shared extraction regexes and loose-JSON conversion
were removed. Nested braces, escapes, comments and trailing commas are handled
by the parser. Unsupported/missing required data fails explicitly; no regex or
page-evaluation fallback exists. The BgUtils interpreter still must execute.

Sources: [Acorn/acorn-walk](https://github.com/acornjs/acorn), both MIT;
[DOMParser](https://developer.mozilla.org/en-US/docs/Web/API/DOMParser/parseFromString);
[BgUtils public API/research](https://github.com/LuanRT/BgUtils).
Acorn 8.18.0 and acorn-walk 8.3.5 were installed with lifecycle scripts disabled.

## Native BotGuard Network

Removed the outgoing-header and response-CORS webRequest callbacks.
`src/main/botguardNetwork.ts` uses native Electron `session.fetch` through a
dedicated method in `resources/botguard-preload.cjs`, not renderer fetch.

- Only registered BotGuard windows' main frames can invoke the handler.
- HTTPS targets, paths, methods and headers are allowlisted: YouTube home,
  att/get, GenerateIT and Google `/js/` interpreters.
- Stored credentials are omitted; redirects to unchecked destinations fail.
  Request-specific YouTube POST Origin/Referer remain protocol inputs.
  Sec-Fetch and response CORS headers are not rewritten.
- Requests have timeout/payload limits; window destruction aborts requests.
- The hidden window enables sandbox/context isolation and disables Node.
  Permissions, new windows and renderer navigation are denied. The static
  preload is included in extraResources. The added restrictive CSP was removed
  after the first manual attempt returned no integrity token: it could interfere
  with interpreter checks. The previous YouTube document base URL is retained;
  it does not establish a YouTube security origin for the data document.

Sources: [Electron session.fetch](https://github.com/electron/electron/blob/main/docs/api/session.md),
[context isolation](https://www.electronjs.org/docs/latest/tutorial/context-isolation).
This is an architectural replacement, not a renamed callback. New interpreter
hosts, redirects or changed attestation requirements need an explicit update.

## Storyboard Track

Absolute thumbnail indexing replaces nested sprite-page/tile traversal and
incremental coordinates/timestamps. Only actual thumbnails produce cues,
times do not accumulate rounding drift, and cues are clipped to video duration.
Missing interval uses duration divided by actual thumbnail count, not padded
sprite capacity. Invalid dimensions/interval data are rejected.

Shaka's existing `addThumbnailsTrack` API consumes WebVTT. Public `#xywh`
syntax and YouTube's `$M` marker remain protocol data.
Sources: installed YouTube.js `PlayerStoryboardSpec.d.ts`/`StoryboardData`;
[Shaka API](https://shaka-project.github.io/shaka-player/docs/api/shaka.Player.html);
[W3C media fragments](https://www.w3.org/TR/media-frags/).

## Verification and Remaining Work

Read-only candidate scan after changes: zero exact runs at the 24-token cutoff,
zero shared regex literals in AST scope, fourteen normalized candidates and
zero identical assets. Remaining candidates are common imports/API maps,
standard binary parsing and Electron permission-denial calls. Not legal clearance.

No build, typecheck, automated runtime test, release or push was performed.
The owner reported successful ordinary playback and tab switching after a dev
restart and the BotGuard CSP correction. This does not cover token reuse,
MP4/WebM variants, storyboard accuracy or the packaged preload path.
Main changes were loaded with development restarts; no production build ran
during dependency installation. The read-only comparison was repeated before
the session commit, returning the same zero/zero/fourteen/zero candidate counts.

New home discovery, playlist presentation and responsive channel-row code use
WorldTube's contracts and upstream parsed models, not FreeTube application
source as a template. Current scan results do not certify all historical code.

Broader integration provenance, historical commits, font origins, complete
asset notices, transitive dependencies and installer notice inclusion remain
open. Keep `DISTRIBUTION_APPROVED` unset; do not choose the root license from
scan counts alone.
