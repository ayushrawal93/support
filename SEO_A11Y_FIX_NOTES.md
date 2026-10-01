# SEO / Performance / Accessibility fix — round 2 (Sep 26, 2026)

## Why this round exists
The `index.html` in this upload had reverted to the old render-blocking
`<link rel="stylesheet">` setup from before the first fix — the inline
critical-CSS from `PERFORMANCE_FIX_NOTES.md` wasn't present, even though
that file and `build-critical-css.py` were still in the repo. Somewhere
between commits, `index.html` and `css/style.css` got overwritten back to
pre-fix versions. This round re-applies the CSS fix **and** fixes the two
underlying bugs directly in `css/style.css` (the actual source file this
time, not just the generated inline block), so re-running
`build-critical-css.py` in future won't reintroduce them.

## 1. SEO — missing meta description (the actual score blocker)
`index.html` had `og:description` and `twitter:description`, but no plain
`<meta name="description">` tag. That tag is what Lighthouse's SEO audit
checks for directly, and it's what Google typically prefers for the SERP
snippet. Added:
```html
<meta name="description" content="Get expert assignment help online for essays, research papers, dissertations, and homework - reliable academic support delivered before your deadline."/>
```
Everything else Lighthouse's SEO category checks was already in good shape:
single `<h1>`, sensible heading order, `rel="canonical"`, valid
`robots.txt`/`sitemap.xml`, `lang="en"`, viewport tag, and the one real
`<img>` (the logo) already has `alt` text.

**Note on canonical/og/sitemap pointing to `assignmenthelp.site`** while the
live URL you gave me is `c2.up.railway.app`: I left this alone since it's
applied *consistently* everywhere (canonical, og:url, twitter, sitemap.xml,
robots.txt) — that only makes sense if `assignmenthelp.site` is the intended
final production domain and Railway is just where it's currently hosted/
tested. If that's not the case and `c2.up.railway.app` actually is the
permanent public URL, say so and I'll switch all five references to it —
leaving it mismatched either way is the one thing that can actively hurt
indexing.

## 2. Accessibility — "Let's Talk" contrast failure
Root cause: the CSS rule was `.ctdark h4{color:#fff}`, but the markup uses
`<h3>Let's Talk</h3>` — the selector never matched. That heading fell back
to the site-wide `h1,h2,h3,h4,h5{color:var(--dark)}` rule, i.e. near-black
text (`#1a1a1a`) on the near-black `.ctdark` card background (`#1a1a1a`) —
functionally invisible. Fixed the selector to `.ctdark h3`.

## 3. Best Practices — touch targets too small (topbar social icons)
`.tsoc` (the Facebook/Instagram/TikTok/YouTube icons in the top bar) had
**no CSS rule at all** — it was rendering at whatever the icon font's
natural glyph size was, with no padding or spacing, which is exactly what
PSI flagged. Added:
```css
.tsoc{display:flex;gap:8px}
.tsoc a{width:32px;height:32px;display:flex;align-items:center;justify-content:center;border-radius:8px;background:rgba(255,255,255,.12)}
```
matching the sizing pattern already used correctly for the footer/contact
social icons (`.fsoc a`, `.ctsocrow a`).

## 4. Performance — re-applied the inline-critical-CSS fix
Same fix as before (see `PERFORMANCE_FIX_NOTES.md`): `mini.css` + `style.css`
+ `submit.css` are minified and inlined into a single
`<style id="critical-css">` block in `<head>`; `all.min.css` (Font Awesome)
loads asynchronously via preload+swap. This removes 3 of the 4
render-blocking CSS requests from the critical path.

## Files changed this round
- `css/style.css` — fixed the two CSS bugs above, at the source.
- `index.html` — added meta description, re-inlined critical CSS, async
  Font Awesome.
- `index.html.gz` — regenerated to match.

## To keep these fixes from disappearing again
Whatever tool/workflow overwrote `index.html` and `css/style.css` back to
an older version between your last two commits is worth tracking down —
otherwise this is going to keep happening. If you're editing through a
website builder or a second local copy, make sure it's pulling the latest
commit before you save over it, and re-run:
```
python3 build-critical-css.py
gzip -9 -k -f index.html
```
any time you hand-edit `css/mini.css`, `css/style.css` or `css/submit.css`.
