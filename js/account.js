/* Login, signup and account dashboard (vanilla JS, no dependencies). */
(function () {
"use strict";

var $ = function (s, r) { return (r || document).querySelector(s); };
var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
var esc = function (v) { return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };

/* ---------- icons (inline SVG, stroke = currentColor) ---------- */
var P = {
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
  phone: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  check: '<path d="m5 12 5 5 9-10"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  eyeoff: '<path d="M3 3l18 18M10.6 6.1A10 10 0 0 1 12 6c6.5 0 10 6 10 6a17 17 0 0 1-3.2 3.9M6.5 7.6A16 16 0 0 0 2 12s3.5 7 10 7c1.6 0 3-.4 4.3-1M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
  copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/>',
  box: '<path d="M21 8 12 3 3 8v8l9 5 9-5z"/><path d="m3 8 9 5 9-5M12 13v8"/>',
  file: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/>'
};
function svg(name) {
  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (P[name] || "") + "</svg>";
}
function paintIcons(root) {
  $$("[data-i]", root).forEach(function (el) {
    if (el.tagName === "SPAN" && el.className.indexOf("ic") === -1 && !el.classList.contains("tick")) { el.style.display = "inline-flex"; el.style.width = "18px"; }
    el.innerHTML = svg(el.getAttribute("data-i"));
  });
  $$("[data-eye]", root).forEach(function (b) { b.innerHTML = svg("eye"); });
}

/* ---------- helpers ---------- */
function toast(msg, kind) {
  var t = document.createElement("div");
  t.className = "toast " + (kind || "info");
  t.textContent = msg;
  $("#toasts").appendChild(t);
  setTimeout(function () { t.style.opacity = "0"; t.style.transition = "opacity .3s"; setTimeout(function () { t.remove(); }, 320); }, 4200);
}

function api(path, opts) {
  opts = opts || {};
  var init = { method: opts.method || "GET", credentials: "same-origin", headers: { Accept: "application/json" } };
  if (opts.body !== undefined) { init.headers["Content-Type"] = "application/json"; init.body = JSON.stringify(opts.body); }
  return fetch(path, init).then(function (r) {
    return r.json().catch(function () { return {}; }).then(function (d) { d.__status = r.status; d.__ok = r.ok; return d; });
  }).catch(function () { return { success: false, message: "Network problem. Please check your connection.", __status: 0 }; });
}

function busy(btn, on, label) {
  if (!btn) return;
  if (on) { btn.dataset.label = btn.innerHTML; btn.disabled = true; btn.innerHTML = '<span class="spin"></span>' + (label ? "<span>" + esc(label) + "</span>" : ""); }
  else { btn.disabled = false; if (btn.dataset.label) btn.innerHTML = btn.dataset.label; }
}

function fieldError(id, msg) {
  var input = $("#" + id), box = input && input.closest(".field"), m = $("#" + id + "Msg");
  if (box) box.classList.toggle("bad", !!msg);
  if (m) m.textContent = msg || "";
}
function clearErrors(form) { $$(".field.bad", form).forEach(function (f) { f.classList.remove("bad"); }); $$(".msg", form).forEach(function (m) { m.textContent = ""; }); }

function wireEyes(root) {
  $$("[data-eye]", root).forEach(function (b) {
    b.addEventListener("click", function () {
      var input = $("#" + b.getAttribute("data-eye"));
      var show = input.type === "password";
      input.type = show ? "text" : "password";
      b.innerHTML = svg(show ? "eyeoff" : "eye");
      b.setAttribute("aria-label", show ? "Hide password" : "Show password");
    });
  });
}

function safeNext() {
  var n = new URLSearchParams(location.search).get("next") || "";
  return /^\/[A-Za-z0-9\-_/]*$/.test(n) && n.indexOf("//") !== 0 ? n : "/account";
}

var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/* ---------- Google sign-in ---------- */
var G_LOGO = '<svg viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.5 17.7 9.5 24 9.5z"/><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.6 5.9c4.4-4.1 7-10.1 7-17.6z"/><path fill="#FBBC05" d="M10.5 28.7A14.5 14.5 0 0 1 9.5 24c0-1.6.3-3.2.8-4.7l-7.9-6.1A24 24 0 0 0 0 24c0 3.9.9 7.5 2.6 10.8l7.9-6.1z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.6-5.9c-2.1 1.4-4.9 2.3-8.3 2.3-6.3 0-11.6-4.2-13.5-9.9l-7.9 6.1C6.5 42.6 14.6 48 24 48z"/></svg>';

function googleFallback(holder, text) {
  holder.innerHTML = '<button type="button" class="gfallback">' + G_LOGO + "<span>Continue with Google</span></button>";
  holder.firstChild.addEventListener("click", function () { toast(text, "info"); });
}

function initGoogle() {
  var wrap = $("#gWrap"), holder = $("#gbtn");
  if (!wrap || !holder) return;
  var down = "Google sign-in isn't available right now. Please use your email instead.";
  googleFallback(holder, down);            // always visible, so people can see the option exists
  api("/api/auth/config").then(function (cfg) {
    if (!cfg.google || !cfg.google.clientId) return;   // not configured on the server yet
    var s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.onerror = function () { googleFallback(holder, "We couldn't reach Google. Check your connection or use your email instead."); };
    s.onload = function () {
      if (!window.google || !google.accounts) return;
      google.accounts.id.initialize({
        client_id: cfg.google.clientId,
        ux_mode: "popup",
        callback: function (resp) {
          api("/api/auth/google", { method: "POST", body: { credential: resp.credential } }).then(function (d) {
            if (d.success) {
              toast(d.message || "Signed in.", "ok");
              setTimeout(function () { location.href = safeNext(); }, d.isNewUser ? 1200 : 500);
            } else toast(d.message || "Google sign-in failed.", "err");
          });
        }
      });
      holder.innerHTML = "";
      google.accounts.id.renderButton(holder, { theme: "outline", size: "large", shape: "pill", text: "continue_with", width: Math.min(360, holder.parentNode.clientWidth || 360) });
    };
    document.head.appendChild(s);
  });
}

function strength(v) {
  var score = 0;
  if (v.length >= 8) score++; if (v.length >= 12) score++; if (/[A-Z]/.test(v) && /[a-z]/.test(v)) score++; if (/\d/.test(v)) score++; if (/[^A-Za-z0-9]/.test(v)) score++;
  return score;
}
function paintMeter(el, v) {
  var sc = strength(v);
  el.style.width = (sc * 20) + "%";
  el.style.background = sc < 3 ? "#ef4444" : sc < 4 ? "#f59e0b" : "#10b981";
}

/* ---------- pages ---------- */
function loginPage() {
  api("/api/account/me").then(function (d) { if (d.success) location.replace(safeNext()); });
  var form = $("#loginForm");
  form.addEventListener("submit", function (e) {
    e.preventDefault(); clearErrors(form);
    var ident = $("#identifier").value.trim(), pw = $("#password").value;
    var bad = false;
    if (!ident) { fieldError("identifier", "Enter your User ID or email."); bad = true; }
    if (!pw) { fieldError("password", "Enter your password."); bad = true; }
    if (bad) return;
    var btn = $("#loginBtn"); busy(btn, true, "Logging in…");
    api("/api/auth/login", { method: "POST", body: { identifier: ident, password: pw } }).then(function (d) {
      if (d.success) { toast("Welcome back, " + d.user.name.split(" ")[0] + "!", "ok"); setTimeout(function () { location.href = safeNext(); }, 450); }
      else { busy(btn, false); fieldError("password", d.message || "Could not log in."); $("#password").focus(); $("#password").select(); }
    });
  });
  $("#showForgot").addEventListener("click", function (e) { e.preventDefault(); $("#loginCard").hidden = true; $("#forgotCard").hidden = false; $("#fIdent").value = $("#identifier").value; $("#fIdent").focus(); });
  $("#backLogin").addEventListener("click", function (e) { e.preventDefault(); $("#forgotCard").hidden = true; $("#loginCard").hidden = false; });
  $("#forgotForm").addEventListener("submit", function (e) {
    e.preventDefault();
    var v = $("#fIdent").value.trim(); if (!v) return toast("Enter your User ID or email.", "err");
    var btn = $("#forgotBtn"); busy(btn, true, "Sending…");
    api("/api/auth/forgot", { method: "POST", body: { identifier: v } }).then(function (d) {
      busy(btn, false);
      toast(d.message || "If an account exists, a new password has been emailed.", d.__ok ? "ok" : "err");
      if (d.__ok) { $("#forgotCard").hidden = true; $("#loginCard").hidden = false; $("#identifier").value = v; $("#password").focus(); }
    });
  });
  initGoogle();
}

function signupPage() {
  var form = $("#signupForm"), uidOk = null, uidTimer = null, uidSeq = 0;
  var UID_RE = /^[A-Za-z0-9._-]{4,16}$/;

  function uidMsg(text, kind) {
    var m = $("#userIdMsg"), f = $("#userId").closest(".field");
    m.textContent = text; m.className = "msg " + (kind || "");
    f.classList.toggle("bad", kind === "");
  }
  function checkUid() {
    var v = $("#userId").value.trim(); uidOk = null;
    clearTimeout(uidTimer);
    if (!v) return uidMsg("4-16 letters, numbers, dots, dashes or underscores.", "hint");
    if (!UID_RE.test(v)) return uidMsg("Use 4-16 letters, numbers, dots, dashes or underscores.", "");
    uidMsg("Checking availability…", "hint");
    var my = ++uidSeq;
    uidTimer = setTimeout(function () {
      api("/api/auth/check-userid?id=" + encodeURIComponent(v)).then(function (d) {
        if (my !== uidSeq) return;               // a newer keystroke superseded this check
        if (d.success && d.available) { uidOk = true; uidMsg("✓ " + v + " is available", "ok"); }
        else { uidOk = false; uidMsg(d.message || "That User ID is taken.", ""); }
      });
    }, 350);
  }
  $("#userId").addEventListener("input", checkUid);
  $("#password").addEventListener("input", function () { paintMeter($("#meter"), this.value); });

  form.addEventListener("submit", function (e) {
    e.preventDefault(); clearErrors(form);
    var name = $("#name").value.trim(), uid = $("#userId").value.trim(), email = $("#email").value.trim(), pw = $("#password").value, bad = false;
    if (name.length < 2) { fieldError("name", "Please enter your full name."); bad = true; }
    if (!UID_RE.test(uid)) { uidMsg("Use 4-16 letters, numbers, dots, dashes or underscores.", ""); bad = true; }
    else if (uidOk === false) { bad = true; }
    if (!EMAIL_RE.test(email)) { fieldError("email", "Please enter a valid email address."); bad = true; }
    if (pw.length < 8) { fieldError("password", "Use at least 8 characters."); bad = true; }
    else if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) { fieldError("password", "Include both letters and numbers."); bad = true; }
    if (bad) return;
    var btn = $("#signupBtn"); busy(btn, true, "Creating account…");
    api("/api/auth/signup", { method: "POST", body: { name: name, userId: uid, email: email, password: pw } }).then(function (d) {
      busy(btn, false);
      if (d.success) { $("#doneMsg").textContent = d.message; $("#signupCard").hidden = true; $("#doneCard").hidden = false; }
      else if (d.__status === 409 && d.field === "userId") { uidOk = false; uidMsg(d.message, ""); }
      else if (d.__status === 409) fieldError("email", d.message);
      else if (d.__status === 400 && /password/i.test(d.message || "")) fieldError("password", d.message);
      else if (d.__status === 400 && /user id/i.test(d.message || "")) uidMsg(d.message, "");
      else toast(d.message || "Could not create your account.", "err");
    });
  });
  initGoogle();
}

function accountPage() {
  var state = { user: null, sub: null, orders: [], page: 1, totalPages: 1, total: 0, timer: null, txns: [], txnPage: 1, txnPages: 1, txnTotal: 0 };

  function fmtDate(v, withTime) {
    if (!v) return "—";
    var d = new Date(v); if (isNaN(d)) return String(v);
    return d.toLocaleString(undefined, withTime ? { dateStyle: "medium", timeStyle: "short" } : { dateStyle: "medium" });
  }
  function pillClass(s) {
    s = String(s || "").toLowerCase();
    if (/complete|deliver|done|closed/.test(s)) return "done";
    if (/progress|review|working|assign|process/.test(s)) return "prog";
    if (/cancel|reject|refund/.test(s)) return "bad";
    return "new";
  }
  function orderRow(o) {
    return '<button class="order" type="button" data-order="' + esc(o.orderId) + '">' +
      '<span class="t">' + esc(o.subject || "Assignment") + "</span>" +
      '<span class="pill ' + pillClass(o.status) + '">' + esc(o.status) + "</span>" +
      '<span class="m"><span>Order #' + esc(o.orderId) + "</span><span>Deadline: " + esc(o.deadlineDate || "—") + (o.deadlineTime ? " " + esc(o.deadlineTime) : "") + "</span><span>Submitted " + esc(fmtDate(o.submittedAt)) + "</span>" + (o.attachmentCount ? "<span>" + o.attachmentCount + " file" + (o.attachmentCount > 1 ? "s" : "") + "</span>" : "") + "</span></button>";
  }
  var emptyOrders = '<div class="empty">' + svg("box") + "<div><b>No orders yet</b></div><div>Orders you submit with your email will appear here.</div><p><a class=\"btn sm\" style=\"text-decoration:none\" href=\"/#hero\">Place an order</a></p></div>";

  function renderProfile() {
    var u = state.user, initials = u.name.split(/\s+/).map(function (w) { return w[0]; }).slice(0, 2).join("").toUpperCase();
    $("#profile").innerHTML =
      '<div class="avatar">' + (u.avatarUrl ? '<img src="' + esc(u.avatarUrl) + '" alt="" referrerpolicy="no-referrer">' : esc(initials)) + "</div>" +
      '<div class="pmain"><h1>' + esc(u.name) + '</h1><div class="em">' + esc(u.email) + "</div></div>" +
      '<div class="chips"><button class="chip" type="button" id="copyId" title="Copy User ID">User ID <code>' + esc(u.userId) + "</code> " + svg("copy").replace("<svg", '<svg width="14" height="14"') + "</button>" +
      '<span class="chip">' + (u.provider === "google" ? "Google account" : "Email account") + "</span>" +
      '<span class="chip">Member since ' + esc(fmtDate(u.memberSince)) + "</span></div>";
    $("#copyId").addEventListener("click", function () {
      (navigator.clipboard ? navigator.clipboard.writeText(u.userId) : Promise.reject()).then(function () { toast("User ID copied.", "ok"); }, function () { toast("Copy failed. Your User ID is " + u.userId, "info"); });
    });
    // Google accounts: the password button sits next to Log out and there is no reset form in Settings.
    var google = u.provider === "google";
    $("#setPwBtn").hidden = !google;
    $("#setPwBtn").textContent = u.hasPassword ? "Change password" : "Set password";
    $("#pwForm").hidden = google;
    $("#verifyBanner").hidden = u.emailVerified;
    $("#curPwField").hidden = !u.hasPassword;
    $("#pwTitle").textContent = u.hasPassword ? "Change password" : "Set a password";
    $("#pwBtn").textContent = u.hasPassword ? "Update password" : "Save password";
    $("#pName").value = u.name; $("#pEmail").value = u.email; $("#pPhone").value = u.phone || "";
  }

  function renderSub() {
    var s = state.sub, el = $("#sub");
    if (!s.active && s.status === "none") {
      el.innerHTML = '<div class="plan"><h3>Free plan <span class="pill">No subscription</span></h3><p style="color:var(--muted)">' + esc(s.message) + '</p><button class="btn sm" id="upgradeBtn" type="button" style="width:auto;display:inline-flex;padding:0 18px">Get unlimited chat - $20/month</button></div>';
      $("#upgradeBtn").addEventListener("click", function () {
        var b = $("#upgradeBtn"); busy(b, true, "Opening checkout…");
        api("/api/billing/checkout", { method: "POST", body: {} }).then(function (d) {
          if (d.url) { location.href = d.url; return; }
          busy(b, false); toast(d.message || "Checkout isn't available right now.", "err");
        });
      });
      return;
    }
    el.innerHTML = '<div class="plan ' + (s.active ? "on" : "") + '"><h3>' + esc(s.plan) + ' <span class="pill ' + (s.active ? "done" : "bad") + '">' + esc(s.status) + '</span></h3><p style="color:var(--muted);margin:6px 0 0">' + esc(s.message) + "</p>" +
      '<div class="kv"><div><small>Price</small><b>' + esc(s.price || "—") + (s.interval ? " / " + esc(s.interval) : "") + "</b></div>" +
      "<div><small>" + (s.cancelAtPeriodEnd ? "Ends on" : "Renews on") + "</small><b>" + esc(fmtDate(s.currentPeriodEnd)) + "</b></div>" +
      "<div><small>Started</small><b>" + esc(fmtDate(s.startedAt)) + "</b></div></div>" +
      (s.active ? '<div style="margin-top:14px"><button class="btn sm" id="renewBtn" type="button" style="width:auto;display:inline-flex;padding:0 18px' +
        (s.cancelAtPeriodEnd ? '">Resume automatic renewal' : ';background:#fff;color:#b91c1c;border:1px solid #fca5a5">Cancel subscription') +
        '</button><p style="color:var(--muted);margin:8px 0 0;font-size:.85rem">' +
        (s.cancelAtPeriodEnd ? "You will not be charged again. Resume any time before the end date to keep your plan." : "Charged automatically every month until you cancel. Cancel anytime; you keep access until the end of the period you paid for.") +
        "</p></div>" : "") + "</div>";
    var rb = $("#renewBtn");
    if (rb) rb.addEventListener("click", function () {
      var cancel = !s.cancelAtPeriodEnd;
      if (cancel && !window.confirm("Cancel your subscription? It will stop renewing, and you keep unlimited access until " + fmtDate(s.currentPeriodEnd) + ".")) return;
      busy(rb, true, cancel ? "Cancelling…" : "Resuming…");
      api("/api/account/subscription/" + (cancel ? "cancel" : "resume"), { method: "POST", body: {} }).then(function (d) {
        if (d.__status === 401) { location.replace("/login?next=/account"); return; }
        busy(rb, false);
        if (!d.success) { toast(d.message || "Could not update your subscription.", "err"); return; }
        toast(d.message || "Subscription updated.");
        loadOverview(true);
      });
    });
  }

  function renderTiles() {
    var s = state.sub;
    $("#tiles").innerHTML =
      '<div class="tile"><div class="k">Current plan</div><div class="v">' + esc(s.active ? s.plan : "Free") + '</div><div class="s">' + (s.active ? (s.cancelAtPeriodEnd ? "Ends " : "Renews ") + esc(fmtDate(s.currentPeriodEnd)) : "No active subscription") + "</div></div>" +
      '<div class="tile"><div class="k">Orders submitted</div><div class="v">' + state.total + '</div><div class="s">All time</div></div>' +
      '<div class="tile"><div class="k">Last login</div><div class="v" style="font-size:1.05rem">' + esc(fmtDate(state.user.lastLogin, true)) + '</div><div class="s">Secure session</div></div>';
  }

  function renderOrders(reset) {
    $("#recent").innerHTML = state.orders.length ? state.orders.slice(0, 5).map(orderRow).join("") : emptyOrders;
    $("#orders").innerHTML = state.orders.length ? state.orders.map(orderRow).join("") : emptyOrders;
    $("#more").hidden = state.page >= state.totalPages;
  }

  function txnRow(t) {
    var receipt = t.receiptUrl && /^https:\/\//.test(t.receiptUrl) ? '<a href="' + esc(t.receiptUrl) + '" target="_blank" rel="noopener">Receipt</a>' : "";
    return '<div class="txn"><div class="tl"><b>' + esc(t.description) + "</b><small>Order ID: " + esc(t.orderId) +
      (t.invoiceNumber ? " · Invoice " + esc(t.invoiceNumber) : "") +
      (t.reference ? "<br>Subscription ref: " + esc(t.reference) : "") +
      "<br>" + esc(fmtDate(t.paidAt, true)) + '</small></div><div class="tr"><b>' + esc(t.amount || "—") + '</b><span class="pill ' + (t.status === "paid" ? "done" : "new") + '">' + esc(t.status) + "</span>" + receipt + "</div></div>";
  }
  function renderTxns() {
    $("#txns").innerHTML = state.txns.length ? state.txns.map(txnRow).join("") :
      '<div class="empty">' + svg("box") + "<div><b>No payments yet</b></div><div>Payments for your subscription will appear here with their order ID.</div></div>";
    $("#moreTxn").hidden = state.txnPage >= state.txnPages;
  }

  /* Set / change password from the button next to Log out (Google accounts). */
  function openPasswordModal() {
    var need = state.user && state.user.hasPassword;
    var eyeBtn = function (id) { return '<button class="eye" type="button" data-eye="' + id + '" aria-label="Show password"></button>'; };
    openModal('<h3 id="mTitle">' + (need ? "Change password" : "Set a password") + "</h3>" +
      '<p style="color:var(--muted);font-size:.88rem;margin:0 0 12px">' + (need ? "Choose a new password for logging in with your email or User ID." : "You signed up with Google, so a password is optional. Add one if you also want to log in with your email or User ID.") + "</p>" +
      '<form id="mPwForm" novalidate>' +
      (need ? '<div class="field"><label for="mCur">Current password</label><div class="box"><span class="ic" data-i="lock"></span><input id="mCur" type="password" autocomplete="current-password">' + eyeBtn("mCur") + "</div></div>" : "") +
      '<div class="field"><label for="mNew">New password</label><div class="box"><span class="ic" data-i="lock"></span><input id="mNew" type="password" autocomplete="new-password" placeholder="8+ characters, letters and numbers">' + eyeBtn("mNew") + '</div><div class="meter"><i id="mMeter"></i></div><div class="msg" id="mPwMsg"></div></div>' +
      '<button class="btn" type="submit" id="mPwBtn">' + (need ? "Update password" : "Save password") + "</button></form>");
    paintIcons($("#mBody")); wireEyes($("#mBody"));
    $("#mNew").addEventListener("input", function () { paintMeter($("#mMeter"), this.value); });
    $("#mPwForm").addEventListener("submit", function (e) {
      e.preventDefault(); $("#mPwMsg").textContent = "";
      var cur = need ? $("#mCur").value : "", next = $("#mNew").value;
      if ((need && !cur) || !next) { $("#mPwMsg").textContent = need ? "Fill in both fields." : "Enter a new password."; return; }
      var btn = $("#mPwBtn"); busy(btn, true, "Saving…");
      api("/api/auth/change-password", { method: "POST", body: { currentPassword: cur, newPassword: next } }).then(function (d) {
        busy(btn, false);
        if (d.success) { closeModal(); toast(need ? "Password updated." : "Password saved. You can now also log in with your email or User ID.", "ok"); loadOverview(true); }
        else $("#mPwMsg").textContent = d.message || "Could not save the password.";
      });
    });
    $("#mNew").focus();
  }

  function loadOverview(quiet) {
    return api("/api/account/overview").then(function (d) {
      if (d.__status === 401) { location.replace("/login?next=/account"); return; }
      if (!d.success) { if (!quiet) toast(d.message || "Could not load your account.", "err"); return; }
      state.user = d.user; state.sub = d.subscription;
      state.orders = d.orders.orders; state.page = 1; state.totalPages = d.orders.totalPages; state.total = d.orders.total;
      if (d.transactions) { state.txns = d.transactions.items; state.txnPage = 1; state.txnPages = d.transactions.totalPages; state.txnTotal = d.transactions.total; }
      renderProfile(); renderTiles(); renderSub(); renderOrders(); renderTxns();
      $("#liveTxt").textContent = "Live · updated " + new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    });
  }

  function openModal(html) { $("#mBody").innerHTML = html; $("#modal").classList.add("open"); $("#mClose").focus(); }
  function closeModal() { $("#modal").classList.remove("open"); }
  function showOrder(id) {
    openModal('<div class="sk"></div>');
    api("/api/account/orders/" + encodeURIComponent(id)).then(function (d) {
      if (!d.success) { closeModal(); return toast(d.message || "Could not load this order.", "err"); }
      var o = d.order;
      openModal('<h3 id="mTitle">' + esc(o.subject || "Assignment") + '</h3><p style="margin:0 0 10px"><span class="pill ' + pillClass(o.status) + '">' + esc(o.status) + '</span> &nbsp;<span style="color:var(--muted);font-size:.85rem">Order #' + esc(o.orderId) + "</span></p>" +
        '<div class="kv"><div><small>Submitted</small><b>' + esc(fmtDate(o.submittedAt, true)) + "</b></div><div><small>Deadline</small><b>" + esc(o.deadlineDate || "—") + " " + esc(o.deadlineTime || "") + "</b></div><div><small>Contact</small><b style=\"font-size:.85rem;word-break:break-all\">" + esc(o.email) + "</b></div></div>" +
        "<b>Your requirements</b><div class=\"desc\">" + esc(o.details || "—") + "</div>" +
        (o.files.length ? '<b>Attachments</b><div class="files">' + o.files.map(function (f) { return '<a href="' + esc(f.downloadUrl) + '" download><span>' + svg("file").replace("<svg", '<svg width="16" height="16" style="vertical-align:-3px"') + " " + esc(f.name) + "</span><span style=\"color:var(--muted)\">" + Math.max(1, Math.round(f.size / 1024)) + " KB</span></a>"; }).join("") + "</div>" : ""));
    });
  }

  function go(tab) {
    $$(".tab").forEach(function (t) { t.setAttribute("aria-selected", String(t.dataset.tab === tab)); });
    $$(".panel").forEach(function (p) { p.hidden = p.id !== "p-" + tab; });
    if (history.replaceState) history.replaceState(null, "", "#" + tab);
  }

  /* events */
  $$(".tab").forEach(function (t) { t.addEventListener("click", function () { go(t.dataset.tab); }); });
  $$("[data-go]").forEach(function (b) { b.addEventListener("click", function () { go(b.dataset.go); $("#curPw").focus(); }); });
  document.addEventListener("click", function (e) { var b = e.target.closest("[data-order]"); if (b) showOrder(b.getAttribute("data-order")); });
  $("#mClose").addEventListener("click", closeModal);
  $("#modal").addEventListener("click", function (e) { if (e.target.id === "modal") closeModal(); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeModal(); });
  $("#more").addEventListener("click", function () {
    var btn = $("#more"); busy(btn, true);
    api("/api/account/orders?page=" + (state.page + 1)).then(function (d) {
      busy(btn, false);
      if (d.success) { state.page = d.page; state.totalPages = d.totalPages; state.orders = state.orders.concat(d.orders); renderOrders(); }
    });
  });
  $("#setPwBtn").addEventListener("click", openPasswordModal);
  $("#moreTxn").addEventListener("click", function () {
    var btn = $("#moreTxn"); busy(btn, true);
    api("/api/account/transactions?page=" + (state.txnPage + 1)).then(function (d) {
      busy(btn, false);
      if (d.success) { state.txnPage = d.page; state.txnPages = d.totalPages; state.txns = state.txns.concat(d.items); renderTxns(); }
    });
  });
  $("#logoutBtn").addEventListener("click", function () { api("/api/auth/logout", { method: "POST" }).then(function () { location.href = "/login"; }); });

  $("#profileForm").addEventListener("submit", function (e) {
    e.preventDefault();
    var btn = $("#profileBtn"); busy(btn, true, "Saving…");
    api("/api/account/me", { method: "PATCH", body: { name: $("#pName").value, phone: $("#pPhone").value } }).then(function (d) {
      busy(btn, false);
      if (d.success) { state.user = d.user; renderProfile(); toast("Profile updated.", "ok"); } else toast(d.message || "Could not save.", "err");
    });
  });

  $("#newPw").addEventListener("input", function () {
    paintMeter($("#meter"), this.value);
  });
  $("#pwForm").addEventListener("submit", function (e) {
    e.preventDefault(); $("#pwMsg").textContent = "";
    var cur = $("#curPw").value, next = $("#newPw").value;
    var needCur = state.user && state.user.hasPassword;
    if ((needCur && !cur) || !next) { $("#pwMsg").textContent = needCur ? "Fill in both fields." : "Enter a new password."; return; }
    var btn = $("#pwBtn"); busy(btn, true, "Updating…");
    api("/api/auth/change-password", { method: "POST", body: { currentPassword: cur, newPassword: next } }).then(function (d) {
      busy(btn, false);
      if (d.success) { $("#pwForm").reset(); $("#meter").style.width = "0"; toast(needCur ? "Password updated." : "Password saved. You can now log in with your email or User ID.", "ok"); loadOverview(true); }
      else $("#pwMsg").textContent = d.message || "Could not update password.";
    });
  });

  $("#resendBtn").addEventListener("click", function () {
    var btn = $("#resendBtn"); busy(btn, true);
    api("/api/auth/resend-verification", { method: "POST" }).then(function (d) {
      busy(btn, false);
      toast(d.message || "Could not send the email.", d.success ? "ok" : "err");
    });
  });
  var vq = new URLSearchParams(location.search).get("verified");
  if (vq === "1") toast("Email confirmed. Thank you!", "ok");
  else if (vq === "0") toast("That confirmation link is invalid or expired. Use \"Resend email\" for a new one.", "err");
  if (vq && history.replaceState) history.replaceState(null, "", location.pathname + location.hash);

  /* live refresh while the tab is visible */
  function tick() { if (!document.hidden) loadOverview(true); }
  state.timer = setInterval(tick, 60000);
  document.addEventListener("visibilitychange", function () { if (!document.hidden) loadOverview(true); });

  var start = (location.hash || "").replace("#", "");
  loadOverview().then(function () { if (["overview", "orders", "subscription", "payments", "settings"].indexOf(start) > -1) go(start); });
}

/* ---------- boot ---------- */
document.addEventListener("DOMContentLoaded", function () {
  paintIcons(document); wireEyes();
  var page = document.body.getAttribute("data-page");
  if (page === "login") loginPage();
  else if (page === "signup") signupPage();
  else if (page === "account") accountPage();
});
})();
