/* ==========================================================================
   APPLY.JS  —  loads CMS content and applies it to the static page.
   --------------------------------------------------------------------------
   Loads BEFORE app.js. Fetches data/content.json (falls back to
   data/content.default.json, then to whatever is already in the HTML).

   Exposes:
     window.__CMS__      the resolved content object (or undefined)
     window.__cmsReady   a Promise that resolves (to the object or null)
                         once content is fetched + applied. app.js awaits it.

   The editor (admin/editor.js) reuses the same [data-cms*] attributes.
   ========================================================================== */
(function () {
  "use strict";

  var PRIMARY = "data/content.json";
  var FALLBACK = "data/content.default.json";

  function getJSON(url) {
    return fetch(url, { cache: "no-cache" }).then(function (r) {
      if (!r.ok) throw new Error(url + " -> " + r.status);
      return r.json();
    });
  }

  var resolved = getJSON(PRIMARY)
    .catch(function () { return getJSON(FALLBACK); })
    .catch(function () { return null; });

  window.__cmsReady = resolved.then(function (data) {
    if (data) {
      window.__CMS__ = data;
      try { applyToDom(data); }
      catch (e) { if (window.console) console.warn("[cms] apply failed:", e); }
      try { document.dispatchEvent(new CustomEvent("cms:applied", { detail: data })); }
      catch (e) {}
    }
    return data || null;
  });

  /* ----------------------------------------------------------------------
     DOM APPLICATION
     ---------------------------------------------------------------------- */
  function applyToDom(d) {
    var text = d.text || {};
    var html = d.html || {};
    var settings = d.settings || {};
    var sec = d.sections || {};

    // <head> SEO
    if (d.seo) {
      if (d.seo.title) document.title = d.seo.title;
      if (d.seo.description) {
        var meta = document.querySelector('meta[name="description"]');
        if (meta) meta.setAttribute("content", d.seo.description);
      }
    }

    // data-cms          -> textContent from content.text[key]
    each("[data-cms]", function (el) {
      var v = text[el.getAttribute("data-cms")];
      if (v != null) el.textContent = v;
    });

    // data-cms-html     -> innerHTML from content.html[key]
    each("[data-cms-html]", function (el) {
      var v = html[el.getAttribute("data-cms-html")];
      if (v != null) el.innerHTML = v;
    });

    // data-cms-set      -> textContent from content.settings[key]
    each("[data-cms-set]", function (el) {
      var v = settings[el.getAttribute("data-cms-set")];
      if (v != null) el.textContent = v;
    });

    // data-cms-img      -> <img> src/srcset from content.text[key]
    each("[data-cms-img]", function (el) {
      var v = text[el.getAttribute("data-cms-img")];
      if (v) applyImg(el, v, d);
    });

    // data-cms-wa       -> rewrite wa.me/<number> in href from settings
    if (settings.whatsappNumber) {
      each("[data-cms-wa]", function (a) {
        if (a.href) a.href = a.href.replace(/wa\.me\/[0-9]+/, "wa.me/" + settings.whatsappNumber);
      });
    }

    // repeatable blocks (rebuilt from arrays so the editor can add/remove rows)
    renderStats(sec.stats);
    renderTrustBar(sec.trustBar);
    renderServices(sec.services);
    renderSafety(sec.safety);
    renderFaq(sec.faq);
    renderFooterSister(settings.sisterLinks);
  }

  /* ----------------------------------------------------------------------
     HELPERS
     ---------------------------------------------------------------------- */
  function each(sel, fn) {
    var nodes = document.querySelectorAll(sel);
    for (var i = 0; i < nodes.length; i++) fn(nodes[i]);
  }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function applyImg(el, path, d) {
    var media = (d.media && d.media[path]) || null;
    var widths = media && Array.isArray(media.widths) ? media.widths.slice() : [400, 700];
    var base = path.replace(/\.webp$/i, "");
    var parts = [];
    widths.forEach(function (w) {
      if (w >= 1024) return;
      parts.push(encodeURI(base + "-" + w + "w.webp") + " " + w + "w");
    });
    parts.push(encodeURI(path) + " 1024w");
    el.setAttribute("src", path);
    if (parts.length > 1) el.setAttribute("srcset", parts.join(", "));
    else el.removeAttribute("srcset");
    if (!el.getAttribute("sizes")) el.setAttribute("sizes", "(max-width: 900px) 100vw, 560px");
  }

  /* ----------------------------------------------------------------------
     SECTION RENDERERS  (markup mirrors the original index.html)
     ---------------------------------------------------------------------- */
  function renderStats(stats) {
    var c = document.getElementById("statsContainer");
    if (!c || !Array.isArray(stats)) return;
    c.innerHTML = stats.map(function (s) {
      return '<div class="stat-item"><h3>' + esc(s.value) + "</h3><p>" + esc(s.label) + "</p></div>";
    }).join("");
  }

  function renderTrustBar(items) {
    var c = document.getElementById("trustBarContainer");
    if (!c || !Array.isArray(items)) return;
    c.innerHTML = items.map(function (it) {
      return (
        '<div style="flex:1; min-width:200px;">' +
        '<span style="font-size:2rem; display:block; margin-bottom:6px;">' + esc(it.icon) + "</span>" +
        '<strong style="font-size:1.05rem; color:var(--primary-navy); display:block;">' + esc(it.title) + "</strong>" +
        '<span style="font-size:0.85rem; color:var(--text-muted);">' + (it.text || "") + "</span>" +
        "</div>"
      );
    }).join("");
  }

  function renderServices(list) {
    var c = document.getElementById("servicesGrid");
    if (!c || !Array.isArray(list)) return;
    c.innerHTML = list.map(function (s) {
      return (
        '<div class="cat-card"><div class="cat-card-body">' +
        '<h3 class="cat-card-title">' + esc(s.title) + "</h3>" +
        '<p class="cat-card-desc">' + (s.desc || "") + "</p>" +
        "</div></div>"
      );
    }).join("");
  }

  function renderSafety(safety) {
    if (!safety) return;
    var intro = document.querySelector('[data-cms="safety.intro"]');
    if (intro && safety.intro != null) intro.textContent = safety.intro;
    var ul = document.getElementById("safetyPoints");
    if (ul && Array.isArray(safety.points)) {
      ul.innerHTML = safety.points.map(function (p) { return "<li>" + (p || "") + "</li>"; }).join("");
    }
  }

  function renderFaq(faq) {
    var c = document.getElementById("faqList");
    if (!c || !Array.isArray(faq)) return;
    c.innerHTML = faq.map(function (f) {
      return (
        '<div class="cat-card" style="padding:32px; cursor:default;">' +
        '<h3 class="faq-question" style="font-size:1.2rem; font-weight:800; color:var(--primary-navy); margin-bottom:12px;">' + esc(f.q) + "</h3>" +
        '<p class="faq-answer" style="color:var(--text-muted); line-height:1.6;">' + (f.a || "") + "</p>" +
        "</div>"
      );
    }).join("");
  }

  function renderFooterSister(links) {
    var c = document.getElementById("footerSister");
    if (!c || !Array.isArray(links) || !links.length) return;
    var a = links.map(function (l) {
      return '<a href="' + esc(l.url) + '" target="_blank" rel="noopener" style="color:var(--accent-cyan); font-weight:700;">' + esc(l.label) + "</a>";
    });
    var joined = a.length > 1
      ? a.slice(0, -1).join(", ") + " &amp; " + a[a.length - 1]
      : a[0];
    c.innerHTML = "Part of the Bongshai Group – see also " + joined;
  }
})();
