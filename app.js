/* ==========================================================================
   BONGSHAI STEEL - ULTRA FAST JAVASCRIPT ENGINE & MODEL DATA
   ========================================================================== */

/* --------------------------------------------------------------------------
   CATEGORY METADATA (drives nav dropdown, home category cards, filters)
   -------------------------------------------------------------------------- */
const CATEGORIES = [
  {
    key: "factory",
    name: "Steel Factory Building",
    icon: "🏭",
    priceLabel: "৳1,200 – ৳1,800 / sqft",
    blurb: "SS400/Q355 heavy portal frame, 10–50 Ton EOT crane ready, PU insulation.",
    image: "images/products/Model No-BH-IS-1006.webp"
  },
  {
    key: "warehouse",
    name: "Steel Warehouse",
    icon: "📦",
    priceLabel: "৳1,000 – ৳1,500 / sqft",
    blurb: "High-bay logistics warehouses, 10m–14m eave height, cold storage PIR panels.",
    image: "images/products/Model No-BH-WH-804.webp"
  },
  {
    key: "structural",
    name: "Structural Steel Building",
    icon: "🏢",
    priceLabel: "৳1,800 – ৳3,000 / sqft",
    blurb: "Multi-story steel towers, composite decking concrete slab, BNBC code compliant.",
    image: "images/products/bh-sb-305.webp"
  },
  {
    key: "duplex",
    name: "Duplex Steel Building",
    icon: "🏘️",
    priceLabel: "Starting ৳30 Lakh",
    blurb: "Modern 2-story luxury steel duplexes, 4 Bed/4 Bath, 60-day rapid build.",
    image: "images/products/dv-104.webp"
  },
  {
    key: "cottage",
    name: "Steel Cottage House",
    icon: "🏡",
    priceLabel: "৳10 Lakh – ৳25 Lakh",
    blurb: "Eco resort prefab cottages, fiber cement cladding, fast on-site setup.",
    image: "images/products/Model No-BH-CH-405.webp"
  },
  {
    key: "container",
    name: "Steel Container House",
    icon: "🚢",
    priceLabel: "৳4.5 Lakh – ৳12 Lakh",
    blurb: "20ft & 40ft modified container site offices & luxury homes.",
    image: "images/products/bh-ch-502.webp"
  }
];

/* --------------------------------------------------------------------------
   HELPERS
   -------------------------------------------------------------------------- */
function lerp(min, max, i, count) {
  return count <= 1 ? min : Math.round(min + ((max - min) * i) / (count - 1));
}

function fmtTaka(n) {
  return "৳" + Math.round(n).toLocaleString("en-IN");
}

function fmtLakh(n) {
  return `${fmtTaka(n)} (৳${(n / 100000).toFixed(1)} Lakh)`;
}

/* --------------------------------------------------------------------------
   1. STEEL FACTORY BUILDING — BH-IS-1001 to BH-IS-1012
   -------------------------------------------------------------------------- */
