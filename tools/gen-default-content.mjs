/* ==========================================================================
   GEN-DEFAULT-CONTENT  —  one-time / re-runnable generator
   --------------------------------------------------------------------------
   Ports the hard-coded catalog builders + all editable index.html copy into
   data/content.default.json (the git-tracked seed the CMS falls back to when
   data/content.json does not yet exist).

   Run:  node tools/gen-default-content.mjs
   ========================================================================== */

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/* --------------------------------------------------------------------------
   MAIN PRODUCT LINES  (nav dropdown + home cards) — mirrors app.js
   -------------------------------------------------------------------------- */
const mainCategories = [
  { key: "prefab",     name: "Prefab Buildings",       icon: "🏗️", blurb: "Pre-engineered steel factories, apartment buildings, duplex homes, cottages, and container houses.", ready: true },
  { key: "structure",  name: "Steel Structure",        icon: "🏛️", blurb: "Structural steel fabrication for industrial and commercial projects.", ready: false },
  { key: "furniture",  name: "Steel Furniture",        icon: "🪑", blurb: "Durable steel furniture for home, office, and industrial use.", ready: false },
  { key: "doorgate",   name: "Door and Gate",          icon: "🚪", blurb: "Custom steel doors and gates built to order.", ready: false },
  { key: "siteothers", name: "Others Steel Products",  icon: "🔧", blurb: "Additional steel products and on-site fabrication services.", ready: false }
];

/* --------------------------------------------------------------------------
   PREFAB BUILDING CATEGORIES  (prefab sidebar / catalog) — mirrors app.js
   -------------------------------------------------------------------------- */
const categories = [
  { key: "factory",    name: "Steel Factory Building",     icon: "🏭", blurb: "SS400/Q355 heavy portal frame, 10–50 Ton EOT crane ready, PU insulation.", image: "images/products/Model No-BH-IS-1006.webp" },
  { key: "structural", name: "Structural Steel Building",  icon: "🏢", blurb: "Multi-story steel apartment towers, composite decking concrete slab, engineered to international structural standards.", image: "images/products/bh-tsb-109.webp" },
  { key: "duplex",     name: "Duplex Steel Building",      icon: "🏘️", blurb: "Modern 2-story luxury steel duplexes, 4 Bed/4 Bath, 60-day rapid build.", image: "images/products/dv-104.webp" },
  { key: "cottage",    name: "Steel Cottage House",        icon: "🏡", blurb: "Eco resort prefab cottages, fiber cement cladding, fast on-site setup.", image: "images/products/Model No-BH-CH-405.webp" },
  { key: "container",  name: "Steel Container House",      icon: "🚢", blurb: "20ft & 40ft modified container site offices & luxury homes.", image: "images/products/bh-ch-502.webp" }
];

/* --------------------------------------------------------------------------
   CATALOG BUILDERS — copied verbatim from app.js so the seed matches today
   -------------------------------------------------------------------------- */
function buildFactory() {
  const names = [
    "Heavy Industrial Factory Shed", "Textile & Garments Factory Building", "Agro-Processing Steel Mill",
    "Automotive Assembly Plant", "Pharmaceutical Manufacturing Facility", "Steel Fabrication Workshop",
    "Electronics Assembly Factory", "Cement & Building Materials Plant", "Food Processing Factory Shed",
    "Plastic & Packaging Manufacturing Unit", "Heavy Machinery Production Hall", "Chemical Processing Steel Plant"
  ];
  return names.map((name, i) => {
    const num = 1001 + i;
    return {
      id: `bh-is-${num}`, category: "factory", categoryName: "Steel Factory Building",
      modelCode: `BH-IS-${num}`, name,
      desc: "Heavy steel portal frame building engineered for manufacturing plants, heavy machinery, and industrial production lines worldwide.",
      image: `images/products/Model No-BH-IS-${num}.webp`
    };
  });
}

