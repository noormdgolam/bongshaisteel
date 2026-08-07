/* ==========================================================================
   BONGSHAI STEEL - ULTRA FAST JAVASCRIPT ENGINE & MODEL DATA
   ========================================================================== */

/* --------------------------------------------------------------------------
   MAIN PRODUCT LINES (drives the Products nav dropdown + home cards).
   Only "Prefab Buildings" has real catalog data right now; the other four
   are real planned product lines with no models yet — they route to an
   honest "Coming Soon" view rather than showing invented products.
   -------------------------------------------------------------------------- */
const MAIN_CATEGORIES = [
  {
    key: "prefab",
    name: "Prefab Buildings",
    icon: "🏗️",
    blurb: "Pre-engineered steel factories, apartment buildings, duplex homes, cottages, and container houses.",
    ready: true
  },
  {
    key: "structure",
    name: "Steel Structure",
    icon: "🏛️",
    blurb: "Structural steel fabrication for industrial and commercial projects.",
    ready: false
  },
  {
    key: "furniture",
    name: "Steel Furniture",
    icon: "🪑",
    blurb: "Durable steel furniture for home, office, and industrial use.",
    ready: false
  },
  {
    key: "doorgate",
    name: "Door and Gate",
    icon: "🚪",
    blurb: "Custom steel doors and gates built to order.",
    ready: false
  },
  {
    key: "siteothers",
    name: "Others Steel Products",
    icon: "🔧",
    blurb: "Additional steel products and on-site fabrication services.",
    ready: false
  }
];

/* --------------------------------------------------------------------------
   PREFAB BUILDING CATEGORIES (drives the Prefab Buildings sidebar/catalog)
   -------------------------------------------------------------------------- */
const CATEGORIES = [
  {
    key: "factory",
    name: "Steel Factory Building",
    icon: "🏭",
    blurb: "SS400/Q355 heavy portal frame, 10–50 Ton EOT crane ready, PU insulation.",
    image: "images/products/Model No-BH-IS-1006.webp"
  },
  {
    key: "structural",
    name: "Structural Steel Building",
    icon: "🏢",
    blurb: "Multi-story steel apartment towers, composite decking concrete slab, engineered to international structural standards.",
    image: "images/products/bh-tsb-109.webp"
  },
  {
    key: "duplex",
    name: "Duplex Steel Building",
    icon: "🏘️",
    blurb: "Modern 2-story luxury steel duplexes, 4 Bed/4 Bath, 60-day rapid build.",
    image: "images/products/dv-104.webp"
  },
  {
    key: "cottage",
    name: "Steel Cottage House",
    icon: "🏡",
    blurb: "Eco resort prefab cottages, fiber cement cladding, fast on-site setup.",
    image: "images/products/Model No-BH-CH-405.webp"
  },
  {
    key: "container",
    name: "Steel Container House",
    icon: "🚢",
    blurb: "20ft & 40ft modified container site offices & luxury homes.",
    image: "images/products/bh-ch-502.webp"
  }
];

/* --------------------------------------------------------------------------
   HELPERS
   -------------------------------------------------------------------------- */
// Source photos missing a -700w variant on disk (verified against images/products/).
const NO_700W = new Set([
  "images/products/Model No-BH-TB-101.webp",
  "images/products/bh-tsb-108.webp",
  "images/products/Model No-BH-TH-708.webp",
  "images/products/Model No-BH-TH-711.webp"
]);

// Builds src/srcset/sizes attributes for a responsive <img>, using the
// -400w/-700w variants that already exist on disk alongside each full-size photo.
// srcset entries must be URI-encoded: unlike a plain src, whitespace in a
// srcset candidate is the delimiter between the URL and its width descriptor,
// and several of these filenames ("Model No-BH-...") contain literal spaces.
function responsiveImgAttrs(imagePath, sizes) {
  const base = imagePath.replace(/\.webp$/, "");
  const enc = (p) => encodeURI(p);
  const candidates = [`${enc(base)}-400w.webp 400w`];
  if (!NO_700W.has(imagePath)) candidates.push(`${enc(base)}-700w.webp 700w`);
  candidates.push(`${enc(imagePath)} 1024w`);
  return `src="${imagePath}" srcset="${candidates.join(", ")}" sizes="${sizes}"`;
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
  return names.map((name, i) => {
    const num = 1001 + i;
    return {
      id: `bh-is-${num}`,
      category: "factory",
      categoryName: "Steel Factory Building",
      modelCode: `BH-IS-${num}`,
      name,
      desc: "Heavy steel portal frame building engineered for manufacturing plants, heavy machinery, and industrial production lines worldwide.",
      image: `images/products/Model No-BH-IS-${num}.webp`
    };
  });
}

