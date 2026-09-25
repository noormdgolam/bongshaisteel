/* ==========================================================================
   IMAGE UPLOADS
   --------------------------------------------------------------------------
   One uploaded image becomes, in images/uploads/:
     <stem>-<rand>.webp          full size, at most MAX_WIDTH wide
     <stem>-<rand>-400w.webp     only when the image is wider than 400
     <stem>-<rand>-700w.webp     only when the image is wider than 700
   and the caller records the widths actually written in content.media, which
   is how apply.js, render.js and the catalogue know which srcset candidates
   exist (a srcset candidate that 404s is not retried by the browser).

   The format is decided from the bytes, never from the file name or the
   browser's MIME type. SVG is refused: it is a document that can carry script.
   Nothing is stored unless sharp decoded and re-encoded it, so a file that is
   not a clean image never reaches the public folder.
   ========================================================================== */
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { ROOT } = require("./paths");

let sharp = null;
try { sharp = require("sharp"); } catch { /* reported by available() */ }

const UPLOAD_URL = "images/uploads";
const UPLOAD_DIR = path.join(ROOT, "images", "uploads");
const MAX_BYTES = 8 * 1024 * 1024;
const MAX_PIXELS = 40e6;
const MAX_WIDTH = 1600;
const VARIANTS = [400, 700];
const FORMATS = new Set(["jpeg", "png", "webp", "gif"]);
const QUALITY = 82;

class ImageError extends Error {}

function stemOf(name) {
  const base = path.basename(String(name || ""), path.extname(String(name || "")));
  const s = base.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
  return (s || "image") + "-" + crypto.randomBytes(4).toString("hex");
}

/** Decode, check, re-encode and store. Returns { path, widths, width, height }. */
async function storeUpload(buffer, originalName) {
  if (!sharp) throw new ImageError("Image processing is not available on this server (sharp is not installed).");
  if (!Buffer.isBuffer(buffer) || !buffer.length) throw new ImageError("No file received.");
  if (buffer.length > MAX_BYTES) throw new ImageError("That file is larger than 8 MB.");

  let meta;
  try {
    meta = await sharp(buffer, { limitInputPixels: MAX_PIXELS }).metadata();
  } catch {
    throw new ImageError("That file is not a readable image.");
  }
  if (!FORMATS.has(meta.format)) {
    throw new ImageError("Only JPEG, PNG, WebP or GIF images can be uploaded.");
  }
  if (!meta.width || !meta.height) throw new ImageError("That image has no size — try re-saving it.");
  if (meta.width * meta.height > MAX_PIXELS) {
    throw new ImageError("That image is " + (meta.width * meta.height / 1e6).toFixed(1) + " megapixels — resize it below 40 MP first.");
  }

  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  const stem = stemOf(originalName);
  const written = [];
  try {
    // rotate() applies the EXIF orientation; metadata is not carried over.
    const src = sharp(buffer, { limitInputPixels: MAX_PIXELS, animated: false }).rotate();
    const full = await src.clone()
      .resize({ width: MAX_WIDTH, withoutEnlargement: true, fit: "inside" })
      .webp({ quality: QUALITY, effort: 4 })
      .toFile(path.join(UPLOAD_DIR, stem + ".webp"));
    written.push(stem + ".webp");

    const widths = [];
    for (const w of VARIANTS) {
      if (full.width <= w) continue;
      await src.clone()
        .resize({ width: w, fit: "inside" })
        .webp({ quality: 80, effort: 4 })
        .toFile(path.join(UPLOAD_DIR, stem + "-" + w + "w.webp"));
      written.push(stem + "-" + w + "w.webp");
      widths.push(w);
    }
    return { path: UPLOAD_URL + "/" + stem + ".webp", widths, width: full.width, height: full.height };
  } catch (err) {
    for (const f of written) { try { fs.unlinkSync(path.join(UPLOAD_DIR, f)); } catch { /* gone */ } }
    if (err instanceof ImageError) throw err;
    throw new ImageError("That image is damaged or incomplete — try re-saving it.");
  }
}

/** Every stored upload (the full-size files; variants are folded in). */
function listUploads() {
  let names;
  try { names = fs.readdirSync(UPLOAD_DIR); } catch { return []; }
  const set = new Set(names);
  return names
    .filter((n) => /\.webp$|\.(jpe?g|png|gif)$/i.test(n) && !/-\d+w\.webp$/i.test(n))
    .map((n) => {
      const st = fs.statSync(path.join(UPLOAD_DIR, n));
      const stem = n.replace(/\.[^.]+$/, "");
      return {
        path: UPLOAD_URL + "/" + n,
        name: n,
        bytes: st.size,
        modified: st.mtime,
        variants: VARIANTS.filter((w) => set.has(stem + "-" + w + "w.webp")),
      };
    })
    .sort((a, b) => b.modified - a.modified);
}

/**
 * Remove one upload and its variants. Only a plain file name directly inside
 * images/uploads is accepted, so no path can reach anywhere else.
 */
function removeUpload(relPath) {
  const m = /^images\/uploads\/([a-z0-9][a-z0-9-]*)\.(webp|jpe?g|png|gif)$/i.exec(String(relPath || ""));
  if (!m) throw new ImageError("Only files in images/uploads can be deleted here.");
  const files = [m[1] + "." + m[2], ...VARIANTS.map((w) => m[1] + "-" + w + "w.webp")];
  let removed = 0;
  for (const f of files) {
    try { fs.unlinkSync(path.join(UPLOAD_DIR, f)); removed++; } catch { /* not there */ }
  }
  if (!removed) throw new ImageError("That file does not exist.");
  return removed;
}

module.exports = {
  storeUpload, listUploads, removeUpload, ImageError,
  available: () => Boolean(sharp),
  UPLOAD_DIR, UPLOAD_URL, MAX_BYTES,
};
