"use strict";

const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert");
const nunjucks = require("nunjucks");
const cheerio = require("cheerio");

const VIEWS_DIR = path.resolve(__dirname, "..");
const ADMIN_DIR = __dirname;

// Configure Nunjucks exactly as specified in TASKS.md
const env = nunjucks.configure(VIEWS_DIR, { autoescape: true });
require("../../lib/view-filters").register(env);

let passedChecks = 0;
let failedChecks = 0;

function pass(name, detail = "") {
  passedChecks++;
  console.log(`  PASS: ${name}${detail ? " - " + detail : ""}`);
}

function fail(name, error) {
  failedChecks++;
  console.error(`  FAIL: ${name}`);
  if (error) console.error("        " + (error.stack || error.message || error));
}

function render(templateName, context = {}) {
  return env.render(templateName, context);
}

console.log("=================================================");
console.log("Antigravity Admin Templates Verification Suite");
console.log("=================================================\n");

// ---------------------------------------------------------------------
// Check 1: Every template renders without throwing (normal & empty fixtures)
// ---------------------------------------------------------------------
try {
  // login.njk
  const loginNormal = render("admin/login.njk", {
    csrfToken: "csrf-token-123",
    error: "Invalid credentials",
    username: "testuser",
    lockedMinutes: 0
  });
  assert(loginNormal.includes("Sign In"));

  const loginEmpty = render("admin/login.njk", {});
  assert(loginEmpty.includes("Sign In"));

  const loginLocked = render("admin/login.njk", {
    csrfToken: "csrf-token-123",
    lockedMinutes: 15
  });
  assert(loginLocked.includes("temporarily locked"));
  assert(loginLocked.includes("15 minute(s)"));

  // dashboard.njk
  const dashNormal = render("admin/dashboard.njk", {
    adminName: "Munna",
    adminRole: "superadmin",
    csrfToken: "csrf-token-123",
    active: "dashboard",
    stats: {
      products: 72,
      categories: 5,
      faqs: 14,
      leadsNew: 4,
      leadsTotal: 65,
      views: 1420
    },
    recentActivity: [
      {
        created_at: "2026-09-24T12:00:00+06:00",
        admin_name: "Munna",
        action: "create",
        summary: "Created product BH-FS-1001"
      }
    ]
  });
  assert(dashNormal.includes("BH-FS-1001"));
  assert(dashNormal.includes("1420"));

  const dashEmpty = render("admin/dashboard.njk", {
    adminName: "Munna",
    adminRole: "admin",
    csrfToken: "csrf-token-123",
    active: "dashboard",
    stats: {},
    recentActivity: []
  });
  assert(dashEmpty.includes("No recent activity recorded."));

  const dashNullViews = render("admin/dashboard.njk", {
    adminName: "Munna",
    adminRole: "editor",
    csrfToken: "csrf-token-123",
    active: "dashboard",
    stats: { views: null },
    recentActivity: []
  });
  assert(dashNullViews.includes("—") || dashNullViews.includes("-"));

  // products/list.njk
  const listNormal = render("admin/products/list.njk", {
    adminName: "Munna",
    adminRole: "superadmin",
    csrfToken: "csrf-token-123",
    active: "products",
    products: [
      {
        id: 10,
        model_code: "BH-IS-1001",
        name: "Industrial Steel Shed",
        category_name: "Factory Shed",
        image: "images/products/Model No-BH-IS-1001.webp",
        featured: 1,
        published: 1,
        sort_order: 1
      }
    ],
    categories: [
      { id: 1, key: "factory-shed", name: "Factory Shed" }
    ],
    q: "industrial",
    category: "factory-shed",
    total: 1
  });
  assert(listNormal.includes("BH-IS-1001"));
  assert(listNormal.includes("Industrial Steel Shed"));
  assert(listNormal.includes("/images/products/Model%20No-BH-IS-1001.webp"));

  const listEmpty = render("admin/products/list.njk", {
    adminName: "Munna",
    adminRole: "sales",
    csrfToken: "csrf-token-123",
    active: "products",
    products: [],
    categories: [],
    total: 0
  });
  assert(listEmpty.includes("No products found matching your search."));

  // products/form.njk - create (product = {})
  const formCreate = render("admin/products/form.njk", {
    adminName: "Munna",
    adminRole: "superadmin",
    csrfToken: "csrf-token-123",
    active: "products",
    product: {},
    categories: [{ id: 1, key: "sheds", name: "Factory Sheds" }],
    error: null
  });
  assert(formCreate.includes("Create New Product"));
  assert(!formCreate.includes("Delete Product"));

  // products/form.njk - edit
  const formEdit = render("admin/products/form.njk", {
    adminName: "Munna",
    adminRole: "admin",
    csrfToken: "csrf-token-123",
    active: "products",
    product: {
      id: 5,
      model_code: "BH-T-200",
      slug: "bh-t-200",
      name: "Telecom Tower",
      description: "Galvanized lattice tower",
      image: "images/products/Model No-BH-IS-1001.webp",
      category_id: 1,
      featured: 1,
      published: 1,
      sort_order: 5
    },
    categories: [{ id: 1, key: "sheds", name: "Factory Sheds" }],
    error: "Validation failed"
  });
  assert(formEdit.includes("BH-T-200"));
  assert(formEdit.includes("Telecom Tower"));
  assert(formEdit.includes("Delete Product"));
  assert(formEdit.includes("Validation failed"));

  // leads/list.njk
  const leadsNormal = render("admin/leads/list.njk", {
    adminName: "Munna",
    adminRole: "admin",
    csrfToken: "csrf-token-123",
    active: "leads",
    leads: [{
      id: 1,
      kind: "quote",
      status: "new",
      name: "Customer A",
      phone: "+8801712345678",
      email: "a@example.com",
      company: "ABC Ltd",
      model_code: "BH-IS-1001",
      destination: "Dhaka",
      created_at: new Date("2026-09-24T10:00:00Z")
    }],
    statuses: ["new", "contacted", "quoted", "won", "lost"],
    counts: { all: 1, new: 1, contacted: 0, quoted: 0, won: 0, lost: 0 },
    status: "new",
    kind: "quote",
    q: "ABC",
    total: 1
  });
  assert(leadsNormal.includes("Customer A"));
  assert(leadsNormal.includes("BH-IS-1001"));

  const leadsEmpty = render("admin/leads/list.njk", {
    adminName: "Munna",
    adminRole: "editor",
    csrfToken: "csrf-token-123",
    active: "leads",
    leads: [],
    statuses: ["new", "contacted", "quoted", "won", "lost"],
    counts: { all: 0, new: 0, contacted: 0, quoted: 0, won: 0, lost: 0 },
    total: 0
  });
  assert(leadsEmpty.includes("No messages found matching your criteria."));

  // leads/detail.njk
  const leadDetailNormal = render("admin/leads/detail.njk", {
    adminName: "Munna",
    adminRole: "superadmin",
    csrfToken: "csrf-token-123",
    active: "leads",
    lead: {
      id: 1,
      public_id: "lead_123",
      kind: "quote",
      status: "new",
      note: "Called them today.",
      name: "Customer A",
      phone: "+8801712345678",
      email: "a@example.com",
      company: "ABC Ltd",
      message: "Hello Bongshai,\nWe need a factory shed.",
      destination: "Chittagong",
      currency: "USD",
      standard: "AISC 360",
      dimensions: "5000 sqft",
      model_code: "BH-IS-1001",
      source: "quote_modal",
      user_agent: "Mozilla/5.0",
      created_at: new Date("2026-09-24T10:00:00Z"),
      updated_at: new Date("2026-09-24T11:00:00Z")
    },
    statuses: ["new", "contacted", "quoted", "won", "lost"]
  });
  assert(leadDetailNormal.includes("Customer A"));
  assert(leadDetailNormal.includes("Delete Inquiry"));

  const leadDetailEmpty = render("admin/leads/detail.njk", {
    adminName: "Munna",
    adminRole: "sales",
    csrfToken: "csrf-token-123",
    active: "leads",
    lead: { id: 2 },
    statuses: ["new", "contacted", "quoted", "won", "lost"]
  });
  assert(leadDetailEmpty.includes("Inquiry #2"));
  assert(!leadDetailEmpty.includes("Delete Inquiry"));

  // activity.njk
  const activityNormal = render("admin/activity.njk", {
    adminName: "Munna",
    adminRole: "admin",
    csrfToken: "csrf-token-123",
    active: "activity",
    activity: [{
      created_at: new Date("2026-09-24T10:00:00Z"),
      admin_name: "Munna",
      action: "login",
      entity_type: "user",
      entity_id: 1,
      summary: "Logged into system"
    }],
    actions: ["login", "create_product", "edit_lead"],
    action: "all",
    page: 1,
    pages: 3
  });
  assert(activityNormal.includes("Logged into system"));

  const activityEmpty = render("admin/activity.njk", {
    adminName: "Munna",
    adminRole: "editor",
    csrfToken: "csrf-token-123",
    active: "activity",
    activity: [],
    actions: [],
    action: "all",
    page: 1,
    pages: 1
  });
  assert(activityEmpty.includes("No activity logs recorded."));

  // Generic sections schema with every field type
  const allTypesSchema = {
    key: "team",
    title: "Team Members",
    description: "Leadership and engineering team",
    orderable: true,
    fields: [
      { name: "name", label: "Full Name", type: "text", required: true },
      { name: "bio", label: "Biography", type: "textarea", help: "Short bio" },
      { name: "details", label: "HTML Details", type: "html", help: "Basic HTML allowed" },
      { name: "sort_order", label: "Sort Order", type: "number" },
      { name: "published", label: "Published", type: "checkbox" },
      { name: "photo", label: "Photo Path", type: "image", help: "Site path" }
    ]
  };
  const sectionsNav = [
    { key: "site", title: "Site copy & SEO", count: null },
    { key: "team", title: "Team Members", count: 2 }
  ];

  // sections/list.njk
  const sectionsListNormal = render("admin/sections/list.njk", {
    adminName: "Munna",
    adminRole: "admin",
    csrfToken: "csrf-token-123",
    active: "content",
    section: allTypesSchema,
    sections: sectionsNav,
    rows: [
      { id: 1, name: "Engr. Noor", bio: "Chief Engineer", details: "Specs", sort_order: 1, published: 1, photo: "images/team/noor.webp" }
    ]
  });
  assert(sectionsListNormal.includes("Engr. Noor"));
  assert(sectionsListNormal.includes("Chief Engineer"));

  const sectionsListEmpty = render("admin/sections/list.njk", {
    adminName: "Munna",
    adminRole: "editor",
    csrfToken: "csrf-token-123",
    active: "content",
    section: allTypesSchema,
    sections: sectionsNav,
    rows: []
  });
  assert(sectionsListEmpty.includes("No entries in this section yet."));

  // sections/form.njk - create
  const sectionsFormCreate = render("admin/sections/form.njk", {
    adminName: "Munna",
    adminRole: "admin",
    csrfToken: "csrf-token-123",
    active: "content",
    section: allTypesSchema,
    sections: sectionsNav,
    row: {},
    error: null
  });
  assert(sectionsFormCreate.includes("New Team Members"));
  assert(!sectionsFormCreate.includes("Delete Team Members"));

  // sections/form.njk - edit
  const sectionsFormEdit = render("admin/sections/form.njk", {
    adminName: "Munna",
    adminRole: "admin",
    csrfToken: "csrf-token-123",
    active: "content",
    section: allTypesSchema,
    sections: sectionsNav,
    row: { id: 1, name: "Engr. Noor", bio: "Chief Engineer", details: "Specs", sort_order: 1, published: 1, photo: "images/team/noor.webp" },
    error: "Validation failed"
  });
  assert(sectionsFormEdit.includes("Edit Team Members #1"));
  assert(sectionsFormEdit.includes("Delete Team Members"));
  assert(sectionsFormEdit.includes("Validation failed"));

  // content/site.njk
  const siteNormal = render("admin/content/site.njk", {
    adminName: "Munna",
    adminRole: "admin",
    csrfToken: "csrf-token-123",
    active: "content",
    sections: sectionsNav,
    groups: [
      {
        key: "hero",
        title: "Hero Section",
        fields: [
          { name: "text.hero.title", label: "Hero Title", type: "text", value: "Prefab Steel Buildings" },
          { name: "text.hero.description", label: "Hero Description", type: "textarea", value: "Engineered to AISC standards" }
        ]
      }
    ],
    error: null
  });
  assert(siteNormal.includes("Prefab Steel Buildings"));
  assert(siteNormal.includes("text.hero.title"));

  const siteEmpty = render("admin/content/site.njk", {
    adminName: "Munna",
    adminRole: "editor",
    csrfToken: "csrf-token-123",
    active: "content",
    sections: sectionsNav,
    groups: [],
    error: null
  });
  assert(siteEmpty.includes("No site copy groups configured."));

  // users/list.njk
  const usersNormal = render("admin/users/list.njk", {
    adminName: "Munna",
    adminRole: "superadmin",
    csrfToken: "csrf-token-123",
    active: "users",
    currentUserId: 1,
    users: [
      { id: 1, username: "munna", name: "Noor", email: "munna@example.com", role: "superadmin", active: 1, last_login_at: new Date(), created_at: new Date() },
      { id: 2, username: "sales1", name: "Sales One", email: "sales1@example.com", role: "sales", active: 0, last_login_at: null, created_at: new Date() }
    ]
  });
  assert(usersNormal.includes("munna"));
  assert(usersNormal.includes("sales1"));
  assert(usersNormal.includes("you"));

  const usersEmpty = render("admin/users/list.njk", {
    adminName: "Munna",
    adminRole: "superadmin",
    csrfToken: "csrf-token-123",
    active: "users",
    currentUserId: 1,
    users: []
  });
  assert(usersEmpty.includes("No user accounts found."));

  // users/form.njk - new
  const usersFormNew = render("admin/users/form.njk", {
    adminName: "Munna",
    adminRole: "superadmin",
    csrfToken: "csrf-token-123",
    active: "users",
    user: {},
    roles: [
      { value: "superadmin", label: "Super Admin", help: "Full access" },
      { value: "admin", label: "Admin", help: "General access" },
      { value: "editor", label: "Editor", help: "Content only" },
      { value: "sales", label: "Sales", help: "Leads only" }
    ],
    isSelf: false,
    error: null
  });
  assert(usersFormNew.includes("New User Account"));
  assert(usersFormNew.includes('name="username"'));

  // users/form.njk - edit self
  const usersFormEditSelf = render("admin/users/form.njk", {
    adminName: "Munna",
    adminRole: "superadmin",
    csrfToken: "csrf-token-123",
    active: "users",
    user: { id: 1, username: "munna", name: "Noor", email: "munna@example.com", role: "superadmin", active: 1 },
    roles: [{ value: "superadmin", label: "Super Admin" }],
    isSelf: true,
    error: null
  });
  assert(usersFormEditSelf.includes("Edit User: munna"));
  assert(!usersFormEditSelf.includes("Delete User Account"));

  // categories/list.njk
  const catNormal = render("admin/categories/list.njk", {
    adminName: "Munna",
    adminRole: "admin",
    csrfToken: "csrf-token-123",
    active: "categories",
    categories: [
      { id: 1, key: "factory-sheds", name: "Factory Sheds", icon: "🏭", blurb: "Heavy industrial sheds", image: "images/categories/shed.webp", main_category_name: "Buildings", product_count: 5, sort_order: 1 }
    ]
  });
  assert(catNormal.includes("Factory Sheds"));
  assert(catNormal.includes("factory-sheds"));

  const catEmpty = render("admin/categories/list.njk", {
    adminName: "Munna",
    adminRole: "admin",
    csrfToken: "csrf-token-123",
    active: "categories",
    categories: []
  });
  assert(catEmpty.includes("No categories defined yet."));

  // categories/form.njk - new
  const catFormNew = render("admin/categories/form.njk", {
    adminName: "Munna",
    adminRole: "admin",
    csrfToken: "csrf-token-123",
    active: "categories",
    category: {},
    mainCategories: [{ id: 1, key: "buildings", name: "Buildings" }],
    productCount: 0,
    error: null
  });
  assert(catFormNew.includes("New Category"));

  // categories/form.njk - edit with products
  const catFormEdit = render("admin/categories/form.njk", {
    adminName: "Munna",
    adminRole: "admin",
    csrfToken: "csrf-token-123",
    active: "categories",
    category: { id: 2, key: "towers", name: "Towers", icon: "🗼", blurb: "Telecom towers", image: null, main_category_id: 1 },
    mainCategories: [{ id: 1, key: "buildings", name: "Buildings" }],
    productCount: 3,
    error: "Sample error"
  });
  assert(catFormEdit.includes("Edit Category: Towers"));
  assert(catFormEdit.includes("This category still has 3 products — move them to another category first."));

  // media/list.njk - normal
  const mediaNormal = render("admin/media/list.njk", {
    adminName: "Munna",
    adminRole: "admin",
    csrfToken: "csrf-token-123",
    active: "media",
    items: [
      {
        path: "images/products/Model No-BH-IS-1001.webp",
        name: "Model No-BH-IS-1001.webp",
        bytes: 45000,
        modified: new Date(),
        variants: [400, 700],
        usedBy: ["Product BH-IS-1001"]
      },
      {
        path: "images/misc/banner.webp",
        name: "banner.webp",
        bytes: 85000,
        modified: new Date(),
        variants: [400],
        usedBy: []
      }
    ],
    uploaded: "images/misc/banner.webp",
    maxMB: 8,
    available: true,
    notice: "Notice text",
    error: null
  });
  assert(mediaNormal.includes("Model No-BH-IS-1001.webp"));
  assert(mediaNormal.includes("banner.webp"));
  assert(mediaNormal.includes("Just uploaded"));

  // media/list.njk - empty
  const mediaEmpty = render("admin/media/list.njk", {
    adminName: "Munna",
    adminRole: "editor",
    csrfToken: "csrf-token-123",
    active: "media",
    items: [],
    uploaded: null,
    maxMB: 8,
    available: true
  });
  assert(mediaEmpty.includes("No media files uploaded yet."));

  // media/list.njk - available: false
  const mediaUnavailable = render("admin/media/list.njk", {
    adminName: "Munna",
    adminRole: "admin",
    csrfToken: "csrf-token-123",
    active: "media",
    items: [],
    uploaded: null,
    maxMB: 8,
    available: false
  });
  assert(mediaUnavailable.includes("Image processing is currently unavailable"));

  // backups/list.njk - normal
  const backupsNormal = render("admin/backups/list.njk", {
    adminName: "Munna",
    adminRole: "superadmin",
    csrfToken: "csrf-token-123",
    active: "backups",
    snapshots: [
      {
        id: 1,
        created_at: new Date(),
        admin_name: "Munna",
        reason: "manual",
        note: "Initial snapshot",
        bytes: 102400,
        counts: { products: 12, categories: 3, sections: 10 }
      },
      {
        id: 2,
        created_at: new Date(),
        admin_name: null,
        reason: "auto",
        note: null,
        bytes: 103000,
        counts: null
      }
    ],
    keep: 60,
    autoGapMinutes: 30,
    notice: null,
    error: null
  });
  assert(backupsNormal.includes("#1"));
  assert(backupsNormal.includes("Initial snapshot"));
  assert(backupsNormal.includes("system"));

  // backups/list.njk - empty
  const backupsEmpty = render("admin/backups/list.njk", {
    adminName: "Munna",
    adminRole: "admin",
    csrfToken: "csrf-token-123",
    active: "backups",
    snapshots: [],
    keep: 60,
    autoGapMinutes: 30
  });
  assert(backupsEmpty.includes("No backups recorded yet."));

  pass("1. Render without throwing", "all templates render normal and empty fixtures");
} catch (err) {
  fail("1. Render without throwing", err);
}

