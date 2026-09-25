/* ==========================================================================
   SERVER-SIDE APPLY
   --------------------------------------------------------------------------
   The twin of apply.js. Same [data-cms*] contract, same generated markup,
   run against index.html with cheerio before the page ever leaves the box.

   Phase 0 rule: the output must match what the browser produced on its own,
   so every renderer here mirrors its counterpart in apply.js line for line —
   including which fields are escaped and which are deliberately raw HTML.
   Change one, change both; scripts/verify-phase0.js is what catches drift.
   ========================================================================== */
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const cheerio = require("cheerio");

const { SERVER } = require("./paths");
const content = require("./content");

// The page template lives in the app, not the docroot: a physical index.html
// in the docroot would be served by LiteSpeed and "/" would never reach Node.
const INDEX = path.join(SERVER, "views", "site", "index.html");

let cache = { key: null, html: null };

function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Only ever emit an href a browser treats as navigation, never javascript:. */
function safeURL(u) {
  u = String(u == null ? "" : u).trim();
  return /^(https?:\/\/|\/|#|mailto:|tel:)/i.test(u) ? u : "#";
}

function applyImg($el, p, d) {
  const media = (d.media && d.media[p]) || null;
  const widths = media && Array.isArray(media.widths) ? media.widths.slice() : [400, 700];
  const base = p.replace(/\.webp$/i, "");
  const parts = [];
  for (const w of widths) {
    if (w >= 1024) continue;
    parts.push(encodeURI(base + "-" + w + "w.webp") + " " + w + "w");
  }
  parts.push(encodeURI(p) + " 1024w");
  $el.attr("src", p);
  if (parts.length > 1) $el.attr("srcset", parts.join(", "));
  else $el.removeAttr("srcset");
  if (!$el.attr("sizes")) $el.attr("sizes", "(max-width: 900px) 100vw, 560px");
}

function setMeta($, sel, attr, value) {
  if (value == null || value === "") return;
  const el = $(sel).first();
  if (el.length) el.attr(attr, value);
}

function show($, id, on) {
  const el = $("#" + id);
  if (!el.length) return;
  // Idempotent: the markup already ships display:none on these, so strip any
  // display rule first and only put one back when the section stays hidden.
  let style = (el.attr("style") || "").replace(/display\s*:\s*[^;]*;?\s*/gi, "").trim();
  if (!on) style = "display:none;" + (style ? " " + style : "");
  el.attr("style", style);
}

function build(d) {
  const $ = cheerio.load(fs.readFileSync(INDEX, "utf8"), { decodeEntities: false });

  const text = d.text || {};
  const html = d.html || {};
  const settings = d.settings || {};
  const sec = d.sections || {};

  /* ---- <head> ---- */
  if (d.seo) {
    const seo = d.seo;
    if (seo.title) $("title").first().text(seo.title);
    setMeta($, 'meta[name="description"]', "content", seo.description);
    setMeta($, 'meta[name="keywords"]', "content", seo.keywords);
    setMeta($, 'link[rel="canonical"]', "href", seo.canonical);
    setMeta($, 'meta[property="og:title"]', "content", seo.ogTitle || seo.title);
    setMeta($, 'meta[property="og:description"]', "content", seo.ogDescription || seo.description);
    setMeta($, 'meta[property="og:image"]', "content", seo.ogImage);
    setMeta($, 'meta[property="og:url"]', "content", seo.canonical);
    setMeta($, 'meta[name="twitter:title"]', "content", seo.ogTitle || seo.title);
    setMeta($, 'meta[name="twitter:description"]', "content", seo.ogDescription || seo.description);
    setMeta($, 'meta[name="twitter:image"]', "content", seo.ogImage);
  }

  /* ---- flat keys ---- */
  $("[data-cms]").each((_, el) => {
    const v = text[$(el).attr("data-cms")];
    if (v != null) $(el).text(v);
  });
  $("[data-cms-html]").each((_, el) => {
    const v = html[$(el).attr("data-cms-html")];
    if (v != null) $(el).html(v);
  });
  $("[data-cms-set]").each((_, el) => {
    const v = settings[$(el).attr("data-cms-set")];
    if (v != null) $(el).text(v);
  });
  $("[data-cms-img]").each((_, el) => {
    const v = text[$(el).attr("data-cms-img")];
    if (v && typeof v === "string") applyImg($(el), v, d);
  });

  if (settings.whatsappNumber) {
    $("[data-cms-wa]").each((_, el) => {
      const href = $(el).attr("href");
      if (href) $(el).attr("href", href.replace(/wa\.me\/[0-9]+/, "wa.me/" + settings.whatsappNumber));
    });
  }

  // data-cms-tel: tel: link from settings.hotline (digits and a leading +)
  if (settings.hotline) {
    const tel = String(settings.hotline).replace(/[^0-9+]/g, "");
    if (tel) $("[data-cms-tel]").attr("href", "tel:" + tel);
  }

  /* ---- repeatable blocks ---- */
  const stats = sec.stats;
  if ($("#statsContainer").length && Array.isArray(stats)) {
    $("#statsContainer").html(stats.map((s) =>
      '<div class="stat-item"><h3>' + esc(s.value) + "</h3><p>" + esc(s.label) + "</p></div>").join(""));
  }

  if ($("#trustBarContainer").length && Array.isArray(sec.trustBar)) {
    $("#trustBarContainer").html(sec.trustBar.map((it) =>
      '<div style="flex:1; min-width:200px;">' +
      '<span style="font-size:2rem; display:block; margin-bottom:6px;">' + esc(it.icon) + "</span>" +
      '<strong style="font-size:1.05rem; color:var(--primary-navy); display:block;">' + esc(it.title) + "</strong>" +
      '<span style="font-size:0.85rem; color:var(--text-muted);">' + (it.text || "") + "</span>" +
      "</div>").join(""));
  }

  if ($("#servicesGrid").length && Array.isArray(sec.services)) {
    $("#servicesGrid").html(sec.services.map((s) =>
      '<div class="cat-card"><div class="cat-card-body">' +
      '<h3 class="cat-card-title">' + esc(s.title) + "</h3>" +
      '<p class="cat-card-desc">' + (s.desc || "") + "</p>" +
      "</div></div>").join(""));
  }

  const safety = sec.safety;
  if (safety) {
    if (safety.intro != null) $('[data-cms="safety.intro"]').text(safety.intro);
    if ($("#safetyPoints").length && Array.isArray(safety.points)) {
      $("#safetyPoints").html(safety.points.map((p) => "<li>" + (p || "") + "</li>").join(""));
    }
  }

  if ($("#faqList").length && Array.isArray(sec.faq)) {
    $("#faqList").html(sec.faq.map((f) =>
      '<div class="cat-card" style="padding:32px; cursor:default;">' +
      '<h3 class="faq-question" style="font-size:1.2rem; font-weight:800; color:var(--primary-navy); margin-bottom:12px;">' + esc(f.q) + "</h3>" +
      '<p class="faq-answer" style="color:var(--text-muted); line-height:1.6;">' + (f.a || "") + "</p>" +
      "</div>").join(""));
  }

  const links = settings.sisterLinks;
  if ($("#footerSister").length && Array.isArray(links) && links.length) {
    const a = links.map((l) =>
      '<a href="' + esc(safeURL(l.url)) + '" target="_blank" rel="noopener" style="color:var(--accent-cyan); font-weight:700;">' +
      esc(l.label) + "</a>");
    const joined = a.length > 1 ? a.slice(0, -1).join(", ") + " &amp; " + a[a.length - 1] : a[0];
    $("#footerSister").html("Part of the Bongshai Group – see also " + joined);
  }

  /* ---- sections that stay hidden until they hold something ---- */
  const testimonials = (sec.testimonials || []).filter((t) => t && t.quote);
  show($, "testimonialsSection", testimonials.length > 0);
  if ($("#testimonialsList").length) {
    $("#testimonialsList").html(testimonials.map((t) =>
      '<div class="cat-card"><div class="cat-card-body">' +
      '<p style="font-style:italic; color:var(--text-muted); line-height:1.7; margin-bottom:16px;">“' +
      esc(t.quote) + '”</p>' +
      '<strong style="color:var(--primary-navy); display:block;">' + esc(t.author) + "</strong>" +
      (t.role ? '<span style="font-size:0.85rem; color:var(--text-muted);">' + esc(t.role) + "</span>" : "") +
      "</div></div>").join(""));
  }

  const team = (sec.team || []).filter((m) => m && m.name);
  show($, "teamSection", team.length > 0);
  if ($("#teamList").length) {
    $("#teamList").html(team.map((m) => {
      const photo = m.photo
        ? '<img src="' + esc(encodeURI(String(m.photo))) + '" alt="' + esc(m.name) +
          '" loading="lazy" style="width:100%; height:220px; object-fit:cover; display:block;">'
        : "";
      return '<div class="cat-card">' + photo + '<div class="cat-card-body">' +
        '<h3 class="cat-card-title">' + esc(m.name) + "</h3>" +
        (m.role ? '<p class="cat-card-desc" style="font-weight:700; color:var(--primary-navy);">' + esc(m.role) + "</p>" : "") +
        (m.bio ? '<p class="cat-card-desc">' + esc(m.bio) + "</p>" : "") +
        "</div></div>";
    }).join(""));
  }

  const areas = (sec.serviceAreas || [])
    .map((a) => (typeof a === "string" ? { name: a } : a))
    .filter((a) => a && a.name);
  show($, "serviceAreasBlock", areas.length > 0);
  if ($("#serviceAreasList").length) {
    $("#serviceAreasList").html(areas.map((a) =>
      '<span style="background:rgba(4,102,200,.08); color:var(--primary-navy); ' +
      'border:1px solid var(--border-light); border-radius:20px; padding:6px 14px; ' +
      'font-size:0.85rem; font-weight:700;"' +
      (a.note ? ' title="' + esc(a.note) + '"' : "") + ">" + esc(a.name) + "</span>").join(""));
  }

  // The chat button only when the chat can answer.
  if (!require("./ai-assistant").groqKeys().length) $("script[data-chat-widget]").remove();

  for (const [id, html] of Object.entries(navMarkup(d))) {
    if ($("#" + id).length) $("#" + id).html(html);
  }

  return $.html();
}

/* Product menu — desktop dropdown, mobile drawer, catalogue filter pills and
   footer — from the product lines and categories in the content (content-db
   lists only those with products). apply.js has the same function for the
   browser; keep the two identical. */
function navMarkup(d) {
  const mains = Array.isArray(d.mainCategories) ? d.mainCategories : [];
  const cats = Array.isArray(d.categories) ? d.categories : [];
  const prods = Array.isArray(d.products) ? d.products : [];
  const key = (k) => String(k || "").replace(/[^a-z0-9-]/gi, "");
  const under = (m, i) => cats.filter((c) => c.main === m.key || (!c.main && i === 0));
  const lines = mains.map((m, i) => ({ m, cats: under(m, i) })).filter((x) => x.cats.length);
  const label = (c) => (c.icon ? esc(c.icon) + " " : "") + esc(c.name);
  const count = (c) => prods.filter((p) => p.category === c.key).length;
  const pill = 'class="btn-secondary-hero" style="padding:8px 18px; font-size:0.88rem; border-radius:20px;"';
  return {
    navProductsMenu: lines.map(({ m, cats: cs }) =>
      '<div class="dropdown-item-wrap"><button class="dropdown-link" type="button" role="menuitem" onclick="goToMainCategory(\'' + key(m.key) + '\')">' +
      '<span class="dropdown-icon-dot"></span><span>' + esc(m.name) + '</span><span class="sub-arrow">▸</span></button>' +
      '<div class="nested-dropdown-menu">' + cs.map((c) =>
        '<button class="dropdown-sublink" type="button" onclick="navigateToCategory(\'' + key(c.key) + '\')">' + label(c) + "</button>").join("") +
      "</div></div>").join(""),
    mobileProductsMenu: lines.map(({ m, cats: cs }) =>
      '<li><button class="mobile-sub-link" type="button" onclick="goToMainCategory(\'' + key(m.key) + '\')">' + esc(m.name) + " ▾</button>" +
      '<ul class="mobile-nested-menu">' + cs.map((c) =>
        '<li><button class="mobile-nested-link" type="button" onclick="navigateToCategory(\'' + key(c.key) + '\')">' + label(c) + "</button></li>").join("") +
      "</ul></li>").join(""),
    catalogFilterChips: '<button type="button" ' + pill + " onclick=\"navigateToCategory('all')\">All Models (" + prods.length + ")</button>" +
      lines.map((x) => x.cats).flat().filter((c) => count(c) > 0).map((c) =>
        '<button type="button" ' + pill + ' onclick="navigateToCategory(\'' + key(c.key) + '\')">' + label(c) + " (" + count(c) + ")</button>").join(""),
    footerProductLinks: lines.map(({ m }) =>
      '<li><button type="button" onclick="goToMainCategory(\'' + key(m.key) + '\')">' + esc(m.name) + "</button></li>").join(""),
  };
}

function stamp() {
  try {
    return String(fs.statSync(INDEX).mtimeMs);
  } catch {
    return "0";
  }
}

/** The rendered home page, rebuilt only when index.html or the content moves. */
function home() {
  const key = stamp() + "|" + content.version();
  if (cache.key === key && cache.html) return cache.html;
  const html = build(content.load());
  cache = { key, html };
  return html;
}

function invalidate() {
  cache = { key: null, html: null };
}

module.exports = { home, invalidate, build, esc, safeURL };
