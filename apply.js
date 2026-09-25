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

    // <head> SEO — title, meta, Open Graph and Twitter all follow one source
    if (d.seo) {
      var seo = d.seo;
      if (seo.title) document.title = seo.title;
      setMeta('meta[name="description"]', "content", seo.description);
      setMeta('meta[name="keywords"]', "content", seo.keywords);
      setMeta('link[rel="canonical"]', "href", seo.canonical);
      setMeta('meta[property="og:title"]', "content", seo.ogTitle || seo.title);
      setMeta('meta[property="og:description"]', "content", seo.ogDescription || seo.description);
      setMeta('meta[property="og:image"]', "content", seo.ogImage);
      setMeta('meta[property="og:url"]', "content", seo.canonical);
      setMeta('meta[name="twitter:title"]', "content", seo.ogTitle || seo.title);
      setMeta('meta[name="twitter:description"]', "content", seo.ogDescription || seo.description);
      setMeta('meta[name="twitter:image"]', "content", seo.ogImage);
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
      if (v && typeof v === "string") applyImg(el, v, d);
    });

    // data-cms-tel      -> tel: link from settings.hotline
    if (settings.hotline) {
      var tel = String(settings.hotline).replace(/[^0-9+]/g, "");
      if (tel) each("[data-cms-tel]", function (a) { a.setAttribute("href", "tel:" + tel); });
    }

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
    renderTestimonials(sec.testimonials);
    renderTeam(sec.team);
    renderServiceAreas(sec.serviceAreas);
    renderNav(d);
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

  function setMeta(sel, attr, value) {
    if (value == null || value === "") return;
    var el = document.querySelector(sel);
    if (el) el.setAttribute(attr, value);
  }

  /** These sections do not exist on the page until the CMS has content for them. */
  function show(el, on) {
    if (el) el.style.display = on ? "" : "none";
  }

  /** Only ever emit an href a browser treats as navigation, never javascript:. */
  function safeURL(u) {
    u = String(u == null ? "" : u).trim();
    return /^(https?:\/\/|\/|#|mailto:|tel:)/i.test(u) ? u : "#";
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

  function renderTestimonials(list) {
    var box = document.getElementById("testimonialsList");
    var wrap = document.getElementById("testimonialsSection");
    if (!box) return;
    var items = (Array.isArray(list) ? list : []).filter(function (t) { return t && t.quote; });
    show(wrap, items.length > 0);
    box.innerHTML = items.map(function (t) {
      return (
        '<div class="cat-card"><div class="cat-card-body">' +
        '<p style="font-style:italic; color:var(--text-muted); line-height:1.7; margin-bottom:16px;">\u201C' +
        esc(t.quote) + '\u201D</p>' +
        '<strong style="color:var(--primary-navy); display:block;">' + esc(t.author) + "</strong>" +
        (t.role ? '<span style="font-size:0.85rem; color:var(--text-muted);">' + esc(t.role) + "</span>" : "") +
        "</div></div>"
      );
    }).join("");
  }

  function renderTeam(list) {
    var box = document.getElementById("teamList");
    var wrap = document.getElementById("teamSection");
    if (!box) return;
    var items = (Array.isArray(list) ? list : []).filter(function (m) { return m && m.name; });
    show(wrap, items.length > 0);
    box.innerHTML = items.map(function (m) {
      var photo = m.photo
        ? '<img src="' + esc(encodeURI(String(m.photo))) + '" alt="' + esc(m.name) +
          '" loading="lazy" style="width:100%; height:220px; object-fit:cover; display:block;">'
        : "";
      return (
        '<div class="cat-card">' + photo + '<div class="cat-card-body">' +
        '<h3 class="cat-card-title">' + esc(m.name) + "</h3>" +
        (m.role ? '<p class="cat-card-desc" style="font-weight:700; color:var(--primary-navy);">' + esc(m.role) + "</p>" : "") +
        (m.bio ? '<p class="cat-card-desc">' + esc(m.bio) + "</p>" : "") +
        "</div></div>"
      );
    }).join("");
  }

  function renderServiceAreas(list) {
    var box = document.getElementById("serviceAreasList");
    var wrap = document.getElementById("serviceAreasBlock");
    if (!box) return;
    var items = (Array.isArray(list) ? list : [])
      .map(function (a) { return typeof a === "string" ? { name: a } : a; })
      .filter(function (a) { return a && a.name; });
    show(wrap, items.length > 0);
    box.innerHTML = items.map(function (a) {
      return '<span style="background:rgba(4,102,200,.08); color:var(--primary-navy); ' +
        'border:1px solid var(--border-light); border-radius:20px; padding:6px 14px; ' +
        'font-size:0.85rem; font-weight:700;"' +
        (a.note ? ' title="' + esc(a.note) + '"' : "") + ">" + esc(a.name) + "</span>";
    }).join("");
  }

  /* Product menu — desktop dropdown, mobile drawer, catalogue filter pills
     and footer. Same function as navMarkup() in server/lib/render.js; keep
     the two identical. */
  function navMarkup(d) {
    var mains = Array.isArray(d.mainCategories) ? d.mainCategories : [];
    var cats = Array.isArray(d.categories) ? d.categories : [];
    var prods = Array.isArray(d.products) ? d.products : [];
    function key(k) { return String(k || "").replace(/[^a-z0-9-]/gi, ""); }
    function label(c) { return (c.icon ? esc(c.icon) + " " : "") + esc(c.name); }
    function count(c) { return prods.filter(function (p) { return p.category === c.key; }).length; }
    var lines = mains.map(function (m, i) {
      return { m: m, cats: cats.filter(function (c) { return c.main === m.key || (!c.main && i === 0); }) };
    }).filter(function (x) { return x.cats.length; });
    var pill = 'class="btn-secondary-hero" style="padding:8px 18px; font-size:0.88rem; border-radius:20px;"';
    var allCats = [];
    lines.forEach(function (x) { allCats = allCats.concat(x.cats); });
    return {
      navProductsMenu: lines.map(function (x) {
        return '<div class="dropdown-item-wrap"><button class="dropdown-link" type="button" role="menuitem" onclick="goToMainCategory(\'' + key(x.m.key) + '\')">' +
          '<span class="dropdown-icon-dot"></span><span>' + esc(x.m.name) + '</span><span class="sub-arrow">▸</span></button>' +
          '<div class="nested-dropdown-menu">' + x.cats.map(function (c) {
            return '<button class="dropdown-sublink" type="button" onclick="navigateToCategory(\'' + key(c.key) + '\')">' + label(c) + "</button>";
          }).join("") + "</div></div>";
      }).join(""),
      mobileProductsMenu: lines.map(function (x) {
        return '<li><button class="mobile-sub-link" type="button" onclick="goToMainCategory(\'' + key(x.m.key) + '\')">' + esc(x.m.name) + " ▾</button>" +
          '<ul class="mobile-nested-menu">' + x.cats.map(function (c) {
            return '<li><button class="mobile-nested-link" type="button" onclick="navigateToCategory(\'' + key(c.key) + '\')">' + label(c) + "</button></li>";
          }).join("") + "</ul></li>";
      }).join(""),
      catalogFilterChips: '<button type="button" ' + pill + " onclick=\"navigateToCategory('all')\">All Models (" + prods.length + ")</button>" +
        allCats.filter(function (c) { return count(c) > 0; }).map(function (c) {
          return '<button type="button" ' + pill + ' onclick="navigateToCategory(\'' + key(c.key) + '\')">' + label(c) + " (" + count(c) + ")</button>";
        }).join(""),
      footerProductLinks: lines.map(function (x) {
        return '<li><button type="button" onclick="goToMainCategory(\'' + key(x.m.key) + '\')">' + esc(x.m.name) + "</button></li>";
      }).join(""),
    };
  }

  function renderNav(d) {
    var parts = navMarkup(d);
    Object.keys(parts).forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.innerHTML = parts[id];
    });
  }

  function renderFooterSister(links) {
    var c = document.getElementById("footerSister");
    if (!c || !Array.isArray(links) || !links.length) return;
    var a = links.map(function (l) {
      return '<a href="' + esc(safeURL(l.url)) + '" target="_blank" rel="noopener" style="color:var(--accent-cyan); font-weight:700;">' + esc(l.label) + "</a>";
    });
    var joined = a.length > 1
      ? a.slice(0, -1).join(", ") + " &amp; " + a[a.length - 1]
      : a[0];
    c.innerHTML = "Part of the Bongshai Group – see also " + joined;
  }
})();