/* --------------------------------------------------------------------------
   2. STRUCTURAL STEEL BUILDING — BH-TSB-101 to BH-TSB-112 (real "Apartment
   Building" line; image per model verified against the live product page)
   -------------------------------------------------------------------------- */
function buildStructural() {
  const names = [
    "Urban Steel Apartment Complex", "Modern Steel Residential Tower", "Family Steel Apartment Building",
    "Riverside Steel Apartment Complex", "Compact Steel Apartment Block", "Premium Steel Residential Complex",
    "Garden View Steel Apartment Tower", "Corner Plot Steel Apartment Building", "Mid-Rise Steel Residential Complex",
    "Skyline Steel Apartment Tower", "Community Steel Apartment Complex", "Signature Steel Apartment Residence"
  ];
  // Verified against each bh-tsb-1XX.html product page's own JSON-LD image field.
  // 105's source page references a non-webp .jfif asset; substituted with the
  // nearest real webp from the same series to keep the site all-WebP.
  const images = [
    "Model No-BH-TB-101.webp", "Model No-BH-TB-102.webp", "bh-tsb-103.webp", "Model No-BH-TB-104.webp",
    "Model No-BH-TB-104.webp", "bh-tsb-106.webp", "dv-107.webp", "bh-tsb-108.webp",
    "bh-tsb-109.webp", "bh-tsb-110.webp", "bh-tsb-111.webp", "bh-tsb-112.webp"
  ];

  return names.map((name, i) => {
    const num = 101 + i;
    return {
      id: `bh-tsb-${num}`,
      category: "structural",
      categoryName: "Structural Steel Building",
      modelCode: `BH-TSB-${num}`,
      name,
      desc: "Multi-floor steel frame apartment building with composite decking concrete slabs, rapid dry-construction erection, and engineering to international seismic design standards.",
      image: `images/products/${images[i]}`
    };
  });
}

/* --------------------------------------------------------------------------
   3. DUPLEX STEEL BUILDING — BH-DV-201 to BH-DV-212 (image per model verified
   against the live product page's own JSON-LD image field)
   -------------------------------------------------------------------------- */
function buildDuplex() {
  const names = [
    "Modern Minimalist Steel Duplex Villa", "Executive RC-Precast Hybrid Duplex", "Contemporary 4-Bedroom Steel Duplex",
    "Scandinavian Style Steel Duplex Home", "Premium Glass-Facade Steel Duplex", "Classic Bengal Steel Duplex Villa",
    "Family Garden Steel Duplex House", "Rooftop Terrace Steel Duplex Villa", "Double-Height Living Steel Duplex",
    "Corner Plot Steel Duplex Residence", "Compact Urban Steel Duplex Home", "Resort-Style Steel Duplex Villa"
  ];
  const images = [
    "dv-101.webp", "dv-102.webp", "villa_1_1782293220395.webp", "dv-104.webp",
    "dv-105.webp", "dv-106.webp", "cottage_2_1782293207157.webp", "dv-108.webp",
    "dv-109.webp", "dv-110.webp", "dv-111.webp", "dv-112.webp"
  ];

  return names.map((name, i) => {
    const num = 201 + i;
    return {
      id: `bh-dv-${num}`,
      category: "duplex",
      categoryName: "Duplex Steel Building",
      modelCode: `BH-DV-${num}`,
      name,
      desc: "Luxury 2-story steel-framed family villa featuring 4 bedrooms, 4 bathrooms, double-height living room, and private balcony.",
      image: `images/products/${images[i]}`
    };
  });
}