function buildFactory() {
  const names = [
    "Heavy Industrial Factory Shed", "Textile & Garments Factory Building", "Agro-Processing Steel Mill",
    "Automotive Assembly Plant", "Pharmaceutical Manufacturing Facility", "Steel Fabrication Workshop",
    "Electronics Assembly Factory", "Cement & Building Materials Plant", "Food Processing Factory Shed",
    "Plastic & Packaging Manufacturing Unit", "Heavy Machinery Production Hall", "Chemical Processing Steel Plant"
  ];
  const spans = [30, 32, 35, 38, 40, 42, 45, 48, 50, 36, 44, 40];
  const cranes = ["10 Ton EOT Crane Ready", "15 Ton EOT Crane Ready", "20 Ton EOT Crane Ready", "25 Ton EOT Crane Ready",
    "30 Ton EOT Crane Ready", "35 Ton EOT Crane Ready", "40 Ton EOT Crane Ready", "45 Ton EOT Crane Ready",
    "50 Ton EOT Crane Ready", "Hoist Crane Compatible", "20 Ton EOT Crane Ready", "10 Ton EOT Crane Ready"];
  const roofs = ["75mm PU Sandwich Panel", "100mm PU Insulated Panel", "PU Insulation + Skylight", "EPS Insulated Sheet",
    "Color Coated Deck", "PIR Insulated Roof", "75mm PU Sandwich Panel", "100mm PU Insulated Panel",
    "PU Insulation + Skylight", "EPS Insulated Sheet", "PIR Insulated Roof", "Color Coated Deck"];
  const frames = ["Q355B Heavy Steel", "SS400 Steel Frame", "Q345 Portal Frame", "Galvanized Heavy Steel"];

  return names.map((name, i) => {
    const num = 1001 + i;
    const price = lerp(1200, 1800, i, names.length);
    return {
      id: `bh-is-${num}`,
      category: "factory",
      categoryName: "Steel Factory Building",
      modelCode: `BH-IS-${num}`,
      name,
      desc: "Heavy steel portal frame building engineered for manufacturing plants, heavy machinery, and industrial production lines nationwide.",
      price: `৳${price.toLocaleString("en-IN")} / sqft`,
      priceVal: price,
      warranty: "20-Year Structural Warranty",
      specs: [
        { label: "Clear Span", val: `${spans[i]}m` },
        { label: "Crane Capacity", val: cranes[i] },
        { label: "Roofing", val: roofs[i] },
        { label: "Steel Frame", val: frames[i % frames.length] }
      ],
      image: `images/products/Model No-BH-IS-${num}.webp`
    };
  });
}

/* --------------------------------------------------------------------------
   2. STEEL WAREHOUSE — BH-WH-801 to BH-WH-812
   -------------------------------------------------------------------------- */
function buildWarehouse() {
  const names = [
    "High-Bay Logistics Warehouse", "Cold Storage Steel Warehouse", "E-Commerce Fulfillment Center",
    "Bonded Storage Warehouse", "Automated Distribution Hub", "Retail Goods Storage Facility",
    "Bulk Cargo Warehouse", "Cross-Dock Logistics Terminal", "Pharmaceutical Cold Chain Warehouse",
    "Raw Material Storage Shed", "Multi-Tenant Industrial Warehouse", "Export Cargo Consolidation Warehouse"
  ];
  const eaves = [10, 10.5, 11, 11.5, 12, 12.5, 13, 13.5, 14, 11, 12, 13];
  const loads = ["3.5 Ton / m²", "4 Ton / m²", "4.5 Ton / m²", "5 Ton / m²", "5.5 Ton / m²", "4 Ton / m²",
    "3.5 Ton / m²", "4.5 Ton / m²", "5 Ton / m²", "4 Ton / m²", "5.5 Ton / m²", "4.5 Ton / m²"];
  const roofs = ["Insulated Skylight Panels", "100mm Cold Storage PIR Panel", "Double Skin Decking",
    "80mm PIR Insulated Panel", "Insulated Skylight Panels", "Color Coated Deck", "Double Skin Decking",
    "100mm Cold Storage PIR Panel", "Insulated Skylight Panels", "Color Coated Deck", "80mm PIR Insulated Panel", "Double Skin Decking"];

  return names.map((name, i) => {
    const num = 801 + i;
    const price = lerp(1000, 1500, i, names.length);
    return {
      id: `bh-wh-${num}`,
      category: "warehouse",
      categoryName: "Steel Warehouse",
      modelCode: `BH-WH-${num}`,
      name,
      desc: "High-clearance pre-engineered warehouse with mezzanine floor option, heavy forklift-rated slab, and rapid loading dock access.",
      price: `৳${price.toLocaleString("en-IN")} / sqft`,
      priceVal: price,
      warranty: "15-Year Structural Warranty",
      specs: [
        { label: "Eave Height", val: `${eaves[i]}m` },
        { label: "Floor Load", val: loads[i] },
        { label: "Roofing", val: roofs[i] },
        { label: "Bay Spacing", val: `${6 + (i % 3)}m Grid` }
      ],
      image: `images/products/Model No-BH-WH-${num}.webp`
    };
  });
}