// ---------------------------------------------------------------------
// Check 2: Hostile fixture strings appear only escaped, never as live markup
// ---------------------------------------------------------------------
try {
  const hostileScript = "</script><script>alert(1)</script>";
  const hostileImg = '"><img src=x onerror=alert(1)>';

  // Test hostile product name in products list
  const listHostile = render("admin/products/list.njk", {
    adminName: "Munna",
    adminRole: "admin",
    csrfToken: "csrf-token-123",
    active: "products",
    products: [
      {
        id: 99,
        model_code: "BH-XSS",
        name: hostileScript,
        category_name: "Safety",
        image: null,
        featured: 0,
        published: 1,
        sort_order: 0
      }
    ],
    categories: [],
    total: 1
  });
  assert(!listHostile.includes("<script>alert(1)</script>"), "Hostile script tag must NOT be unescaped in products list");
  assert(listHostile.includes("&lt;/script&gt;&lt;script&gt;alert(1)&lt;/script&gt;"), "Escaped script must be present");

  // Test hostile product name in product form
  const formHostile = render("admin/products/form.njk", {
    adminName: "Munna",
    adminRole: "admin",
    csrfToken: "csrf-token-123",
    active: "products",
    product: {
      id: 99,
      model_code: "BH-XSS",
      name: hostileScript,
      description: hostileImg
    },
    categories: []
  });
  assert(!formHostile.includes("<script>alert(1)</script>"), "Hostile script tag must NOT be unescaped in product form");
  assert(!formHostile.includes("<img src=x onerror=alert(1)>"), "Hostile img tag must NOT be unescaped in product form");

  // Test hostile username in login
  const loginHostile = render("admin/login.njk", {
    csrfToken: "csrf-token-123",
    username: hostileImg
  });
  assert(!loginHostile.includes("<img src=x onerror=alert(1)>"), "Hostile img tag must NOT be unescaped in login username");
  assert(loginHostile.includes("&quot;&gt;&lt;img src=x onerror=alert(1)&gt;"), "Escaped img tag must be present in login input value");

  // Test hostile query notice and error banners in layout
  const layoutHostile = render("admin/products/list.njk", {
    adminName: "Munna",
    adminRole: "admin",
    csrfToken: "csrf-token-123",
    active: "products",
    products: [],
    categories: [],
    notice: hostileScript,
    error: hostileImg
  });
  assert(!layoutHostile.includes("<script>alert(1)</script>"), "Hostile script in notice banner must be escaped");
  assert(!layoutHostile.includes("<img src=x onerror=alert(1)>"), "Hostile img in error banner must be escaped");

  pass("2. Hostile string escaping", "all XSS vectors safely escaped and no raw markup injected");
} catch (err) {
  fail("2. Hostile string escaping", err);
}