function buildStructural() {
  const names = [
    "Urban Steel Apartment Complex", "Modern Steel Residential Tower", "Family Steel Apartment Building",
    "Riverside Steel Apartment Complex", "Compact Steel Apartment Block", "Premium Steel Residential Complex",
    "Garden View Steel Apartment Tower", "Corner Plot Steel Apartment Building", "Mid-Rise Steel Residential Complex",
    "Skyline Steel Apartment Tower", "Community Steel Apartment Complex", "Signature Steel Apartment Residence"
  ];
  const images = [
    "Model No-BH-TB-101.webp", "Model No-BH-TB-102.webp", "bh-tsb-103.webp", "Model No-BH-TB-104.webp",
    "Model No-BH-TB-104.webp", "bh-tsb-106.webp", "dv-107.webp", "bh-tsb-108.webp",
    "bh-tsb-109.webp", "bh-tsb-110.webp", "bh-tsb-111.webp", "bh-tsb-112.webp"
  ];
  return names.map((name, i) => {
    const num = 101 + i;
    return {
      id: `bh-tsb-${num}`, category: "structural", categoryName: "Structural Steel Building",
      modelCode: `BH-TSB-${num}`, name,
      desc: "Multi-floor steel frame apartment building with composite decking concrete slabs, rapid dry-construction erection, and engineering to international seismic design standards.",
      image: `images/products/${images[i]}`
    };
  });
}

function buildDuplex() {
  const names = [
    "Modern Minimalist Steel Duplex Villa", "Executive RC-Precast Hybrid Duplex", "Contemporary 4-Bedroom Steel Duplex",
    "Scandinavian Style Steel Duplex Home", "Premium Glass-Facade Steel Duplex", "Classic Bengal Steel Duplex Villa",
    "Family Garden Steel Duplex House", "Rooftop Terrace Steel Duplex Villa", "Double-Height Living Steel Duplex",
    "Corner Plot Steel Duplex Residence", "Compact Urban Steel Duplex Home", "Resort-Style Steel Duplex Villa"
  ];
  const images = [
    "dv-101.webp", "dv-102.webp", "dv-103.webp", "dv-104.webp",
    "dv-105.webp", "dv-106.webp", "dv-107.webp", "dv-108.webp",
    "dv-109.webp", "dv-110.webp", "dv-111.webp", "dv-112.webp"
  ];
  return names.map((name, i) => {
    const num = 201 + i;
    return {
      id: `bh-dv-${num}`, category: "duplex", categoryName: "Duplex Steel Building",
      modelCode: `BH-DV-${num}`, name,
      desc: "Luxury 2-story steel-framed family villa featuring 4 bedrooms, 4 bathrooms, double-height living room, and private balcony.",
      image: `images/products/${images[i]}`
    };
  });
}

function buildCottage() {
  const chNames = [
    "Eco Resort Prefab Steel Cottage", "Garden View Steel Cottage", "Hillside Retreat Steel Cottage",
    "Lakeside Vacation Steel Cottage", "Riverside Accent Steel Cottage", "Tropical Getaway Steel Cottage",
    "Countryside Steel Farm Cottage", "Beachfront Steel Holiday Cottage", "Forest Cabin Steel Cottage",
    "Weekend Retreat Steel Cottage", "Artist Studio Steel Cottage", "Guest House Steel Cottage"
  ];
  const thNames = [
    "Simplex Lakeview Steel Cottage", "Panoramic View Tiny Steel House", "Compact Studio Steel Tiny Home",
    "Off-Grid Steel Tiny House", "Minimalist Steel Micro Cottage", "Nomad Steel Tiny House",
    "Backyard Steel Tiny Guest House", "Mountain View Steel Tiny Cabin", "Urban Steel Micro-Living Unit",
    "Farmstead Steel Tiny House", "Eco-Friendly Steel Tiny Home", "Deluxe Steel Tiny House"
  ];
  const chImages = ["401", "402", "403", "404", "405", "406", "407", "408", "409", "410", "411", "412"];
  const products = [];

  chNames.forEach((name, i) => {
    products.push({
      id: `bh-ch-${400 + i + 1}`, category: "cottage", categoryName: "Steel Cottage House",
      modelCode: `BH-CH-${400 + i + 1}`, name,
      desc: "Charming vacation cottage framed with light gauge steel, featuring weather-resistant cladding and fast on-site setup.",
      image: chImages[i] === "412" ? "images/products/bh-ch-412.webp" : `images/products/Model No-BH-CH-${400 + i + 1}.webp`
    });
  });

  thNames.forEach((name, i) => {
    const num = 701 + i;
    products.push({
      id: `bh-th-${num}`, category: "cottage", categoryName: "Steel Cottage House",
      modelCode: `BH-TH-${num}`, name,
      desc: "Modern single-story steel framed holiday home with large panoramic windows and a weather-proof composite roof system.",
      image: `images/products/Model No-BH-TH-${num}.webp`
    });
  });

  return products;
}