/* --------------------------------------------------------------------------
   3. STRUCTURAL STEEL BUILDING — BH-TB-101 to BH-TB-112
   -------------------------------------------------------------------------- */
function buildStructural() {
  const names = [
    "Commercial Steel Multi-Story Complex", "Steel Composite Apartment Tower", "Corporate Steel Office Tower",
    "Mixed-Use Steel Commercial Building", "Steel-Framed Shopping Complex", "Institutional Steel Building",
    "Steel Composite Hospital Block", "High-Rise Residential Steel Tower", "Steel Educational Campus Building",
    "Multi-Level Parking Steel Structure", "Steel Composite Hotel Building", "Government Steel Administrative Building"
  ];
  const floors = ["3 to 5 Stories", "4 to 6 Stories", "5 to 7 Stories", "6 to 8 Stories", "5 to 10 Stories",
    "4 to 6 Stories", "6 to 9 Stories", "8 to 12 Stories", "3 to 5 Stories", "4 to 7 Stories", "6 to 10 Stories", "5 to 8 Stories"];
  const slabs = ["Composite Steel Decking", "Reinforced Composite Deck"];
  const seismic = ["BNBC Zone-2 Compliant", "BNBC Zone-3 Compliant", "BNBC Zone-4 Compliant", "Earthquake Resistant Design"];
  const speeds = [70, 75, 80, 85, 90, 95, 100, 105, 110, 115, 120, 90];
  const imgSb = [301, 302, 303, 304, 305, 306, 307, 308, 309, 310, 311, 312];

  return names.map((name, i) => {
    const num = 101 + i;
    const price = lerp(1800, 3000, i, names.length);
    return {
      id: `bh-tb-${num}`,
      category: "structural",
      categoryName: "Structural Steel Building",
      modelCode: `BH-TB-${num}`,
      name,
      desc: "Multi-floor steel frame building with composite decking concrete slabs, rapid dry-construction erection, and BNBC seismic code compliance.",
      price: `৳${price.toLocaleString("en-IN")} / sqft`,
      priceVal: price,
      warranty: "25-Year Structural Warranty",
      specs: [
        { label: "Floors", val: floors[i] },
        { label: "Slab System", val: slabs[i % slabs.length] },
        { label: "Seismic Rating", val: seismic[i % seismic.length] },
        { label: "Build Speed", val: `${speeds[i]} Days` }
      ],
      image: `images/products/bh-sb-${imgSb[i]}.webp`
    };
  });
}

/* --------------------------------------------------------------------------
   4. DUPLEX STEEL BUILDING — BH-DV-101 to BH-DV-113
   -------------------------------------------------------------------------- */
function buildDuplex() {
  const names = [
    "Modern Minimalist Steel Duplex Villa", "Executive RC-Precast Hybrid Duplex", "Contemporary 4-Bedroom Steel Duplex",
    "Scandinavian Style Steel Duplex Home", "Premium Glass-Facade Steel Duplex", "Classic Bengal Steel Duplex Villa",
    "Family Garden Steel Duplex House", "Rooftop Terrace Steel Duplex Villa", "Double-Height Living Steel Duplex",
    "Corner Plot Steel Duplex Residence", "Compact Urban Steel Duplex Home", "Resort-Style Steel Duplex Villa",
    "Signature Collection Steel Duplex"
  ];
  const finishes = ["Precast Concrete + Tiles", "RC Concrete Board + Paint", "Fiber Cement Cladding + Tiles",
    "Textured Render + Composite Panel", "Full Glass Curtain + Precast"];
  const speeds = [60, 65, 70, 62, 75, 68, 60, 80, 72, 65, 58, 78, 85];

  return names.map((name, i) => {
    const num = 101 + i;
    const area = 1650 + i * 90;
    const price = 3000000 + i * 200000;
    return {
      id: `bh-dv-${num}`,
      category: "duplex",
      categoryName: "Duplex Steel Building",
      modelCode: `BH-DV-${num}`,
      name,
      desc: "Luxury 2-story steel-framed family villa featuring 4 bedrooms, 4 bathrooms, double-height living room, and private balcony.",
      price: fmtLakh(price),
      priceVal: price,
      warranty: "50-Year Structural Warranty",
      specs: [
        { label: "Total Area", val: `${area.toLocaleString("en-IN")} sqft` },
        { label: "Layout", val: "4 Bed / 4 Bath" },
        { label: "Build Time", val: `${speeds[i]} Days` },
        { label: "Finish", val: finishes[i % finishes.length] }
      ],
      image: `images/products/dv-${num}.webp`
    };
  });
}