/* --------------------------------------------------------------------------
   4. STEEL COTTAGE HOUSE — BH-CH-401 to BH-CH-412 & BH-TH-701 to BH-TH-712
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
  const chImages = ["401", "402", "403", "404", "405", "406", "407", "408", "409", "410", "411", "412"];

  const products = [];

  chNames.forEach((name, i) => {
    products.push({
      id: `bh-ch-${400 + i + 1}`,
      category: "cottage",
      categoryName: "Steel Cottage House",
      modelCode: `BH-CH-${400 + i + 1}`,
      name,
      desc: "Charming vacation cottage framed with light gauge steel, featuring weather-resistant cladding and fast on-site setup.",
      image: chImages[i] === "412" ? "images/products/bh-ch-412.webp" : `images/products/Model No-BH-CH-${400 + i + 1}.webp`
    });
  });

  thNames.forEach((name, i) => {
    const num = 701 + i;
    products.push({
      id: `bh-th-${num}`,
      category: "cottage",
      categoryName: "Steel Cottage House",
      modelCode: `BH-TH-${num}`,
      name,
      desc: "Modern single-story steel framed holiday home with large panoramic windows and a weather-proof composite roof system.",
      image: `images/products/Model No-BH-TH-${num}.webp`
    });
  });

  return products;
}

/* --------------------------------------------------------------------------
   5. STEEL CONTAINER HOUSE — BH-CH-501 to BH-CH-512
   -------------------------------------------------------------------------- */
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
      id: `bh-ch-${num}`,
      category: "container",
      categoryName: "Steel Container House",
      modelCode: `BH-CH-${num}`,
      name,
      desc: "Heavy-duty modified shipping container unit with insulated interior walls, factory-fitted wiring, and rapid delivery.",
      image: `images/products/bh-ch-${num}.webp`
    };
  });
}

/* --------------------------------------------------------------------------
   FULL DATASET
   -------------------------------------------------------------------------- */
const PRODUCTS_DATA = [
  ...buildFactory(),
  ...buildStructural(),
  ...buildDuplex(),
  ...buildCottage(),
  ...buildContainer()
];

// One flagship model per category for the homepage teaser
const FEATURED_IDS = ["bh-is-1006", "bh-tsb-109", "bh-dv-201", "bh-ch-401", "bh-ch-502"];

/* --------------------------------------------------------------------------
   INIT
   -------------------------------------------------------------------------- */
document.addEventListener("DOMContentLoaded", () => {
  renderCategoryCards();
  renderFeatured();
  renderCatalog("all");
  setupEventListeners();
  setupTheme();
  init3dSteelCanvas();
});

/* --------------------------------------------------------------------------
   RENDERERS
   -------------------------------------------------------------------------- */
function productCardHTML(p) {
  return `
    <div class="product-card">
      <div class="product-thumb">
        <img ${responsiveImgAttrs(p.image, "(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 350px")} alt="${p.name}" loading="lazy" decoding="async">
        <span class="product-badge">${p.modelCode}</span>
      </div>
      <div class="product-body">
        <span class="product-category">${p.categoryName}</span>
        <h3 class="product-name">${p.name}</h3>
        <p class="product-desc">${p.desc}</p>

        <div class="product-footer">
          <button class="btn-detail" onclick="openProductModal('${p.id}')">View Details</button>
          <button class="btn-get-quote" onclick="openQuoteModal('${p.modelCode}')">Get Quote</button>
        </div>
      </div>
    </div>
  `;
}

// Home page "Browse by Product Line" cards — renders image + description + model count for all categories.
function renderCategoryCards() {
  const container = document.getElementById("categoryCardsGrid");
  if (!container) return;
  container.innerHTML = CATEGORIES.map(c => {
    const modelCount = PRODUCTS_DATA.filter(p => p.category === c.key).length;
    return `
      <button type="button" class="cat-card" onclick="navigateToCategory('${c.key}')">
        <div class="cat-card-img">
          <img ${responsiveImgAttrs(c.image, "(max-width: 640px) 100vw, 360px")} alt="${c.name}" loading="lazy" decoding="async">
        </div>
        <div class="cat-card-body">
          <h3 class="cat-card-title">${c.icon} ${c.name}</h3>
          <p class="cat-card-desc">${c.blurb}</p>
          <span class="cat-card-link">${modelCount} Models →</span>
        </div>
      </button>
    `;
  }).join("");
}

function navigateToCategory(catKey) {
  navigateToView("productsView");
  const cat = CATEGORIES.find(c => c.key === catKey);
  const title = document.getElementById("productsViewTitle");
  if (title && cat) title.textContent = cat.name;
  renderCatalog(catKey);
}

