"use strict";

/**
 * Normalise root-relative path ensuring leading slash.
 */
function toRootRelative(p) {
  if (!p) return "";
  return p.startsWith("/") ? p : "/" + p;
}

/**
 * Builds responsive image attributes following apply.js:
 * Uses media[path].widths (defaulting to [400, 700]) plus 1024w fallback.
 */
function buildSrcset(imagePath, media) {
  if (!imagePath) {
    return { src: "", srcset: "", sizes: "" };
  }

  // Ensure root-relative for clean subpage resolution
  const cleanPath = imagePath.replace(/^\//, "");
  const normPath = "/" + cleanPath;

  const mediaEntry = (media && (media[cleanPath] || media[normPath])) || null;
  const widths = mediaEntry && Array.isArray(mediaEntry.widths) ? mediaEntry.widths.slice() : [400, 700];

  const base = normPath.replace(/\.webp$/i, "");
  const parts = [];

  for (const w of widths) {
    if (w >= 1024) continue;
    parts.push(encodeURI(base + "-" + w + "w.webp") + " " + w + "w");
  }
  parts.push(encodeURI(normPath) + " 1024w");

  return {
    src: encodeURI(normPath),
    srcset: parts.length > 1 ? parts.join(", ") : "",
    sizes: "(max-width: 900px) 100vw, 560px"
  };
}

/**
 * Deep link generator for WhatsApp inquiries
 */
function buildWhatsAppLink(whatsappNumber, message) {
  const number = String(whatsappNumber || "8801789949060").replace(/[^0-9]/g, "");
  return `https://wa.me/${number}?text=${encodeURIComponent(message || "")}`;
}

module.exports = {
  toRootRelative,
  buildSrcset,
  buildWhatsAppLink
};