/* --------------------------------------------------------------------------
   5. STEEL COTTAGE HOUSE — BH-CH-401 to BH-CH-412 & BH-TH-701 to BH-TH-712
   -------------------------------------------------------------------------- */
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
  const layouts = ["1 Bed + Living + Porch", "2 Bed + 1 Bath + Deck", "1 Bed + Open Kitchen", "Studio + Loft"];
  const insulations = ["EPS Thermal Board", "PU Heat Insulation", "Fiber Cement Cladding", "Rockwool Insulated Panel"];
  const chImages = ["401", "402", "403", "404", "405", "406", "407", "408", "409", "410", "411", "412"];

  const products = [];

  chNames.forEach((name, i) => {
    const price = 1000000 + i * 62000;
    products.push({
      id: `bh-ch-${400 + i + 1}`,
      category: "cottage",
      categoryName: "Steel Cottage House",
      modelCode: `BH-CH-${400 + i + 1}`,
      name,
      desc: "Charming vacation cottage framed with light gauge steel, featuring weather-resistant cladding and a fast 25–35 day on-site setup.",
      price: fmtLakh(price),
      priceVal: price,
      warranty: "20-Year Structural Warranty",
      specs: [
        { label: "Floor Area", val: `${420 + i * 15} sqft` },
        { label: "Layout", val: layouts[i % layouts.length] },
        { label: "Insulation", val: insulations[i % insulations.length] },
        { label: "Setup Time", val: `${25 + (i % 6)} Days` }
      ],
      image: chImages[i] === "412" ? "images/products/bh-ch-412.webp" : `images/products/Model No-BH-CH-${400 + i + 1}.webp`
    });
  });

  thNames.forEach((name, i) => {
    const num = 701 + i;
    const price = 1620000 + i * 78000;
    products.push({
      id: `bh-th-${num}`,
      category: "cottage",
      categoryName: "Steel Cottage House",
      modelCode: `BH-TH-${num}`,
      name,
      desc: "Modern single-story steel framed holiday home with large panoramic windows and a weather-proof composite roof system.",
      price: fmtLakh(price),
      priceVal: price,
      warranty: "20-Year Structural Warranty",
      specs: [
        { label: "Floor Area", val: `${560 + i * 12} sqft` },
        { label: "Layout", val: layouts[(i + 2) % layouts.length] },
        { label: "Insulation", val: insulations[(i + 1) % insulations.length] },
        { label: "Setup Time", val: `${28 + (i % 8)} Days` }
      ],
      image: `images/products/Model No-BH-TH-${num}.webp`
    });
  });

  return products;
}

/* --------------------------------------------------------------------------
   6. STEEL CONTAINER HOUSE — BH-CH-501 to BH-CH-512
   -------------------------------------------------------------------------- */
