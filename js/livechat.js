/* Human live chat widget. Every reply comes from a real person (agent console: /agent.html). No AI.
 *
 * Optional config, set before this script loads:
 *   window.AH_LIVECHAT = { whatsapp: "14155550100", text: "Hi, I need assignment help",
 *                          brand: "Assignment Help", autoOpenDelay: 3000,      // ms, -1 = never auto-open
 *                          chips: ["Get a free quote", "Essay help", "Coding help", "Online class help"] };
 */
(function () {
  "use strict";
  var CFG = window.AH_LIVECHAT || {};
  var API = "/api/livechat", KEY = "ah_livechat", DISMISS = "ah_livechat_min";
  var WA = String(CFG.whatsapp || "").replace(/\D/g, "");
  var BRAND = CFG.brand || "Assignment Help";
  var DELAY = CFG.autoOpenDelay == null ? 3000 : CFG.autoOpenDelay;
  var CHIPS = CFG.chips || ["Get a free quote", "Essay help", "Coding help", "Online class help"];
  var S = null, es = null, open = false, unread = 0, busy = false;
  try { S = JSON.parse(sessionStorage.getItem(KEY) || "null"); } catch (e) {}

  /* ------------------------------------------------ styles ------------------------------------------------ */
  var css = [
    "#lc-dock,#lc-box{--lc1:#8b5cf6;--lc2:#4f46e5;--lc3:#2563eb;--lc-g:linear-gradient(135deg,#8b5cf6 0%,#4f46e5 55%,#2563eb 100%)}",
    "#lc-dock{position:fixed;right:20px;bottom:20px;z-index:99990;display:flex;flex-direction:column;align-items:center;gap:14px;font-family:Poppins,Arial,sans-serif}",
    "#lc-wa,#lc-btn{position:relative;display:flex;align-items:center;justify-content:center;width:56px;height:56px;border:0;border-radius:50%;cursor:pointer;text-decoration:none;transition:transform .2s,box-shadow .2s;-webkit-tap-highlight-color:transparent}",
    "#lc-wa:hover,#lc-btn:hover{transform:translateY(-3px) scale(1.06)}",
    "#lc-wa{background:#25d366;box-shadow:0 10px 24px rgba(37,211,102,.45)}",
    "#lc-btn{background:var(--lc-g);box-shadow:0 10px 24px rgba(79,70,229,.5)}",
    "#lc-btn::before{content:\"\";position:absolute;inset:0;border-radius:50%;border:2px solid #4f46e5;animation:lcring 2.4s ease-out infinite;pointer-events:none}",
    "#lc-dock.open #lc-btn::before,#lc-dock.seen #lc-btn::before{animation:none;opacity:0}",
    "@keyframes lcring{0%{transform:scale(1);opacity:.7}100%{transform:scale(1.7);opacity:0}}",
    "#lc-wa svg{width:30px;height:30px;fill:#fff}#lc-btn svg{width:30px;height:30px}",
    "#lc-btn .ic-x{display:none}#lc-dock.open #lc-btn .ic-hs{display:none}#lc-dock.open #lc-btn .ic-x{display:block}",
    "#lc-btn .dot{position:absolute;top:-4px;right:-4px;min-width:20px;height:20px;padding:0 5px;border-radius:10px;background:#ef4444;color:#fff;font:700 11px/20px Arial;text-align:center;border:2px solid #fff;box-sizing:content-box;animation:lcpop .3s}",
    "@keyframes lcpop{from{transform:scale(0)}to{transform:scale(1)}}",
    "#lc-tease{position:absolute;right:68px;bottom:6px;display:none;align-items:center;gap:8px;background:#fff;color:#1f2937;font:500 13px Poppins,Arial,sans-serif;padding:10px 12px 10px 14px;border-radius:14px 14px 4px 14px;box-shadow:0 10px 30px rgba(0,0,0,.18);white-space:nowrap;cursor:pointer;animation:lcin .3s ease-out}",
    "#lc-tease.on{display:flex}#lc-tease button{border:0;background:none;color:#94a3b8;font-size:16px;line-height:1;cursor:pointer;padding:0 2px}",
    "#lc-box{position:fixed;right:20px;bottom:162px;z-index:99991;display:none;flex-direction:column;width:min(340px,calc(100vw - 24px));height:min(470px,calc(100vh - 182px));min-height:300px;background:#f5f6fd;border-radius:20px;box-shadow:0 20px 60px rgba(30,20,10,.3);overflow:hidden;font:14px/1.5 Poppins,Arial,sans-serif;color:#1f2937;transform-origin:bottom right}",
    "#lc-box.on{display:flex;animation:lcin .25s cubic-bezier(.2,.9,.3,1.1)}@keyframes lcin{from{opacity:0;transform:translateY(16px) scale(.96)}to{opacity:1;transform:none}}",
    "#lc-box *{box-sizing:border-box;font-family:inherit}",
    ".lc-h{display:flex;align-items:center;gap:10px;padding:12px 12px 12px 14px;background:var(--lc-g);color:#fff;flex:none}",
    ".lc-logo{position:relative;flex:none;width:38px;height:38px;border-radius:50%;background:#fff;display:flex;align-items:center;justify-content:center}.lc-logo img{width:28px;height:auto;display:block}",
    ".lc-logo::after{content:\"\";position:absolute;right:-1px;bottom:-1px;width:11px;height:11px;border-radius:50%;background:#22c55e;border:2px solid #7c5cf0}",
    ".lc-bt{flex:1;min-width:0;line-height:1.25}.lc-bt b{display:block;font-size:14.5px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.lc-bt small{display:block;font-size:11.5px;opacity:.92;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
    ".lc-hb{flex:none;width:30px;height:30px;border:0;background:rgba(255,255,255,.2);color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;border-radius:50%;transition:background .15s}.lc-hb:hover{background:rgba(255,255,255,.35)}.lc-hb svg{width:16px;height:16px;stroke:#fff;stroke-width:2.6;stroke-linecap:round;fill:none}",
    ".lc-log{flex:1;overflow-y:auto;padding:14px 12px 8px;display:flex;flex-direction:column;gap:9px;scroll-behavior:smooth}",
    ".lc-r{display:flex;align-items:flex-end;gap:8px;animation:lcmsg .25s ease-out}.lc-r.v{justify-content:flex-end}@keyframes lcmsg{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}",
    ".lc-av{flex:none;width:26px;height:26px;border-radius:50%;background:var(--lc-g);color:#fff;font-weight:600;font-size:12px;display:flex;align-items:center;justify-content:center}",
    ".lc-m{max-width:80%;padding:9px 13px;white-space:pre-wrap;overflow-wrap:anywhere;font-size:13.5px;line-height:1.45}",
    ".lc-r.a .lc-m{background:#fff;color:#1f2937;border-radius:16px 16px 16px 4px;box-shadow:0 1px 3px rgba(15,23,42,.08)}",
    ".lc-r.v .lc-m{background:var(--lc-g);color:#fff;border-radius:16px 16px 4px 16px}",
    ".lc-m a{color:#2563eb;text-decoration:none}.lc-m a:hover{text-decoration:underline}.lc-r.v .lc-m a{color:#fff;text-decoration:underline}",
    ".lc-m small{display:block;font-size:10px;opacity:.6;margin-top:3px}.lc-r.v .lc-m small{text-align:right}",
    ".lc-sys,.lc-hint{align-self:center;color:#64748b;font-size:11.5px;text-align:center;padding:2px 8px;animation:lcmsg .25s}",
    ".lc-hint{display:flex;align-items:center;gap:6px}.lc-hint i{display:inline-block;width:5px;height:5px;border-radius:50%;background:#4f46e5;animation:lcblink 1.2s infinite}.lc-hint i:nth-child(2){animation-delay:.2s}.lc-hint i:nth-child(3){animation-delay:.4s}@keyframes lcblink{0%,80%,100%{opacity:.25}40%{opacity:1}}",
    ".lc-sys button{border:0;background:none;color:#4f46e5;font-weight:600;cursor:pointer;text-decoration:underline;font-size:11.5px}",
    ".lc-chips{display:flex;flex-wrap:wrap;gap:7px;padding:2px 0 2px 34px}",
    ".lc-chip{border:1.5px solid #ddd6fe;background:#fff;color:#5b21b6;font:500 12.5px Poppins,Arial,sans-serif;padding:6px 12px;border-radius:999px;cursor:pointer;text-decoration:none;transition:all .15s}.lc-chip:hover{background:#4f46e5;border-color:#4f46e5;color:#fff;transform:translateY(-1px)}",
    ".lc-chip.wa{border-color:#b7ebcb;color:#15803d}.lc-chip.wa:hover{background:#25d366;border-color:#25d366;color:#fff}",
    ".lc-f{flex:none;display:flex;align-items:flex-end;gap:8px;padding:10px 10px 10px 12px;background:#fff;border-top:1px solid #eceef3}",
    ".lc-f textarea{flex:1;min-width:0;resize:none;border:1.5px solid #e5e7ee;outline:0;background:#f5f6fd;font:14px/1.4 Poppins,Arial,sans-serif;padding:9px 14px;border-radius:18px;max-height:84px;height:38px;color:#1f2937;transition:border-color .15s,background .15s}.lc-f textarea:focus{border-color:#a78bfa;background:#fff}.lc-f textarea::placeholder{color:#9aa3b2}",
    ".lc-send{flex:none;width:38px;height:38px;border:0;border-radius:50%;background:var(--lc-g);cursor:pointer;display:flex;align-items:center;justify-content:center;transition:transform .15s,opacity .15s;box-shadow:0 4px 12px rgba(79,70,229,.4)}.lc-send:hover{transform:scale(1.08)}.lc-send:active{transform:scale(.94)}.lc-send:disabled{opacity:.5;cursor:default;transform:none}.lc-send svg{width:18px;height:18px;fill:#fff;margin-left:2px}",
    "#btt{right:auto!important;left:20px!important}",
    "@media(max-width:480px){#lc-dock{right:12px;bottom:12px;gap:12px}#lc-wa,#lc-btn{width:50px;height:50px}#lc-box{right:6px;bottom:136px;width:calc(100vw - 12px);height:calc(100vh - 156px)}#lc-tease{right:60px}}",
    "@media(prefers-reduced-motion:reduce){#lc-box *,#lc-btn::before,#lc-tease{animation:none!important}}"
  ].join("");
  var st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);

  /* ------------------------------------------------ helpers ------------------------------------------------ */
  function el(t, c, txt) { var e = document.createElement(t); if (c) e.className = c; if (txt != null) e.textContent = txt; return e; }
  function save() { try { sessionStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }
  function clearSession() { S = null; try { sessionStorage.removeItem(KEY); } catch (e) {} if (es) { es.close(); es = null; } }
  function hhmm(d) { try { return new Date(d || Date.now()).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); } catch (e) { return ""; } }
  function post(path, body) {
    return fetch(API + path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().catch(function () { return { success: false, message: "Something went wrong." }; }); })
      .then(function (j) { if (!j.success) throw new Error(j.message || "Something went wrong."); return j; }, function () { throw new Error("Connection problem. Please try again."); });
  }
  function linkify(node, text) {
    var re = /(https?:\/\/[^\s<]+)/g, last = 0, m;
    while ((m = re.exec(text))) {
      if (m.index > last) node.appendChild(document.createTextNode(text.slice(last, m.index)));
      var a = el("a", "", m[0]); a.href = m[0]; a.target = "_blank"; a.rel = "noopener noreferrer"; node.appendChild(a);
      last = m.index + m[0].length;
    }
    if (last < text.length) node.appendChild(document.createTextNode(text.slice(last)));
  }

  /* ------------------------------------------------ launcher buttons ------------------------------------------------ */
  var dock = el("div"); dock.id = "lc-dock";
  var wa = el("a"); wa.id = "lc-wa"; wa.target = "_blank"; wa.rel = "noopener";
  wa.href = "https://wa.me/" + WA + "?text=" + encodeURIComponent(CFG.text || "Hi, I need assignment help");
  wa.setAttribute("aria-label", "Chat with us on WhatsApp"); wa.title = "Chat on WhatsApp";
  wa.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/></svg>';
  var btn = el("button"); btn.id = "lc-btn"; btn.type = "button";
  btn.setAttribute("aria-label", "Open live chat"); btn.setAttribute("aria-expanded", "false");
  btn.innerHTML = '<svg class="ic-hs" viewBox="0 0 32 32" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 17v-2a10 10 0 0 1 20 0v2"/><rect x="3.5" y="16" width="4.5" height="7" rx="2"/><rect x="24" y="16" width="4.5" height="7" rx="2"/><path d="M26 23v1.5a3 3 0 0 1-3 3h-4"/><rect x="11" y="10.5" width="10" height="8" rx="2"/><path d="M14 18.5v3l3.2-3"/></svg>' +
    '<svg class="ic-x" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>';
  var tease = el("div"); tease.id = "lc-tease";
  var teaseTxt = el("span", "", "\uD83D\uDC4B Need help? Chat with an expert");
  var teaseX = el("button", "", "\u00D7"); teaseX.type = "button"; teaseX.setAttribute("aria-label", "Dismiss");
  tease.appendChild(teaseTxt); tease.appendChild(teaseX);
  dock.appendChild(tease); dock.appendChild(wa); dock.appendChild(btn);

  /* ------------------------------------------------ chat window ------------------------------------------------ */
  var box = el("div"); box.id = "lc-box"; box.setAttribute("role", "dialog"); box.setAttribute("aria-label", "Live chat");

  var head = el("div", "lc-h");
  var logo = el("span", "lc-logo"), img = el("img"); img.src = "img/logo.webp"; img.alt = ""; img.onerror = function () { logo.textContent = BRAND.charAt(0); }; logo.appendChild(img);
  var bt = el("div", "lc-bt"), bname = el("b", "", BRAND), bsub = el("small", "", "Online \u00B7 replies in a few minutes"); bt.appendChild(bname); bt.appendChild(bsub);
  var minB = el("button", "lc-hb"); minB.type = "button"; minB.setAttribute("aria-label", "Minimise chat"); minB.innerHTML = '<svg viewBox="0 0 24 24"><path d="M6 12h12"/></svg>';
  var xB = el("button", "lc-hb"); xB.type = "button"; xB.setAttribute("aria-label", "End chat"); xB.title = "End chat"; xB.innerHTML = '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>';
  [logo, bt, minB, xB].forEach(function (n) { head.appendChild(n); });

  var log = el("div", "lc-log"); log.setAttribute("role", "log"); log.setAttribute("aria-live", "polite");

  var foot = el("div", "lc-f"), input = el("textarea"), send = el("button", "lc-send");
  input.rows = 1; input.placeholder = "Type your message\u2026"; input.maxLength = 1000; input.setAttribute("aria-label", "Type your message");
  send.type = "button"; send.setAttribute("aria-label", "Send message"); send.title = "Send (Enter)";
  send.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.3 3.2a1 1 0 0 1 1.1-.2l18 8.4a1 1 0 0 1 0 1.8l-18 8.4a1 1 0 0 1-1.4-1.1L3.9 13l8.6-1-8.6-1L2 4.3a1 1 0 0 1 .3-1.1z"/></svg>';
  foot.appendChild(input); foot.appendChild(send);

  box.appendChild(head); box.appendChild(log); box.appendChild(foot);
  document.body.appendChild(dock); document.body.appendChild(box);

  /* ------------------------------------------------ rendering ------------------------------------------------ */
  function hasVisitorMsg() { return ((S && S.msgs) || []).some(function (m) { return m.sender === "visitor"; }); }
  function hasAgentMsg() { return ((S && S.msgs) || []).some(function (m) { return m.sender === "agent"; }); }

  function welcome() {
    var r = el("div", "lc-r a"), av = el("span", "lc-av", BRAND.charAt(0)), m = el("div", "lc-m");
    m.appendChild(document.createTextNode("Hi there! \uD83D\uDC4B Need a hand with an assignment, essay, coding task or online class?\nTell us what you need and an expert will reply right here."));
    r.appendChild(av); r.appendChild(m); return r;
  }
  function chipsRow() {
    var row = el("div", "lc-chips"); row.id = "lc-chips";
    CHIPS.forEach(function (t) {
      var c = el("button", "lc-chip", t); c.type = "button";
      c.onclick = function () { doSend(t); };
      row.appendChild(c);
    });
    var w = el("a", "lc-chip wa", "Chat on WhatsApp"); w.href = wa.href; w.target = "_blank"; w.rel = "noopener"; row.appendChild(w);
    return row;
  }
  function bubble(m) {
    if (m.sender === "system") return el("div", "lc-sys", m.body);
    var v = m.sender === "visitor", r = el("div", "lc-r " + (v ? "v" : "a")), b = el("div", "lc-m");
    linkify(b, m.body);
    var meta = (v ? "" : (m.sender_name ? m.sender_name + " \u00B7 " : "")) + hhmm(m.created_at);
    b.appendChild(el("small", "", meta));
    if (!v) r.appendChild(el("span", "lc-av", (m.sender_name || BRAND).charAt(0).toUpperCase()));
    r.appendChild(b); return r;
  }
  function scroll() { log.scrollTop = log.scrollHeight; }
  function hint() {
    var old = log.querySelector(".lc-hint"); if (old) old.remove();
    if (S && !S.closed && hasVisitorMsg() && !hasAgentMsg()) {
      var h = el("div", "lc-hint"); h.appendChild(el("i")); h.appendChild(el("i")); h.appendChild(el("i"));
      h.appendChild(document.createTextNode(" Sent \u2713 An expert will reply shortly")); log.appendChild(h); scroll();
    }
  }
  function renderLog() {
    log.innerHTML = ""; log.appendChild(welcome());
    if (!hasVisitorMsg()) log.appendChild(chipsRow());
    ((S && S.msgs) || []).forEach(function (m) { log.appendChild(bubble(m)); });
    if (S && S.closed) {
      var d = el("div", "lc-sys", "This chat has ended. "), n = el("button", "", "Start a new chat"); n.type = "button";
      n.onclick = function () { clearSession(); renderLog(); updateSub(); input.focus(); };
      d.appendChild(n); log.appendChild(d);
    }
    hint(); scroll();
  }
  function updateSub() { bsub.textContent = S && S.agent && !S.closed ? S.agent + " is with you" : "Online \u00B7 replies in a few minutes"; }
  function badge() { var d = btn.querySelector(".dot"); if (d) d.remove(); if (unread) btn.appendChild(el("span", "dot", unread > 9 ? "9+" : unread)); }

  function addLive(m) {
    S.msgs = S.msgs || [];
    if (S.msgs.some(function (x) { return x.id === m.id; })) return;
    S.msgs.push(m); if (S.msgs.length > 300) S.msgs.shift(); save();
    var ch = document.getElementById("lc-chips"); if (ch) ch.remove();
    log.appendChild(bubble(m)); hint(); scroll();
    if (m.sender === "agent" && !open) { unread++; badge(); }
  }

  /* ------------------------------------------------ open / close ------------------------------------------------ */
  function hideTease() { tease.classList.remove("on"); }
  function openBox() {
    open = true; box.classList.add("on"); dock.classList.add("open"); btn.setAttribute("aria-expanded", "true"); btn.setAttribute("aria-label", "Minimise live chat");
    hideTease(); unread = 0; badge(); renderLog(); setTimeout(function () { input.focus(); }, 80);
    window.dispatchEvent(new CustomEvent("ah-livechat-open"));
  }
  function minimise(silent) {
    open = false; box.classList.remove("on"); dock.classList.remove("open"); dock.classList.add("seen");
    btn.setAttribute("aria-expanded", "false"); btn.setAttribute("aria-label", "Open live chat");
    if (silent !== true) { try { sessionStorage.setItem(DISMISS, "1"); } catch (e) {} }
  }
  // The AI assistant box is being used: tuck the live chat away (and never auto-open over it).
  window.addEventListener("ah-assistant-open", function () { if (open) minimise(true); });
  btn.onclick = function () { open ? minimise() : openBox(); };
  minB.onclick = function () { minimise(); };
  tease.onclick = function (e) { if (e.target === teaseX) { hideTease(); return; } openBox(); };
  xB.onclick = function () {
    if (S && !S.closed && hasVisitorMsg()) {
      if (!window.confirm("End this chat? Your conversation will be closed.")) return;
      post("/" + S.id + "/end", { token: S.token }).catch(function () {});
    }
    minimise();
  };
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && open) minimise(); });

  /* ------------------------------------------------ sending (Enter key + arrow button) ------------------------------------------------ */
  function grow() { input.style.height = "38px"; input.style.height = Math.min(input.scrollHeight, 84) + "px"; }
  function doSend(text) {
    var v = String(text != null ? text : input.value).trim();
    if (!v || busy) return;
    if (S && S.closed) { clearSession(); updateSub(); }
    if (text == null) { input.value = ""; grow(); }
    busy = true; send.disabled = true;
    var p;
    if (!S) {
      p = post("/start", { message: v }).then(function (j) {
        S = { id: j.id, token: j.token, msgs: [], agent: null, closed: false }; save(); return load();
      });
    } else {
      p = post("/" + S.id + "/messages", { token: S.token, body: v });
    }
    p.catch(function (e) {
      if (text == null) { input.value = v; grow(); }
      log.appendChild(bubble({ sender: "system", body: e.message })); scroll();
    }).then(function () { busy = false; send.disabled = false; input.focus(); });
  }
  send.addEventListener("click", function () { doSend(); });
  input.addEventListener("keydown", function (e) {
    if ((e.key === "Enter" || e.keyCode === 13) && !e.shiftKey && !e.isComposing) { e.preventDefault(); doSend(); }
  });
  input.addEventListener("input", grow);

  function connect() {
    if (es) es.close();
    es = new EventSource(API + "/" + S.id + "/stream?token=" + encodeURIComponent(S.token));
    es.addEventListener("message", function (ev) {
      var m = JSON.parse(ev.data);
      if (m.sender === "agent" && !S.agent) { S.agent = m.sender_name; save(); updateSub(); }
      addLive(m);
    });
    es.addEventListener("joined", function (ev) { S.agent = JSON.parse(ev.data).agent_name; save(); updateSub(); });
    es.addEventListener("closed", function () { S.closed = true; save(); es.close(); es = null; updateSub(); if (open) renderLog(); });
  }

  function load() {
    return fetch(API + "/" + S.id + "/messages?token=" + encodeURIComponent(S.token)).then(function (r) { return r.json(); }).then(function (j) {
      if (!j.success) { clearSession(); renderLog(); updateSub(); return; }
      S.msgs = j.messages; S.agent = j.agent_name; S.closed = j.status === "closed"; save();
      if (!S.closed) connect();
      updateSub(); renderLog();
    }).catch(function () {});
  }

  function assistantBusy() { var f = document.getElementById("ah-cb-form"), p = document.getElementById("ah-cb-panel"); return !!((p && p.classList.contains("open")) || (f && f.contains(document.activeElement))); }

  /* ------------------------------------------------ boot ------------------------------------------------ */
  renderLog(); updateSub();
  if (S) load();
  document.addEventListener("visibilitychange", function () { if (S && !S.closed && document.visibilityState === "visible") load(); });
  var dismissed = false; try { dismissed = !!sessionStorage.getItem(DISMISS); } catch (e) {}
  if (DELAY >= 0 && !dismissed && window.innerWidth >= 768) setTimeout(function () { if (!open && !assistantBusy()) openBox(); }, DELAY);
  else if (!dismissed) setTimeout(function () { if (!open) { tease.classList.add("on"); setTimeout(hideTease, 9000); } }, 6000);
})();
