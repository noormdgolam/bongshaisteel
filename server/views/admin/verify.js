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

console.log("\n-------------------------------------------------");
console.log(`Results: ${passedChecks} passed, ${failedChecks} failed.`);
console.log("-------------------------------------------------");

if (failedChecks > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