// ---------------------------------------------------------------------
// Check 3: Every <form method="post"> contains exactly one _csrf input
// ---------------------------------------------------------------------
try {
  const token = "secret-token-xyz-789";

  const pagesToTest = [
    {
      name: "admin/login.njk",
      html: render("admin/login.njk", { csrfToken: token, username: "admin" })
    },
    {
      name: "admin/dashboard.njk",
      html: render("admin/dashboard.njk", {
        adminName: "Admin",
        adminRole: "admin",
        csrfToken: token,
        active: "dashboard",
        stats: {},
        recentActivity: []
      })
    },
    {
      name: "admin/products/list.njk",
      html: render("admin/products/list.njk", {
        adminName: "Admin",
        adminRole: "admin",
        csrfToken: token,
        active: "products",
        products: [],
        categories: []
      })
    },
    {
      name: "admin/products/form.njk (new)",
      html: render("admin/products/form.njk", {
        adminName: "Admin",
        adminRole: "admin",
        csrfToken: token,
        active: "products",
        product: {},
        categories: []
      })
    },
    {
      name: "admin/products/form.njk (edit & delete)",
      html: render("admin/products/form.njk", {
        adminName: "Admin",
        adminRole: "admin",
        csrfToken: token,
        active: "products",
        product: { id: 7, name: "Item 7", model_code: "BH-7" },
        categories: []
      })
    },
    {
      name: "admin/leads/detail.njk (update & delete)",
      html: render("admin/leads/detail.njk", {
        adminName: "Admin",
        adminRole: "superadmin",
        csrfToken: token,
        active: "leads",
        lead: { id: 10, name: "Lead 10" },
        statuses: ["new", "contacted", "quoted", "won", "lost"]
      })
    },
    {
      name: "admin/sections/list.njk (orderable move forms)",
      html: render("admin/sections/list.njk", {
        adminName: "Admin",
        adminRole: "admin",
        csrfToken: token,
        active: "content",
        section: {
          key: "faq",
          title: "FAQ",
          orderable: true,
          fields: [{ name: "q", label: "Question", type: "text" }]
        },
        sections: [{ key: "faq", title: "FAQ", count: 3 }],
        rows: [
          { id: 1, q: "Q1" },
          { id: 2, q: "Q2" },
          { id: 3, q: "Q3" }
        ]
      })
    },
    {
      name: "admin/sections/form.njk (new)",
      html: render("admin/sections/form.njk", {
        adminName: "Admin",
        adminRole: "admin",
        csrfToken: token,
        active: "content",
        section: {
          key: "faq",
          title: "FAQ",
          fields: [{ name: "q", label: "Question", type: "text" }]
        },
        sections: [{ key: "faq", title: "FAQ", count: 0 }],
        row: {}
      })
    },
    {
      name: "admin/sections/form.njk (edit & delete)",
      html: render("admin/sections/form.njk", {
        adminName: "Admin",
        adminRole: "admin",
        csrfToken: token,
        active: "content",
        section: {
          key: "faq",
          title: "FAQ",
          fields: [{ name: "q", label: "Question", type: "text" }]
        },
        sections: [{ key: "faq", title: "FAQ", count: 1 }],
        row: { id: 5, q: "Q5" }
      })
    },
    {
      name: "admin/content/site.njk (site save form)",
      html: render("admin/content/site.njk", {
        adminName: "Admin",
        adminRole: "admin",
        csrfToken: token,
        active: "content",
        sections: [{ key: "site", title: "Site copy", count: null }],
        groups: [
          {
            key: "seo",
            title: "SEO",
            fields: [{ name: "seo.title", label: "Title", type: "text", value: "Bongshai" }]
          }
        ]
      })
    },
    {
      name: "admin/users/form.njk (new)",
      html: render("admin/users/form.njk", {
        adminName: "Admin",
        adminRole: "superadmin",
        csrfToken: token,
        active: "users",
        user: {},
        roles: [{ value: "admin", label: "Admin" }],
        isSelf: false
      })
    },
    {
      name: "admin/users/form.njk (edit & delete)",
      html: render("admin/users/form.njk", {
        adminName: "Admin",
        adminRole: "superadmin",
        csrfToken: token,
        active: "users",
        user: { id: 10, username: "user10", role: "editor" },
        roles: [{ value: "editor", label: "Editor" }],
        isSelf: false
      })
    },
    {
      name: "admin/categories/list.njk (move forms)",
      html: render("admin/categories/list.njk", {
        adminName: "Admin",
        adminRole: "admin",
        csrfToken: token,
        active: "categories",
        categories: [
          { id: 1, key: "c1", name: "Cat 1" },
          { id: 2, key: "c2", name: "Cat 2" },
          { id: 3, key: "c3", name: "Cat 3" }
        ]
      })
    },
    {
      name: "admin/categories/form.njk (new)",
      html: render("admin/categories/form.njk", {
        adminName: "Admin",
        adminRole: "admin",
        csrfToken: token,
        active: "categories",
        category: {},
        mainCategories: [],
        productCount: 0
      })
    },
    {
      name: "admin/categories/form.njk (edit & delete)",
      html: render("admin/categories/form.njk", {
        adminName: "Admin",
        adminRole: "admin",
        csrfToken: token,
        active: "categories",
        category: { id: 25, key: "c25", name: "Cat 25" },
        mainCategories: [],
        productCount: 0
      })
    },
    {
      name: "admin/media/list.njk (upload & delete forms)",
      html: render("admin/media/list.njk", {
        adminName: "Admin",
        adminRole: "admin",
        csrfToken: token,
        active: "media",
        items: [{ path: "images/misc/test.webp", name: "test.webp", bytes: 1000, modified: new Date(), variants: [], usedBy: [] }],
        uploaded: null,
        maxMB: 8,
        available: true
      })
    },
    {
      name: "admin/backups/list.njk (create & restore forms)",
      html: render("admin/backups/list.njk", {
        adminName: "Admin",
        adminRole: "superadmin",
        csrfToken: token,
        active: "backups",
        snapshots: [{ id: 42, created_at: new Date(), admin_name: "Admin", reason: "manual", note: "Test", bytes: 50000, counts: null }],
        keep: 60,
        autoGapMinutes: 30
      })
    }
  ];

  let postFormCount = 0;
  for (const page of pagesToTest) {
    const $ = cheerio.load(page.html);
    $("form").each((i, el) => {
      const method = ($(el).attr("method") || "get").toLowerCase();
      if (method === "post") {
        postFormCount++;
        const csrfInputs = $(el).find('input[name="_csrf"]');
        assert.strictEqual(
          csrfInputs.length,
          1,
          `Form in ${page.name} (action: ${$(el).attr("action")}) must contain exactly 1 _csrf input, found ${csrfInputs.length}`
        );
        assert.strictEqual(
          csrfInputs.attr("type"),
          "hidden",
          `_csrf input in ${page.name} must be type="hidden"`
        );
        assert.strictEqual(
          csrfInputs.val(),
          token,
          `_csrf input value in ${page.name} must match token`
        );
      }
    });
  }

  assert(postFormCount >= 6, `Expected at least 6 POST forms across test suite, verified ${postFormCount}`);
  pass("3. CSRF token in POST forms", `all ${postFormCount} POST forms contain exactly one hidden _csrf carrying token`);
} catch (err) {
  fail("3. CSRF token in POST forms", err);
}

// ---------------------------------------------------------------------
// Check 4: Users link appears for superadmin & admin, not for editor & sales
// ---------------------------------------------------------------------
try {
  const roles = ["superadmin", "admin", "editor", "sales"];
  const results = {};

  for (const role of roles) {
    const html = render("admin/dashboard.njk", {
      adminName: "Test User",
      adminRole: role,
      csrfToken: "token",
      active: "dashboard",
      stats: {},
      recentActivity: []
    });
    const $ = cheerio.load(html);
    const hasUsersLink = $('a[href="/admin/users"]').length > 0;
    results[role] = hasUsersLink;
  }

  assert.strictEqual(results.superadmin, true, "Users link must appear for superadmin");
  assert.strictEqual(results.admin, true, "Users link must appear for admin");
  assert.strictEqual(results.editor, false, "Users link must NOT appear for editor");
  assert.strictEqual(results.sales, false, "Users link must NOT appear for sales");

  pass("4. Role-based navigation for Users link", "superadmin/admin visible, editor/sales hidden");
} catch (err) {
  fail("4. Role-based navigation for Users link", err);
}

// ---------------------------------------------------------------------
// Check 5: No template contains | safe
// ---------------------------------------------------------------------
try {
  function scanDir(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    const files = [];
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        files.push(...scanDir(fullPath));
      } else if (entry.isFile() && entry.name.endsWith(".njk")) {
        files.push(fullPath);
      }
    }
    return files;
  }

  const njkFiles = scanDir(ADMIN_DIR);
  assert(njkFiles.length >= 4, `Expected at least 4 .njk files, found ${njkFiles.length}`);

  for (const file of njkFiles) {
    const content = fs.readFileSync(file, "utf8");
    const safeRegex = /\|\s*safe\b/i;
    assert(!safeRegex.test(content), `Template ${path.relative(VIEWS_DIR, file)} contains forbidden '| safe' filter`);
  }

  pass("5. No '| safe' filter in templates", `scanned ${njkFiles.length} admin templates, zero occurrences found`);
} catch (err) {
  fail("5. No '| safe' filter in templates", err);
}