function buildContainer() {
  const names = [
    "20ft Portable Site Office Container", "40ft Modern Luxury Container Home", "20ft Security Guard Cabin Container",
    "40ft Two-Bedroom Container House", "20ft Mobile Sales Kiosk Container", "40ft Container Café & Restaurant",
    "20ft Labor Accommodation Container", "40ft Container Guest House", "20ft Portable Toilet & Utility Container",
    "40ft Container Office Complex", "20ft Emergency Relief Container Unit", "40ft Luxury Container Villa"
  ];
  return names.map((name, i) => {
    const num = 501 + i;
    return {
      id: `bh-ch-${num}`, category: "container", categoryName: "Steel Container House",
      modelCode: `BH-CH-${num}`, name,
      desc: "Heavy-duty modified shipping container unit with insulated interior walls, factory-fitted wiring, and rapid delivery.",
      image: `images/products/bh-ch-${num}.webp`
    };
  });
}

const products = [
  ...buildFactory(),
  ...buildStructural(),
  ...buildDuplex(),
  ...buildCottage(),
  ...buildContainer()
].map((p, i) => ({ ...p, order: i }));

const featuredIds = ["bh-is-1006", "bh-tsb-109", "bh-dv-201", "bh-ch-401", "bh-ch-502"];

/* --------------------------------------------------------------------------
   EDITABLE COPY  — transcribed from index.html (keep keys in sync with
   the data-cms / data-cms-html attributes added there).
   -------------------------------------------------------------------------- */