function buildContainer() {
  const names = [
    "20ft Portable Site Office Container", "40ft Modern Luxury Container Home", "20ft Security Guard Cabin Container",
    "40ft Two-Bedroom Container House", "20ft Mobile Sales Kiosk Container", "40ft Container Café & Restaurant",
    "20ft Labor Accommodation Container", "40ft Container Guest House", "20ft Portable Toilet & Utility Container",
    "40ft Container Office Complex", "20ft Emergency Relief Container Unit", "40ft Luxury Container Villa"
  ];
  const types = ["Site Office / Cabin", "Residential / Resort Home", "Security / Guard Post", "Residential Home",
    "Retail / Kiosk", "Commercial / Café", "Labor Accommodation", "Guest House", "Utility / Sanitation",
    "Commercial Office", "Relief / Emergency Unit", "Luxury Residential Villa"];
  const features = ["Plug & Play Electricals", "Full Height Glass Front", "AC Port + LED Lighting", "Fitted Kitchen + Bath",
    "Display Windows + Counter", "Commercial Kitchen Vent", "Bunk Bed Fit-Out", "Ensuite Bathroom",
    "Water & Drainage Fitted", "Meeting Room Partition", "Rapid Deploy Skid Base", "Premium Interior Finish"];

  return names.map((name, i) => {
    const num = 501 + i;
    const is40 = name.startsWith("40ft");
    const price = lerp(450000, 1200000, i, names.length);
    return {
      id: `bh-ch-${num}`,
      category: "container",
      categoryName: "Steel Container House",
      modelCode: `BH-CH-${num}`,
      name,
      desc: "Heavy-duty modified shipping container unit with insulated interior walls, factory-fitted wiring, and rapid 1–2 day delivery.",
      price: fmtLakh(price),
      priceVal: price,
      warranty: "10-Year Container Structure Warranty",
      specs: [
        { label: "Size", val: is40 ? "40ft x 8ft x 9.6ft High Cube" : "20ft x 8ft x 8.6ft" },
        { label: "Type", val: types[i] },
        { label: "Features", val: features[i] },
        { label: "Setup", val: is40 ? "2-Day Plug & Play" : "Instant 1-Day Delivery" }
      ],
      image: `images/products/bh-ch-${num}.webp`
    };
  });
}

/* --------------------------------------------------------------------------
   FULL DATASET
   -------------------------------------------------------------------------- */
const PRODUCTS_DATA = [
  ...buildFactory(),
  ...buildWarehouse(),
  ...buildStructural(),
  ...buildDuplex(),
  ...buildCottage(),
  ...buildContainer()
];

// One flagship model per category for the homepage teaser
const FEATURED_IDS = ["bh-is-1006", "bh-wh-804", "bh-tb-105", "bh-dv-101", "bh-ch-401", "bh-ch-502"];

/* --------------------------------------------------------------------------
   INIT
   -------------------------------------------------------------------------- */
document.addEventListener("DOMContentLoaded", () => {
  renderCategoryCards();
  renderFeatured();
  renderCatalog("all");
  renderMediaGallery();
  setupEventListeners();
  setupEstimator();
  setupTheme();
});

/* --------------------------------------------------------------------------
   RENDERERS
   -------------------------------------------------------------------------- */
function productCardHTML(p) {
  return `
    <div class="product-card">
      <div class="product-thumb">
        <img src="${p.image}" alt="${p.name}" loading="lazy" decoding="async">
        <span class="product-badge">${p.modelCode}</span>
      </div>
      <div class="product-body">
        <span class="product-category">${p.categoryName}</span>
        <h3 class="product-name">${p.name}</h3>
        <p class="product-desc">${p.desc}</p>

        <div class="product-specs">
          ${p.specs.map(s => `<div class="spec-item"><span class="spec-label">${s.label}</span><span class="spec-val">${s.val}</span></div>`).join("")}
        </div>

        <div class="product-footer">
          <div class="product-price">${p.price}</div>
          <button class="btn-detail" onclick="openProductModal('${p.id}')">View Details</button>
        </div>
      </div>
    </div>
  `;
}

