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
env.addFilter("dump", (obj) => JSON.stringify(obj));

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

  function renderView(res, next, viewName, context) {
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
        pageDescription: "Browse all 72 pre-engineered steel building models by Bongshai Steel: factory sheds, structural buildings, duplex villas, cottages, and container houses.",
        canonicalUrl: "https://www.bongshaisteel.com/products",
        ogTitle: "Steel Building Products Catalogue | Bongshai Steel",
        ogDescription: "Browse all 72 pre-engineered steel building models by Bongshai Steel: factory sheds, structural buildings, duplex villas, cottages, and container houses.",
        ogImage: "https://www.bongshaisteel.com/images/products/Model%20No-BH-IS-1001.webp",
        categoryGroups,
        settings: content.settings || {},
        currentNav: "products"
      };

      renderView(res, next, "index.njk", context);
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

      if (!category) {
        return res.status(404).send("Category not found");
      }

      const allProducts = Array.isArray(content.products) ? content.products : [];
      const categoryProducts = allProducts
        .filter((p) => (p.category || "").toLowerCase() === (category.key || "").toLowerCase())
        .map((p) => ({
          ...p,
          imageSrc: buildSrcset(p.image, content.media)
        }));

      const canonicalUrl = `https://www.bongshaisteel.com/category/${encodeURIComponent(category.key)}`;
      const cleanImg = (category.image || "").replace(/^\//, "");
      const ogImage = cleanImg ? `https://www.bongshaisteel.com/${encodeURI(cleanImg)}` : undefined;

      const context = {
        category,
        products: categoryProducts,
        pageTitle: `${category.name} Exporter & Manufacturer | Bongshai Steel`,
        pageDescription: `Explore ${category.name} models by Bongshai Steel. ${category.blurb || ""} AISC 360, BNBC 2020 & Eurocode certified manufacturing in Bangladesh.`,
        canonicalUrl,
        ogTitle: `${category.name} | Bongshai Steel`,
        ogDescription: category.blurb || `Certified ${category.name} models manufactured by Bongshai Steel.`,
        ogImage,
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

      const product = allProducts.find(
        (p) =>
          (p.modelCode || "").toLowerCase() === rawCode.toLowerCase() ||
          (p.id || "").toLowerCase() === rawCode.toLowerCase()
      );

      if (!product) {
        return res.status(404).send("Product not found");
      }

      const canonicalUrl = `https://www.bongshaisteel.com/products/${encodeURIComponent(product.modelCode)}`;
      const cleanImg = (product.image || "").replace(/^\//, "");
      const fullImageUrl = `https://www.bongshaisteel.com/${encodeURI(cleanImg)}`;

      const waMsg = `Hello Bongshai Steel! I would like to inquire about ${product.modelCode} (${product.name}). Please send technical specs and quotation.`;
      const waLink = buildWhatsAppLink(content.settings && content.settings.whatsappNumber, waMsg);

      const relatedProducts = allProducts
        .filter((p) => p.category === product.category && p.id !== product.id)
        .slice(0, 3)
        .map((p) => ({
          ...p,
          imageSrc: buildSrcset(p.image, content.media)
        }));

      const context = {
        product,
        imageSrc: buildSrcset(product.image, content.media),
        fullImageUrl,
        waLink,
        relatedProducts,
        pageTitle: `${product.name} (${product.modelCode}) | Bongshai Steel`,
        pageDescription: `${product.desc} Certified pre-engineered steel building by Bongshai Steel engineered to AISC 360 & BNBC standards. Request a custom quote.`,
        canonicalUrl,
        ogType: "product",
        ogTitle: `${product.name} (${product.modelCode}) | Bongshai Steel`,
        ogDescription: product.desc,
        ogImage: fullImageUrl,
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
