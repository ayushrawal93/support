#!/usr/bin/env python3
"""
Rebuilds the chat composer block in index.html (its <style> and markup)
from css/chatbar.css. Run after editing css/chatbar.css:

    python3 build-chatbar.py

It also refreshes index.html.gz and js/chat-widget.js.gz, because the server
prefers the precompressed copies when they exist.
"""
import gzip, re, sys

INDEX = "index.html"
CSS = "css/chatbar.css"

MARKUP = '''<div id="ah-chatbar">
<div class="container">
<div class="ah-cb-wrap">
<form id="ah-cb-form" autocomplete="off">
<div class="ah-cb-files" id="ah-cb-files" role="list" aria-label="Attached files"></div>
<textarea id="ah-cb-input" rows="1" maxlength="2000" placeholder="Ask, write or message anything" aria-label="Write a message to our assistant"></textarea>
<div class="ah-cb-quick" id="ah-cb-quick"><div></div></div>
<div class="ah-cb-note" id="ah-cb-note" role="status" aria-live="polite"></div>
<div class="ah-cb-bar">
<div class="ah-cb-attachwrap">
<button type="button" class="ah-cb-attach" id="ah-cb-attach" aria-label="Attach files" title="Attach files" aria-haspopup="true" aria-expanded="false" aria-controls="ah-cb-menu"><svg class="ic i-plus" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg><svg class="ic i-clip" viewBox="0 0 24 24" aria-hidden="true"><path d="M21 11.5l-8.6 8.6a5.5 5.5 0 0 1-7.8-7.8l9-9a3.7 3.7 0 0 1 5.2 5.2l-9 9a1.8 1.8 0 0 1-2.6-2.6l8.4-8.4"/></svg></button>
<div class="ah-cb-menu" id="ah-cb-menu" hidden>
<button type="button" data-act="upload"><span class="mi"><svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 16V4M7 9l5-5 5 5M5 20h14"/></svg></span><span><b>Upload files</b><small>PDF, Word, text or images</small></span></button>
<button type="button" data-act="cam"><span class="mi"><svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8h3l1.6-2.4h6.8L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13" r="3.6"/></svg></span><span><b>Take a photo</b><small>Snap your question or brief</small></span></button>
</div>
</div>
<span class="ah-cb-sp"></span>
<button type="button" class="ah-cb-quota" id="ah-cb-quota" aria-label="Free questions left"></button>
<button type="button" class="ah-cb-ib" id="ah-cb-mic" aria-label="Dictate a message" title="Speak" hidden><svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg></button>
<button type="submit" id="ah-cb-send" aria-label="Send message" disabled><svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7"/></svg></button>
<button type="button" class="ah-cb-chev" id="ah-cb-chev" aria-label="Open message box" tabindex="-1"><svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg></button>
</div>
<div class="ah-cb-drop" aria-hidden="true"><svg class="ic" viewBox="0 0 24 24"><path d="M12 16V4M7 9l5-5 5 5M5 20h14"/></svg><b>Drop your files to attach</b><small>PDF, Word, text or photos, up to 5 files</small></div>
<input type="file" id="ah-cb-fileinput" multiple hidden>
<input type="file" id="ah-cb-caminput" accept="image/*" capture="environment" hidden>
</form>
<div id="ah-cb-panel">
<div id="ah-cb-head"><span>Assistant</span><div><button type="button" id="ah-cb-clear">New chat</button><button type="button" id="ah-cb-close" aria-label="Collapse conversation">Hide</button></div></div>
<div id="ah-cb-log" role="log" aria-live="polite"></div>
</div>
</div>
</div>
</div>
'''

def minify(css):
    css = re.sub(r"/\*.*?\*/", "", css, flags=re.S)
    css = re.sub(r"\s+", " ", css)
    css = re.sub(r"\s*([{}:;,>])\s*", r"\1", css)
    css = re.sub(r";}", "}", css)
    return css.strip()

html = open(INDEX, encoding="utf-8").read()
# Only the <style> is rebuilt. The single chat bar markup lives inside the hero in index.html.
pattern = re.compile(r"(<!-- Chat bar styles[^>]*-->\s*)<style>.*?</style>", re.S)
if not pattern.search(html):
    sys.exit("Could not find the chat bar style block in index.html")
css_min = minify(open(CSS, encoding="utf-8").read())
html = pattern.sub(lambda m: m.group(1) + "<style>" + css_min + "</style>", html, count=1)
html = re.sub(r"js/chat-widget\.js\?v=\w+", "js/chat-widget.js?v=20261001cw", html)
open(INDEX, "w", encoding="utf-8").write(html)

for src in (INDEX, "js/chat-widget.js"):
    with open(src, "rb") as f, gzip.open(src + ".gz", "wb", 9) as g:
        g.write(f.read())
print("chat bar rebuilt; .gz files refreshed")
