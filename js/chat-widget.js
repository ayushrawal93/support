(function () {
  "use strict";

  var STORAGE_KEY = "ah_chat_history_v1";
  var MAX_STORED_TURNS = 12;
  var MAX_FILES = 5;
  var MAX_FILE_MB = 10;
  var ACCEPT = ".png,.jpg,.jpeg,.webp,.gif,.pdf,.docx,.txt,.md,.csv,.json";
  var reduceMotion =
    window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var history = [];
  try {
    var saved = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || "[]");
    if (Array.isArray(saved)) history = saved;
  } catch (e) {
    history = [];
  }

  function persist() {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(history.slice(-MAX_STORED_TURNS * 2)));
    } catch (e) {
      /* storage unavailable - chat still works for this pageview */
    }
  }

  /* ---------- small helpers ---------- */
  var IC = {
    clip: '<path d="M21 11.5l-8.6 8.6a5.5 5.5 0 0 1-7.8-7.8l9-9a3.7 3.7 0 0 1 5.2 5.2l-9 9a1.8 1.8 0 0 1-2.6-2.6l8.4-8.4"/>',
    cam: '<path d="M4 8h3l1.6-2.4h6.8L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13" r="3.6"/>',
    up: '<path d="M12 16V4M7 9l5-5 5 5M5 20h14"/>',
    x: '<path d="M6 6l12 12M18 6L6 18"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    file: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/>',
    copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/>',
    dl: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
    spark: '<path d="M13 2L4.5 13.5H11L10 22l8.5-11.5H12z"/>'
  };
  function svg(name, cls) {
    return '<svg class="ic ' + (cls || "") + '" viewBox="0 0 24 24" aria-hidden="true">' + IC[name] + "</svg>";
  }
  function el(tag, cls, html) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function fmtSize(n) {
    if (n < 1024) return n + " B";
    if (n < 1048576) return Math.round(n / 1024) + " KB";
    return (n / 1048576).toFixed(1) + " MB";
  }
  function kindOf(f) {
    var n = (f.name || "").toLowerCase();
    var t = f.type || "";
    if (/^image\/(png|jpe?g|webp|gif)$/.test(t) || /\.(png|jpe?g|webp|gif)$/.test(n)) return "image";
    if (t === "application/pdf" || /\.pdf$/.test(n)) return "pdf";
    if (/\.docx$/.test(n)) return "docx";
    if (/\.(txt|md|csv|json)$/.test(n) || t === "text/plain" || t === "text/csv") return "text";
    return null;
  }
  function extLabel(rec) {
    var m = /\.([a-z0-9]+)$/i.exec(rec.name);
    return (m ? m[1] : rec.kind).slice(0, 4).toUpperCase();
  }
  function kindLabel(rec) {
    return { image: "Image", pdf: "PDF", docx: "Word", text: "Text" }[rec.kind] || "File";
  }

  /* Shrink big photos before upload so phone pictures don't hit size limits. */
  function downscale(file) {
    return new Promise(function (resolve) {
      if (file.type === "image/gif") return resolve(file);
      var img = new Image();
      var u = URL.createObjectURL(file);
      img.onload = function () {
        var s = Math.min(1, 1600 / Math.max(img.width, img.height));
        if (s === 1 && file.size < 1500000) {
          URL.revokeObjectURL(u);
          return resolve(file);
        }
        var c = document.createElement("canvas");
        c.width = Math.round(img.width * s);
        c.height = Math.round(img.height * s);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        c.toBlob(
          function (b) {
            URL.revokeObjectURL(u);
            resolve(b ? new File([b], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" }) : file);
          },
          "image/jpeg",
          0.85
        );
      };
      img.onerror = function () {
        URL.revokeObjectURL(u);
        resolve(file);
      };
      img.src = u;
    });
  }

  /* ---------- exporting an answer: copy / PDF / Word ---------- */
  /* Dependency-free: a tiny zip writer builds the .docx and a tiny PDF writer
     builds the .pdf, so nothing extra has to load on the page. */
  var EX = (function () {
    var BRAND = "Assignment Help";

    /* Answers may arrive with markdown symbols (#, **, backticks). They are never shown:
       everything is reduced to plain text, and only headings are kept as headings. */
    function inline(s) {
      return String(s)
        .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, "$1 ($2)")
        .replace(/`+([^`]*)`+/g, "$1")
        .replace(/(^|[\s(\[])\*\*(?=\S)/g, "$1")
        .replace(/(\S)\*\*(?=$|[\s)\].,;:!?\u2013\u2014-])/g, "$1")
        .replace(/~~(.+?)~~/g, "$1")
        .replace(/(^|[\s(])\*(\S(?:[^*]*\S)?)\*(?=$|[\s).,;:!?])/g, "$1$2")
        .replace(/&nbsp;/g, " ");
    }
    function runs(s) {
      var t = inline(s).trim();
      return t ? [{ s: t, b: false }] : [];
    }
    function blocks(text) {
      var out = [], inCode = false;
      function gap() { if (out.length && out[out.length - 1].t !== "gap") out.push({ t: "gap" }); }
      String(text).replace(/\r/g, "").split("\n").forEach(function (raw) {
        var line = raw.replace(/\s+$/, "");
        var m;
        if (/^\s*```/.test(line)) { inCode = !inCode; return; }
        if (inCode) {
          if (line.trim()) out.push({ t: "p", runs: [{ s: line.trim(), b: false }] }); else gap();
          return;
        }
        if (!line.trim()) { gap(); return; }
        if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) { gap(); return; }                     /* --- rules */
        line = line.replace(/^\s*>+\s?/, "");                                              /* > quotes */
        if ((m = /^\s{0,3}#{1,6}\s+(.*?)(?:\s+#+)?\s*$/.exec(line))) {
          var ht = runs(m[1]);
          if (ht.length) out.push({ t: "h", runs: ht.map(function (r) { return { s: r.s, b: true }; }) });
        } else if ((m = /^\s*\*\*\s*([^*].*?)\s*\*\*\s*:?\s*$/.exec(line))) {               /* whole line in bold = heading */
          out.push({ t: "h", runs: [{ s: inline(m[1]).trim(), b: true }] });
        } else if (/^\s*\|.*\|\s*$/.test(line)) {                                          /* table rows -> plain lines */
          if (/^[\s|:-]+$/.test(line) && /-/.test(line)) return;
          var cells = line.replace(/^\s*\||\|\s*$/g, "").split("|").map(function (c) { return inline(c).trim(); }).filter(Boolean);
          if (cells.length) out.push({ t: "p", runs: [{ s: cells.join("  -  "), b: false }] });
        } else if ((m = /^\s*[-*\u2022]\s+(.*)$/.exec(line))) {
          out.push({ t: "li", mark: "\u2022", runs: runs(m[1]) });
        } else if ((m = /^\s*(\d+)[.)]\s+(.*)$/.exec(line))) {
          out.push({ t: "li", mark: m[1] + ".", runs: runs(m[2]) });
        } else {
          var pr = runs(line.trim());
          if (pr.length) out.push({ t: "p", runs: pr });
        }
      });
      while (out.length && out[out.length - 1].t === "gap") out.pop();
      return out;
    }
    /* Plain text with no markdown symbols (used for copy and for the typing effect). */
    function plain(text) {
      var lines = [];
      blocks(text).forEach(function (b) {
        if (b.t === "gap") { if (lines.length && lines[lines.length - 1] !== "") lines.push(""); return; }
        var t = b.runs.map(function (r) { return r.s; }).join("");
        if (b.t === "li") t = b.mark + " " + t;
        if (b.t === "h" && lines.length && lines[lines.length - 1] !== "") lines.push("");
        lines.push(t);
      });
      while (lines.length && lines[lines.length - 1] === "") lines.pop();
      return lines.join("\n");
    }
    /* The document heading is exactly what the visitor typed. */
    function titleOf(q) {
      var t = String(q || "").replace(/\s+/g, " ").trim();
      if (t.length > 300) t = t.slice(0, 297).replace(/\s+\S*$/, "") + "...";
      return t || "Answer";
    }
    /* The file name is the visitor's text too (minus characters a file name cannot hold). */
    function fileBase(q) {
      var t = String(q || "").replace(/[\\/:*?"<>|\u0000-\u001f]+/g, " ").replace(/\s+/g, " ").trim().replace(/^[.\s]+|[.\s]+$/g, "");
      if (t.length > 80) t = t.slice(0, 80).replace(/\s+\S*$/, "").trim() || t.slice(0, 80).trim();
      if (!t || /^(con|prn|aux|nul|com\d|lpt\d)$/i.test(t)) t = "Answer";
      return t;
    }
    function today() {
      return new Date().toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
    }
    function stamp() {
      var d = new Date();
      function z(n) { return (n < 10 ? "0" : "") + n; }
      return d.getFullYear() + z(d.getMonth() + 1) + z(d.getDate()) + "-" + z(d.getHours()) + z(d.getMinutes());
    }

    /* ---------- zip (store only) ---------- */
    var CRC = (function () {
      var t = [];
      for (var n = 0; n < 256; n++) {
        var c = n;
        for (var k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        t[n] = c >>> 0;
      }
      return t;
    })();
    function crc32(u8) {
      var c = 0xffffffff;
      for (var i = 0; i < u8.length; i++) c = CRC[(c ^ u8[i]) & 255] ^ (c >>> 8);
      return (c ^ 0xffffffff) >>> 0;
    }
    function zip(files) {
      var enc = new TextEncoder();
      var d = new Date();
      var T = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
      var D = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
      var parts = [], central = [], off = 0, cdSize = 0;
      files.forEach(function (f) {
        var name = enc.encode(f.name), data = enc.encode(f.data), crc = crc32(data), size = data.length;
        var h = new DataView(new ArrayBuffer(30));
        h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true);
        h.setUint16(8, 0, true); h.setUint16(10, T, true); h.setUint16(12, D, true);
        h.setUint32(14, crc, true); h.setUint32(18, size, true); h.setUint32(22, size, true);
        h.setUint16(26, name.length, true); h.setUint16(28, 0, true);
        parts.push(new Uint8Array(h.buffer), name, data);
        var c = new DataView(new ArrayBuffer(46));
        c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true);
        c.setUint16(8, 0x0800, true); c.setUint16(10, 0, true); c.setUint16(12, T, true); c.setUint16(14, D, true);
        c.setUint32(16, crc, true); c.setUint32(20, size, true); c.setUint32(24, size, true);
        c.setUint16(28, name.length, true); c.setUint32(42, off, true);
        central.push(new Uint8Array(c.buffer), name);
        cdSize += 46 + name.length;
        off += 30 + name.length + size;
      });
      var e = new DataView(new ArrayBuffer(22));
      e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true);
      e.setUint32(12, cdSize, true); e.setUint32(16, off, true);
      var all = parts.concat(central, [new Uint8Array(e.buffer)]);
      var total = 0;
      all.forEach(function (p) { total += p.length; });
      var out = new Uint8Array(total), at = 0;
      all.forEach(function (p) { out.set(p, at); at += p.length; });
      return out;
    }

    /* ---------- .docx ---------- */
    function xesc(s) {
      return String(s)
        .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/g, "")
        .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    }
    function docx(question, text) {
      var FONT = '<w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/>';
      function r(s, o) {
        o = o || {};
        return (
          "<w:r><w:rPr>" + FONT + (o.b ? "<w:b/>" : "") + (o.i ? "<w:i/>" : "") +
          '<w:color w:val="' + (o.c || "1F2937") + '"/><w:sz w:val="' + (o.sz || 22) + '"/></w:rPr>' +
          '<w:t xml:space="preserve">' + xesc(s) + "</w:t></w:r>"
        );
      }
      function p(inner, ppr) { return "<w:p><w:pPr>" + (ppr || "") + "</w:pPr>" + inner + "</w:p>"; }
      function rr(list, o) {
        return list.map(function (x) {
          var q = { b: x.b || (o && o.b), i: o && o.i, c: o && o.c, sz: o && o.sz };
          return r(x.s, q);
        }).join("");
      }
      var body = "";
      body += p(r(titleOf(question), { b: true, sz: 36, c: "4F46E5" }),
        '<w:pBdr><w:bottom w:val="single" w:sz="8" w:space="4" w:color="C7D2FE"/></w:pBdr><w:spacing w:after="240"/>');
      blocks(text).forEach(function (b) {
        if (b.t === "gap") return;
        if (b.t === "h") {
          body += p(rr(b.runs, { b: true, sz: 26, c: "1E1B4B" }),
            '<w:keepNext/><w:spacing w:before="240" w:after="100"/>');
        } else if (b.t === "li") {
          body += p(r(b.mark) + "<w:r><w:tab/></w:r>" + rr(b.runs),
            '<w:spacing w:after="80" w:line="290" w:lineRule="auto"/><w:ind w:left="540" w:hanging="300"/>');
        } else {
          body += p(rr(b.runs), '<w:spacing w:after="140" w:line="300" w:lineRule="auto"/>');
        }
      });
      body += p(r("Generated by " + BRAND + " assistant on " + today(), { sz: 16, c: "9CA3AF" }),
        '<w:pBdr><w:top w:val="single" w:sz="4" w:space="6" w:color="E5E7EB"/></w:pBdr><w:spacing w:before="360"/>');
      var W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
      var doc =
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="' + W + '"><w:body>' + body +
        '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1304" w:right="1304" w:bottom="1304" w:left="1304" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr></w:body></w:document>';
      return zip([
        { name: "[Content_Types].xml", data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>' },
        { name: "_rels/.rels", data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>' },
        { name: "word/document.xml", data: doc }
      ]);
    }

    /* ---------- .pdf (Helvetica, Latin text) ---------- */
    var WR = [278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584];
    var WB = [278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,611,556,778,556,556,500,389,280,389,584];
    var CP = { 0x2018: 0x91, 0x2019: 0x92, 0x201c: 0x93, 0x201d: 0x94, 0x2013: 0x96, 0x2014: 0x97, 0x2022: 0x95, 0x2026: 0x85, 0x20ac: 0x80, 0x2122: 0x99 };
    var SYM = { "\u2264": "<=", "\u2265": ">=", "\u2260": "!=", "\u2192": "->", "\u2190": "<-", "\u2248": "~", "\u221a": "sqrt", "\u2211": "sum", "\u2212": "-", "\u2011": "-", "\u2009": " ", "\u202f": " ", "\u2003": " ", "\u2002": " " };
    var LETTER = /[\p{L}\p{N}]/u;

    /* returns a byte-per-char string, or null when the text needs a real font */
    function latin(s) {
      var out = "";
      for (var ch of String(s)) {
        var c = ch.codePointAt(0);
        if (SYM[ch] != null) out += SYM[ch];
        else if (c === 9) out += "  ";
        else if (c === 0x200b || c === 0xfeff || c === 0x200d || c === 0xfe0f) continue;
        else if (c >= 32 && c < 127) out += ch;
        else if (c >= 160 && c <= 255) out += ch;
        else if (CP[c]) out += String.fromCharCode(CP[c]);
        else if (LETTER.test(ch)) return null;
        /* emoji and other pictographs are dropped */
      }
      return out;
    }
    function width(s, bold, size) {
      var t = bold ? WB : WR, w = 0;
      for (var i = 0; i < s.length; i++) {
        var c = s.charCodeAt(i);
        w += c >= 32 && c < 127 ? t[c - 32] : 556;
      }
      return (w * size) / 1000;
    }
    function pesc(s) { return s.replace(/[\\()]/g, "\\$&"); }

    function pdf(question, text) {
      var PW = 595, PH = 842, M = 56, CW = PW - M * 2;
      var pages = [[]], y = M, cur = pages[0];
      function bad() { throw new Error("nolatin"); }
      function L(s) { var v = latin(s); if (v == null) bad(); return v; }
      function newPage() { cur = []; pages.push(cur); y = M; }
      function line(segs, size, lead, x, color, mark, bg) {
        if (y + lead > PH - M - 10) newPage();
        y += lead;
        if (bg) cur.push(bg + " rg " + (M - 5) + " " + (PH - y - 5).toFixed(2) + " " + (CW + 10) + " " + lead + " re f");
        if (mark) cur.push("BT " + color + " rg " + M + " " + (PH - y).toFixed(2) + " Td /F1 " + size + " Tf (" + pesc(mark) + ") Tj ET");
        var ops = "BT " + color + " rg " + x.toFixed(2) + " " + (PH - y).toFixed(2) + " Td ";
        segs.forEach(function (g) { ops += "/" + (g.b ? "F2" : "F1") + " " + size + " Tf (" + pesc(g.s) + ") Tj "; });
        cur.push(ops + "ET");
      }
      function flow(list, size, lead, indent, color, mark, bg) {
        var words = [];
        list.forEach(function (r) {
          L(r.s).split(/(\s+)/).forEach(function (w) { if (w) words.push({ s: w, b: r.b }); });
        });
        var lines = [[]], lw = 0, avail = CW - indent;
        words.forEach(function (w) {
          var ww = width(w.s, w.b, size), sp = /^\s+$/.test(w.s);
          if (sp && !lines[lines.length - 1].length) return;
          if (!sp && lw + ww > avail && lines[lines.length - 1].length) {
            var last = lines[lines.length - 1];
            while (last.length && /^\s+$/.test(last[last.length - 1].s)) last.pop();
            lines.push([]); lw = 0;
          }
          lines[lines.length - 1].push(w); lw += ww;
        });
        var first = true;
        lines.forEach(function (ln) {
          if (!ln.length) return;
          line(ln, size, lead, M + indent, color, first ? mark : "", bg);
          first = false;
        });
      }
      var INK = "0.122 0.161 0.216", INDIGO = "0.310 0.275 0.898", DEEP = "0.118 0.106 0.294", GREY = "0.420 0.447 0.502";
      flow([{ s: titleOf(question), b: true }], 18, 23, 0, INDIGO);
      cur.push("0.78 0.82 0.99 RG 1 w " + M + " " + (PH - y - 8) + " m " + (PW - M) + " " + (PH - y - 8) + " l S");
      y += 18;
      blocks(text).forEach(function (b) {
        if (b.t === "gap") { y += 4; return; }
        if (b.t === "h") { y += 12; flow(b.runs, 13, 19, 0, DEEP); y += 5; }
        else if (b.t === "li") {
          flow(b.runs, 11, 16, 18, INK, L(b.mark));
          y += 3;
        } else { flow(b.runs, 11, 16, 0, INK); y += 7; }
      });
      var n = pages.length;
      pages.forEach(function (pg, i) {
        var t = BRAND + "  |  Page " + (i + 1) + " of " + n;
        pg.push("BT " + GREY + " rg " + (PW - M - width(t, false, 8)).toFixed(2) + " 28 Td /F1 8 Tf (" + pesc(t) + ") Tj ET");
      });
      var objs = [];
      objs[1] = "<</Type/Catalog/Pages 2 0 R>>";
      var kids = [];
      pages.forEach(function (pg, i) {
        var stream = pg.join("\n");
        objs[5 + i * 2] = "<</Length " + stream.length + ">>\nstream\n" + stream + "\nendstream";
        objs[6 + i * 2] = "<</Type/Page/Parent 2 0 R/MediaBox[0 0 " + PW + " " + PH + "]/Resources<</Font<</F1 3 0 R/F2 4 0 R>>>>/Contents " + (5 + i * 2) + " 0 R>>";
        kids.push(6 + i * 2 + " 0 R");
      });
      objs[2] = "<</Type/Pages/Kids[" + kids.join(" ") + "]/Count " + n + ">>";
      objs[3] = "<</Type/Font/Subtype/Type1/BaseFont/Helvetica/Encoding/WinAnsiEncoding>>";
      objs[4] = "<</Type/Font/Subtype/Type1/BaseFont/Helvetica-Bold/Encoding/WinAnsiEncoding>>";
      var info = objs.length;
      objs[info] = "<</Title (" + pesc(L(titleOf(question))) + ")/Producer (" + pesc(BRAND) + ")>>";
      var out = "%PDF-1.4\n%\u00e2\u00e3\u00cf\u00d3\n", offs = [];
      for (var i = 1; i < objs.length; i++) {
        offs[i] = out.length;
        out += i + " 0 obj\n" + objs[i] + "\nendobj\n";
      }
      var xref = out.length;
      out += "xref\n0 " + objs.length + "\n0000000000 65535 f \n";
      for (i = 1; i < objs.length; i++) out += ("0000000000" + offs[i]).slice(-10) + " 00000 n \n";
      out += "trailer\n<</Size " + objs.length + "/Root 1 0 R/Info " + info + " 0 R>>\nstartxref\n" + xref + "\n%%EOF";
      var u8 = new Uint8Array(out.length);
      for (i = 0; i < out.length; i++) u8[i] = out.charCodeAt(i) & 255;
      return u8;
    }

    /* Full-Unicode fallback: open the browser's print dialog ("Save as PDF"). */
    function printPdf(question, text) {
      var h = blocks(text).map(function (b) {
        function inl(list) { return list.map(function (r) { return r.b ? "<b>" + esc(r.s) + "</b>" : esc(r.s); }).join(""); }
        if (b.t === "gap") return "";
        if (b.t === "h") return "<h3>" + inl(b.runs) + "</h3>";
        if (b.t === "li") return '<p class="li"><span>' + esc(b.mark) + "</span>" + inl(b.runs) + "</p>";
        return "<p>" + inl(b.runs) + "</p>";
      }).join("");
      var doc =
        '<!doctype html><meta charset="utf-8"><title>' + esc(fileBase(question)) + "</title><style>" +
        "body{font:14px/1.6 Arial,'Noto Sans',sans-serif;color:#1f2937;margin:0;padding:8px;-webkit-print-color-adjust:exact;print-color-adjust:exact}h1{font-size:22px;color:#4f46e5;border-bottom:2px solid #c7d2fe;padding-bottom:8px}" +
        "h3{color:#1e1b4b;background:#fff;margin:18px 0 8px;font-size:15px}p{margin:0 0 9px}.li{padding-left:22px;position:relative}.li span{position:absolute;left:4px}" +
        "</style><h1>" + esc(titleOf(question)) + "</h1>" + h;
      var f = document.createElement("iframe");
      f.setAttribute("aria-hidden", "true");
      f.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
      document.body.appendChild(f);
      f.contentDocument.open();
      f.contentDocument.write(doc);
      f.contentDocument.close();
      setTimeout(function () {
        try { f.contentWindow.focus(); f.contentWindow.print(); } catch (e) {}
        setTimeout(function () { f.remove(); }, 60000);
      }, 250);
    }

    function save(name, bytes, mime) {
      var url = URL.createObjectURL(new Blob([bytes], { type: mime }));
      var a = document.createElement("a");
      a.href = url; a.download = name; a.style.display = "none";
      /* keep this synthetic click from reaching the "click outside closes the panel" handler */
      a.addEventListener("click", function (e) { e.stopPropagation(); });
      document.body.appendChild(a);
      a.click();
      setTimeout(function () { a.remove(); URL.revokeObjectURL(url); }, 2000);
    }
    function copy(text) {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        return navigator.clipboard.writeText(text).catch(function () { return legacy(text); });
      }
      return legacy(text);
    }
    function legacy(text) {
      return new Promise(function (ok, no) {
        var t = document.createElement("textarea");
        t.value = text; t.setAttribute("readonly", "");
        t.style.cssText = "position:fixed;top:0;left:0;opacity:0";
        document.body.appendChild(t);
        t.select();
        var done = false;
        try { done = document.execCommand("copy"); } catch (e) {}
        t.remove();
        done ? ok() : no();
      });
    }

    return {
      docx: docx, pdf: pdf, print: printPdf, save: save, copy: copy, stamp: stamp,
      plain: plain, fileBase: fileBase, title: titleOf, blocks: blocks,
      _blocks: blocks
    };
  })();

  function init() {
    var bar = document.getElementById("ah-chatbar");
    if (!bar) return;

    var form = document.getElementById("ah-cb-form");
    var input = document.getElementById("ah-cb-input");
    var sendBtn = document.getElementById("ah-cb-send");
    var micBtn = document.getElementById("ah-cb-mic");
    var panel = document.getElementById("ah-cb-panel");
    var log = document.getElementById("ah-cb-log");
    var closeBtn = document.getElementById("ah-cb-close");
    var clearBtn = document.getElementById("ah-cb-clear");
    var filesBox = document.getElementById("ah-cb-files");
    var attachBtn = document.getElementById("ah-cb-attach");
    var menu = document.getElementById("ah-cb-menu");
    var fileInput = document.getElementById("ah-cb-fileinput");
    var camInput = document.getElementById("ah-cb-caminput");
    var quotaEl = document.getElementById("ah-cb-quota");
    var quickEl = document.getElementById("ah-cb-quick");
    var noteEl = document.getElementById("ah-cb-note");

    var wrapEl = bar.querySelector(".ah-cb-wrap");

    /* Shorter placeholder on phones so the collapsed bar stays on one line. */
    if (window.innerWidth < 480) input.setAttribute("placeholder", "Ask or message anything");

    var busy = false;
    var focused = false;
    var dragging = false;
    var files = []; // files staged in the composer
    var uid = 0;
    var fileContext = ""; // text of earlier attachments, kept in memory only
    var quota = { limit: 10, used: 0, pro: false, windowMinutes: 60 };
    var quickMode = "";
    var noteTimer = null;
    var lastFocus = null;

    fileInput.setAttribute("accept", ACCEPT);

    /* ---------- notices ---------- */
    function setNote(msg, ok) {
      clearTimeout(noteTimer);
      noteEl.textContent = msg;
      noteEl.className = "ah-cb-note show" + (ok ? " ok" : "");
      noteTimer = setTimeout(function () {
        noteEl.className = "ah-cb-note";
      }, 6000);
    }

    /* ---------- panel + scrolling ---------- */
    /* While a conversation is open the message box sits at the bottom of the screen and the answers
       stack above it (like a chat app). A spacer keeps the page from jumping when it leaves the hero. */
    var collapsedH = 0;
    function measureCollapsed() {
      if (!bar.classList.contains("docked") && !form.classList.contains("is-open")) {
        collapsedH = Math.round(wrapEl.getBoundingClientRect().height) || collapsedH;
      }
    }
    function dock(on) {
      if (on === bar.classList.contains("docked")) return;
      if (on) {
        measureCollapsed();
        if (collapsedH) wrapEl.style.height = collapsedH + "px";
      } else {
        wrapEl.style.height = "";
      }
      bar.classList.toggle("docked", on);
    }
    function openPanel(open) {
      panel.classList.toggle("open", open);
      dock(open);
      if (open) window.dispatchEvent(new CustomEvent("ah-assistant-open"));
    }
    measureCollapsed();
    window.addEventListener("resize", measureCollapsed);
    function scrollDown() {
      log.scrollTop = log.scrollHeight;
    }

    /* ---------- messages ---------- */
    /* Shows an answer as clean text: no markdown symbols, headings highlighted. */
    function renderAnswer(span, text) {
      span.textContent = "";
      EX.blocks(text).forEach(function (b) {
        if (b.t === "gap") return;
        var t = b.runs.map(function (r) { return r.s; }).join("");
        var d;
        if (b.t === "h") {
          d = el("div", "ah-cb-hd");
          d.textContent = t;
        } else if (b.t === "li") {
          d = el("div", "ah-cb-li");
          var mk = el("span", "ah-cb-mk");
          mk.textContent = b.mark;
          var tx = el("span", "ah-cb-lt");
          tx.textContent = t;
          d.appendChild(mk);
          d.appendChild(tx);
        } else {
          d = el("div", "ah-cb-p");
          d.textContent = t;
        }
        span.appendChild(d);
      });
    }
    function addMessage(role, text, opts) {
      opts = opts || {};
      var isUser = role === "user";
      var box = el("div", "ah-cb-msg " + (isUser ? "user" : "bot"));

      if (isUser && opts.fileNames && opts.fileNames.length) {
        var row = el("div", "ah-cb-mfiles");
        opts.fileNames.forEach(function (name, i) {
          var b = el("button", "ah-cb-mf");
          b.type = "button";
          b.innerHTML = svg("file") + "<span>" + esc(name) + "</span>";
          if (opts.files && opts.files[i]) {
            b.setAttribute("aria-label", "View " + name);
            b.addEventListener("click", function () {
              openViewer(opts.files, i);
            });
          } else {
            b.disabled = true;
            b.title = "Preview is only available in the session where the file was attached";
          }
          row.appendChild(b);
        });
        box.appendChild(row);
      }

      var span = el("span", "ah-cb-txt");
      box.appendChild(span);
      log.appendChild(box);

      function finish() {
        if (isUser) span.textContent = text;
        else renderAnswer(span, text);
        if (!isUser) {
          if (!opts.noExport) {
            var acts = el("div", "ah-cb-acts");
            acts.setAttribute("role", "group");
            acts.setAttribute("aria-label", "Copy or download this answer");
            var mk = function (icon, label, title, fn) {
              var b = el("button", "ah-cb-act", svg(icon) + "<span>" + label + "</span>");
              b.type = "button";
              b.title = title;
              b.addEventListener("click", function () {
                var t = b.querySelector("span");
                var flash = function (msg) {
                  t.textContent = msg;
                  setTimeout(function () {
                    t.textContent = label;
                  }, 1600);
                };
                fn(flash);
              });
              acts.appendChild(b);
            };
            var question = function () {
              var n = box.previousElementSibling;
              while (n) {
                if (n.classList.contains("user")) {
                  var q = n.querySelector(".ah-cb-txt");
                  return q ? q.textContent : "";
                }
                n = n.previousElementSibling;
              }
              return "";
            };
            mk("copy", "Copy", "Copy the answer", function (flash) {
              EX.copy(EX.plain(text)).then(function () { flash("Copied"); }, function () { flash("Press Ctrl+C"); });
            });
            mk("dl", "PDF", "Download as PDF", function (flash) {
              try {
                EX.save(EX.fileBase(question()) + ".pdf", EX.pdf(question(), text), "application/pdf");
                flash("Saved");
              } catch (err) {
                EX.print(question(), text);
                setNote("In the print window, choose \u201cSave as PDF\u201d as the destination.", true);
                flash("PDF");
              }
            });
            mk("dl", "Word", "Download as Word document (.docx)", function (flash) {
              try {
                EX.save(
                  EX.fileBase(question()) + ".docx",
                  EX.docx(question(), text),
                  "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                );
                flash("Saved");
              } catch (err) {
                flash("Failed");
              }
            });
            box.appendChild(acts);
          }
          if (opts.footnote) box.appendChild(el("div", "ah-cb-fnote", esc(opts.footnote)));
        }
        scrollDown();
      }

      if (!isUser && opts.animate && !reduceMotion && text.length > 80) {
        var tokens = EX.plain(text).split(/(\s+)/);
        var i = 0;
        var step = Math.max(2, Math.ceil(tokens.length / 40));
        (function tick() {
          i += step;
          if (i >= tokens.length) return finish();
          span.textContent = tokens.slice(0, i).join("");
          scrollDown();
          setTimeout(tick, 28);
        })();
      } else {
        finish();
      }
      return box;
    }

    function addThinking(hasFiles) {
      var labels = hasFiles
        ? ["Reading your files\u2026", "Finding the requirements\u2026", "Writing your answer\u2026"]
        : ["Thinking\u2026", "Writing your answer\u2026"];
      var box = el("div", "ah-cb-msg bot ah-cb-think");
      box.setAttribute("role", "status");
      box.setAttribute("aria-label", "Assistant is working on your answer");

      // Plain orbit loader: a ring with a turning arc and a softly pulsing centre dot.
      box.innerHTML =
        '<svg class="ah-cb-orb" viewBox="0 0 40 40" aria-hidden="true">' +
        '<circle class="trk" cx="20" cy="20" r="14"/><circle class="arc" cx="20" cy="20" r="14"/>' +
        '<circle class="dot" cx="20" cy="20" r="3.4"/></svg>' +
        '<span class="lbl">' + esc(labels[0]) + "</span>";
      log.appendChild(box);

      var lbl = box.querySelector(".lbl");
      var at = 0;
      var timer = setInterval(function () {
        if (at >= labels.length - 1) return;
        at++;
        lbl.textContent = labels[at];
      }, 2500);
      scrollDown();
      box.stop = function () {
        clearInterval(timer);
        box.remove();
      };
      return box;
    }

    /* ---------- free-use meter ---------- */
    function renderQuota() {
      var left = Math.max(0, quota.limit - quota.used);
      if (quota.pro) {
        quotaEl.className = "ah-cb-quota pro";
        quotaEl.innerHTML = svg("spark") + '<span class="txt">Unlimited</span>';
        quotaEl.setAttribute("aria-label", "Unlimited plan active");
        return;
      }
      var dots = "";
      for (var i = 0; i < quota.limit; i++) dots += '<i class="' + (i < left ? "" : "used") + '"></i>';
      quotaEl.className = "ah-cb-quota" + (left === 0 ? " out" : left === 1 ? " low" : "");
      quotaEl.innerHTML =
        '<span class="dots" aria-hidden="true">' + dots + "</span>" +
        '<span class="txt">' + (left === 0 ? "Upgrade" : left + " free left") + "</span>";
      quotaEl.setAttribute(
        "aria-label",
        left === 0 ? "Free questions used. See the unlimited plan" : left + " free questions left. See the unlimited plan"
      );
    }
    function applyUsage(u) {
      if (!u) return;
      quota.limit = u.limit || quota.limit;
      quota.windowMinutes = u.windowMinutes || quota.windowMinutes;
      quota.used = u.blocked ? quota.limit : u.used;
      quota.pro = !!u.pro;
      renderQuota();
    }
    function syncStatus() {
      fetch("/api/chat/status", { headers: { Accept: "application/json" } })
        .then(function (r) {
          return r.json();
        })
        .then(function (d) {
          if (d && d.usage) applyUsage(d.usage);
        })
        .catch(function () {});
    }

    /* ---------- composer state ---------- */
    function allReady() {
      return files.every(function (f) {
        return f.status === "ready";
      });
    }
    function updateSendState() {
      sendBtn.disabled = busy || !(input.value.trim() || files.length) || !allReady();
    }
    function autoGrow() {
      input.style.height = "auto";
      input.style.height = Math.min(input.scrollHeight, 220) + "px";
    }
    function renderQuick() {
      var mode = files.length ? "files" : "plain";
      if (mode === quickMode) return;
      quickMode = mode;
      var sets = {
        files: ["Do what the file asks", "List every requirement", "Give me a step-by-step solution"],
        plain: ["Help me plan an essay", "Explain this step by step", "How do I place an order?"]
      };
      var inner = el("div");
      sets[mode].forEach(function (label) {
        var b = el("button", "", esc(label));
        b.type = "button";
        b.addEventListener("click", function () {
          input.value = label;
          input.focus();
          autoGrow();
          updateState();
        });
        inner.appendChild(b);
      });
      quickEl.innerHTML = "";
      quickEl.appendChild(inner);
    }
    function updateState() {
      var hasText = !!input.value.trim();
      form.classList.toggle("is-open", focused || dragging || files.length > 0 || hasText);
      form.classList.toggle("has-text", hasText);
      renderQuick();
      updateSendState();
      autoGrow();
    }

    form.addEventListener("focusin", function () {
      focused = true;
      window.dispatchEvent(new CustomEvent("ah-assistant-open"));
      if (history.length) openPanel(true);
      updateState();
    });
    form.addEventListener("focusout", function () {
      setTimeout(function () {
        focused = form.contains(document.activeElement);
        updateState();
      }, 0);
    });
    // Once the mouse leaves an empty, unfocused composer, make sure it's
    // back to its collapsed resting size (covers the case where it was
    // opened by hover/inspection rather than a real focus).
    wrapEl.addEventListener("mouseleave", function () {
      if (dragging || files.length || input.value.trim()) return;
      if (document.activeElement === input || form.contains(document.activeElement)) {
        input.blur();
      }
      focused = false;
      updateState();
    });
    // Clicking anywhere on the bar opens it and puts the cursor in the box.
    form.addEventListener("click", function (e) {
      if (!e.target.closest("button, input, a, textarea")) input.focus();
    });

    /* ---------- attaching files ---------- */
    function toggleMenu(open) {
      menu.hidden = !open;
      attachBtn.setAttribute("aria-expanded", open ? "true" : "false");
    }
    // While the bar is collapsed, keep the button from taking focus on press so the
    // layout doesn't jump before the click lands (focus opens the bar).
    var chevBtn = document.getElementById("ah-cb-chev");
    [attachBtn, micBtn, chevBtn].forEach(function (b) {
      b.addEventListener("mousedown", function (e) {
        if (!form.classList.contains("is-open")) e.preventDefault();
      });
    });
    chevBtn.addEventListener("click", function () {
      input.focus();
    });
    attachBtn.addEventListener("click", function () {
      toggleMenu(menu.hidden);
      input.focus();
    });
    menu.addEventListener("click", function (e) {
      var b = e.target.closest("button[data-act]");
      if (!b) return;
      toggleMenu(false);
      (b.getAttribute("data-act") === "cam" ? camInput : fileInput).click();
    });
    fileInput.addEventListener("change", function () {
      addFiles(fileInput.files);
      fileInput.value = "";
    });
    camInput.addEventListener("change", function () {
      addFiles(camInput.files);
      camInput.value = "";
    });

    function buildChip(rec) {
      var chip = el("div", "ah-cb-file reading");
      chip.setAttribute("role", "listitem");
      var view = el("button", "ah-cb-fview");
      view.type = "button";
      view.setAttribute("aria-label", "View " + rec.name);
      view.innerHTML =
        '<span class="ah-cb-thumb"><span class="lbl">' + esc(extLabel(rec)) + "</span>" +
        '<span class="ah-cb-tick">' + svg("check") + "</span></span>" +
        '<span class="ah-cb-fmeta"><b>' + esc(rec.name) + "</b><i></i></span>";
      view.addEventListener("click", function () {
        openViewer(files, files.indexOf(rec));
      });
      var x = el("button", "ah-cb-fx", svg("x"));
      x.type = "button";
      x.setAttribute("aria-label", "Remove " + rec.name);
      x.addEventListener("click", function () {
        removeFile(rec);
      });
      chip.appendChild(view);
      chip.appendChild(x);
      rec.el = chip;
      refreshChip(rec);
      return chip;
    }
    function refreshChip(rec) {
      if (!rec.el) return;
      var ready = rec.status === "ready";
      rec.el.classList.toggle("reading", !ready);
      rec.el.classList.toggle("ready", ready);
      rec.el.style.setProperty("--p", (rec.p || 0) + "%");
      var thumb = rec.el.querySelector(".ah-cb-thumb");
      rec.el.querySelector(".ah-cb-fmeta i").textContent =
        (ready ? kindLabel(rec) + " \u00b7 " + fmtSize(rec.size) : "Reading\u2026");
      if (rec.kind === "image" && rec.url && !thumb.querySelector("img")) {
        var im = new Image();
        im.alt = "";
        im.src = rec.url;
        thumb.insertBefore(im, thumb.firstChild);
        var lbl = thumb.querySelector(".lbl");
        if (lbl) lbl.style.display = "none";
      }
    }
    function mountChips() {
      files.forEach(function (rec) {
        if (!rec.el) filesBox.appendChild(buildChip(rec));
        else if (rec.el.parentNode !== filesBox) filesBox.appendChild(rec.el);
      });
    }
    function removeFile(rec) {
      files = files.filter(function (f) {
        return f !== rec;
      });
      if (rec.el && rec.el.parentNode) rec.el.remove();
      if (rec.url && !rec.sent) URL.revokeObjectURL(rec.url);
      updateState();
    }

    function prepare(rec) {
      var step = rec.kind === "image" ? downscale(rec.file) : Promise.resolve(rec.file);
      step
        .then(function (f) {
          rec.file = f;
          rec.size = f.size;
          rec.url = URL.createObjectURL(f);
          return new Promise(function (resolve) {
            var r = new FileReader();
            r.onprogress = function (e) {
              if (e.lengthComputable) {
                rec.p = Math.round((e.loaded / e.total) * 100);
                refreshChip(rec);
              }
            };
            r.onload = function () {
              resolve(true);
            };
            r.onerror = function () {
              resolve(false);
            };
            r.readAsArrayBuffer(f.slice(0, 1048576));
          });
        })
        .then(function (ok) {
          if (files.indexOf(rec) === -1) return;
          if (!ok) {
            setNote("Couldn't read " + rec.name + ". Try attaching it again.");
            return removeFile(rec);
          }
          rec.p = 100;
          setTimeout(function () {
            if (files.indexOf(rec) === -1) return;
            rec.status = "ready";
            refreshChip(rec);
            updateSendState();
          }, 350);
        });
    }

    function addFiles(list) {
      var arr = Array.prototype.slice.call(list || []);
      var full = false;
      arr.forEach(function (f) {
        var kind = kindOf(f);
        if (!kind) {
          setNote(
            (f.name || "That file") + " isn\u2019t supported. Attach a PDF, Word (.docx), text file or image."
          );
          return;
        }
        if (f.size > MAX_FILE_MB * 1048576) {
          setNote(f.name + " is over " + MAX_FILE_MB + " MB.");
          return;
        }
        if (files.length >= MAX_FILES) {
          full = true;
          return;
        }
        var dup = files.some(function (x) {
          return x.name === f.name && x.size === f.size;
        });
        if (dup) return;
        var rec = { id: ++uid, name: f.name, size: f.size, kind: kind, file: f, url: null, status: "reading", p: 0 };
        files.push(rec);
        prepare(rec);
      });
      if (full) setNote("You can attach up to " + MAX_FILES + " files per question.");
      mountChips();
      updateState();
    }

    /* drag, drop and paste */
    function hasFiles(e) {
      var t = e.dataTransfer && e.dataTransfer.types;
      return !!t && Array.prototype.indexOf.call(t, "Files") !== -1;
    }
    function inForm(e) {
      return !!(e.target && e.target.closest && e.target.closest("#hero"));
    }
    var depth = 0;
    document.addEventListener("dragenter", function (e) {
      if (!hasFiles(e) || inForm(e)) return;
      depth++;
      dragging = true;
      form.classList.add("ah-drag");
      updateState();
    });
    document.addEventListener("dragleave", function (e) {
      if (!hasFiles(e)) return;
      depth = Math.max(0, depth - 1);
      if (!depth) {
        dragging = false;
        form.classList.remove("ah-drag");
        updateState();
      }
    });
    document.addEventListener("dragover", function (e) {
      if (hasFiles(e) && !inForm(e)) e.preventDefault();
    });
    document.addEventListener("drop", function (e) {
      if (!hasFiles(e) || inForm(e)) return;
      e.preventDefault();
      depth = 0;
      dragging = false;
      form.classList.remove("ah-drag");
      addFiles(e.dataTransfer.files);
      input.focus();
    });
    input.addEventListener("paste", function (e) {
      var items = (e.clipboardData && e.clipboardData.files) || [];
      if (items.length) {
        e.preventDefault();
        addFiles(items);
      }
    });

    /* ---------- dialogs ---------- */
    var activeModal = null;
    function closeModal() {
      if (!activeModal) return;
      activeModal.remove();
      activeModal = null;
      document.body.style.overflow = "";
      if (lastFocus && lastFocus.focus) lastFocus.focus();
    }
    function openModal(dlg, label) {
      closeModal();
      lastFocus = document.activeElement;
      var m = el("div", "ah-cb-modal");
      dlg.setAttribute("role", "dialog");
      dlg.setAttribute("aria-modal", "true");
      dlg.setAttribute("aria-label", label);
      m.appendChild(dlg);
      m.addEventListener("mousedown", function (e) {
        if (e.target === m) closeModal();
      });
      m.addEventListener("keydown", function (e) {
        if (e.key !== "Tab") return;
        var f = dlg.querySelectorAll("button:not([disabled]), input, a[href], iframe");
        if (!f.length) return;
        var first = f[0];
        var last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      });
      document.body.appendChild(m);
      document.body.style.overflow = "hidden";
      activeModal = m;
      return m;
    }

    function openViewer(list, index) {
      var rec = list[index];
      if (!rec) return;
      var dlg = el("div", "ah-cb-dlg");
      var head = el("div", "ah-cb-dh");
      var t = el("div", "t", "<b>" + esc(rec.name) + "</b><small>" + kindLabel(rec) + " \u00b7 " + fmtSize(rec.size) + "</small>");
      head.appendChild(t);
      if (list.length > 1) {
        [["prev", -1, "Previous file", "M15 6l-6 6 6 6"], ["next", 1, "Next file", "M9 6l6 6-6 6"]].forEach(function (d) {
          var b = el("button", "ah-cb-ib", '<svg class="ic" viewBox="0 0 24 24"><path d="' + d[3] + '"/></svg>');
          b.type = "button";
          b.setAttribute("aria-label", d[2]);
          b.addEventListener("click", function () {
            var next = (index + d[1] + list.length) % list.length;
            openViewer(list, next);
          });
          head.appendChild(b);
        });
      }
      var cls = el("button", "ah-cb-ib", svg("x"));
      cls.type = "button";
      cls.setAttribute("aria-label", "Close preview");
      cls.addEventListener("click", closeModal);
      head.appendChild(cls);
      var body = el("div", "ah-cb-db");

      if (rec.kind === "image" && rec.url) {
        var im = new Image();
        im.alt = rec.name;
        im.src = rec.url;
        body.appendChild(im);
      } else if (rec.kind === "pdf" && rec.url) {
        var fr = el("iframe");
        fr.src = rec.url;
        fr.title = rec.name;
        body.style.display = "block";
        body.appendChild(fr);
      } else if (rec.kind === "text" && rec.file) {
        var pre = el("pre");
        pre.textContent = "Loading\u2026";
        body.appendChild(pre);
        rec.file
          .slice(0, 30000)
          .text()
          .then(function (txt) {
            pre.textContent = txt + (rec.size > 30000 ? "\n\n\u2026 (preview shows the first part of the file)" : "");
          });
      } else {
        body.appendChild(
          el(
            "div",
            "none",
            svg("file") +
              "<div>This file type can\u2019t be previewed here, but the assistant reads its full text when you send it.</div>"
          )
        );
      }
      dlg.appendChild(head);
      dlg.appendChild(body);
      openModal(dlg, "File preview: " + rec.name);
      cls.focus();
    }

    /* Free allowance is over: send the visitor straight to Stripe Checkout ($20/month).
       If checkout can't be opened, fall back to the paywall dialog so they can retry. */
    var redirecting = false;
    function autoCheckout(data) {
      if (redirecting) return;
      redirecting = true;
      setNote(((data && data.message) || "Your free chats are over.") + " Taking you to secure checkout\u2026");
      fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}"
      })
        .then(function (r) {
          return r.json().catch(function () {
            return {};
          });
        })
        .then(function (d) {
          if (d && d.url) {
            setTimeout(function () {
              window.location.href = d.url;
            }, 1200);
            return;
          }
          throw new Error((d && d.message) || "");
        })
        .catch(function () {
          redirecting = false;
          openPaywall(true, data && data.reason);
        });
    }

    function openPaywall(exhausted, reason) {
      var dlg = el("div", "ah-cb-dlg ah-cb-pay");
      var title = exhausted
        ? reason === "time"
          ? "Your free " + quota.windowMinutes + " minutes are up"
          : "You\u2019ve used your " + quota.limit + " free questions"
        : "Unlimited questions for $20/month";
      var sub = exhausted
        ? "Subscribe to keep asking questions and attaching files."
        : "You get " + quota.limit + " free questions or " + quota.windowMinutes + " minutes, whichever comes first. Subscribe when you want to go beyond that.";
      dlg.innerHTML =
        '<button type="button" class="ah-cb-mclose" aria-label="Close">' + svg("x") + "</button>" +
        '<div class="ah-cb-badge">' + svg("spark") + "</div>" +
        '<div class="ah-cb-h" role="heading" aria-level="2">' + esc(title) + "</div>" +
        '<p class="ah-cb-sub">' + esc(sub) + "</p>" +
        '<div class="ah-cb-plan"><div class="ah-cb-price"><b>$20</b><span>per month</span></div>' +
        "<ul><li>Unlimited questions</li><li>Reads PDFs, Word files and photos</li><li>Renews automatically every month</li><li>Cancel anytime</li></ul></div>" +
        '<label for="ah-cb-email">Email for your account and receipt (optional)</label>' +
        '<input id="ah-cb-email" type="email" autocomplete="email" placeholder="you@example.com">' +
        '<div class="ah-cb-payerr" role="alert"></div>' +
        '<button type="button" class="ah-cb-cta">Sign up for $20/month</button>' +
        '<button type="button" class="ah-cb-later">Not now</button>' +
        '<div class="ah-cb-fine">Secure checkout by Stripe. You are charged $20 today and then automatically every month until you cancel. Cancel anytime from your account page.</div>';
      openModal(dlg, title);
      var emailEl = dlg.querySelector("#ah-cb-email");
      var errEl = dlg.querySelector(".ah-cb-payerr");
      var cta = dlg.querySelector(".ah-cb-cta");
      dlg.querySelector(".ah-cb-mclose").addEventListener("click", closeModal);
      dlg.querySelector(".ah-cb-later").addEventListener("click", closeModal);
      emailEl.focus();
      function go() {
        var email = emailEl.value.trim();
        if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          errEl.textContent = "That email address doesn\u2019t look right.";
          emailEl.focus();
          return;
        }
        errEl.textContent = "";
        cta.disabled = true;
        cta.textContent = "Opening secure checkout\u2026";
        fetch("/api/billing/checkout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: email })
        })
          .then(function (r) {
            return r.json().catch(function () {
              return {};
            });
          })
          .then(function (d) {
            if (d && d.url) {
              window.location.href = d.url;
              return;
            }
            throw new Error((d && d.message) || "");
          })
          .catch(function (err) {
            cta.disabled = false;
            cta.textContent = "Sign up for $20/month";
            errEl.textContent =
              (err && err.message) || "Checkout isn\u2019t available right now. Please try again in a moment.";
          });
      }
      cta.addEventListener("click", go);
      emailEl.addEventListener("keydown", function (e) {
        if (e.key === "Enter") {
          e.preventDefault();
          go();
        }
      });
    }
    quotaEl.addEventListener("click", function () {
      if (!quota.pro) openPaywall(quota.used >= quota.limit);
    });

    /* ---------- basic wiring ---------- */
    history.forEach(function (turn) {
      addMessage(turn.role, turn.content, { fileNames: turn.files });
    });

    input.addEventListener("input", updateState);
    input.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
        e.preventDefault();
        if (!sendBtn.disabled) form.requestSubmit();
      }
    });
    closeBtn.addEventListener("click", function () {
      openPanel(false);
    });
    // When the human live chat opens, the assistant collapses (only one chat is open at a time).
    window.addEventListener("ah-livechat-open", function () {
      openPanel(false);
      var ae = document.activeElement;
      if (ae && form.contains(ae) && ae.blur) ae.blur();
      focused = false;
      updateState();
    });
    // Ctrl+U (Cmd+U on Mac) opens the file picker straight away.
    document.addEventListener("keydown", function (e) {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && (e.key === "u" || e.key === "U")) {
        e.preventDefault();
        toggleMenu(false);
        fileInput.click();
      }
    });
    document.addEventListener("keydown", function (e) {
      if (e.key !== "Escape") return;
      if (activeModal) return closeModal();
      if (!menu.hidden) {
        toggleMenu(false);
        return attachBtn.focus();
      }
      openPanel(false);
    });
    document.addEventListener("click", function (e) {
      if (e.target.closest && e.target.closest(".ah-cb-modal")) return;
      if (!menu.hidden && !e.target.closest(".ah-cb-attachwrap")) toggleMenu(false);
      if (!bar.contains(e.target)) openPanel(false);
    });

    function newChat() {
      history = [];
      fileContext = "";
      persist();
      log.innerHTML = "";
      openPanel(false);
      input.value = "";
      updateState();
      input.focus();
    }
    clearBtn.addEventListener("click", newChat);

    // Voice dictation (only shown where the browser supports it).
    var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SR) {
      micBtn.hidden = false;
      var rec = null;
      var listening = false;
      var baseText = "";
      micBtn.addEventListener("click", function () {
        input.focus();
        if (listening && rec) {
          rec.stop();
          return;
        }
        rec = new SR();
        rec.lang = navigator.language || "en-US";
        rec.interimResults = true;
        rec.continuous = false;
        baseText = input.value ? input.value.replace(/\s+$/, "") + " " : "";
        rec.onstart = function () {
          listening = true;
          micBtn.classList.add("on");
        };
        rec.onresult = function (ev) {
          var t = "";
          for (var i = 0; i < ev.results.length; i++) t += ev.results[i][0].transcript;
          input.value = (baseText + t).slice(0, 2000);
          updateState();
        };
        var stop = function () {
          listening = false;
          micBtn.classList.remove("on");
        };
        rec.onend = stop;
        rec.onerror = stop;
        try {
          rec.start();
        } catch (err) {
          stop();
        }
      });
    }

    /* ---------- sending ---------- */
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      send();
    });

    function send() {
      if (busy) return;
      var text = input.value.trim();
      if (!text && !files.length) return;
      if (!allReady()) return;
      if (!quota.pro && quota.used >= quota.limit) {
        autoCheckout({ message: "Your free chats are over." });
        return;
      }

      var staged = files.slice();
      var names = staged.map(function (f) {
        return f.name;
      });
      var msg =
        text ||
        (staged.length > 1
          ? "Please read the attached files and do what they ask."
          : "Please read the attached file and do what it asks.");

      openPanel(true);
      var userEl = addMessage("user", msg, { fileNames: names, files: staged });
      history.push({ role: "user", content: msg, files: names });
      persist();

      staged.forEach(function (f) {
        f.sent = true;
        if (f.el) f.el.remove();
      });
      files = [];
      input.value = "";
      busy = true;
      updateState();
      var thinking = addThinking(staged.length > 0);

      function restore() {
        history.pop();
        persist();
        if (userEl.parentNode) userEl.remove();
        input.value = text;
        staged.forEach(function (f) {
          f.sent = false;
        });
        files = staged;
        mountChips();
      }

      var fd = new FormData();
      fd.append("message", msg);
      fd.append(
        "history",
        JSON.stringify(
          history.slice(-13, -1).map(function (t) {
            return { role: t.role, content: t.content };
          })
        )
      );
      if (fileContext) fd.append("fileContext", fileContext);
      staged.forEach(function (f) {
        fd.append("files", f.file, f.file.name);
      });

      fetch("/api/chat", { method: "POST", body: fd, headers: { Accept: "application/json" } })
        .then(function (res) {
          return res
            .json()
            .catch(function () {
              return {};
            })
            .then(function (data) {
              return { ok: res.ok, status: res.status, data: data || {} };
            });
        })
        .then(function (r) {
          thinking.stop();
          if (r.status === 402) {
            restore();
            quota.used = quota.limit;
            if (r.data.usage) applyUsage(r.data.usage);
            renderQuota();
            autoCheckout(r.data);
            return;
          }
          if (r.ok && r.data.reply) {
            addMessage("assistant", r.data.reply, { animate: true, footnote: r.data.notice });
            history.push({ role: "assistant", content: r.data.reply });
            persist();
            if (typeof r.data.fileContext === "string") fileContext = r.data.fileContext;
            applyUsage(r.data.usage);
            return;
          }
          restore();
          addMessage(
            "assistant",
            r.data.message ||
              "Sorry, something went wrong. Your message is back in the box, so you can try again or email support@assignmenthelp.com.",
            { noExport: true }
          );
        })
        .catch(function () {
          thinking.stop();
          restore();
          addMessage(
            "assistant",
            "I'm having trouble connecting right now. Your message is back in the box, so you can try again shortly or email support@assignmenthelp.com.",
            { noExport: true }
          );
        })
        .then(function () {
          busy = false;
          updateState();
          input.focus();
        });
    }

    /* ---------- return from checkout ---------- */
    try {
      var params = new URLSearchParams(window.location.search);
      var co = params.get("checkout");
      if (co) {
        var sid = params.get("session_id");
        var clean = window.location.pathname + window.location.hash;
        window.history.replaceState(null, "", clean);
        if (co === "success" && sid) {
          fetch("/api/billing/confirm?session_id=" + encodeURIComponent(sid))
            .then(function (r) {
              return r.json();
            })
            .then(function (d) {
              if (d && d.success) {
                quota.pro = true;
                renderQuota();
                setNote("You\u2019re on Unlimited. Thanks for signing up!", true);
                form.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "center" });
              } else {
                setNote((d && d.message) || "We couldn\u2019t confirm your payment yet. Refresh in a minute or email support.");
              }
            })
            .catch(function () {
              setNote("We couldn\u2019t confirm your payment yet. Refresh in a minute or email support.");
            });
        }
      }
    } catch (err) {
      /* ignore malformed URLs */
    }

    renderQuota();
    updateState();
    setTimeout(syncStatus, 800);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
