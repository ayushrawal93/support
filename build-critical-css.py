#!/usr/bin/env python3
"""
Rebuilds the inlined critical CSS block in index.html from the source files
css/mini.css, css/style.css and css/submit.css.

Why this exists:
  index.html used to load mini.css, submit.css and style.css as 3 separate
  render-blocking <link rel="stylesheet"> requests. That was the main cause
  of the slow First Contentful Paint / Largest Contentful Paint scores in
  PageSpeed Insights (the browser has to fetch + parse all of them before
  it's allowed to paint anything).

  They are now minified and inlined directly into a single
  <style id="critical-css"> block in <head>, so the very first HTML response
  already contains everything needed to paint the page correctly styled -
  no extra round trips.

  Font Awesome (css/all.min.css) is intentionally NOT inlined - icons are
  not needed for first paint, so it is still loaded, but asynchronously
  (preload + onload swap, with a <noscript> fallback), so it never blocks
  rendering.

Usage:
  Whenever you edit css/mini.css, css/style.css or css/submit.css, run:
      python3 build-critical-css.py
  This regenerates the <style id="critical-css"> block in index.html in place.
  (It does NOT touch the form markup or dimensions - only the CSS block.)
"""
import re
import sys

SOURCE_FILES = ["css/mini.css", "css/style.css", "css/submit.css"]
INDEX_HTML = "index.html"


def minify_css(css: str) -> str:
    css = re.sub(r"/\*.*?\*/", "", css, flags=re.S)  # strip comments
    css = re.sub(r"\s+", " ", css)                    # collapse whitespace
    css = re.sub(r"\s*([{}:;,>])\s*", r"\1", css)      # trim around punctuation
    css = re.sub(r";}", "}", css)                      # drop trailing ;
    return css.strip()


def main():
    combined = []
    for path in SOURCE_FILES:
        with open(path, encoding="utf-8") as fh:
            raw = fh.read()
        combined.append(minify_css(raw))
    new_css = "".join(combined)

    with open(INDEX_HTML, encoding="utf-8") as fh:
        html = fh.read()

    pattern = re.compile(
        r'(<style id="critical-css">).*?(</style>)', flags=re.S
    )
    if not pattern.search(html):
        print("ERROR: could not find <style id=\"critical-css\"> block in "
              f"{INDEX_HTML}", file=sys.stderr)
        sys.exit(1)

    html = pattern.sub(lambda m: m.group(1) + new_css + m.group(2), html)

    with open(INDEX_HTML, "w", encoding="utf-8") as fh:
        fh.write(html)

    print(f"critical CSS rebuilt: {len(new_css)} bytes inlined into {INDEX_HTML}")
    print("Remember to also regenerate index.html.gz (and .br if you use it), e.g.:")
    print("  gzip -9 -k -f index.html")


if __name__ == "__main__":
    main()