// Routes a Products-nav / home-card click to the shared Products view,
// rendering either the real Prefab Buildings catalog or an honest
// "Coming Soon" placeholder for the four product lines with no models yet.
function goToMainCategory(key) {
  const cat = MAIN_CATEGORIES.find(c => c.key === key);
  if (!cat) return;
  navigateToView("productsView");
  const title = document.getElementById("productsViewTitle");
  if (title) title.textContent = cat.name;
  if (cat.ready) {
    renderCatalog("all");
  } else {
    renderComingSoon(cat);
  }
}

function renderComingSoon(cat) {
  const container = document.getElementById("productsViewContainer");
  if (!container) return;
  container.innerHTML = `
    <div class="cat-card" style="max-width:800px; margin:0 auto; padding:40px; text-align:center; cursor:default;">
      <div style="font-size:3rem; margin-bottom:16px;">${cat.icon}</div>
      <p style="font-size:1.1rem; color:var(--text-muted); margin-bottom:16px;">${cat.blurb}</p>
      <p style="color:var(--text-muted); margin-bottom:24px;">This product line is launching soon. Contact our team for early access, custom orders, or bulk inquiries.</p>
      <button class="btn-primary-hero" style="border:none; cursor:pointer;" onclick="openQuoteModal()">Contact Us</button>
    </div>
  `;
}

function renderFeatured() {
  const container = document.getElementById("featuredGrid");
  if (!container) return;
  const featured = FEATURED_IDS.map(id => PRODUCTS_DATA.find(p => p.id === id)).filter(Boolean);
  container.innerHTML = featured.map(productCardHTML).join("");
}

