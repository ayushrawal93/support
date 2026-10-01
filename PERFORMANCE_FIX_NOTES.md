# Performance fix — Sep 25, 2026

## What PageSpeed was actually measuring
Mobile PSI showed **FCP 6.3s / LCP 6.9s** with a score of 61. The page had
**4 separate render-blocking `<link rel="stylesheet">` requests** in `<head>`
(`mini.css`, `submit.css`, `all.min.css`, `style.css`). Chrome will not paint
*anything* until every synchronous stylesheet in `<head>` has been fetched
and parsed — so on a throttled mobile connection, the LCP element (the hero
`<h1>` text) sat blank for seconds waiting on CSS that had nothing to do
with it.

## What changed
1. **Inlined the critical CSS.** `mini.css` + `style.css` + `submit.css` are
   now minified and embedded directly in `<head>` as a single
   `<style id="critical-css">` block. This removes 3 of the 4 render-blocking
   network requests entirely — the very first HTML response already contains
   everything needed to paint the page fully styled, including the exact
   dimensions/padding/border-radius of the assignment form (untouched, byte
   for byte, just minified — **no visual or dimension changes**).
2. **Font Awesome (`all.min.css`) now loads asynchronously** using the same
   preload+swap pattern already used for Google Fonts
   (`rel="preload" as="style" onload="this.rel='stylesheet'"`, with a
   `<noscript>` fallback). Icons aren't needed for first paint, so they no
   longer block it — they simply pop in a beat after the text.
3. **Fixed two pre-existing CSS bugs** found while minifying (unrelated to
   performance, but worth noting): an orphaned `*/` in the original
   `style.css` was accidentally swallowing the `section{padding:88px 0}`
   rule into an invalid selector, and a stray `text-transform:uppercase;`
   was sitting outside any rule instead of inside `.ttag{}`. Both are now
   applied correctly.
4. Regenerated `index.html.gz` to match.

## Net effect on the critical render path
| | Before | After |
|---|---|---|
| Requests before first paint | 5 (html + 4 css) | 1 (html, CSS inlined) |
| Blocking bytes (gzip) | ~22.7 KB across 5 requests | ~17.2 KB in 1 request |
| Font Awesome | render-blocking | async, non-blocking |

Fewer round trips matters more than raw bytes on mobile: each blocking
request pays a full RTT (Lighthouse's mobile profile simulates ~150ms RTT +
1.6 Mbps down), so 5 serial/parallel-but-still-blocking requests were
costing multiple seconds before the round trip time is even accounted for.

## Files you should re-check / re-deploy
- `index.html` (and `index.html.gz`) — rebuilt.
- `css/mini.css`, `css/style.css`, `css/submit.css` are **kept on disk** as
  the source of truth for future edits — they are no longer linked from
  `index.html` directly, they're compiled into it.
- `css/all.min.css` is still a real file, now loaded async.

## If you edit the CSS again
Don't hand-edit the `<style id="critical-css">` block in `index.html`.
Edit `css/mini.css` / `css/style.css` / `css/submit.css` as before, then run:
```
python3 build-critical-css.py
gzip -9 -k -f index.html
```
This regenerates the inlined block and the gzip file automatically.

## Honest expectation-setting on "<1s"
This fix removes the actual bottleneck the PSI report was flagging
(render-blocking CSS chain) and should produce a large, measurable drop in
both FCP and LCP. Whether the *live* PageSpeed run lands under 1.0s also
depends on things outside this HTML/CSS: your hosting TTFB, whether a CDN
sits in front of Railway/wherever this is deployed, and real-world mobile
network conditions PSI simulates (slow 4G). Re-run PSI against the deployed
version once it's live and we can iterate further (e.g. real font
subsetting for Font Awesome, trimming unused CSS rules) if it's still short
of target.