function renderCategoryCards() {
  const container = document.getElementById("categoryCardsGrid");
  if (!container) return;
  container.innerHTML = CATEGORIES.map(c => {
    const count = PRODUCTS_DATA.filter(p => p.category === c.key).length;
    return `
      <a class="glass-card category-card-home" onclick="navigateToView('productsView'); renderCatalog('${c.key}');">
        <div class="cat-home-thumb">
          <img src="${c.image}" alt="${c.name}" loading="lazy" decoding="async">
        </div>
        <div class="cat-home-body">
          <span class="cat-home-icon">${c.icon}</span>
          <h3>${c.name}</h3>
          <p>${c.blurb}</p>
          <div class="cat-home-footer">
            <span class="cat-home-price">${c.priceLabel}</span>
            <span class="cat-home-count">${count} Models →</span>
          </div>
        </div>
      </a>
    `;
  }).join("");
}

function renderFeatured() {
  const container = document.getElementById("featuredGrid");
  if (!container) return;
  const featured = FEATURED_IDS.map(id => PRODUCTS_DATA.find(p => p.id === id)).filter(Boolean);
  container.innerHTML = featured.map(productCardHTML).join("");
}

// Full catalog (Products view) — grouped by category on "all", flat on a specific category
function renderCatalog(filterCategory) {
  const container = document.getElementById("productsGridPage");
  if (!container) return;

  // Sync filter button active state
  document.querySelectorAll(".filter-btn").forEach(b => {
    b.classList.toggle("active", b.getAttribute("data-category") === filterCategory);
  });

  if (filterCategory === "all") {
    container.innerHTML = CATEGORIES.map(c => {
      const items = PRODUCTS_DATA.filter(p => p.category === c.key);
      return `
        <div class="catalog-group">
          <div class="catalog-group-header">
            <h3>${c.icon} ${c.name} <span>(${items.length} Models · ${c.priceLabel})</span></h3>
          </div>
          <div class="products-grid">${items.map(productCardHTML).join("")}</div>
        </div>
      `;
    }).join("");
  } else {
    const items = PRODUCTS_DATA.filter(p => p.category === filterCategory);
    container.innerHTML = `<div class="products-grid">${items.map(productCardHTML).join("")}</div>`;
  }
}

// Legacy shim: nav dropdown / footer links call renderProducts(category)
function renderProducts(category) {
  renderCatalog(category);
}

function renderMediaGallery() {
  const container = document.getElementById("mediaGallery");
  if (!container) return;
  const sample = PRODUCTS_DATA.filter((_, i) => i % 7 === 0).slice(0, 12);
  container.innerHTML = sample.map(p => `
    <div class="media-item">
      <img src="${p.image}" alt="${p.name}" loading="lazy" decoding="async">
      <span class="media-caption">${p.modelCode} — ${p.categoryName}</span>
    </div>
  `).join("");
}

/* --------------------------------------------------------------------------
   EVENT LISTENERS
   -------------------------------------------------------------------------- */
function setupEventListeners() {
  document.querySelectorAll(".filter-btn").forEach(btn => {
    btn.addEventListener("click", () => renderCatalog(btn.getAttribute("data-category")));
  });

  const hamburger = document.getElementById("hamburgerBtn");
  const drawer = document.getElementById("mobileDrawer");
  const drawerClose = document.getElementById("drawerClose");

  if (hamburger && drawer) hamburger.addEventListener("click", () => drawer.classList.add("active"));
  if (drawerClose && drawer) drawerClose.addEventListener("click", () => drawer.classList.remove("active"));

  const themeToggle = document.getElementById("themeToggle");
  if (themeToggle) themeToggle.addEventListener("click", toggleTheme);
}

/* --------------------------------------------------------------------------
   THEME (DARK / LIGHT)
   -------------------------------------------------------------------------- */
function setupTheme() {
  const saved = localStorage.getItem("bongshai-theme");
  const prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  const theme = saved || (prefersDark ? "dark" : "light");
  applyTheme(theme);
}