// ---------------------------------------------------------------------
// Check 6: No external <script src> or <link rel="stylesheet" href>
// ---------------------------------------------------------------------
try {
  const renderedHtmls = [
    render("admin/login.njk", { csrfToken: "t" }),
    render("admin/dashboard.njk", { adminName: "N", adminRole: "admin", csrfToken: "t", stats: {}, recentActivity: [] }),
    render("admin/products/list.njk", { adminName: "N", adminRole: "admin", csrfToken: "t", products: [], categories: [] }),
    render("admin/products/form.njk", { adminName: "N", adminRole: "admin", csrfToken: "t", product: {}, categories: [] })
  ];

  for (const html of renderedHtmls) {
    const $ = cheerio.load(html);

    // No <script src="...">
    $("script").each((i, el) => {
      const src = $(el).attr("src");
      assert(!src, `Found external script tag: src="${src}"`);
    });

    // No <link rel="stylesheet">
    $('link[rel="stylesheet"]').each((i, el) => {
      const href = $(el).attr("href");
      assert(!href, `Found stylesheet link tag: href="${href}"`);
    });
  }

  pass("6. No external scripts or stylesheets", "all styles and scripts are inline, no CDN/external dependencies");
} catch (err) {
  fail("6. No external scripts or stylesheets", err);
}

// ---------------------------------------------------------------------
// Check 7: Sign-out is a POST form, not a link
// ---------------------------------------------------------------------
try {
  const html = render("admin/dashboard.njk", {
    adminName: "Munna",
    adminRole: "superadmin",
    csrfToken: "t-logout",
    active: "dashboard",
    stats: {},
    recentActivity: []
  });

  const $ = cheerio.load(html);

  // Assert NO link to /admin/logout exists
  const logoutLinks = $('a[href*="/admin/logout"]');
  assert.strictEqual(logoutLinks.length, 0, "Sign-out must NEVER be a GET link <a>");

  // Assert a POST form to /admin/logout exists
  const logoutForms = $('form[action="/admin/logout"]');
  assert.strictEqual(logoutForms.length, 1, "Expected exactly 1 form with action='/admin/logout'");
  assert.strictEqual(
    (logoutForms.attr("method") || "").toLowerCase(),
    "post",
    "Logout form method must be POST"
  );

  const logoutCsrf = logoutForms.find('input[name="_csrf"]');
  assert.strictEqual(logoutCsrf.length, 1, "Logout form must contain _csrf hidden input");
  assert.strictEqual(logoutCsrf.val(), "t-logout", "Logout form _csrf must match csrfToken");

  const submitBtn = logoutForms.find('button[type="submit"]');
  assert(submitBtn.length >= 1, "Logout form must have a submit button");

  pass("7. Sign-out is a POST form", "POST form to /admin/logout with CSRF token verified, no GET links");
} catch (err) {
  fail("7. Sign-out is a POST form", err);
}

// ---------------------------------------------------------------------
// Extra Check 8: Image Path Segment URL-Encoding
// ---------------------------------------------------------------------
try {
  const testImagePath = "images/products/Model No-BH-IS-1001.webp";
  const expectedEncoded = "/images/products/Model%20No-BH-IS-1001.webp";

  const listHtml = render("admin/products/list.njk", {
    adminName: "A",
    adminRole: "admin",
    csrfToken: "t",
    products: [{ id: 1, name: "P", model_code: "M", image: testImagePath }],
    categories: []
  });
  const $list = cheerio.load(listHtml);
  const listImgSrc = $list(".product-thumb").attr("src");
  assert.strictEqual(listImgSrc, expectedEncoded, `Product thumbnail src must be ${expectedEncoded}, got ${listImgSrc}`);

  const formHtml = render("admin/products/form.njk", {
    adminName: "A",
    adminRole: "admin",
    csrfToken: "t",
    product: { id: 1, image: testImagePath },
    categories: []
  });
  const $form = cheerio.load(formHtml);
  const formImgSrc = $form('img[alt="Current image preview"]').attr("src");
  assert.strictEqual(formImgSrc, expectedEncoded, `Product preview img src must be ${expectedEncoded}, got ${formImgSrc}`);

  pass("8. Image path segment URL encoding", `encoded correctly to ${expectedEncoded}`);
} catch (err) {
  fail("8. Image path segment URL encoding", err);
}

// ---------------------------------------------------------------------
// Extra Check 9: New product published default checked & delete form on edit
// ---------------------------------------------------------------------
try {
  // New product
  const newHtml = render("admin/products/form.njk", {
    adminName: "A",
    adminRole: "admin",
    csrfToken: "t",
    product: {},
    categories: []
  });
  const $new = cheerio.load(newHtml);
  assert($new('input[name="published"]').is(":checked"), "New product must have published checked by default");
  assert.strictEqual($new('form[action*="/delete"]').length, 0, "New product must NOT have delete form");

  // Existing product with published false
  const editDraftHtml = render("admin/products/form.njk", {
    adminName: "A",
    adminRole: "admin",
    csrfToken: "t",
    product: { id: 8, published: 0 },
    categories: []
  });
  const $editDraft = cheerio.load(editDraftHtml);
  assert(!$editDraft('input[name="published"]').is(":checked"), "Edit product with published=0 must not be checked");
  assert.strictEqual($editDraft('form[action="/admin/products/8/delete"]').length, 1, "Edit product must have delete form");

  pass("9. Form logic defaults & delete form", "new products default to published; delete form only appears on edit");
} catch (err) {
  fail("9. Form logic defaults & delete form", err);
}

// ---------------------------------------------------------------------
// Extra Check 10: Robots noindex, nofollow on layout and login
// ---------------------------------------------------------------------
try {
  const layoutHtml = render("admin/dashboard.njk", {
    adminName: "A",
    adminRole: "admin",
    csrfToken: "t",
    stats: {},
    recentActivity: []
  });
  const $layout = cheerio.load(layoutHtml);
  assert.strictEqual(
    $layout('meta[name="robots"]').attr("content"),
    "noindex, nofollow",
    "Layout must have <meta name='robots' content='noindex, nofollow'>"
  );

  const loginHtml = render("admin/login.njk", { csrfToken: "t" });
  const $login = cheerio.load(loginHtml);
  assert.strictEqual(
    $login('meta[name="robots"]').attr("content"),
    "noindex, nofollow",
    "Login must have <meta name='robots' content='noindex, nofollow'>"
  );

  pass("10. Security robots meta tag", "both layout and login enforce noindex, nofollow");
} catch (err) {
  fail("10. Security robots meta tag", err);
}

