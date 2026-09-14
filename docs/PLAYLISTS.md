# Local Playlists

## Library View

The playlist gallery uses the first saved video's thumbnail as a cover, with
an item count, name, description and update date. Empty lists have an icon
placeholder. Search matches name/description; sorting supports update date,
name and video count. Creation is an inline form, not another nested card.

Opening a playlist shows its cover/details and numbered video rows. Videos
open in Watch; removing a row removes only that playlist membership, not
memberships in other playlists or the separate saved collection. Existing
local database/preload APIs are reused, with profile data change notifications.

## Watch Context

Local playlist links carry `?playlist=<id>`. Watch loads that active profile's
playlist and members and renders a bounded, scrollable playlist panel above
Up next. The current video is marked; selecting another member preserves the
playlist query. The panel heading returns to the playlist detail view.

Recommendations remain separate. Opening a recommendation or ordinary video
link without the query leaves playlist context. The panel does not automatically
advance on video end or change the player's next-video shortcut behavior.
Playlist rename/delete, reordering and a full autoplay queue are not added by
this UI work. YouTube channel playlists are separate from this local library.

No cloud login or database was introduced. Export/import continues to use the
existing local package, including saved playlists and video memberships.

## Verification and Provenance

Implementation follows WorldTube's existing React, router, profile and IPC
contracts. FreeTube application source was not used as a template for this
gallery or Watch panel. That statement does not certify the older repository's
entire provenance; see LICENSE_REVIEW.md for remaining review and asset notices.

No production build, typecheck or automated runtime tests were run. Development
startup was inspected and the owner reviewed ongoing UI changes; all responsive
and playlist/profile edge cases still need grouped manual validation.
