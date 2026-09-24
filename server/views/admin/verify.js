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

console.log("\n-------------------------------------------------");
console.log(`Results: ${passedChecks} passed, ${failedChecks} failed.`);
console.log("-------------------------------------------------");

if (failedChecks > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
