
let scrollTick = false;
window.addEventListener('scroll', function () {
if (scrollTick) return;
scrollTick = true;
requestAnimationFrame(function () {
scrollTick = false;
var y = window.scrollY;
var nav = document.getElementById('nav');
var btt = document.getElementById('btt');
if (nav) nav.classList.toggle('scrolled', y > 60);
if (btt) btt.classList.toggle('show', y > 300);
var activeId = '';
document.querySelectorAll('section[id]').forEach(function (sec) {
var top = sec.offsetTop - 110;
if (y >= top && y < top + sec.offsetHeight) activeId = sec.id;
});
document.querySelectorAll('.nav-link').forEach(function (link) {
link.classList.toggle('active', link.getAttribute('href') === '#' + activeId);
});
});
}, { passive: true });

document.querySelectorAll('a[href^="#"]').forEach(function(a) {
a.addEventListener('click', function(e) {
var href = this.getAttribute('href');
if (href === '#') return;
var t = document.querySelector(href);
if (t) {
e.preventDefault();
var navCollapse = document.getElementById('navmenu');
var navToggle = document.querySelector('.navbar-toggler');
if (navCollapse && navCollapse.classList.contains('show')) {
navCollapse.classList.remove('show');
if (navToggle) navToggle.setAttribute('aria-expanded', 'false');
}
setTimeout(function() {
window.scrollTo({
top: t.offsetTop - ((document.getElementById('nav') || {}).offsetHeight || 52) - 4,
behavior: 'smooth'
});
}, 50);
}
});
});

var navToggle = document.querySelector('.navbar-toggler');
var navMenu = document.getElementById('navmenu');
if (navToggle && navMenu) {
navToggle.addEventListener('click', function () {
var open = navMenu.classList.toggle('show');
navToggle.setAttribute('aria-expanded', String(open));
});
}

document.addEventListener('keydown', function(e) {
if (e.key === 'Escape') {
if (navMenu) navMenu.classList.remove('show');
}
});

var nlBtn = document.getElementById('nlBtn');
if (nlBtn) {
nlBtn.addEventListener('click', function() {
var emailEl = document.getElementById('nlEmail');
var email = emailEl ? emailEl.value : '';
if (email && email.includes('@')) {
var btn = this;
btn.textContent = 'Subscribed!';
btn.style.background = '#4ade80';
btn.style.color = '#222';
emailEl.value = '';
setTimeout(function() {
btn.textContent = 'Subscribe';
btn.style.background = '';
btn.style.color = '';
}, 3000);
}
});
}

var numAnimated = false;
window.addEventListener('scroll', function() {
var hero = document.getElementById('hero');
if (!numAnimated && hero && window.scrollY > hero.offsetHeight - 300) {
numAnimated = true;
document.querySelectorAll('.snum').forEach(function(el) {
var txt = el.textContent;
var num = parseInt(txt);
var suf = txt.replace(/[0-9]/g, '');
if (isNaN(num)) return;
var start = 0;
var step = Math.ceil(num / 55);
var iv = setInterval(function() {
start += step;
if (start >= num) {
start = num;
clearInterval(iv);
}
el.textContent = start + suf;
}, 1400 / 55);
});
}
}, { passive: true });


/* Header alignment: social icons + Login/Signup end exactly at the submit form's RIGHT edge (desktop).
   Order Now is auto-centred between the nav links and the Login block. If the links would not fit,
   the header falls back to its normal flow so nothing ever overlaps. */
(function () {
var root = document.documentElement, ticking = false;
function align() {
ticking = false;
root.classList.remove('hdr-x');
root.style.removeProperty('--hdr-r');
var form = document.querySelector('#hero .assignment-form-updated');
var cont = document.querySelector('#nav .container');
if (!form || !cont || window.innerWidth < 992) return;
var cs = getComputedStyle(cont), cr = cont.getBoundingClientRect();
var left = cr.left + parseFloat(cs.paddingLeft);
var right = cr.right - parseFloat(cs.paddingRight);
var fr = form.getBoundingClientRect().right;
var off = right - fr;
if (off < 0) return;
function w(sel) { var e = document.querySelector(sel); return e ? e.offsetWidth : 0; }
var authW = w('#nav .nav-auth-group'), socW = w('#topbar .tsoc');
var navRoom = (fr - authW) - left;
var navNeed = w('#nav .navbar-brand') + 8 + (w('#nav .navbar-nav') - 7) + w('#nav .top-order') + 24;
var topRoom = (fr - socW) - left, topNeed = 16, shown = 0;
document.querySelectorAll('#topbar .top-contact span').forEach(function (k) { if (k.offsetWidth) { topNeed += k.offsetWidth; shown++; } });
topNeed += Math.max(0, shown - 1) * 14;
if (navNeed > navRoom || topNeed > topRoom) return;
root.style.setProperty('--hdr-r', off + 'px');
root.classList.add('hdr-x');
}
function queue() { if (!ticking) { ticking = true; requestAnimationFrame(align); } }
window.addEventListener('resize', queue, { passive: true });
window.addEventListener('load', queue);
if (document.fonts && document.fonts.ready) document.fonts.ready.then(queue);
queue();
})();

/* Signed-in visitors: turn "Login" into their name (links to /account) and hide "Signup". */
(function () {
if (!/(?:^|;\s*)ah_in=1/.test(document.cookie)) return;
fetch('/api/account/me', { credentials: 'same-origin', headers: { Accept: 'application/json' } })
.then(function (r) { return r.ok ? r.json() : null; })
.then(function (d) {
if (!d || !d.success) return;
var login = document.querySelector('.nav-auth.login'), signup = document.querySelector('.nav-auth.signup');
if (login) {
login.setAttribute('href', '/account');
var t = login.querySelector('.nav-auth-txt');
if (t) t.textContent = String(d.user.name || 'Account').split(' ')[0].slice(0, 12);
}
if (signup) signup.style.display = 'none';
window.dispatchEvent(new Event('resize')); // re-run the header alignment
})
.catch(function () {});
})();
