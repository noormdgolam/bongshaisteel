/* ==========================================================================
   HTML SANITISER for the few CMS fields the public page renders as HTML
   (service descriptions, FAQ answers, trust-bar text, safety points, html.*).
   --------------------------------------------------------------------------
   Those fields are editable by the "editor" role, and they reach every
   visitor unescaped — without this, an editor could put a <script> on the
   public site. Everything the current content uses survives unchanged
   (strong, time[datetime], a[href target rel]); everything else is either
   unwrapped (unknown tags keep their text) or dropped with its content
   (script, style, iframe, …).
   ========================================================================== */
"use strict";

const cheerio = require("cheerio");

const KEEP = new Set(["b", "strong", "i", "em", "u", "br", "small", "sup", "sub", "p", "ul", "ol", "li", "time", "a"]);
// Removed together with everything inside them.
const DROP = new Set(["script", "style", "iframe", "frame", "frameset", "object", "embed", "applet", "template",
  "noscript", "textarea", "select", "option", "input", "button", "form", "link", "meta", "base", "svg", "math", "title", "head"]);

const ATTRS = { a: ["href", "target", "rel"], time: ["datetime"] };
const SAFE_HREF = /^(?:https?:\/\/|mailto:|tel:|\/(?!\/)|#)/i;
const REL_TOKENS = new Set(["noopener", "noreferrer", "nofollow", "ugc", "sponsored"]);

function clean($, node) {
  for (const child of [...(node.children || [])]) {
    if (child.type === "comment" || child.type === "directive" || child.type === "cdata") { $(child).remove(); continue; }
    if (child.type !== "tag" && child.type !== "script" && child.type !== "style") continue; // text stays

    const tag = (child.name || "").toLowerCase();
    if (DROP.has(tag) || child.type === "script" || child.type === "style") { $(child).remove(); continue; }

    clean($, child);                                   // children first, so unwrapping keeps clean content

    if (!KEEP.has(tag)) { $(child).replaceWith($(child).contents()); continue; }

    const allowed = ATTRS[tag] || [];
    for (const name of Object.keys(child.attribs || {})) {
      if (!allowed.includes(name.toLowerCase())) $(child).removeAttr(name);
    }
    if (tag === "a") {
      const href = String($(child).attr("href") || "").trim();
      // Browsers ignore whitespace and control characters inside a scheme
      // ("java\tscript:") — judge the collapsed form.
      const collapsed = href.replace(/[\s\x00-\x1f]+/g, "");
      if (!href || !SAFE_HREF.test(collapsed)) $(child).removeAttr("href");
      const target = $(child).attr("target");
      if (target !== undefined && target !== "_blank") $(child).removeAttr("target");
      const rel = String($(child).attr("rel") || "").split(/\s+/).filter((t) => REL_TOKENS.has(t.toLowerCase()));
      if ($(child).attr("target") === "_blank" && !rel.includes("noopener")) rel.push("noopener");
      if (rel.length) $(child).attr("rel", rel.join(" ")); else $(child).removeAttr("rel");
    }
    if (tag === "time") {
      const dt = $(child).attr("datetime");
      if (dt !== undefined && !/^[0-9T:+\-. Z]{1,40}$/.test(dt)) $(child).removeAttr("datetime");
    }
  }
}

function sanitizeHtml(input) {
  if (input == null) return input;
  const src = String(input);
  // Without a "<" no element can exist, so there is nothing to remove — and
  // passing it through the parser would rewrite a bare "&" as "&amp;".
  if (!src.includes("<")) return src;
  const $ = cheerio.load(src, { decodeEntities: false }, false);
  clean($, $.root()[0]);
  return $.html();
}

module.exports = { sanitizeHtml };