// Full catalog (Products view) — grouped by category on "all", flat on a specific category
function renderCatalog(filterCategory) {
  const container = document.getElementById("productsViewContainer");
  if (!container) return;

  if (filterCategory === "all") {
    container.innerHTML = CATEGORIES.map(c => {
      const items = PRODUCTS_DATA.filter(p => p.category === c.key);
      return `
        <div class="catalog-group">
          <div class="catalog-group-header">
            <h3>${c.icon} ${c.name} <span>(${items.length} Models)</span></h3>
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

/* --------------------------------------------------------------------------
   EVENT LISTENERS
   -------------------------------------------------------------------------- */
function setupEventListeners() {
  const hamburger = document.getElementById("hamburgerBtn");
  const drawer = document.getElementById("mobileDrawer");
  const drawerClose = document.getElementById("drawerClose");

  if (hamburger && drawer) {
    hamburger.addEventListener("click", () => {
      openOverlay(drawer);
      hamburger.setAttribute("aria-expanded", "true");
    });
    drawer.addEventListener("click", (e) => {
      if (e.target === drawer) closeDrawer();
    });
  }
  if (drawerClose) drawerClose.addEventListener("click", closeDrawer);

  const modalOverlay = document.getElementById("modalOverlay");
  if (modalOverlay) {
    modalOverlay.addEventListener("click", (e) => {
      if (e.target === modalOverlay) closeModal();
    });
  }

  document.addEventListener("keydown", (e) => {
    const overlay = activeOverlay();
    if (!overlay) return;

    if (e.key === "Escape") {
      e.preventDefault();
      if (overlay.id === "mobileDrawer") closeDrawer(); else closeModal();
      return;
    }

    if (e.key === "Tab") {
      const focusable = getFocusable(overlay);
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  });

  setupDropdownAria();

  const themeToggle = document.getElementById("themeToggle");
  if (themeToggle) themeToggle.addEventListener("click", toggleTheme);
}

// Keeps aria-expanded on the Products trigger in sync with the CSS-driven
// :hover / :focus-within dropdown visibility.
function setupDropdownAria() {
  document.querySelectorAll(".nav-item").forEach(item => {
    const trigger = item.querySelector(":scope > .nav-link[aria-haspopup]");
    const menu = item.querySelector(".dropdown-menu");
    if (!trigger || !menu) return;
    const setExpanded = (val) => trigger.setAttribute("aria-expanded", String(val));
    item.addEventListener("mouseenter", () => setExpanded(true));
    item.addEventListener("mouseleave", () => setExpanded(false));
    item.addEventListener("focusin", () => setExpanded(true));
    item.addEventListener("focusout", (e) => {
      if (!item.contains(e.relatedTarget)) setExpanded(false);
    });
  });
}

function closeDrawer() {
  const drawer = document.getElementById("mobileDrawer");
  const hamburger = document.getElementById("hamburgerBtn");
  if (drawer) closeOverlay(drawer);
  if (hamburger) hamburger.setAttribute("aria-expanded", "false");
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
  if (drawer && drawer.classList.contains("active")) closeDrawer();
}

/* --------------------------------------------------------------------------
   OVERLAY ACCESSIBILITY — shared by the modal overlay and the mobile drawer:
   focus trap, Escape-to-close, backdrop-click-to-close, focus restore.
   -------------------------------------------------------------------------- */
let lastFocusedElement = null;

function getFocusable(container) {
  return Array.from(container.querySelectorAll(
    'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
  )).filter(el => el.offsetParent !== null);
}

function openOverlay(overlayEl, focusEl) {
  lastFocusedElement = document.activeElement;
  overlayEl.classList.add("active");
  const target = focusEl || getFocusable(overlayEl)[0];
  if (target) target.focus();
}

function closeOverlay(overlayEl) {
  overlayEl.classList.remove("active");
  if (lastFocusedElement && document.body.contains(lastFocusedElement)) {
    lastFocusedElement.focus();
  }
  lastFocusedElement = null;
}

function activeOverlay() {
  const modal = document.getElementById("modalOverlay");
  const drawer = document.getElementById("mobileDrawer");
  if (modal && modal.classList.contains("active")) return modal;
  if (drawer && drawer.classList.contains("active")) return drawer;
  return null;
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
      <h3 class="modal-title" id="modalTitle">${product.name} (${product.modelCode})</h3>
      <button class="modal-close" onclick="closeModal()">✕</button>
    </div>
    <div class="modal-body">
      <img ${responsiveImgAttrs(product.image, "(max-width: 650px) 100vw, 650px")} alt="${product.name}" style="width:100%; height:280px; object-fit:cover; border-radius:8px; margin-bottom:20px;">
      <p style="font-size:1.05rem; color:var(--text-muted); margin-bottom:20px;">${product.desc}</p>

      <p style="margin-bottom:20px;"><strong>Category:</strong> ${product.categoryName}</p>

      <button class="btn-modal-cta" onclick="openQuoteModal('${product.modelCode}')">
        Request Official Quote for ${product.modelCode}
      </button>
    </div>
  `;

  openOverlay(modalOverlay, modalBox.querySelector(".modal-close"));
}

function openQuoteModal(modelCode = "") {
  const modalOverlay = document.getElementById("modalOverlay");
  const modalBox = document.getElementById("modalContent");
  if (!modalOverlay || !modalBox) return;

  modalBox.innerHTML = `
    <div class="modal-header">
      <h3 class="modal-title" id="modalTitle">Get Official Quote ${modelCode ? `for ${modelCode}` : ""}</h3>
      <button class="modal-close" onclick="closeModal()">✕</button>
    </div>
    <div class="modal-body">
      <form onsubmit="handleQuoteSubmit(event)">
        <div class="form-field">
          <label>Your Full Name</label>
          <input type="text" required placeholder="Full name">
        </div>
        <div class="form-field">
          <label>Phone Number (with country code)</label>
          <input type="tel" required placeholder="e.g. +1 234 567 8900">
        </div>
        <div class="form-field">
          <label>Project Location (City, Country)</label>
          <input type="text" placeholder="e.g. Dubai, UAE">
        </div>
        <div class="form-field">
          <label>Building Dimensions / Requirements</label>
          <textarea rows="3" placeholder="Specify length, width, height or model details..."></textarea>
        </div>
        <button type="submit" class="btn-modal-cta">Submit Quote Request</button>
      </form>
    </div>
  `;

  openOverlay(modalOverlay, modalBox.querySelector(".modal-close"));
}

function closeModal() {
  const modalOverlay = document.getElementById("modalOverlay");
  if (modalOverlay) closeOverlay(modalOverlay);
}

function handleQuoteSubmit(e) {
  e.preventDefault();
  alert("Thank you! Your quote request has been submitted successfully. Our engineering team at Bongshai Steel will contact you shortly.");
  closeModal();
}

/* ==========================================================================
   THREE.JS 3D WEBGL STRUCTURAL STEEL PORTAL FRAME INSPECTOR
   ========================================================================== */
let threeScene, threeCamera, threeRenderer, steelFrameGroup, steelMaterial, roofMaterial, floorMaterial, wallMaterial;
let isDragging3d = false, previousMousePosition = { x: 0, y: 0 };
let leftWallMesh, rightWallMesh, floorMesh;

function init3dSteelCanvas() {
  const canvas = document.getElementById("steel3dCanvas");
  const container = document.getElementById("canvas3dContainer");
  if (!canvas || !container || typeof THREE === "undefined") return;

  const width = container.clientWidth;
  const height = container.clientHeight;

  // Scene, Camera, Renderer
  threeScene = new THREE.Scene();
  threeScene.background = new THREE.Color(0x050811);

  threeCamera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
  threeCamera.position.set(25, 20, 35);
  threeCamera.lookAt(0, 5, 0);

  threeRenderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  threeRenderer.setSize(width, height);
  threeRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  // Ambient & Directional Lighting
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
  threeScene.add(ambientLight);

  const dirLight1 = new THREE.DirectionalLight(0x38bdf8, 1.2);
  dirLight1.position.set(20, 40, 20);
  threeScene.add(dirLight1);

  const dirLight2 = new THREE.DirectionalLight(0xffffff, 0.5);
  dirLight2.position.set(-20, 20, -20);
  threeScene.add(dirLight2);

  // Materials
  steelMaterial = new THREE.MeshStandardMaterial({
    color: 0x0466c8,
    metalness: 0.8,
    roughness: 0.3
  });

  roofMaterial = new THREE.MeshStandardMaterial({
    color: 0x38bdf8,
    metalness: 0.5,
    roughness: 0.4,
    transparent: true,
    opacity: 0.85,
    side: THREE.DoubleSide
  });

  floorMaterial = new THREE.MeshStandardMaterial({
    color: 0x334155,
    roughness: 0.8,
    metalness: 0.2
  });

  wallMaterial = new THREE.MeshStandardMaterial({
    color: 0x64748b,
    roughness: 0.5,
    metalness: 0.5,
    transparent: true,
    opacity: 0.5,
    side: THREE.DoubleSide
  });

  // Construct 3D Steel Portal Frame
  steelFrameGroup = new THREE.Group();

  // 1. REINFORCED CONCRETE FLOOR SLAB
  floorMesh = new THREE.Mesh(new THREE.BoxGeometry(32, 0.4, 38), floorMaterial);
  floorMesh.position.set(0, -0.2, 0);
  steelFrameGroup.add(floorMesh);

  // 2. SIDE WALL CLADDING PANELS
  leftWallMesh = new THREE.Mesh(new THREE.PlaneGeometry(32, 12), wallMaterial);
  leftWallMesh.position.set(-12, 6, 0);
  leftWallMesh.rotation.y = Math.PI / 2;
  steelFrameGroup.add(leftWallMesh);

  rightWallMesh = new THREE.Mesh(new THREE.PlaneGeometry(32, 12), wallMaterial);
  rightWallMesh.position.set(12, 6, 0);
  rightWallMesh.rotation.y = -Math.PI / 2;
  steelFrameGroup.add(rightWallMesh);

  // 3. COLUMNS & RAFTER BEAMS (BAY FRAMES)
  for (let z = -15; z <= 15; z += 10) {
    // Left Column
    const colLeft = new THREE.Mesh(new THREE.BoxGeometry(0.8, 12, 0.8), steelMaterial);
    colLeft.position.set(-12, 6, z);
    steelFrameGroup.add(colLeft);

    // Right Column
    const colRight = new THREE.Mesh(new THREE.BoxGeometry(0.8, 12, 0.8), steelMaterial);
    colRight.position.set(12, 6, z);
    steelFrameGroup.add(colRight);

    // Left Rafter
    const rafterLeft = new THREE.Mesh(new THREE.BoxGeometry(13, 0.6, 0.6), steelMaterial);
    rafterLeft.position.set(-6, 13.5, z);
    rafterLeft.rotation.z = 0.25;
    steelFrameGroup.add(rafterLeft);

    // Right Rafter
    const rafterRight = new THREE.Mesh(new THREE.BoxGeometry(13, 0.6, 0.6), steelMaterial);
    rafterRight.position.set(6, 13.5, z);
    rafterRight.rotation.z = -0.25;
    steelFrameGroup.add(rafterRight);
  }

  // 4. LONGITUDINAL PURLINS (ROOF BARS)
  for (let x = -11; x <= 11; x += 3.6) {
    const purlin = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 32), steelMaterial);
    const heightOffset = 12 + (1 - Math.abs(x) / 12) * 3;
    purlin.position.set(x, heightOffset, 0);
    steelFrameGroup.add(purlin);
  }

  // 5. ROOF DECKING & CLADDING SLAB
  const roofLeft = new THREE.Mesh(new THREE.PlaneGeometry(14, 32), roofMaterial);
  roofLeft.position.set(-6, 13.7, 0);
  roofLeft.rotation.x = Math.PI / 2;
  roofLeft.rotation.y = 0.25;
  steelFrameGroup.add(roofLeft);

  const roofRight = new THREE.Mesh(new THREE.PlaneGeometry(14, 32), roofMaterial);
  roofRight.position.set(6, 13.7, 0);
  roofRight.rotation.x = Math.PI / 2;
  roofRight.rotation.y = -0.25;
  steelFrameGroup.add(roofRight);

  threeScene.add(steelFrameGroup);

  // Mouse Orbit Controls
  canvas.addEventListener("mousedown", (e) => {
    isDragging3d = true;
    previousMousePosition = { x: e.clientX, y: e.clientY };
  });

  window.addEventListener("mouseup", () => { isDragging3d = false; });

  canvas.addEventListener("mousemove", (e) => {
    if (!isDragging3d || !steelFrameGroup) return;
    const deltaX = e.clientX - previousMousePosition.x;
    const deltaY = e.clientY - previousMousePosition.y;

    steelFrameGroup.rotation.y += deltaX * 0.008;
    steelFrameGroup.rotation.x += deltaY * 0.005;

    previousMousePosition = { x: e.clientX, y: e.clientY };
  });

  // Animation Loop
  function animate3d() {
    requestAnimationFrame(animate3d);
    if (!isDragging3d && steelFrameGroup) {
      steelFrameGroup.rotation.y += 0.003; // Gentle auto-spin
    }
    threeRenderer.render(threeScene, threeCamera);
  }

  animate3d();

  // Resize Handler
  window.addEventListener("resize", () => {
    if (!container || !threeRenderer || !threeCamera) return;
    const w = container.clientWidth;
    const h = container.clientHeight;
    threeCamera.aspect = w / h;
    threeCamera.updateProjectionMatrix();
    threeRenderer.setSize(w, h);
  });
}

function update3dFrameColor(colorVal) {
  if (!steelMaterial) return;
  if (colorVal === "blue") steelMaterial.color.setHex(0x0466c8);
  else if (colorVal === "grey") steelMaterial.color.setHex(0x334155);
  else if (colorVal === "red") steelMaterial.color.setHex(0x991b1b);
  else if (colorVal === "silver") steelMaterial.color.setHex(0x94a3b8);
}

function update3dInsulation(insulationVal) {
  if (!roofMaterial) return;
  if (insulationVal === "pu") roofMaterial.color.setHex(0x38bdf8);
  else if (insulationVal === "eps") roofMaterial.color.setHex(0xf8fafc);
  else if (insulationVal === "pir") roofMaterial.color.setHex(0xf59e0b);
  else if (insulationVal === "single") roofMaterial.color.setHex(0x64748b);
}

function update3dWall(wallVal) {
  if (!wallMaterial) return;
  if (wallVal === "full") {
    wallMaterial.opacity = 0.85;
    wallMaterial.color.setHex(0x475569);
  } else if (wallVal === "semi") {
    wallMaterial.opacity = 0.35;
    wallMaterial.color.setHex(0x38bdf8);
  } else if (wallVal === "none") {
    wallMaterial.opacity = 0.0;
  }
}

function update3dFloor(floorVal) {
  if (!floorMaterial) return;
  if (floorVal === "concrete") floorMaterial.color.setHex(0x475569);
  else if (floorVal === "epoxy") floorMaterial.color.setHex(0x059669);
  else if (floorVal === "dark") floorMaterial.color.setHex(0x1e293b);
}