// ---------------------------------------------------------------------
// Check 11: Phone width card layout (no squeezed tables below 640px)
// ---------------------------------------------------------------------
try {
  // Test product list
  const listHtml = render("admin/products/list.njk", {
    adminName: "A",
    adminRole: "admin",
    csrfToken: "t",
    active: "products",
    products: [
      { id: 1, model_code: "BH-M1", name: "Model 1", category_name: "Sheds", image: "img.webp", featured: 1, published: 1, sort_order: 1 }
    ],
    categories: []
  });
  const $list = cheerio.load(listHtml);
  assert($list(".mobile-card-list").length > 0, "Products list must contain .mobile-card-list");
  assert($list(".mobile-card-list .product-card").length === 1, "Products list must contain .product-card");

  // Test dashboard
  const dashHtml = render("admin/dashboard.njk", {
    adminName: "A",
    adminRole: "admin",
    csrfToken: "t",
    active: "dashboard",
    stats: {},
    recentActivity: [
      { created_at: new Date("2026-09-24T12:00:00Z"), admin_name: "Admin", action: "edit", summary: "Summary" }
    ]
  });
  const $dash = cheerio.load(dashHtml);
  assert($dash(".mobile-card-list").length > 0, "Dashboard must contain .mobile-card-list");
  assert($dash(".mobile-card-list .activity-card").length === 1, "Dashboard must contain .activity-card");

  // Verify CSS media query in layout hides table-responsive
  const layoutContent = fs.readFileSync(path.join(ADMIN_DIR, "layout.njk"), "utf8");
  assert(
    /@media\s*\(\s*max-width:\s*640px\s*\)[^{]*\{[^}]*\.table-responsive\s*\{[^}]*display:\s*none/s.test(layoutContent),
    "Layout CSS must hide .table-responsive below 640px"
  );

  pass("11. Phone card layout below 640px", "product list & dashboard render card markup with media query hiding table");
} catch (err) {
  fail("11. Phone card layout below 640px", err);
}

// ---------------------------------------------------------------------
// Check 12: Dates on dashboard formatted through dhaka filter
// ---------------------------------------------------------------------
try {
  const utcDate = new Date("2026-09-24T15:58:00.000Z"); // 21:58 in Asia/Dhaka (+06:00)
  const dashHtml = render("admin/dashboard.njk", {
    adminName: "A",
    adminRole: "admin",
    csrfToken: "t",
    active: "dashboard",
    stats: {},
    recentActivity: [
      { created_at: utcDate, admin_name: "Admin", action: "edit", summary: "Summary" }
    ]
  });

  assert(
    dashHtml.includes("24 Sept 2026, 21:58"),
    `Dashboard must display date formatted in Asia/Dhaka ("24 Sept 2026, 21:58"), but was not found in rendered HTML`
  );
  assert(!dashHtml.includes("2026-09-24T15:58:00.000Z"), "Raw ISO string must not appear unformatted");
  assert(!dashHtml.includes("Thu Sep 24"), "Default JS Date string must not appear unformatted");

  pass("12. Dhaka date filter on dashboard", "UTC date formatted cleanly to '24 Sept 2026, 21:58'");
} catch (err) {
  fail("12. Dhaka date filter on dashboard", err);
}

// ---------------------------------------------------------------------
// Check 13: Hostile lead fields render escaped; message/note keep line breaks
// ---------------------------------------------------------------------
try {
  const hostileScript = "</script><script>alert(1)</script>";
  const hostileImg = '"><img src=x onerror=alert(1)>';
  const multilineMsg = "Line 1: Need factory shed\nLine 2: 120ft span\n<script>alert(2)</script>";
  const multilineNote = "Called client\nDiscussed requirements\n<img src=y onerror=alert(3)>";

  const detailHtml = render("admin/leads/detail.njk", {
    adminName: "Admin",
    adminRole: "admin",
    csrfToken: "t",
    active: "leads",
    lead: {
      id: 88,
      name: hostileScript,
      company: hostileImg,
      message: multilineMsg,
      note: multilineNote
    },
    statuses: ["new", "contacted"]
  });

  assert(!detailHtml.includes("<script>alert(1)</script>"), "Hostile name must not render unescaped script");
  assert(!detailHtml.includes("<img src=x onerror=alert(1)>"), "Hostile company must not render unescaped img");
  assert(!detailHtml.includes("<script>alert(2)</script>"), "Hostile message must not render unescaped script");
  assert(!detailHtml.includes("<img src=y onerror=alert(3)>"), "Hostile note must not render unescaped img");

  // Verify line breaks preserved
  assert(detailHtml.includes("Line 1: Need factory shed\nLine 2: 120ft span"), "Message must preserve literal line breaks");
  assert(detailHtml.includes("Called client\nDiscussed requirements"), "Note must preserve literal line breaks");
  assert(detailHtml.includes("white-space:pre-wrap") || detailHtml.includes("white-space: pre-wrap"), "Must have white-space: pre-wrap style");

  pass("13. Hostile lead fields escaped with preserved line breaks", "all XSS vectors safely escaped and pre-wrap applied");
} catch (err) {
  fail("13. Hostile lead fields escaped with preserved line breaks", err);
}

// ---------------------------------------------------------------------
// Check 14: Phone 'javascript:alert(1)' produces wa.me link with only digits
// ---------------------------------------------------------------------
try {
  const hostilePhone = "javascript:alert(1)";

  // Test leads list
  const listHtml = render("admin/leads/list.njk", {
    adminName: "A",
    adminRole: "admin",
    csrfToken: "t",
    active: "leads",
    leads: [{ id: 1, name: "Test", phone: hostilePhone }],
    statuses: []
  });
  const $list = cheerio.load(listHtml);
  $list('a[href*="wa.me"]').each((i, el) => {
    const href = $list(el).attr("href");
    assert(!href.includes("javascript:"), `wa.me link in list must NOT contain javascript:, got: ${href}`);
    assert.strictEqual(href, "https://wa.me/1", `wa.me link must only contain digits, expected https://wa.me/1, got: ${href}`);
  });

  // Test leads detail
  const detailHtml = render("admin/leads/detail.njk", {
    adminName: "A",
    adminRole: "admin",
    csrfToken: "t",
    active: "leads",
    lead: { id: 1, name: "Test", phone: hostilePhone },
    statuses: []
  });
  const $detail = cheerio.load(detailHtml);
  $detail('a[href*="wa.me"]').each((i, el) => {
    const href = $detail(el).attr("href");
    assert(!href.includes("javascript:"), `wa.me link in detail must NOT contain javascript:, got: ${href}`);
    assert.strictEqual(href, "https://wa.me/1", `wa.me link must only contain digits, expected https://wa.me/1, got: ${href}`);
  });
  $detail('a[href*="tel:"]').each((i, el) => {
    const href = $detail(el).attr("href");
    assert(!href.includes("javascript:"), `tel: link in detail must NOT contain javascript:, got: ${href}`);
    assert.strictEqual(href, "tel:1", `tel: link must only contain digits, expected tel:1, got: ${href}`);
  });

  pass("14. Phone digits filter & wa.me security", "hostile phone string sanitized to digits only; no javascript: injection possible");
} catch (err) {
  fail("14. Phone digits filter & wa.me security", err);
}

// ---------------------------------------------------------------------
// Check 15: Leads delete form present for superadmin/admin, absent for editor/sales
// ---------------------------------------------------------------------
try {
  const roles = [
    { role: "superadmin", shouldHaveDelete: true },
    { role: "admin", shouldHaveDelete: true },
    { role: "editor", shouldHaveDelete: false },
    { role: "sales", shouldHaveDelete: false }
  ];

  for (const { role, shouldHaveDelete } of roles) {
    const html = render("admin/leads/detail.njk", {
      adminName: "A",
      adminRole: role,
      csrfToken: "t",
      active: "leads",
      lead: { id: 25 },
      statuses: []
    });
    const $ = cheerio.load(html);
    const deleteForm = $('form[action="/admin/leads/25/delete"]');
    assert.strictEqual(
      deleteForm.length > 0,
      shouldHaveDelete,
      `Delete form presence for ${role} should be ${shouldHaveDelete}, found ${deleteForm.length}`
    );
  }

  pass("15. Role gating on leads delete form", "superadmin/admin have delete form; editor/sales do not");
} catch (err) {
  fail("15. Role gating on leads delete form", err);
}

// ---------------------------------------------------------------------
// Check 16: Leads CSV link carries status, kind and q, URL-encoded
// ---------------------------------------------------------------------
try {
  const html = render("admin/leads/list.njk", {
    adminName: "A",
    adminRole: "admin",
    csrfToken: "t",
    active: "leads",
    leads: [],
    statuses: [],
    status: "quoted",
    kind: "quote",
    q: "Heavy Steel & Tower"
  });

  const $ = cheerio.load(html);
  const csvLink = $('a[href*="leads.csv"]').attr("href");
  assert(csvLink, "Download CSV link must be present");
  assert(csvLink.includes("status=quoted"), "CSV link must carry status=quoted");
  assert(csvLink.includes("kind=quote"), "CSV link must carry kind=quote");
  assert(
    csvLink.includes("q=Heavy%20Steel%20%26%20Tower") || csvLink.includes("q=Heavy+Steel+%26+Tower"),
    `CSV link must URL-encode '&' and spaces, got: ${csvLink}`
  );

  pass("16. Leads CSV link URL-encoding", "status, kind, and q containing '&' and spaces are correctly encoded");
} catch (err) {
  fail("16. Leads CSV link URL-encoding", err);
}

// ---------------------------------------------------------------------
// Check 17: Activity pagination links absent on first and last pages
// ---------------------------------------------------------------------
try {
  // Page 1 of 3: no previous, has next
  const page1Html = render("admin/activity.njk", {
    adminName: "A",
    adminRole: "admin",
    csrfToken: "t",
    active: "activity",
    activity: [{ created_at: new Date(), admin_name: "A", action: "login", summary: "s" }],
    actions: [],
    page: 1,
    pages: 3
  });
  const $p1 = cheerio.load(page1Html);
  assert.strictEqual($p1("#pagination-prev").length, 0, "Page 1 must NOT have prev link");
  assert.strictEqual($p1("#pagination-next").length, 1, "Page 1 must have next link");
  assert($p1("#pagination-next").attr("href").includes("page=2"), "Next link on page 1 must target page 2");

  // Page 3 of 3: has previous, no next
  const page3Html = render("admin/activity.njk", {
    adminName: "A",
    adminRole: "admin",
    csrfToken: "t",
    active: "activity",
    activity: [{ created_at: new Date(), admin_name: "A", action: "login", summary: "s" }],
    actions: [],
    page: 3,
    pages: 3
  });
  const $p3 = cheerio.load(page3Html);
  assert.strictEqual($p3("#pagination-prev").length, 1, "Page 3 must have prev link");
  assert.strictEqual($p3("#pagination-next").length, 0, "Page 3 must NOT have next link");
  assert($p3("#pagination-prev").attr("href").includes("page=2"), "Prev link on page 3 must target page 2");

  // Page 1 of 1: no previous, no next
  const singlePageHtml = render("admin/activity.njk", {
    adminName: "A",
    adminRole: "admin",
    csrfToken: "t",
    active: "activity",
    activity: [{ created_at: new Date(), admin_name: "A", action: "login", summary: "s" }],
    actions: [],
    page: 1,
    pages: 1
  });
  const $single = cheerio.load(singlePageHtml);
  assert.strictEqual($single("#pagination-prev").length, 0, "Single page must NOT have prev link");
  assert.strictEqual($single("#pagination-next").length, 0, "Single page must NOT have next link");

  pass("17. Activity pagination boundaries", "prev absent on page 1, next absent on last page, pagination hidden on single page");
} catch (err) {
  fail("17. Activity pagination boundaries", err);
}

// ---------------------------------------------------------------------
// Check 18: Phone width card layout for leads and activity
// ---------------------------------------------------------------------
try {
  // Test leads list
  const leadsHtml = render("admin/leads/list.njk", {
    adminName: "A",
    adminRole: "admin",
    csrfToken: "t",
    active: "leads",
    leads: [{ id: 1, name: "Lead 1", phone: "123", created_at: new Date() }],
    statuses: []
  });
  const $leads = cheerio.load(leadsHtml);
  assert($leads(".mobile-card-list").length > 0, "Leads list must contain .mobile-card-list");
  assert($leads(".mobile-card-list .lead-card").length === 1, "Leads list must contain .lead-card");

  // Test activity
  const actHtml = render("admin/activity.njk", {
    adminName: "A",
    adminRole: "admin",
    csrfToken: "t",
    active: "activity",
    activity: [{ created_at: new Date(), admin_name: "A", action: "login", summary: "s" }],
    actions: [],
    page: 1,
    pages: 1
  });
  const $act = cheerio.load(actHtml);
  assert($act(".mobile-card-list").length > 0, "Activity must contain .mobile-card-list");
  assert($act(".mobile-card-list .activity-card").length === 1, "Activity must contain .activity-card");

  pass("18. Phone card layout for leads & activity", "both templates provide .mobile-card-list reflow for mobile");
} catch (err) {
  fail("18. Phone card layout for leads & activity", err);
}

// ---------------------------------------------------------------------
// Check 19: Hostile values in every field type stay escaped inside textarea/input
// ---------------------------------------------------------------------
try {
  const hostileScript = "</textarea><script>alert('xss')</script>";
  const hostileAttr = '"><script>alert(\'attr\')</script>';

  const hostileSchema = {
    key: "faq",
    title: "FAQ",
    orderable: true,
    fields: [
      { name: "question", label: "Question", type: "text" },
      { name: "answer", label: "Answer", type: "textarea" },
      { name: "markup", label: "Markup", type: "html" },
      { name: "order_num", label: "Order Num", type: "number" },
      { name: "photo", label: "Photo", type: "image" }
    ]
  };

  const hostileRow = {
    id: 1,
    question: hostileAttr,
    answer: hostileScript,
    markup: hostileScript,
    order_num: hostileAttr,
    photo: hostileAttr
  };

  const formHtml = render("admin/sections/form.njk", {
    adminName: "Admin",
    adminRole: "admin",
    csrfToken: "csrf-token-123",
    active: "content",
    section: hostileSchema,
    sections: [{ key: "faq", title: "FAQ", count: 1 }],
    row: hostileRow
  });

  assert(!formHtml.includes("<script>alert("), "No live unescaped script tag should appear in sections/form.njk");
  assert(formHtml.includes("&lt;/textarea&gt;&lt;script&gt;alert(&#39;xss&#39;)&lt;/script&gt;"), "Escaped textarea value must be present");

  const siteHtml = render("admin/content/site.njk", {
    adminName: "Admin",
    adminRole: "admin",
    csrfToken: "csrf-token-123",
    active: "content",
    sections: [{ key: "site", title: "Site copy", count: null }],
    groups: [
      {
        key: "hero",
        title: "Hero",
        fields: [
          { name: "text.hero.title", label: "Title", type: "text", value: hostileAttr },
          { name: "text.hero.body", label: "Body", type: "textarea", value: hostileScript },
          { name: "text.hero.raw", label: "Raw", type: "html", value: hostileScript }
        ]
      }
    ]
  });

  assert(!siteHtml.includes("<script>alert("), "No live unescaped script tag should appear in content/site.njk");
  assert(siteHtml.includes("&lt;/textarea&gt;&lt;script&gt;alert(&#39;xss&#39;)&lt;/script&gt;"), "Escaped site textarea value must be present");

  pass("19. Hostile values in form field types remain escaped", "text, textarea, html, number, and image inputs escape hostile values without executing raw markup");
} catch (err) {
  fail("19. Hostile values in form field types remain escaped", err);
}

// ---------------------------------------------------------------------
// Check 20: Orderable move forms logic
// ---------------------------------------------------------------------
try {
  const token = "token-order-test";
  const orderableSchema = {
    key: "services",
    title: "Services",
    orderable: true,
    fields: [{ name: "name", label: "Name", type: "text" }]
  };
  const nonOrderableSchema = {
    key: "services",
    title: "Services",
    orderable: false,
    fields: [{ name: "name", label: "Name", type: "text" }]
  };

  const rows = [
    { id: 10, name: "First Service" },
    { id: 20, name: "Middle Service" },
    { id: 30, name: "Last Service" }
  ];

  // Test orderable: true
  const orderableHtml = render("admin/sections/list.njk", {
    adminName: "Admin",
    adminRole: "admin",
    csrfToken: token,
    active: "content",
    section: orderableSchema,
    sections: [{ key: "services", title: "Services", count: 3 }],
    rows
  });

  const $ord = cheerio.load(orderableHtml);

  // First row in desktop table: should have down form, but NO up form
  const firstRowForms = $ord('tbody tr:first-child form');
  assert.strictEqual(firstRowForms.length, 1, "First row should have exactly 1 move form (down)");
  assert.strictEqual(firstRowForms.find('input[name="direction"]').val(), "down", "First row move form must be direction=down");
  assert.strictEqual(firstRowForms.attr("action"), "/admin/content/services/10/move");
  assert.strictEqual(firstRowForms.find('input[name="_csrf"]').val(), token);

  // Middle row in desktop table: should have both up and down forms
  const middleRowForms = $ord('tbody tr:nth-child(2) form');
  assert.strictEqual(middleRowForms.length, 2, "Middle row should have 2 move forms (up and down)");
  assert.strictEqual(middleRowForms.eq(0).find('input[name="direction"]').val(), "up");
  assert.strictEqual(middleRowForms.eq(0).attr("action"), "/admin/content/services/20/move");
  assert.strictEqual(middleRowForms.eq(1).find('input[name="direction"]').val(), "down");
  assert.strictEqual(middleRowForms.eq(1).attr("action"), "/admin/content/services/20/move");

  // Last row in desktop table: should have up form, but NO down form
  const lastRowForms = $ord('tbody tr:last-child form');
  assert.strictEqual(lastRowForms.length, 1, "Last row should have exactly 1 move form (up)");
  assert.strictEqual(lastRowForms.find('input[name="direction"]').val(), "up", "Last row move form must be direction=up");
  assert.strictEqual(lastRowForms.attr("action"), "/admin/content/services/30/move");

  // Test orderable: false
  const nonOrderableHtml = render("admin/sections/list.njk", {
    adminName: "Admin",
    adminRole: "admin",
    csrfToken: token,
    active: "content",
    section: nonOrderableSchema,
    sections: [{ key: "services", title: "Services", count: 3 }],
    rows
  });

  const $nonOrd = cheerio.load(nonOrderableHtml);
  const moveForms = $nonOrd('form[action*="/move"]');
  assert.strictEqual(moveForms.length, 0, "No move forms should exist when orderable is false");

  pass("20. Orderable move forms logic", "first row has no up, last row has no down, all forms POST with CSRF, none when orderable: false");
} catch (err) {
  fail("20. Orderable move forms logic", err);
}

// ---------------------------------------------------------------------
// Check 21: Checkbox logic in sections/form.njk
// ---------------------------------------------------------------------
try {
  const checkboxSchema = {
    key: "news",
    title: "News",
    fields: [
      { name: "title", label: "Title", type: "text" },
      { name: "published", label: "Published", type: "checkbox" },
      { name: "pinned", label: "Pinned", type: "checkbox" }
    ]
  };

  // 1. New row: published should default to checked, other checkboxes unchecked
  const newRowHtml = render("admin/sections/form.njk", {
    adminName: "Admin",
    adminRole: "admin",
    csrfToken: "t",
    active: "content",
    section: checkboxSchema,
    sections: [{ key: "news", title: "News", count: 0 }],
    row: {}
  });
  const $new = cheerio.load(newRowHtml);
  const publishedNew = $new('input[name="published"]');
  const pinnedNew = $new('input[name="pinned"]');
  assert(publishedNew.is(":checked"), "Published checkbox should default to checked on new row");
  assert(!pinnedNew.is(":checked"), "Other checkboxes (pinned) should NOT be checked by default on new row");

  // 2. Edit row with truthy values
  const editTruthyHtml = render("admin/sections/form.njk", {
    adminName: "Admin",
    adminRole: "admin",
    csrfToken: "t",
    active: "content",
    section: checkboxSchema,
    sections: [{ key: "news", title: "News", count: 1 }],
    row: { id: 1, title: "News 1", published: 1, pinned: true }
  });
  const $truthy = cheerio.load(editTruthyHtml);
  assert($truthy('input[name="published"]').is(":checked"), "Published should be checked when truthy");
  assert($truthy('input[name="pinned"]').is(":checked"), "Pinned should be checked when truthy");

  // 3. Edit row with falsy values
  const editFalsyHtml = render("admin/sections/form.njk", {
    adminName: "Admin",
    adminRole: "admin",
    csrfToken: "t",
    active: "content",
    section: checkboxSchema,
    sections: [{ key: "news", title: "News", count: 1 }],
    row: { id: 1, title: "News 1", published: 0, pinned: false }
  });
  const $falsy = cheerio.load(editFalsyHtml);
  assert(!$falsy('input[name="published"]').is(":checked"), "Published should be unchecked when 0");
  assert(!$falsy('input[name="pinned"]').is(":checked"), "Pinned should be unchecked when false");

  pass("21. Checkbox logic in sections/form.njk", "published defaults to checked on new row, checked if truthy, unchecked if falsy");
} catch (err) {
  fail("21. Checkbox logic in sections/form.njk", err);
}

// ---------------------------------------------------------------------
// Check 22: Field names with dots survive into name attribute unchanged
// ---------------------------------------------------------------------
try {
  const siteHtml = render("admin/content/site.njk", {
    adminName: "Admin",
    adminRole: "admin",
    csrfToken: "t",
    active: "content",
    sections: [{ key: "site", title: "Site copy", count: null }],
    groups: [
      {
        key: "hero",
        title: "Hero",
        fields: [
          { name: "text.hero.title", label: "Title", type: "text", value: "Prefab Steel" },
          { name: "text.hero.body", label: "Body", type: "textarea", value: "Description" }
        ]
      },
      {
        key: "seo",
        title: "SEO",
        fields: [
          { name: "seo.meta_title", label: "Meta Title", type: "text", value: "Bongshai Steel" },
          { name: "seo.meta_description", label: "Meta Description", type: "textarea", value: "Best steel in BD" }
        ]
      }
    ]
  });

  const $ = cheerio.load(siteHtml);
  assert.strictEqual($('input[name="text.hero.title"]').length, 1, 'input[name="text.hero.title"] must exist');
  assert.strictEqual($('input[name="text.hero.title"]').val(), "Prefab Steel");
  assert.strictEqual($('textarea[name="text.hero.body"]').length, 1, 'textarea[name="text.hero.body"] must exist');
  assert.strictEqual($('input[name="seo.meta_title"]').length, 1, 'input[name="seo.meta_title"] must exist');
  assert.strictEqual($('textarea[name="seo.meta_description"]').length, 1, 'textarea[name="seo.meta_description"] must exist');

  pass("22. Dotted field names preserved in name attribute", "text.hero.title, seo.meta_description retain dot syntax");
} catch (err) {
  fail("22. Dotted field names preserved in name attribute", err);
}

// ---------------------------------------------------------------------
// Check 23: Content sidebar link role-based visibility
// ---------------------------------------------------------------------
try {
  const roles = ["superadmin", "admin", "editor", "sales"];
  const results = {};

  for (const role of roles) {
    const html = render("admin/dashboard.njk", {
      adminName: "Test User",
      adminRole: role,
      csrfToken: "token",
      active: "dashboard",
      stats: {},
      recentActivity: []
    });
    const $ = cheerio.load(html);
    const hasContentLink = $('a[href="/admin/content"]').length > 0;
    results[role] = hasContentLink;
  }

  assert.strictEqual(results.superadmin, true, "Content link must appear for superadmin");
  assert.strictEqual(results.admin, true, "Content link must appear for admin");
  assert.strictEqual(results.editor, true, "Content link must appear for editor");
  assert.strictEqual(results.sales, false, "Content link must NOT appear for sales");

  pass("23. Role-based navigation for Content link", "superadmin/admin/editor visible, sales hidden");
} catch (err) {
  fail("23. Role-based navigation for Content link", err);
}

// ---------------------------------------------------------------------
// Check 24: Hostile strings in user and category fields render escaped
// ---------------------------------------------------------------------
try {
  const hostileScript = '"><script>alert("xss")</script>';
  const hostileTextarea = '</textarea><script>alert("textarea")</script>';

  // Users list
  const usersListHtml = render("admin/users/list.njk", {
    adminName: "Admin",
    adminRole: "superadmin",
    csrfToken: "t",
    active: "users",
    users: [{
      id: 99,
      username: hostileScript,
      name: hostileScript,
      email: hostileScript,
      role: "editor",
      active: 1
    }]
  });
  assert(!usersListHtml.includes('<script>alert('), "Hostile strings in users/list.njk must be escaped");

  // Users form
  const usersFormHtml = render("admin/users/form.njk", {
    adminName: "Admin",
    adminRole: "superadmin",
    csrfToken: "t",
    active: "users",
    user: {
      id: 99,
      username: hostileScript,
      name: hostileScript,
      email: hostileScript,
      role: "editor"
    },
    roles: [{ value: "editor", label: "Editor" }],
    isSelf: false
  });
  assert(!usersFormHtml.includes('<script>alert('), "Hostile strings in users/form.njk must be escaped");

  // Categories list
  const catListHtml = render("admin/categories/list.njk", {
    adminName: "Admin",
    adminRole: "admin",
    csrfToken: "t",
    active: "categories",
    categories: [{
      id: 99,
      key: hostileScript,
      name: hostileScript,
      blurb: hostileTextarea,
      product_count: 0
    }]
  });
  assert(!catListHtml.includes('<script>alert('), "Hostile strings in categories/list.njk must be escaped");

  // Categories form
  const catFormHtml = render("admin/categories/form.njk", {
    adminName: "Admin",
    adminRole: "admin",
    csrfToken: "t",
    active: "categories",
    category: {
      id: 99,
      key: hostileScript,
      name: hostileScript,
      blurb: hostileTextarea
    },
    mainCategories: [],
    productCount: 0
  });
  assert(!catFormHtml.includes('<script>alert('), "Hostile strings in categories/form.njk must be escaped");

  pass("24. Hostile strings in user and category templates escaped", "username, name, email, category name, key, and blurb properly escaped");
} catch (err) {
  fail("24. Hostile strings in user and category templates escaped", err);
}

// ---------------------------------------------------------------------
// Check 25: isSelf user editing logic
// ---------------------------------------------------------------------
try {
  // isSelf: true
  const selfHtml = render("admin/users/form.njk", {
    adminName: "Munna",
    adminRole: "superadmin",
    csrfToken: "t",
    active: "users",
    user: { id: 1, username: "munna", role: "superadmin", active: 1 },
    roles: [{ value: "superadmin", label: "Super Admin" }],
    isSelf: true
  });
  const $self = cheerio.load(selfHtml);
  assert($self('select[name="role"]').is(":disabled"), "Role select must be disabled when isSelf is true");
  assert($self('input[name="active"]').is(":disabled"), "Active checkbox must be disabled when isSelf is true");
  assert.strictEqual($self('form[action*="/delete"]').length, 0, "Delete form must NOT be present when isSelf is true");

  // isSelf: false
  const notSelfHtml = render("admin/users/form.njk", {
    adminName: "Munna",
    adminRole: "superadmin",
    csrfToken: "t",
    active: "users",
    user: { id: 2, username: "other", role: "editor", active: 1 },
    roles: [{ value: "editor", label: "Editor" }],
    isSelf: false
  });
  const $notSelf = cheerio.load(notSelfHtml);
  assert(!$notSelf('select[name="role"]').is(":disabled"), "Role select must be enabled when isSelf is false");
  assert(!$notSelf('input[name="active"]').is(":disabled"), "Active checkbox must be enabled when isSelf is false");
  const delForm = $notSelf('form[action="/admin/users/2/delete"]');
  assert.strictEqual(delForm.length, 1, "Delete form must be present when isSelf is false and user.id is set");
  assert.strictEqual((delForm.attr("method") || "").toLowerCase(), "post");
  assert.strictEqual(delForm.find('input[name="_csrf"]').val(), "t");

  pass("25. isSelf user editing logic", "role select and active checkbox disabled without delete form when isSelf; enabled with delete form when not self");
} catch (err) {
  fail("25. isSelf user editing logic", err);
}

// ---------------------------------------------------------------------
// Check 26: Role select options dynamically driven by roles fixture
// ---------------------------------------------------------------------
try {
  const customRoles = [
    { value: "lead_engineer", label: "Lead Engineer", help: "Structural signing authority" },
    { value: "site_inspector", label: "Site Inspector", help: "QA checks only" }
  ];

  const html = render("admin/users/form.njk", {
    adminName: "Munna",
    adminRole: "superadmin",
    csrfToken: "t",
    active: "users",
    user: { id: 3, role: "lead_engineer" },
    roles: customRoles,
    isSelf: false
  });

  const $ = cheerio.load(html);
  const options = $('select[name="role"] option');
  assert.strictEqual(options.length, 2, "Select must contain exactly 2 options from custom roles fixture");
  assert.strictEqual(options.eq(0).val(), "lead_engineer");
  assert.strictEqual(options.eq(1).val(), "site_inspector");
  assert.strictEqual($('select[name="role"] option[value="superadmin"]').length, 0, "superadmin must not be hardcoded when omitted from roles fixture");
  assert(options.eq(0).is(":selected"), "Current user role should be selected");

  pass("26. Role select dynamically rendered from roles fixture", "renders exactly what is passed with zero hardcoded options");
} catch (err) {
  fail("26. Role select dynamically rendered from roles fixture", err);
}

// ---------------------------------------------------------------------
// Check 27: Password fields required on new user, not required on edit
// ---------------------------------------------------------------------
try {
  // New user
  const newHtml = render("admin/users/form.njk", {
    adminName: "Munna",
    adminRole: "superadmin",
    csrfToken: "t",
    active: "users",
    user: {},
    roles: [{ value: "editor", label: "Editor" }],
    isSelf: false
  });
  const $new = cheerio.load(newHtml);
  const pwdNew = $new('input[name="password"]');
  const pwd2New = $new('input[name="password2"]');
  assert.strictEqual(pwdNew.attr("autocomplete"), "new-password", "Password field must have autocomplete='new-password'");
  assert.strictEqual(pwd2New.attr("autocomplete"), "new-password", "Confirm password field must have autocomplete='new-password'");
  assert(pwdNew.attr("required") !== undefined, "Password must be required on new user");
  assert(pwd2New.attr("required") !== undefined, "Confirm password must be required on new user");

  // Edit user
  const editHtml = render("admin/users/form.njk", {
    adminName: "Munna",
    adminRole: "superadmin",
    csrfToken: "t",
    active: "users",
    user: { id: 5, username: "existing" },
    roles: [{ value: "editor", label: "Editor" }],
    isSelf: false
  });
  const $edit = cheerio.load(editHtml);
  const pwdEdit = $edit('input[name="password"]');
  const pwd2Edit = $edit('input[name="password2"]');
  assert.strictEqual(pwdEdit.attr("autocomplete"), "new-password");
  assert.strictEqual(pwd2Edit.attr("autocomplete"), "new-password");
  assert(pwdEdit.attr("required") === undefined, "Password must NOT be required on edit user");
  assert(pwd2Edit.attr("required") === undefined, "Confirm password must NOT be required on edit user");
  assert(editHtml.includes("leave both empty to keep the current password"), "Edit user form must include leave empty help text");

  pass("27. Password field requirements and autocomplete", "required on create, optional on edit with help text, autocomplete='new-password' on both");
} catch (err) {
  fail("27. Password field requirements and autocomplete", err);
}

// ---------------------------------------------------------------------
// Check 28: Categories delete gating on productCount and move forms logic
// ---------------------------------------------------------------------
try {
  const token = "cat-token-test";

  // Category with products (> 0)
  const busyCatHtml = render("admin/categories/form.njk", {
    adminName: "Admin",
    adminRole: "admin",
    csrfToken: token,
    active: "categories",
    category: { id: 10, key: "sheds", name: "Sheds" },
    mainCategories: [],
    productCount: 7
  });
  const $busy = cheerio.load(busyCatHtml);
  assert.strictEqual($busy('form[action*="/delete"]').length, 0, "No delete form allowed when productCount > 0");
  assert(busyCatHtml.includes("This category still has 7 products — move them to another category first."), "Must show warning with exact product count when > 0");

  // Category with 0 products
  const emptyCatHtml = render("admin/categories/form.njk", {
    adminName: "Admin",
    adminRole: "admin",
    csrfToken: token,
    active: "categories",
    category: { id: 11, key: "towers", name: "Towers" },
    mainCategories: [],
    productCount: 0
  });
  const $empty = cheerio.load(emptyCatHtml);
  const delCatForm = $empty('form[action="/admin/categories/11/delete"]');
  assert.strictEqual(delCatForm.length, 1, "Delete form must be present when productCount is 0");
  assert.strictEqual((delCatForm.attr("method") || "").toLowerCase(), "post");
  assert.strictEqual(delCatForm.find('input[name="_csrf"]').val(), token);

  // Category list move forms
  const catListHtml = render("admin/categories/list.njk", {
    adminName: "Admin",
    adminRole: "admin",
    csrfToken: token,
    active: "categories",
    categories: [
      { id: 101, key: "c1", name: "Cat 1" },
      { id: 102, key: "c2", name: "Cat 2" },
      { id: 103, key: "c3", name: "Cat 3" }
    ]
  });
  const $list = cheerio.load(catListHtml);

  // First row in desktop table: only down form
  const firstRowForms = $list('tbody tr:first-child form');
  assert.strictEqual(firstRowForms.length, 1, "First category row must have only 1 move form (down)");
  assert.strictEqual(firstRowForms.find('input[name="direction"]').val(), "down");
  assert.strictEqual(firstRowForms.attr("action"), "/admin/categories/101/move");
  assert.strictEqual(firstRowForms.find('input[name="_csrf"]').val(), token);

  // Middle row in desktop table: both up and down
  const midRowForms = $list('tbody tr:nth-child(2) form');
  assert.strictEqual(midRowForms.length, 2, "Middle category row must have both up and down forms");
  assert.strictEqual(midRowForms.eq(0).find('input[name="direction"]').val(), "up");
  assert.strictEqual(midRowForms.eq(1).find('input[name="direction"]').val(), "down");

  // Last row in desktop table: only up form
  const lastRowForms = $list('tbody tr:last-child form');
  assert.strictEqual(lastRowForms.length, 1, "Last category row must have only 1 move form (up)");
  assert.strictEqual(lastRowForms.find('input[name="direction"]').val(), "up");
  assert.strictEqual(lastRowForms.attr("action"), "/admin/categories/103/move");

  pass("28. Categories delete gating and move forms logic", "warning message when products > 0, delete form when 0; first row no up, last row no down");
} catch (err) {
  fail("28. Categories delete gating and move forms logic", err);
}

// ---------------------------------------------------------------------
// Check 29: Categories sidebar link role-based visibility
// ---------------------------------------------------------------------
try {
  const roles = ["superadmin", "admin", "editor", "sales"];
  const results = {};

  for (const role of roles) {
    const html = render("admin/dashboard.njk", {
      adminName: "Test User",
      adminRole: role,
      csrfToken: "token",
      active: "dashboard",
      stats: {},
      recentActivity: []
    });
    const $ = cheerio.load(html);
    const hasCategoriesLink = $('a[href="/admin/categories"]').length > 0;
    results[role] = hasCategoriesLink;
  }

  assert.strictEqual(results.superadmin, true, "Categories link must appear for superadmin");
  assert.strictEqual(results.admin, true, "Categories link must appear for admin");
  assert.strictEqual(results.editor, true, "Categories link must appear for editor");
  assert.strictEqual(results.sales, false, "Categories link must NOT appear for sales");

  pass("29. Role-based navigation for Categories link", "superadmin/admin/editor visible, sales hidden");
} catch (err) {
  fail("29. Role-based navigation for Categories link", err);
}

// ---------------------------------------------------------------------
// Check 30: Hostile strings in media and backups templates render escaped
// ---------------------------------------------------------------------
try {
  const hostileScript = '"><script>alert("xss")</script>';
  const hostileTextarea = '</textarea><script>alert("textarea")</script>';

  // Media list hostile
  const mediaHtml = render("admin/media/list.njk", {
    adminName: "Admin",
    adminRole: "admin",
    csrfToken: "t",
    active: "media",
    items: [{
      path: hostileScript,
      name: hostileScript,
      bytes: 2048,
      modified: new Date(),
      variants: [],
      usedBy: [hostileScript]
    }],
    uploaded: hostileScript,
    maxMB: 8,
    available: true
  });
  assert(!mediaHtml.includes('<script>alert('), "Hostile script must NOT execute unescaped in media/list.njk");

  // Backups list hostile
  const backupsHtml = render("admin/backups/list.njk", {
    adminName: "Admin",
    adminRole: "superadmin",
    csrfToken: "t",
    active: "backups",
    snapshots: [{
      id: 99,
      created_at: new Date(),
      admin_name: hostileScript,
      reason: "manual",
      note: hostileTextarea,
      bytes: 4096,
      counts: null
    }],
    keep: 60,
    autoGapMinutes: 30
  });
  assert(!backupsHtml.includes('<script>alert('), "Hostile script must NOT execute unescaped in backups/list.njk");

  pass("30. Hostile strings in media & backups templates escaped", "name, path, usedBy, admin_name, and note safely escaped");
} catch (err) {
  fail("30. Hostile strings in media & backups templates escaped", err);
}

// ---------------------------------------------------------------------
// Check 31: Upload form enctype and file input configuration
// ---------------------------------------------------------------------
try {
  const html = render("admin/media/list.njk", {
    adminName: "Admin",
    adminRole: "admin",
    csrfToken: "t-upload",
    active: "media",
    items: [],
    uploaded: null,
    maxMB: 8,
    available: true
  });
  const $ = cheerio.load(html);
  const uploadForm = $('form[action="/admin/media"]');
  assert.strictEqual(uploadForm.length, 1, "Expected exactly 1 upload form targeting /admin/media");
  assert.strictEqual(uploadForm.attr("enctype"), "multipart/form-data", "Upload form must have enctype='multipart/form-data'");
  assert.strictEqual((uploadForm.attr("method") || "").toLowerCase(), "post", "Upload form method must be POST");

  const fileInput = uploadForm.find('input[type="file"][name="file"]');
  assert.strictEqual(fileInput.length, 1, "Upload form must contain input[type='file'][name='file']");
  assert(fileInput.attr("required") !== undefined, "File input must be required");

  pass("31. Upload form enctype and file input configuration", "enctype='multipart/form-data', method=post, file input named 'file' and required");
} catch (err) {
  fail("31. Upload form enctype and file input configuration", err);
}

// ---------------------------------------------------------------------
// Check 32: Media delete forms logic & lesson 1 constraint
// ---------------------------------------------------------------------
try {
  const html = render("admin/media/list.njk", {
    adminName: "Admin",
    adminRole: "admin",
    csrfToken: "t-delete",
    active: "media",
    items: [
      { path: "images/used.webp", name: "used.webp", bytes: 5000, modified: new Date(), variants: [], usedBy: ["Product BH-100"] },
      { path: "images/unused1.webp", name: "unused1.webp", bytes: 6000, modified: new Date(), variants: [], usedBy: [] },
      { path: "images/unused2.webp", name: "unused2.webp", bytes: 7000, modified: new Date(), variants: [], usedBy: [] }
    ],
    uploaded: null,
    maxMB: 8,
    available: true
  });

  const $ = cheerio.load(html);
  const deleteForms = $('form[action="/admin/media/delete"]');
  assert.strictEqual(deleteForms.length, 2, "Expected exactly 2 delete forms for the 2 unused items");

  const pathsInForms = [];
  deleteForms.each((i, el) => {
    const pathVal = $(el).find('input[name="path"]').val();
    pathsInForms.push(pathVal);
    assert.strictEqual($(el).find('input[name="_csrf"]').val(), "t-delete");
    assert($(el).attr("onsubmit") && $(el).attr("onsubmit").includes("confirm("), "Delete form must have confirmation prompt");
  });

  assert(!pathsInForms.includes("images/used.webp"), "Item with usedBy must NOT have a delete form");
  assert(pathsInForms.includes("images/unused1.webp"));
  assert(pathsInForms.includes("images/unused2.webp"));

  // Verify Lesson 1: Each media path appears in at most one delete form
  const pathOccurrences = {};
  for (const p of pathsInForms) {
    pathOccurrences[p] = (pathOccurrences[p] || 0) + 1;
    assert.strictEqual(pathOccurrences[p], 1, `Path ${p} appeared more than once in delete forms! Single markup required.`);
  }

  pass("32. Media delete forms logic & single markup constraint", "each media path appears in at most one delete form; usedBy items have none");
} catch (err) {
  fail("32. Media delete forms logic & single markup constraint", err);
}

// ---------------------------------------------------------------------
// Check 33: available: false disables upload form submit and file input
// ---------------------------------------------------------------------
try {
  const html = render("admin/media/list.njk", {
    adminName: "Admin",
    adminRole: "admin",
    csrfToken: "t",
    active: "media",
    items: [],
    uploaded: null,
    maxMB: 8,
    available: false
  });
  const $ = cheerio.load(html);
  const uploadForm = $('form[action="/admin/media"]');
  const fileInput = uploadForm.find('input[name="file"]');
  const submitBtn = uploadForm.find('button[type="submit"]');

  assert(fileInput.is(":disabled"), "File input must be disabled when available is false");
  assert(submitBtn.is(":disabled"), "Submit button must be disabled when available is false");

  pass("33. available: false disables upload controls", "file input and submit button disabled when image processing is unavailable");
} catch (err) {
  fail("33. available: false disables upload controls", err);
}

// ---------------------------------------------------------------------
// Check 34: Each snapshot has exactly one restore form with confirm()
// ---------------------------------------------------------------------
try {
  const token = "t-restore";
  const snapshotsList = [
    { id: 101, created_at: new Date(), admin_name: "Munna", reason: "manual", note: "N1", bytes: 1000, counts: null },
    { id: 102, created_at: new Date(), admin_name: "Admin", reason: "auto", note: "N2", bytes: 2000, counts: null },
    { id: 103, created_at: new Date(), admin_name: null, reason: "before-restore", note: "N3", bytes: 3000, counts: null }
  ];

  const html = render("admin/backups/list.njk", {
    adminName: "Admin",
    adminRole: "superadmin",
    csrfToken: token,
    active: "backups",
    snapshots: snapshotsList,
    keep: 60,
    autoGapMinutes: 30
  });

  const $ = cheerio.load(html);

  for (const s of snapshotsList) {
    const restoreForms = $(`form[action="/admin/backups/${s.id}/restore"]`);
    assert.strictEqual(restoreForms.length, 1, `Snapshot #${s.id} must have exactly one restore form`);
    assert.strictEqual((restoreForms.attr("method") || "").toLowerCase(), "post");
    assert.strictEqual(restoreForms.find('input[name="_csrf"]').val(), token);
    const onsubmit = restoreForms.attr("onsubmit") || "";
    assert(onsubmit.includes("confirm("), `Restore form for #${s.id} must have confirm() prompt`);
    assert(onsubmit.includes(`snapshot #${s.id}`), `Restore confirm text should reference snapshot #${s.id}`);
  }

  pass("34. Exactly one restore form with confirm() per snapshot", "all snapshots have exactly 1 POST restore form with CSRF and confirm()");
} catch (err) {
  fail("34. Exactly one restore form with confirm() per snapshot", err);
}

// ---------------------------------------------------------------------
// Check 35: Media and Backups sidebar links role-based visibility
// ---------------------------------------------------------------------
try {
  const roles = ["superadmin", "admin", "editor", "sales"];
  const mediaResults = {};
  const backupsResults = {};

  for (const role of roles) {
    const html = render("admin/dashboard.njk", {
      adminName: "Test User",
      adminRole: role,
      csrfToken: "token",
      active: "dashboard",
      stats: {},
      recentActivity: []
    });
    const $ = cheerio.load(html);
    mediaResults[role] = $('a[href="/admin/media"]').length > 0;
    backupsResults[role] = $('a[href="/admin/backups"]').length > 0;
  }

  // Media: superadmin/admin/editor visible, sales hidden
  assert.strictEqual(mediaResults.superadmin, true, "Media link must appear for superadmin");
  assert.strictEqual(mediaResults.admin, true, "Media link must appear for admin");
  assert.strictEqual(mediaResults.editor, true, "Media link must appear for editor");
  assert.strictEqual(mediaResults.sales, false, "Media link must NOT appear for sales");

  // Backups: superadmin/admin visible, editor/sales hidden
  assert.strictEqual(backupsResults.superadmin, true, "Backups link must appear for superadmin");
  assert.strictEqual(backupsResults.admin, true, "Backups link must appear for admin");
  assert.strictEqual(backupsResults.editor, false, "Backups link must NOT appear for editor");
  assert.strictEqual(backupsResults.sales, false, "Backups link must NOT appear for sales");

  pass("35. Role-based navigation for Media and Backups links", "Media: superadmin/admin/editor; Backups: superadmin/admin only");
} catch (err) {
  fail("35. Role-based navigation for Media and Backups links", err);
}

console.log("\n-------------------------------------------------");
console.log(`Results: ${passedChecks} passed, ${failedChecks} failed.`);
console.log("-------------------------------------------------");

if (failedChecks > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
