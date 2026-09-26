"use strict";

const express = require("express");
const nunjucks = require("nunjucks");
const path = require("node:path");
const { buildSrcset, buildWhatsAppLink } = require("./helpers");

const VIEWS_DIR = path.join(__dirname, "views");

// Configure Nunjucks environment
const env = new nunjucks.Environment(
  new nunjucks.FileSystemLoader(VIEWS_DIR, { noCache: process.env.NODE_ENV !== "production" }),
  { autoescape: true }
);

// Filters
env.addFilter("urlencode", (str) => encodeURIComponent(String(str || "")));

/* Replaces nunjucks' own dump for use inside <script type="application/ld+json">.
   Plain JSON.stringify leaves "</script>" intact, so a product name containing
   it closed the block and injected markup. "<", ">", "&" and the two JS line
   separators are escaped, so no string can leave the script element. */
env.addFilter("dump", (value) =>
  (JSON.stringify(value === undefined ? null : value) || "null")
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029"));

/** The public origin, taken from the CMS canonical rather than hardcoded. */
function siteOrigin(content) {
  try {
    return new URL(content && content.seo && content.seo.canonical).origin;
  } catch {
    return "https://www.bongshaisteel.com";
  }
}

/**
 * Creates and returns an Express Router for server-rendered catalog pages.
 *
 * @param {Object} [options]
 * @param {Function} [options.getContent] Custom content getter; defaults to ../lib/content.load
 * @returns {express.Router}
 */
module.exports = function createCatalogRouter(options = {}) {
  const getContent = (options && typeof options.getContent === "function")
    ? options.getContent
    : (() => require("../lib/content").load());

  const router = express.Router();

  /* The product menu for the layout: lines that have visible categories, in
     order (content-db already hides empty ones). Same data as navMarkup(). */
  function navLines(content) {
    const mains = Array.isArray(content.mainCategories) ? content.mainCategories : [];
    const cats = Array.isArray(content.categories) ? content.categories : [];
    return mains
      .map((m, i) => ({ key: m.key, name: m.name, cats: cats.filter((c) => c.main === m.key || (!c.main && i === 0)) }))
      .filter((l) => l.cats.length);
  }

  function renderView(res, next, viewName, context) {
    context = { navLines: navLines(getContent() || {}), chatEnabled: require("../lib/ai-assistant").groqKeys().length > 0, ...context };
    env.render(viewName, context, (err, html) => {
      if (err) return next(err);
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.status(200).send(html);
    });
  }

  // 1. Catalogue Index: GET /products
  router.get("/products", (req, res, next) => {
    try {
      const content = getContent();
      const origin = siteOrigin(content);
      const categories = Array.isArray(content.categories) ? content.categories : [];
      const allProducts = Array.isArray(content.products) ? content.products : [];

      const categoryGroups = categories.map((cat) => {
        const catProducts = allProducts
          .filter((p) => (p.category || "").toLowerCase() === (cat.key || "").toLowerCase())
          .map((p) => ({
            ...p,
            imageSrc: buildSrcset(p.image, content.media)
          }));

        return {
          category: cat,
          products: catProducts
        };
      });

      const context = {
        pageTitle: "Steel Building Products Catalogue | Bongshai Steel",
        pageDescription: `Browse all ${allProducts.length} pre-engineered steel building models by Bongshai Steel: factory sheds, structural buildings, duplex villas, cottages, and container houses.`,
        canonicalUrl: `${origin}/products`,
        ogTitle: "Steel Building Products Catalogue | Bongshai Steel",
        ogDescription: `Browse all ${allProducts.length} pre-engineered steel building models by Bongshai Steel: factory sheds, structural buildings, duplex villas, cottages, and container houses.`,
        ogImage: `${origin}/images/products/Model%20No-BH-IS-1001.webp`,
        siteOrigin: origin,
        categoryGroups,
        settings: content.settings || {},
        currentNav: "products"
      };

      renderView(res, next, "index.njk", context);
    } catch (err) {
      next(err);
    }
  });

  // Completed projects: GET /projects — from the database (options.getProjects);
  // "not mine" when the app runs without one.
  router.get("/projects", async (req, res, next) => {
    if (typeof options.getProjects !== "function") return next();
    try {
      const content = getContent();
      const origin = siteOrigin(content);
      const all = await options.getProjects();
      const withImage = (p) => ({ ...p, imageSrc: p.image ? buildSrcset(p.image, content.media) : null });
      const steel = all.filter((p) => p.delivered_by === "steel").map(withImage);
      const engineering = all.filter((p) => p.delivered_by === "engineering").map(withImage);
      const clients = [...new Set(engineering.map((p) => p.client).filter(Boolean))];
      renderView(res, next, "projects.njk", {
        steel, engineering, clients,
        pageTitle: "Completed Projects | Bongshai Steel",
        pageDescription: "Steel buildings delivered by Bongshai Steel across Bangladesh, and the Bongshai Group's completed engineering projects since 2008.",
        canonicalUrl: origin + "/projects",
        ogTitle: "Completed Projects | Bongshai Steel",
        ogDescription: steel.length + " steel buildings and " + engineering.length + " engineering projects delivered by the Bongshai Group.",
        settings: content.settings || {},
        currentNav: "projects",
      });
    } catch (err) {
      next(err);
    }
  });

  // 2. Individual Category Page: GET /category/:key
  router.get("/category/:key", (req, res, next) => {
    try {
      const content = getContent();
      const rawKey = req.params.key || "";
      const categories = Array.isArray(content.categories) ? content.categories : [];
      const category = categories.find((c) => (c.key || "").toLowerCase() === rawKey.toLowerCase());

      // "Not mine": the app's own HTML 404 answers.
      if (!category) return next();
      // One URL per category; any other spelling redirects to it.
      if (rawKey !== category.key) {
        return res.redirect(301, "/category/" + encodeURIComponent(category.key));
      }
      const origin = siteOrigin(content);

      const allProducts = Array.isArray(content.products) ? content.products : [];
      const categoryProducts = allProducts
        .filter((p) => (p.category || "").toLowerCase() === (category.key || "").toLowerCase())
        .map((p) => ({
          ...p,
          imageSrc: buildSrcset(p.image, content.media)
        }));

      const canonicalUrl = `${origin}/category/${encodeURIComponent(category.key)}`;
      const cleanImg = (category.image || "").replace(/^\//, "");
      const ogImage = cleanImg ? `${origin}/${encodeURI(cleanImg)}` : undefined;

      const context = {
        category,
        products: categoryProducts,
        // A building type with no published models yet: a quote-on-request
        // page, kept out of search results until it has models to show.
        robots: categoryProducts.length ? undefined : "noindex, follow",
        waLink: buildWhatsAppLink(content.settings && content.settings.whatsappNumber,
          "Hello Bongshai Steel! I would like a quote for a " + category.name + "."),
        pageTitle: category.metaTitle || `${category.name} Exporter & Manufacturer | Bongshai Steel`,
        pageDescription: category.metaDescription || `Explore ${category.name} models by Bongshai Steel. ${category.blurb || ""} AISC 360, BNBC 2020 & Eurocode certified manufacturing in Bangladesh.`,
        canonicalUrl,
        ogTitle: `${category.name} | Bongshai Steel`,
        ogDescription: category.blurb || `Certified ${category.name} models manufactured by Bongshai Steel.`,
        ogImage,
        siteOrigin: origin,
        settings: content.settings || {},
        currentNav: "products"
      };

      renderView(res, next, "category.njk", context);
    } catch (err) {
      next(err);
    }
  });

  // 3. Individual Product Page: GET /products/:modelCode
  router.get("/products/:modelCode", (req, res, next) => {
    try {
      const content = getContent();
      const rawCode = req.params.modelCode || "";
      const allProducts = Array.isArray(content.products) ? content.products : [];

      // Model code only: also matching the internal id gave every product a
      // second live URL.
      const product = allProducts.find(
        (p) => (p.modelCode || "").toLowerCase() === rawCode.toLowerCase()
      );

      // "Not mine": the app's own HTML 404 answers.
      if (!product) return next();
      // One URL per product: BH-IS-1001, never bh-is-1001 as well.
      if (rawCode !== product.modelCode) {
        return res.redirect(301, "/products/" + encodeURIComponent(product.modelCode));
      }

      const origin = siteOrigin(content);
      const canonicalUrl = `${origin}/products/${encodeURIComponent(product.modelCode)}`;
      const categoryUrl = `${origin}/category/${encodeURIComponent(product.category || "")}`;
      const cleanImg = (product.image || "").replace(/^\//, "");
      const fullImageUrl = `${origin}/${encodeURI(cleanImg)}`;

      const waMsg = `Hello Bongshai Steel! I would like to inquire about ${product.modelCode} (${product.name}). Please send technical specs and quotation.`;
      const waLink = buildWhatsAppLink(content.settings && content.settings.whatsappNumber, waMsg);

      const relatedProducts = allProducts
        .filter((p) => p.category === product.category && p.id !== product.id)
        .slice(0, 3)
        .map((p) => ({
          ...p,
          imageSrc: buildSrcset(p.image, content.media)
        }));

      // Rows with an empty value are placeholders from a template: not shown.
      const specs = (Array.isArray(product.specs) ? product.specs : []).filter((s) => s && s.value);
      const price = product.priceFrom ? {
        amount: product.priceFrom,
        currency: product.priceCurrency || "BDT",
        perSqft: product.priceUnit === "sqft",
        text: (product.priceCurrency === "USD" ? "US$ " : "Tk ") +
          Number(product.priceFrom).toLocaleString("en-IN", { maximumFractionDigits: 2 }) +
          (product.priceUnit === "sqft" ? " per sq ft" : ""),
      } : null;
      const title = product.metaTitle || `${product.name} (${product.modelCode}) | Bongshai Steel`;
      const description = product.metaDescription ||
        `${product.desc || product.name} Certified pre-engineered steel building by Bongshai Steel engineered to AISC 360 & BNBC standards. Request a custom quote.`;

      const context = {
        product,
        specs,
        price,
        imageAlt: product.imageAlt || `${product.name} - Model ${product.modelCode}`,
        imageSrc: buildSrcset(product.image, content.media),
        fullImageUrl,
        waLink,
        relatedProducts,
        pageTitle: title,
        pageDescription: description,
        canonicalUrl,
        ogType: "product",
        ogTitle: title,
        ogDescription: product.metaDescription || product.desc,
        ogImage: fullImageUrl,
        categoryUrl,
        siteOrigin: origin,
        settings: content.settings || {},
        currentNav: "products"
      };

      renderView(res, next, "product.njk", context);
    } catch (err) {
      next(err);
    }
  });

  return router;
};
