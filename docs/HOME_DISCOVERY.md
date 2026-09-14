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

## Search

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
