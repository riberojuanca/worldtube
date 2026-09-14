# Home Discovery and Search

## Home

- Featured recommendation with double-column visual weight beside four videos.
- Related live broadcasts queried with YouTube.js `features: ['live']` and
  validated using the parsed Video `is_live` flag. Empty results are explicit.
- A full horizontal row of recommended channels, ranked by appearances in the
  recommendation feed. Already subscribed/recently watched creators are
  excluded from this discovery row; channel avatars/counts come from headers.
- Related sections per recent watched video, with the seed's actual category
  as context when supplied by YouTube. This is not a genre assertion for every
  recommended video. Each section retains the watched title as its basis.
- Repeated tiles across the featured area and related sections are removed.
- Anonymous YouTube home is preferred. If it is empty, recent local viewing
  supplies recommendation seeds; local subscriptions are the last fallback.
- Live queries use seed keywords when available, otherwise creator/title.
  No video streams are opened and no history entries are recorded by discovery.

This is a local recommendation assembly, not a new trained algorithm and not
YouTube account personalization. Failed channel/live enrichment does not
discard the primary video feed. Seed/live/discovery requests are bounded to
three seeds, eight discovery channel headers and two live queries per request.
Missing author names can require additional unique channel-header requests,
in batches of four, using the existing channel cache.

## Names and Image Quality

YouTube.js parsed thumbnail arrays are ordered largest first. Home/channel
mapping now uses the first entry instead of the smallest last entry. Video
images try higher-resolution variants and reject tiny unavailable-image
placeholders; portrait cards keep the provided Shorts image first.

Discovery uses the channel info `name` field, not a nonexistent `channelName`.
Missing author names are supplemented by channel headers when an ID exists.
Plain author labels also have a guarded metadata fallback; truly absent source
metadata is not invented. Previously stored local video names are not rewritten.

Discovery avatars request size 512 only for recognized HTTPS Google avatar
hosts with a size marker; unsupported URLs remain unchanged. Failed requests
fall back to the original URL, then initials. Original low-resolution artwork
cannot be made sharper merely by requesting a larger variant.

The row distributes complete visible slots across the available width, without
inter-item gaps. It retains horizontal native scrolling and shows previous/next
buttons only where there is more content. ResizeObserver recalculates slots and
overflow after window size changes; image dimensions have responsive limits.

## Hover Previews

Video tiles start an image preview after 500ms of mouse hover. Parsed animated
thumbnail overlays/MovingThumbnail images are used when present. Otherwise a
dedicated metadata-only IPC request obtains a storyboard sprite sheet; up to
24 frames near the middle of the video cycle every 400ms. This fallback is a
frame sequence, not full video playback. Missing/failed previews leave the
ordinary thumbnail unchanged. No stream, playback token or history entry is
created by the preview path.

Storyboard selection uses the largest per-frame pixel area. An initial 1.4x
enlargement guard was removed because it suppressed previews on the featured
tile. Available previews now display at the tile size; source resolution can
still limit sharpness, especially on the large tile. Missing/failed preview
artwork still leaves the static image. This is not an HD video stream.

Metadata requests are serialized, deduplicated per video and capped at eight
pending requests. Up to 64 results are cached for ten minutes (missing previews
for two minutes). Leaving hover/unmounting removes the preview, timers and image
handlers; an already started metadata request can finish and populate the cache.
Previews stop on tab changes, document visibility changes, window blur, resize
and clicks.
Touch, portrait cards and reduced-motion users retain static thumbnails.
Playlist covers and Shorts modal placeholders remain static as well.

The featured Home tile retains 16:9 instead of stretching/cropping to match the
adjacent two rows. Desktop allocates additional width to the featured tile and
less to the four smaller ones, accounting for uniform 80px metadata footers and
grid gaps. Other tiles keep their regular metadata layout; mobile keeps 16:9.

## Buffering Artwork

Shaka circular spinners, including its buffering play-button icon, use the
existing WorldTube icon without text in grayscale. CSS overrides hide only
the original buffering artwork; Shaka still controls buffering visibility.
A 2.6-second opacity pulse replaces rotation, with no scaling or flashing.
Reduced-motion preference disables the pulse. Upstream library files/notices
are not modified. Page skeletons and text loading states are unchanged.

Initial metadata/player loading hides Shaka controls and its own spinner,
showing a single WorldTube logo. Controls return after the manifest loads and
the autoplay attempt settles; a rejected autoplay attempt leaves Play available
instead of blocking the user. Ready state is associated with the video/manifest
source and late callbacks from a replaced load cannot reveal stale controls.

Sources: installed YouTube.js `AnimatedThumbnailOverlayView`, `MovingThumbnail`
and `PlayerStoryboardSpec` parser contracts; existing WorldTube IPC/tab APIs.
No FreeTube application source was used as a template for this implementation.
No production build, typecheck or automated tests were run.

## Search Results

Search is no longer restricted to videos. Mixed YouTube results include
channels, with a channel-filtered fallback request if the mixed page has none.
The result view offers All, Videos and Channels tabs over returned data.
Channels link to their channel page. These tabs do not promise exhaustive
pagination or every channel matching a query.

The existing success IPC shape retains `data` as video items and adds optional
`channels`/`home` metadata, keeping subscriptions and other video feeds compatible.

Sources: installed YouTube.js 18.0.0 Search, Feed, Channel and SearchFilters;
[channel API](https://ytjs.dev/api/youtubei.js/namespaces/YT/classes/Channel);
[YouTube recommendations](https://support.google.com/youtube/answer/16089387?hl=en).

No production build, typecheck or runtime suite was run. Development restart
and ordinary startup logs are the only runtime verification performed here;
visual layout and returned channel/live relevance still require manual review.