const content = {
  version: 1,
  updated: new Date().toISOString(),

  settings: {
    companyName: "Bongshai Steel",
    hotline: "+8801789-949060",
    whatsappNumber: "8801789949060",
    email: "sales@bongshaisteel.com",
    address: "House #18, Road #18, Sector #10, Uttara C/A, Dhaka – 1230",
    workingHours: "Sat - Thu (9:00 AM - 7:00 PM GMT+6)",
    copyright: "© 2026 Bongshai Steel. All Rights Reserved. Designed for Ultra Fast International Performance.",
    footerBlurb: "Premier Steel Building Manufacturer & Exporter delivering AISC & BNBC certified pre-engineered factory buildings, warehouses, duplex steel homes, resort cottages, and container houses globally.",
    sisterLinks: [
      { label: "Bongshai Housing", url: "https://noormdgolam.github.io/bongshaihousing/" },
      { label: "Bongshai Engineering", url: "https://noormdgolam.github.io/Bongshaiengineering/" }
    ]
  },

  seo: {
    title: "Bongshai Steel | Steel Building Manufacturer & Exporter",
    description: "Bongshai Steel is a Bangladesh-based steel building manufacturer and exporter, delivering AISC & BNBC certified Pre-Engineered Steel Factory Buildings, Structural Steel Towers, Duplex Steel Homes, Resort Cottages, and Container Houses to the Middle East, Africa, South Asia, and worldwide."
  },

  text: {
    "hero.tag": "Worldwide Engineering Standards • AISC & Eurocode",
    "hero.title": "What is Bongshai Steel and what kinds of steel buildings do they manufacture?",
    "hero.description": "Bongshai Steel is a Bangladesh-based manufacturer and exporter of pre-engineered steel buildings — 72 models across factory sheds, duplex villas, cottages, and container houses. All structures are engineered to AISC 360, Eurocode 3, and BNBC 2020 standards.",
    "hero.btnPrimary": "Explore Full Catalog",
    "hero.btnSecondary": "Request Custom Quote",
    "hero.image": "images/products/Model No-BH-IS-1001.webp",

    "growing.subtitle": "Looking Ahead",
    "growing.title": "Growing Into New Markets",
    "growing.body": "Bongshai Steel's established export focus is the Middle East, Africa, and South Asia. As part of our long-term growth, we're also building engineering capability toward North American and Australian structural standards — AISC 360, CSA S16, and AS/NZS 4100 — to eventually serve those markets too.",
    "growing.btn": "Discuss a Project With Us",

    "threeD.subtitle": "Interactive 3D WebGL Engine",
    "threeD.title": "3D Structural Steel Portal Frame Inspector",
    "threeD.body": "Rotate, zoom, and customize a 3D structural steel portal frame in real time. Inspect columns, I-beams, purlins, roof panels, floor slab, and side walls built to AISC & Eurocode standards.",

    "categories.subtitle": "Complete Catalog",
    "categories.title": "Explore Our Steel Categories",
    "featured.subtitle": "Popular Models",
    "featured.title": "Flagship Structural Steel Solutions",

    "productsView.title": "Products Catalog",

    "services.subtitle": "Turnkey Solutions",
    "services.title": "Our Specialized Services",

    "safety.subtitle": "Zero Accident Commitment",
    "safety.title": "Health And Safety Policy (EHS)",

    "faq.subtitle": "Got Questions?",
    "faq.title": "Frequently Asked Questions",
    "faq.intro": "Everything you need to know about our pre-engineered steel buildings, structural standards, international export logistics, and quote procurement process.",

    "contact.subtitle": "Global Inquiries",
    "contact.title": "Contact Bongshai Steel",
    "contact.hqTitle": "Corporate Headquarters",
    "contact.formTitle": "Send Official Inquiry"
  },

  html: {
    "hero.byline": "<time datetime=\"2026-08-08\">Last updated: August 8, 2026</time> · Reviewed &amp; Approved by <strong>SMA Awal, Chief Engineer</strong>, Bongshai Steel",
    "faqTeaser.title": "Have Questions About Steel Buildings &amp; International Shipping?",
    "faqTeaser.body": "Read our detailed Frequently Asked Questions covering structural building codes (AISC/CSA/AS), export logistics, custom engineering, and the quotation process."
  },

  sections: {
    stats: [
      { value: "72 Models",    label: "Delivered to UAE, KSA & Kenya since 2004" },
      { value: "20+ Years",    label: "Industry Experience" },
      { value: "50-60 Years",  label: "Structural Lifespan Guarantee" },
      { value: "Case Study",   label: "3000 sqm Factory Shed Erected in 45 Days" }
    ],
    trustBar: [
      { icon: "🌍", title: "Worldwide Export Ready",   text: "Middle East, Africa, South Asia & Container Shipping" },
      { icon: "🏛️", title: "AISC & Eurocode Standards", text: 'Structural design aligned to <a href="https://www.aisc.org/" target="_blank" rel="noopener">AISC 360</a> and Eurocode 3. Certified to <a href="https://www.iso.org/standard/62085.html" target="_blank" rel="noopener">ISO 9001:2015</a>.' },
      { icon: "⚡",  title: "50%+ Faster Erection",     text: "Pre-punched bolt connections — zero on-site cutting" },
      { icon: "🏗️", title: "Custom BIM / Tekla Design", text: "3D Structural modeling tailored to site loads & spans" }
    ],
    services: [
      { title: "Architectural & Structural Engineering", desc: "Complete 3D Tekla BIM modeling, AISC structural load calculation, and BNBC seismic engineering by senior structural engineers." },
      { title: "Precision Steel Fabrication",            desc: "Automated CNC beam processing, SAW submerged arc welding, sandblasting, and epoxy anti-corrosion coating in our factory." },
      { title: "On-Site Erection & Installation",        desc: "Experienced erection crews, heavy mobile crane scheduling, torque bolt tightening, and zero-incident safety supervision." }
    ],
    safety: {
      intro: "Bongshai Steel maintains strict Environmental, Health, and Safety (EHS) policies across all factory floors and construction erection sites nationwide & internationally.",
      points: [
        "Mandatory PPE compliance (hard hats, full-body safety harnesses, steel-toe boots).",
        "ISO 9001:2015, ISO 14001, and OHSAS safety protocol compliance.",
        "100% certified heavy crane operators and certified high-altitude welders.",
        "Regular site hazard audits, wind shear protection, and emergency protocols."
      ]
    },
    faq: [
      { q: "What is a Pre-Engineered Steel Building (PEB)?", a: "A Pre-Engineered Steel Building (PEB) is a structural steel building system designed and manufactured in a factory, then shipped to the construction site for rapid bolt-together assembly — offering large clear-span spaces, superior structural integrity, and 50%+ faster construction than conventional reinforced concrete methods." },
      { q: "Does Bongshai Steel export steel buildings internationally?", a: "Yes. Bongshai Steel manufactures pre-engineered steel buildings in Bangladesh and exports worldwide, including to the USA (AISC 360), Canada (CSA S16), Australia (AS/NZS 4100), Middle East, Africa, and South Asia. Contact our engineering team to discuss sea freight logistics for your port." },
      { q: "What types of steel buildings does Bongshai Steel manufacture?", a: "Bongshai Steel's Prefab Buildings line covers five core categories: Heavy Steel Factory Buildings, Multi-story Structural Steel Towers, Luxury Duplex Steel Villas, Resort Cottages, and Modified Container Houses — featuring 72 distinct models. Additional lines for Heavy Steel Structure, Steel Furniture, Doors &amp; Gates, and Custom Steel Products are also available." },
      { q: "What structural standards does Bongshai Steel build to?", a: "Our engineering designs comply with <strong>AISC 360</strong> (USA), <strong>CSA S16</strong> (Canada), <strong>AS/NZS 4100</strong> (Australia), <strong>Eurocode 3</strong> (Europe), and <strong>BNBC 2020</strong> structural building codes. Welding and structural quality conform strictly to AWS D1.1 and ISO 9001:2015 standards." },
      { q: "How do I request an official quote from Bongshai Steel?", a: "Click any <strong>\"Get Quote\"</strong> or <strong>\"Get a Quote\"</strong> button on the site to open the quote request form, or WhatsApp us directly at <strong>+8801789-949060</strong>. Bongshai Steel does not publish fixed pricing — every building is custom engineered to the buyer's site dimensions, wind/snow loads, and eave heights. Quotes are provided directly by our engineering team within 24 hours." },
      { q: "Where is Bongshai Steel's factory located?", a: "Bongshai Steel's corporate headquarters and fabrication plant are located at House #18, Road #18, Sector #10, Uttara C/A, Dhaka – 1230, Bangladesh." },
      { q: "Is Bongshai Steel related to Bongshai Housing?", a: "Yes — Bongshai Steel and Bongshai Housing are sister companies within the Bongshai Group. Bongshai Housing focuses on domestic residential real estate within Bangladesh, while Bongshai Steel specializes in industrial steel fabrication and international building exports." },
      { q: "What are modified shipping container houses, and are they durable?", a: "Modified shipping container houses use standard 20ft or 40ft steel containers as the structural core, retrofitted with insulation, wiring, plumbing, and interior finishes for full residential or office use. As all-steel structures they are highly weather-resistant and relocatable. Bongshai Steel's BH-CH-501 to BH-CH-512 container models range from portable site offices to 40ft luxury container homes." },
      { q: "How long does it take to erect a pre-engineered steel building?", a: "Pre-engineered steel buildings from Bongshai Steel erect 50%+ faster than equivalent concrete construction. Factory-bolted connections and pre-punched components eliminate on-site cutting and welding. Typical erection time for an industrial factory shed is 30–60 days depending on span and complexity, once fabrication is complete and components are delivered to site." }
    ]
  },

  mainCategories,
  categories,
  products,
  featuredIds,

  /* image -> which responsive widths exist on disk. Seed the 4 source photos
     that have no -700w variant (mirrors app.js NO_700W); everything else has
     both -400w and -700w. Uploaded images add their own entries. */
  media: {
    "images/products/Model No-BH-TB-101.webp": { widths: [400] },
    "images/products/bh-tsb-108.webp": { widths: [400] },
    "images/products/Model No-BH-TH-708.webp": { widths: [400] },
    "images/products/Model No-BH-TH-711.webp": { widths: [400] }
  }
};

const outPath = resolve(ROOT, "data/content.default.json");
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify(content, null, 2) + "\n", "utf8");

console.log(`wrote ${outPath}`);
console.log(`  ${content.mainCategories.length} main categories`);
console.log(`  ${content.categories.length} prefab categories`);
console.log(`  ${content.products.length} products`);
console.log(`  ${content.sections.faq.length} FAQ items, ${content.sections.services.length} services`);