function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  const toggle = document.getElementById("themeToggle");
  if (toggle) toggle.textContent = theme === "dark" ? "☀️" : "🌙";
  localStorage.setItem("bongshai-theme", theme);
}

function toggleTheme() {
  const current = document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
  applyTheme(current === "dark" ? "light" : "dark");
}

/* --------------------------------------------------------------------------
   NAVIGATION VIEW SWITCHER (INSTANT SPA NAVIGATION)
   -------------------------------------------------------------------------- */
function navigateToView(viewId) {
  document.querySelectorAll(".page-view").forEach(v => v.classList.remove("active-view"));
  const targetView = document.getElementById(viewId);
  if (targetView) {
    targetView.classList.add("active-view");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  const drawer = document.getElementById("mobileDrawer");
  if (drawer) drawer.classList.remove("active");
}

/* --------------------------------------------------------------------------
   INTERACTIVE COST & STEEL WEIGHT ESTIMATOR
   -------------------------------------------------------------------------- */
const ESTIMATOR_RATES = {
  factory:    { rate: 1500, weight: 4.5 },
  warehouse:  { rate: 1250, weight: 3.2 },
  structural: { rate: 2400, weight: 6.5 },
  duplex:     { rate: 1800, weight: 4.2 },
  cottage:    { rate: 2200, weight: 3.5 },
  container:  { rate: 2800, weight: 5.0 }
};

function setupEstimator() {
  const lengthInput = document.getElementById("estLength");
  const widthInput = document.getElementById("estWidth");
  const heightInput = document.getElementById("estHeight");
  const typeSelect = document.getElementById("estType");

  if (!lengthInput || !widthInput || !typeSelect) return;

  function calculate() {
    const l = parseFloat(lengthInput.value) || 0;
    const w = parseFloat(widthInput.value) || 0;
    const areaSqft = l * w;

    const config = ESTIMATOR_RATES[typeSelect.value] || ESTIMATOR_RATES.factory;
    const estimatedCost = Math.round(areaSqft * config.rate);
    const estimatedWeightTon = ((areaSqft * config.weight) / 1000).toFixed(1);

    const costDisplay = document.getElementById("estCostDisplay");
    const weightDisplay = document.getElementById("estWeightDisplay");

    if (costDisplay) costDisplay.innerText = areaSqft > 0 ? fmtTaka(estimatedCost) : "৳ 0";
    if (weightDisplay) weightDisplay.innerText = areaSqft > 0
      ? `Estimated Steel Weight: ${estimatedWeightTon} Metric Tons`
      : "Estimated Steel Weight: 0 Tons";
  }

  lengthInput.addEventListener("input", calculate);
  widthInput.addEventListener("input", calculate);
  if (heightInput) heightInput.addEventListener("input", calculate);
  typeSelect.addEventListener("change", calculate);

  calculate();
}

/* --------------------------------------------------------------------------
   MODAL POPUPS — PRODUCT SPEC SHEET / QUOTE / JOB APPLICATION
   -------------------------------------------------------------------------- */
function openProductModal(productId) {
  const product = PRODUCTS_DATA.find(p => p.id === productId);
  if (!product) return;

  const modalOverlay = document.getElementById("modalOverlay");
  const modalBox = document.getElementById("modalContent");
  if (!modalOverlay || !modalBox) return;

  modalBox.innerHTML = `
    <div class="modal-header">
      <h3 class="modal-title">${product.name} (${product.modelCode})</h3>
      <button class="modal-close" onclick="closeModal()">✕</button>
    </div>
    <div class="modal-body">
      <img src="${product.image}" alt="${product.name}" style="width:100%; height:280px; object-fit:cover; border-radius:8px; margin-bottom:20px;">
      <p style="font-size:1.05rem; color:var(--text-muted); margin-bottom:20px;">${product.desc}</p>

      <div class="modal-spec-grid">
        <div><strong>Category:</strong> ${product.categoryName}</div>
        <div><strong>Price Estimate:</strong> ${product.price}</div>
        ${product.specs.map(s => `<div><strong>${s.label}:</strong> ${s.val}</div>`).join("")}
        <div><strong>Warranty:</strong> ${product.warranty}</div>
      </div>

      <button class="btn-modal-cta" onclick="openQuoteModal('${product.modelCode}')">
        Request Official Quote for ${product.modelCode}
      </button>
    </div>
  `;

  modalOverlay.classList.add("active");
}

function openQuoteModal(modelCode = "") {
  const modalOverlay = document.getElementById("modalOverlay");
  const modalBox = document.getElementById("modalContent");
  if (!modalOverlay || !modalBox) return;

  modalBox.innerHTML = `
    <div class="modal-header">
      <h3 class="modal-title">Get Official Quote ${modelCode ? `for ${modelCode}` : ""}</h3>
      <button class="modal-close" onclick="closeModal()">✕</button>
    </div>
    <div class="modal-body">
      <form onsubmit="handleQuoteSubmit(event)">
        <div class="form-field">
          <label>Your Full Name</label>
          <input type="text" required placeholder="e.g. Mr. Kabir Ahmed">
        </div>
        <div class="form-field">
          <label>Phone Number</label>
          <input type="tel" required placeholder="+88017XXXXXXXX">
        </div>
        <div class="form-field">
          <label>Project Location</label>
          <input type="text" placeholder="e.g. Gazipur, Dhaka">
        </div>
        <div class="form-field">
          <label>Building Dimensions / Requirements</label>
          <textarea rows="3" placeholder="Specify length, width, height or model details..."></textarea>
        </div>
        <button type="submit" class="btn-modal-submit">Submit Quote Request</button>
      </form>
    </div>
  `;

  modalOverlay.classList.add("active");
}

function openJobModal(jobTitle = "") {
  const modalOverlay = document.getElementById("modalOverlay");
  const modalBox = document.getElementById("modalContent");
  if (!modalOverlay || !modalBox) return;

  modalBox.innerHTML = `
    <div class="modal-header">
      <h3 class="modal-title">Apply ${jobTitle ? `— ${jobTitle}` : ""}</h3>
      <button class="modal-close" onclick="closeModal()">✕</button>
    </div>
    <div class="modal-body">
      <form onsubmit="handleJobSubmit(event)">
        <div class="form-field">
          <label>Full Name</label>
          <input type="text" required placeholder="e.g. Fahmida Islam">
        </div>
        <div class="form-field">
          <label>Phone Number</label>
          <input type="tel" required placeholder="+88017XXXXXXXX">
        </div>
        <div class="form-field">
          <label>Email Address</label>
          <input type="email" required placeholder="you@example.com">
        </div>
        <div class="form-field">
          <label>Position Applying For</label>
          <input type="text" value="${jobTitle}" placeholder="Position title">
        </div>
        <div class="form-field">
          <label>Years of Relevant Experience</label>
          <input type="text" placeholder="e.g. 5 Years">
        </div>
        <div class="form-field">
          <label>Cover Note / CV Link</label>
          <textarea rows="3" placeholder="Paste a Google Drive / LinkedIn link, or a short note about yourself..."></textarea>
        </div>
        <button type="submit" class="btn-modal-submit">Submit Application</button>
      </form>
    </div>
  `;

  modalOverlay.classList.add("active");
}

function closeModal() {
  const modalOverlay = document.getElementById("modalOverlay");
  if (modalOverlay) modalOverlay.classList.remove("active");
}

function handleQuoteSubmit(e) {
  e.preventDefault();
  alert("Thank you! Your quote request has been submitted successfully. Our engineering team at Bongshai Steel will contact you shortly.");
  closeModal();
}

function handleJobSubmit(e) {
  e.preventDefault();
  alert("Thank you for applying! Our HR team will review your application and get back to you if shortlisted.");
  closeModal();
}
