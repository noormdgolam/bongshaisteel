/* ==========================================================================
   BONGSHAI STEEL — CMS DASHBOARD
   Plain ES2015. Loads content via api.php, edits it in memory, saves the
   whole object back. No framework, no build.
   ========================================================================== */
(function () {
  "use strict";

  var content = null;
  var dirty = false;
  var currentTab = null;

  var $main = document.getElementById("main");
  var $nav = document.getElementById("nav");
  var $saveBtn = document.getElementById("saveBtn");
  var $dot = document.getElementById("dirtyDot");
  var $overlay = document.getElementById("overlay");
  var $modal = document.getElementById("modal");
  var $toast = document.getElementById("toast");

  /* ---------- tiny helpers ------------------------------------------------ */
  function h(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); }
  function getPath(o, path) {
    return path.split(".").reduce(function (a, k) { return a == null ? a : a[k]; }, o);
  }
  function markDirty() { dirty = true; syncDirty(); }
  function syncDirty() {
    $saveBtn.disabled = !dirty;
    $dot.classList.toggle("dirty", dirty);
    $dot.title = dirty ? "Unsaved changes" : "No unsaved changes";
  }
  var toastTimer;
  function toast(msg, kind) {
    $toast.textContent = msg;
    $toast.className = "toast show " + (kind || "");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { $toast.className = "toast " + (kind || ""); }, 3200);
  }
  function slug(s) {
    return String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  }

  /* ---------- API ------------------------------------------------------- */
  function api(action, opts) {
    return fetch("api.php?action=" + action, opts).then(function (r) {
      return r.json().then(function (j) {
        if (r.status === 403 || (j && j.error === "unauthorized")) {
          location.href = "login.php?return=" + encodeURIComponent("/admin/");
          throw new Error("auth");
        }
        if (!j || !j.ok) throw new Error((j && j.message) || ("HTTP " + r.status));
        return j;
      });
    });
  }

  /** Fill in anything missing so every tab can assume its shape. */
  function normalise() {
    ["text", "html", "settings", "seo", "sections", "media"].forEach(function (k) {
      if (typeof content[k] !== "object" || content[k] == null) content[k] = {};
    });
    ["products", "categories", "mainCategories", "featuredIds"].forEach(function (k) {
      if (!Array.isArray(content[k])) content[k] = [];
    });
    var s = content.sections;
    ["stats", "trustBar", "services", "faq", "testimonials", "team", "serviceAreas"]
      .forEach(function (k) { if (!Array.isArray(s[k])) s[k] = []; });
    if (typeof s.safety !== "object" || !s.safety) s.safety = { intro: "", points: [] };
    if (!Array.isArray(s.safety.points)) s.safety.points = [];
    if (!Array.isArray(content.settings.sisterLinks)) content.settings.sisterLinks = [];
  }

  function load() {
    api("load").then(function (j) {
      if (!j.authed) { location.href = "login.php?return=" + encodeURIComponent("/admin/"); return; }
      content = j.content || {};
      normalise();

      buildNav();
      var start = (location.hash || "").replace(/^#/, "");
      renderTab(TABS.some(function (t) { return t.id === start; }) ? start : TABS[0].id);
      syncDirty();
    }).catch(function (e) {
      if (e.message === "auth") return;
      clear($main);
      $main.appendChild(h("div", "loading", "Could not load content: " + e.message));
    });
  }

  function save() {
    $saveBtn.disabled = true;
    api("save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: content })
    }).then(function (j) {
      content = j.content;
      dirty = false; syncDirty();
      toast("Saved — live on the site now.", "ok");
    }).catch(function (e) {
      if (e.message === "auth") return;
      toast("Save failed: " + e.message, "err");
      syncDirty();
    });
  }

  function uploadImage(file) {
    var fd = new FormData();
    fd.append("file", file);
    return api("upload", { method: "POST", body: fd }).then(function (j) {
      content.media[j.path] = { widths: j.widths || [] };
      if (j.variants === false) toast(j.note || "Stored full-size only (no WebP support on server).", "err");
      return j.path;
    });
  }

  /* ---------- generic field builders ----------------------------------- */
  function fieldWrap(label, sub) {
    var w = h("div", "field");
    if (label) w.appendChild(h("label", null, label));
    w._sub = sub;
    return w;
  }
  function attachSub(w) { if (w._sub) w.appendChild(h("div", "sub", w._sub)); return w; }

  function boundInput(store, key, opts) {
    opts = opts || {};
    var el = opts.area ? document.createElement("textarea") : document.createElement("input");
    if (!opts.area) el.type = "text";
    el.value = store[key] == null ? "" : store[key];
    el.addEventListener("input", function () {
      store[key] = opts.number ? (el.value === "" ? "" : Number(el.value)) : el.value;
      markDirty();
    });
    return el;
  }

  // scoped text field: content.text[key]
  function tField(key, label, opts) {
    var w = fieldWrap(label, opts && opts.sub);
    w.appendChild(boundInput(content.text, key, opts));
    return attachSub(w);
  }
  function htmlField(key, label, opts) {
    opts = Object.assign({ area: true }, opts || {});
    var w = fieldWrap(label, opts.sub || "HTML allowed (e.g. <strong>, <a>).");
    w.appendChild(boundInput(content.html, key, opts));
    return attachSub(w);
  }
  function sField(key, label, opts) {
    var w = fieldWrap(label, opts && opts.sub);
    w.appendChild(boundInput(content.settings, key, opts));
    return attachSub(w);
  }
  function seoField(key, label, opts) {
    var w = fieldWrap(label, opts && opts.sub);
    w.appendChild(boundInput(content.seo, key, opts));
    return attachSub(w);
  }

  function group(title) {
    var g = h("div", "group");
    if (title) g.appendChild(h("h2", null, title));
    return g;
  }
  function rowGrid() { return h("div", "row"); }

  /* ---------- image picker ------------------------------------------- */
  function imagePicker(obj, key, opts) {
    opts = opts || {};
    var w = fieldWrap(opts.label || "Image", opts.sub);
    var box = h("div", "imgpick");
    var img = h("img");
    img.alt = "";
    img.src = obj[key] ? "../" + obj[key] : "";
    var controls = h("div", "imgpick-controls");

    var path = document.createElement("input");
    path.type = "text";
    path.placeholder = "images/…";
    path.value = obj[key] || "";
    path.addEventListener("input", function () {
      obj[key] = path.value; img.src = path.value ? "../" + path.value : ""; markDirty();
    });

    var file = document.createElement("input");
    file.type = "file";
    file.accept = "image/*";
    file.style.display = "none";
    file.addEventListener("change", function () {
      if (!file.files || !file.files[0]) return;
      var btnText = upBtn.textContent;
      upBtn.textContent = "Uploading…"; upBtn.disabled = true;
      uploadImage(file.files[0]).then(function (p) {
        obj[key] = p; path.value = p; img.src = "../" + p; markDirty();
      }).catch(function (e) { if (e.message !== "auth") toast("Upload failed: " + e.message, "err"); })
        .then(function () { upBtn.textContent = btnText; upBtn.disabled = false; file.value = ""; });
    });
    var upBtn = h("button", null, "Upload…");
    upBtn.type = "button";
    upBtn.addEventListener("click", function () { file.click(); });

    controls.appendChild(path);
    controls.appendChild(upBtn);
    controls.appendChild(file);
    box.appendChild(img);
    box.appendChild(controls);
    w.appendChild(box);
    return attachSub(w);
  }

  /* ---------- array editor (stats / trustBar / services / points) ----- */
  function arrayEditor(arr, spec, opts) {
    opts = opts || {};
    var wrap = h("div", "card-list");

    function rowFor(item, idx) {
      var it = h("div", "item");
      var head = h("div", "item-head");
      head.appendChild(h("strong", null, opts.title ? opts.title(item, idx) : "#" + (idx + 1)));
      if (idx > 0) {
        var up = h("button", "ghost", "↑"); up.type = "button";
        up.addEventListener("click", function () { arr.splice(idx - 1, 0, arr.splice(idx, 1)[0]); markDirty(); rerender(); });
        head.appendChild(up);
      }
      if (idx < arr.length - 1) {
        var dn = h("button", "ghost", "↓"); dn.type = "button";
        dn.addEventListener("click", function () { arr.splice(idx + 1, 0, arr.splice(idx, 1)[0]); markDirty(); rerender(); });
        head.appendChild(dn);
      }
      var del = h("button", "danger", "Remove"); del.type = "button";
      del.addEventListener("click", function () { arr.splice(idx, 1); markDirty(); rerender(); });
      head.appendChild(del);
      it.appendChild(head);

      if (typeof item === "string") {
        var ta = document.createElement("textarea");
        ta.value = item;
        ta.addEventListener("input", function () { arr[idx] = ta.value; markDirty(); });
        it.appendChild(ta);
      } else {
        spec.forEach(function (f) {
          if (f.type === "image") {
            it.appendChild(imagePicker(item, f.key, { label: f.label, sub: f.sub }));
            return;
          }
          var fw = fieldWrap(f.label, f.sub);
          var input = f.type === "textarea" ? document.createElement("textarea") : document.createElement("input");
          if (f.type !== "textarea") input.type = "text";
          input.value = item[f.key] == null ? "" : item[f.key];
          input.addEventListener("input", function () { item[f.key] = input.value; markDirty(); });
          fw.appendChild(input);
          it.appendChild(attachSub(fw));
        });
      }
      return it;
    }

    function rerender() {
      clear(wrap);
      arr.forEach(function (item, idx) { wrap.appendChild(rowFor(item, idx)); });
      var add = h("button", "add-btn", opts.addLabel || "+ Add");
      add.type = "button";
      add.addEventListener("click", function () {
        arr.push(opts.blank ? opts.blank() : "");
        markDirty(); rerender();
      });
      wrap.appendChild(add);
    }
    rerender();
    return wrap;
  }

  /* ---------- modal --------------------------------------------------- */
  function openModal(title, buildBody, onSave) {
    clear($modal);
    $modal.appendChild(h("h3", null, title));
    var body = h("div");
    buildBody(body);
    $modal.appendChild(body);
    var actions = h("div", "modal-actions");
    var cancel = h("button", "ghost", "Cancel");
    cancel.addEventListener("click", closeModal);
    var ok = h("button", "primary", "Done");
    ok.addEventListener("click", function () { if (onSave() !== false) closeModal(); });
    actions.appendChild(cancel);
    actions.appendChild(ok);
    $modal.appendChild(actions);
    $overlay.classList.add("open");
  }
  function closeModal() { $overlay.classList.remove("open"); }
  $overlay.addEventListener("click", function (e) { if (e.target === $overlay) closeModal(); });

  /* ==================================================================== */
  /*  TABS                                                                 */
  /* ==================================================================== */
  var TABS = [
    { id: "overview", label: "Overview", render: renderOverview },
    { id: "leads", label: "Messages", render: renderLeads },
    { id: "site", label: "Site & SEO", render: renderSite },
    { id: "nav", label: "Navigation", render: renderNav },
    { id: "home", label: "Home page", render: renderHome },
    { id: "services", label: "Services", render: renderServices },
    { id: "safety", label: "Safety (EHS)", render: renderSafety },
    { id: "faq", label: "FAQ", render: renderFaq },
    { id: "products", label: "Products", render: renderProducts },
    { id: "categories", label: "Categories", render: renderCategories },
    { id: "testimonials", label: "Testimonials", render: renderTestimonials },
    { id: "team", label: "Team", render: renderTeam },
    { id: "areas", label: "Service areas", render: renderAreas },
    { id: "media", label: "Media", render: renderMedia },
    { id: "activity", label: "Activity", render: renderActivity },
    { id: "backups", label: "Backups & export", render: renderBackups }
  ];

  function buildNav() {
    clear($nav);
    TABS.forEach(function (t) {
      var a = h("a", null, t.label);
      a.href = "#" + t.id;
      a.dataset.tab = t.id;
      a.addEventListener("click", function (e) { e.preventDefault(); renderTab(t.id); });
      $nav.appendChild(a);
    });
  }

  function renderTab(id) {
    currentTab = id;
    location.hash = id;
    Array.prototype.forEach.call($nav.children, function (a) {
      a.classList.toggle("active", a.dataset.tab === id);
    });
    clear($main);
    var tab = TABS.filter(function (t) { return t.id === id; })[0] || TABS[0];
    tab.render($main);
    $main.scrollTop = 0;
  }

  /* ---------- SITE & SEO --------------------------------------------- */
  function renderSite(root) {
    root.appendChild(h("h1", null, "Site & SEO"));
    root.appendChild(h("p", "hint", "Company details shown in the header strip, contact card and footer."));

    var g1 = group("Contact details");
    var r = rowGrid();
    r.appendChild(sField("companyName", "Company name"));
    r.appendChild(sField("email", "Email"));
    g1.appendChild(r);
    var r2 = rowGrid();
    r2.appendChild(sField("hotline", "Hotline / phone (display text)"));
    r2.appendChild(sField("whatsappNumber", "WhatsApp number", { sub: "Digits only, with country code — e.g. 8801789949060" }));
    g1.appendChild(r2);
    g1.appendChild(sField("address", "Address"));
    g1.appendChild(sField("workingHours", "Working hours"));
    root.appendChild(g1);

    var g2 = group("Footer");
    g2.appendChild(sField("footerBlurb", "Footer blurb", { area: true }));
    g2.appendChild(sField("copyright", "Copyright line"));
    g2.appendChild(h("label", null, "Sister company links"));
    g2.appendChild(arrayEditor(content.settings.sisterLinks, [
      { key: "label", label: "Label" },
      { key: "url", label: "URL" }
    ], { addLabel: "+ Add link", blank: function () { return { label: "", url: "" }; },
      title: function (it) { return it.label || "Link"; } }));
    root.appendChild(g2);

    var g3 = group("Search / SEO");
    g3.appendChild(seoField("title", "Browser tab title", { sub: "Applied to <title> and used by search engines." }));
    g3.appendChild(seoField("description", "Meta description", { area: true }));
    g3.appendChild(seoField("keywords", "Meta keywords", { area: true, sub: "Comma separated. Minor ranking value these days, harmless to keep." }));
    g3.appendChild(seoField("canonical", "Canonical URL", { sub: "The one address this page should be indexed under. Also fills og:url." }));
    root.appendChild(g3);

    var g4 = group("Social sharing card");
    g4.appendChild(h("p", "sub", "What Facebook, WhatsApp, LinkedIn and X show when someone pastes the link. Left empty, each falls back to the SEO title and description above."));
    g4.appendChild(seoField("ogTitle", "Share title"));
    g4.appendChild(seoField("ogDescription", "Share description", { area: true }));
    g4.appendChild(imagePicker(content.seo, "ogImage", { label: "Share image", sub: "Shown at roughly 1200x630. Wide images survive cropping best." }));
    root.appendChild(g4);
  }

  /* ---------- HOME -------------------------------------------------- */
  function renderHome(root) {
    root.appendChild(h("h1", null, "Home page"));
    root.appendChild(h("p", "hint", "The one-page site's hero and homepage sections."));

    var hero = group("Hero");
    hero.appendChild(tField("hero.tag", "Small tag line (above the headline)"));
    hero.appendChild(tField("hero.title", "Headline", { area: true }));
    hero.appendChild(tField("hero.description", "Intro paragraph", { area: true }));
    hero.appendChild(htmlField("hero.byline", "Byline (reviewer / date line)"));
    var hr = rowGrid();
    hr.appendChild(tField("hero.btnPrimary", "Primary button label"));
    hr.appendChild(tField("hero.btnSecondary", "Secondary button label"));
    hero.appendChild(hr);
    hero.appendChild(imagePicker(content.text, "hero.image", { label: "Hero image" }));
    root.appendChild(hero);

    var stats = group("Stats bar (below the hero)");
    stats.appendChild(arrayEditor(content.sections.stats, [
      { key: "value", label: "Big number / value" },
      { key: "label", label: "Caption" }
    ], { addLabel: "+ Add stat", blank: function () { return { value: "", label: "" }; },
      title: function (it) { return it.value || "Stat"; } }));
    root.appendChild(stats);

    var trust = group("Trust bar (icons row)");
    trust.appendChild(arrayEditor(content.sections.trustBar, [
      { key: "icon", label: "Icon (emoji)" },
      { key: "title", label: "Title" },
      { key: "text", label: "Text", type: "textarea", sub: "HTML allowed." }
    ], { addLabel: "+ Add item", blank: function () { return { icon: "", title: "", text: "" }; },
      title: function (it) { return it.title || "Item"; } }));
    root.appendChild(trust);

    var misc = group("Section headings");
    [
      ["growing.subtitle", "“Growing markets” — small subtitle"],
      ["growing.title", "“Growing markets” — title"],
      ["growing.body", "“Growing markets” — paragraph"],
      ["growing.btn", "“Growing markets” — button label"],
      ["threeD.subtitle", "3D inspector — subtitle"],
      ["threeD.title", "3D inspector — title"],
      ["threeD.body", "3D inspector — paragraph"],
      ["categories.subtitle", "Categories block — subtitle"],
      ["categories.title", "Categories block — title"],
      ["featured.subtitle", "Flagship models — subtitle"],
      ["featured.title", "Flagship models — title"],
      ["productsView.title", "Products catalog — page title"]
    ].forEach(function (p) {
      misc.appendChild(tField(p[0], p[1], /body|paragraph/i.test(p[1]) ? { area: true } : null));
    });
    root.appendChild(misc);

    var teaser = group("FAQ teaser card");
    teaser.appendChild(htmlField("faqTeaser.title", "Heading"));
    teaser.appendChild(htmlField("faqTeaser.body", "Text"));
    root.appendChild(teaser);
  }

  /* ---------- SERVICES -------------------------------------------- */
  function renderServices(root) {
    root.appendChild(h("h1", null, "Services"));
    root.appendChild(h("p", "hint", "The “Our Specialized Services” cards."));
    var g = group(null);
    g.appendChild(tField("services.subtitle", "Subtitle"));
    g.appendChild(tField("services.title", "Title"));
    root.appendChild(g);
    var g2 = group("Service cards");
    g2.appendChild(arrayEditor(content.sections.services, [
      { key: "title", label: "Title" },
      { key: "desc", label: "Description", type: "textarea", sub: "HTML allowed." }
    ], { addLabel: "+ Add service", blank: function () { return { title: "", desc: "" }; },
      title: function (it) { return it.title || "Service"; } }));
    root.appendChild(g2);
  }

  /* ---------- SAFETY -------------------------------------------- */
  function renderSafety(root) {
    root.appendChild(h("h1", null, "Health & Safety Policy"));
    var g = group(null);
    g.appendChild(tField("safety.subtitle", "Subtitle"));
    g.appendChild(tField("safety.title", "Title"));
    var w = fieldWrap("Intro paragraph");
    w.appendChild(boundInput(content.sections.safety, "intro", { area: true }));
    g.appendChild(w);
    root.appendChild(g);
    var g2 = group("Policy points (bullet list)");
    g2.appendChild(arrayEditor(content.sections.safety.points, null, { addLabel: "+ Add point" }));
    root.appendChild(g2);
  }

  /* ---------- FAQ --------------------------------------------- */
  function renderFaq(root) {
    root.appendChild(h("h1", null, "FAQ"));
    root.appendChild(h("p", "hint", "The visible FAQ list. (The separate search-engine FAQ schema in the page <head> is left untouched.)"));
    var g = group("Headings");
    g.appendChild(tField("faq.subtitle", "Subtitle"));
    g.appendChild(tField("faq.title", "Title"));
    g.appendChild(tField("faq.intro", "Intro paragraph", { area: true }));
    root.appendChild(g);
    var g2 = group("Questions & answers");
    g2.appendChild(arrayEditor(content.sections.faq, [
      { key: "q", label: "Question" },
      { key: "a", label: "Answer", type: "textarea", sub: "HTML allowed." }
    ], { addLabel: "+ Add question", blank: function () { return { q: "", a: "" }; },
      title: function (it) { return it.q || "Question"; } }));
    root.appendChild(g2);
  }

  /* ---------- PRODUCTS -------------------------------------- */
  function catName(key) {
    var c = content.categories.filter(function (x) { return x.key === key; })[0];
    return c ? c.name : "";
  }

  function renderProducts(root) {
    root.appendChild(h("h1", null, "Products"));
    root.appendChild(h("p", "hint", content.products.length + " models. ★ marks the homepage flagship picks."));

    var add = h("button", "primary", "+ Add product");
    add.style.marginBottom = "16px";
    add.addEventListener("click", function () { editProduct(null); });
    root.appendChild(add);

    var table = h("table", "products");
    var thead = h("thead");
    thead.innerHTML = "<tr><th></th><th></th><th>Model</th><th>Name</th><th>Category</th><th>★</th><th></th></tr>";
    table.appendChild(thead);
    var tb = h("tbody");

    content.products
      .slice()
      .sort(function (a, b) { return (a.order || 0) - (b.order || 0); })
      .forEach(function (p) {
        var tr = h("tr");
        var pos = content.products.indexOf(p);

        var tdImg = h("td");
        if (p.image) { var im = h("img"); im.src = "../" + p.image; im.alt = ""; tdImg.appendChild(im); }
        tr.appendChild(tdImg);

        var tdOrd = h("td");
        var oi = document.createElement("input");
        oi.type = "text"; oi.value = p.order == null ? "" : p.order;
        oi.style.width = "44px";
        oi.title = "Sort order";
        oi.addEventListener("input", function () { p.order = oi.value === "" ? 0 : Number(oi.value) || 0; markDirty(); });
        tdOrd.appendChild(oi);
        tr.appendChild(tdOrd);

        tr.appendChild(h("td", null, p.modelCode || ""));
        tr.appendChild(h("td", null, p.name || ""));
        var tdc = h("td"); tdc.appendChild(h("span", "pill", catName(p.category) || p.category || "—")); tr.appendChild(tdc);

        var tdStar = h("td");
        var star = h("button", "ghost", content.featuredIds.indexOf(p.id) >= 0 ? "★" : "☆");
        star.title = "Toggle homepage flagship";
        star.addEventListener("click", function () {
          var i = content.featuredIds.indexOf(p.id);
          if (i >= 0) content.featuredIds.splice(i, 1); else content.featuredIds.push(p.id);
          star.textContent = i >= 0 ? "☆" : "★";
          markDirty();
        });
        tdStar.appendChild(star);
        tr.appendChild(tdStar);

        var tdAct = h("td");
        var ed = h("button", "ghost", "Edit");
        ed.addEventListener("click", function () { editProduct(pos); });
        tdAct.appendChild(ed);
        tr.appendChild(tdAct);

        tb.appendChild(tr);
      });

    table.appendChild(tb);
    root.appendChild(table);
  }

  function editProduct(pos) {
    var isNew = pos == null;
    var p = isNew
      ? { id: "", category: (content.categories[0] || {}).key || "", categoryName: "", modelCode: "", name: "", desc: "", image: "", order: content.products.length }
      : Object.assign({}, content.products[pos]);

    openModal(isNew ? "New product" : "Edit product", function (body) {
      var f1 = fieldWrap("Name"); f1.appendChild(boundInput(p, "name")); body.appendChild(f1);
      var f2 = fieldWrap("Model code", "e.g. BH-IS-1013"); f2.appendChild(boundInput(p, "modelCode")); body.appendChild(attachSub(f2));

      var fc = fieldWrap("Category");
      var sel = document.createElement("select");
      content.categories.forEach(function (c) {
        var o = document.createElement("option");
        o.value = c.key; o.textContent = c.name;
        if (c.key === p.category) o.selected = true;
        sel.appendChild(o);
      });
      sel.addEventListener("change", function () { p.category = sel.value; });
      fc.appendChild(sel);
      body.appendChild(fc);

      var f3 = fieldWrap("Description"); var ta = document.createElement("textarea");
      ta.value = p.desc || ""; ta.addEventListener("input", function () { p.desc = ta.value; });
      f3.appendChild(ta); body.appendChild(f3);

      body.appendChild(imagePicker(p, "image", { label: "Photo" }));

      var f4 = fieldWrap("Sort order", "Lower numbers show first."); f4.appendChild(boundInput(p, "order", { number: true })); body.appendChild(attachSub(f4));

      if (!isNew) {
        var del = h("button", "danger", "Delete this product");
        del.style.marginTop = "8px";
        del.addEventListener("click", function () {
          if (!confirm("Delete " + (p.modelCode || p.name) + "?")) return;
          var id = content.products[pos].id;
          content.products.splice(pos, 1);
          var fi = content.featuredIds.indexOf(id);
          if (fi >= 0) content.featuredIds.splice(fi, 1);
          markDirty(); closeModal(); renderTab("products");
        });
        body.appendChild(del);
      }
    }, function () {
      if (!p.name || !p.modelCode) { toast("Name and model code are required.", "err"); return false; }
      p.categoryName = catName(p.category);
      if (isNew) {
        p.id = slug(p.modelCode) || ("product-" + Date.now());
        if (content.products.some(function (x) { return x.id === p.id; })) p.id += "-" + Date.now().toString(36);
        content.products.push(p);
      } else {
        content.products[pos] = p;
      }
      markDirty();
      renderTab("products");
    });
  }

  /* ---------- CATEGORIES ---------------------------------- */
  function renderCategories(root) {
    root.appendChild(h("h1", null, "Categories"));
    root.appendChild(h("p", "hint", "Product lines (nav dropdown) and the prefab catalog groups."));

    var g1 = group("Product lines — nav dropdown & home cards");
    g1.appendChild(arrayEditor(content.mainCategories, [
      { key: "key", label: "Key", sub: "Internal id — avoid changing once set." },
      { key: "name", label: "Name" },
      { key: "icon", label: "Icon (emoji)" },
      { key: "blurb", label: "Blurb", type: "textarea" },
      { key: "ready", label: "Ready? (true = has catalog, false = “coming soon”)" }
    ], { addLabel: "+ Add product line", title: function (it) { return it.name || "Line"; },
      blank: function () { return { key: "", name: "", icon: "", blurb: "", ready: false }; } }));
    root.appendChild(g1);

    var g2 = group("Prefab catalog categories");
    g2.appendChild(arrayEditor(content.categories, [
      { key: "key", label: "Key" },
      { key: "name", label: "Name" },
      { key: "icon", label: "Icon (emoji)" },
      { key: "blurb", label: "Blurb", type: "textarea" },
      { key: "image", label: "Image path", sub: "Use the Media tab to upload, then paste the path here." }
    ], { addLabel: "+ Add category", title: function (it) { return it.name || "Category"; },
      blank: function () { return { key: "", name: "", icon: "", blurb: "", image: "" }; } }));
    root.appendChild(g2);

    // coerce ready string -> bool on save
    var note = h("p", "hint", "Tip: type true or false in the “Ready?” box.");
    root.appendChild(note);
  }

  /* ---------- MEDIA ------------------------------------ */
  function renderMedia(root) {
    root.appendChild(h("h1", null, "Media"));
    root.appendChild(h("p", "hint", "Upload an image here, then paste its path into a product, category or hero field."));

    var up = group("Upload");
    var file = document.createElement("input");
    file.type = "file"; file.accept = "image/*";
    var btn = h("button", "primary", "Upload image");
    btn.style.marginLeft = "10px";
    var out = h("div", "sub");
    btn.addEventListener("click", function () {
      if (!file.files || !file.files[0]) { toast("Choose a file first.", "err"); return; }
      btn.disabled = true; btn.textContent = "Uploading…";
      uploadImage(file.files[0]).then(function (p) {
        clear(out);
        out.appendChild(document.createTextNode("Uploaded: "));
        var codeEl = document.createElement("code");
        codeEl.textContent = p;
        out.appendChild(codeEl);
        out.appendChild(document.createTextNode(" — copied to clipboard."));
        try { navigator.clipboard.writeText(p); } catch (e) {}
        renderMediaGrid(grid);
      }).catch(function (e) { if (e.message !== "auth") toast("Upload failed: " + e.message, "err"); })
        .then(function () { btn.disabled = false; btn.textContent = "Upload image"; file.value = ""; });
    });
    up.appendChild(file); up.appendChild(btn); up.appendChild(out);
    root.appendChild(up);

    var g = group("Known images (with responsive variants)");
    var grid = h("div", "card-list");
    renderMediaGrid(grid);
    g.appendChild(grid);
    root.appendChild(g);
  }

  function renderMediaGrid(grid) {
    clear(grid);
    var keys = Object.keys(content.media || {}).sort();
    if (!keys.length) { grid.appendChild(h("p", "sub", "No entries yet.")); return; }
    keys.forEach(function (k) {
      var it = h("div", "item");
      var head = h("div", "item-head");
      var im = h("img"); im.src = "../" + k; im.alt = ""; im.style.width = "60px"; im.style.height = "44px";
      im.style.objectFit = "cover"; im.style.borderRadius = "4px";
      head.appendChild(im);
      var meta = h("div"); meta.style.flex = "1";
      meta.appendChild(h("div", null, k));
      meta.appendChild(h("div", "sub", "variants: " + ((content.media[k].widths || []).join(", ") || "none")));
      head.appendChild(meta);
      var copy = h("button", "ghost", "Copy path");
      copy.addEventListener("click", function () { try { navigator.clipboard.writeText(k); toast("Copied.", "ok"); } catch (e) {} });
      head.appendChild(copy);
      it.appendChild(head);
      grid.appendChild(it);
    });
  }


  /* ---------- shared bits for the new tabs --------------------------- */
  function when(iso) {
    if (!iso) return "";
    var d = new Date(iso);
    if (isNaN(d.getTime())) return String(iso);
    var MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    var p2 = function (n) { return (n < 10 ? "0" : "") + n; };
    return d.getDate() + " " + MON[d.getMonth()] + " " + d.getFullYear() +
      ", " + p2(d.getHours()) + ":" + p2(d.getMinutes());
  }

  function statCard(label, value, sub) {
    var c = h("div", "item");
    c.style.padding = "14px 16px";
    var v = h("div", null, value == null ? "\u2014" : String(value));
    v.style.cssText = "font-size:1.7rem; font-weight:800; line-height:1.1; color:var(--accent);";
    c.appendChild(v);
    c.appendChild(h("div", null, label));
    if (sub) c.appendChild(h("div", "sub", sub));
    return c;
  }

  function loadingBox(text) {
    var b = h("div", "card-list");
    b.appendChild(h("p", "sub", text || "Loading\u2026"));
    return b;
  }

  function failBox(box, e) {
    if (e.message === "auth") return;
    clear(box);
    box.appendChild(h("p", "sub", "Could not load that: " + e.message));
  }

  /* ---------- OVERVIEW ----------------------------------------------- */
  function renderOverview(root) {
    root.appendChild(h("h1", null, "Overview"));
    root.appendChild(h("p", "hint", "What the site is serving right now."));

    var g1 = group(null);
    var grid = loadingBox();
    g1.appendChild(grid);
    root.appendChild(g1);

    var g2 = group("Engine");
    var engine = h("p", "sub", "\u2026");
    g2.appendChild(engine);
    root.appendChild(g2);

    var g3 = group("Latest activity");
    var log = loadingBox();
    g3.appendChild(log);
    root.appendChild(g3);

    api("stats").then(function (j) {
      var s = j.stats || {};
      clear(grid);
      grid.style.cssText = "display:grid; grid-template-columns:repeat(auto-fill, minmax(155px, 1fr)); gap:12px;";
      [
        ["Unread messages", s.leadsNew, (s.leads || 0) + " kept in total"],
        ["Page views", s.views, "since the counter started"],
        ["Products", s.products, (s.featured || 0) + " starred for the homepage"],
        ["Categories", s.categories, null],
        ["Services", s.services, null],
        ["FAQ entries", s.faq, null],
        ["Testimonials", s.testimonials, null],
        ["Team members", s.team, null],
        ["Service areas", s.serviceAreas, null],
        ["Snapshots", s.backups, "on the server"]
      ].forEach(function (c) { grid.appendChild(statCard(c[0], c[1], c[2])); });

      var e = s.engine || {};
      engine.textContent =
        "PHP " + (e.php || "?") +
        " \u00b7 " + (e.gd ? "GD/WebP available" : "no GD \u2014 uploads keep their original size") +
        " \u00b7 " + (e.live ? "serving data/content.json" : "serving the built-in seed") +
        (s.updated ? " \u00b7 last saved " + when(s.updated) : "") +
        (e.server ? " \u00b7 " + e.server : "");
    }).catch(function (e) { failBox(grid, e); });

    api("activity").then(function (j) {
      clear(log);
      var rows = (j.activity || []).slice(0, 12);
      if (!rows.length) { log.appendChild(h("p", "sub", "Nothing logged yet.")); return; }
      rows.forEach(function (a) { log.appendChild(activityRow(a)); });
    }).catch(function (e) { failBox(log, e); });
  }

  /* ---------- ACTIVITY ------------------------------------------------ */
  var EVENT_LABEL = {
    "content.save": "Content saved",
    "content.restore": "Snapshot restored",
    "media.upload": "Image uploaded",
    "lead.new": "New message",
    "lead.update": "Message updated",
    "lead.delete": "Message deleted",
    "auth.signin": "Signed in",
    "auth.failed": "Failed sign-in",
    "auth.logout": "Signed out",
    "setup.complete": "Installer finished"
  };

  function activityRow(a) {
    var it = h("div", "item");
    it.style.padding = "10px 14px";
    var head = h("div", "item-head");
    var left = h("div");
    left.style.flex = "1";
    left.appendChild(h("div", null, EVENT_LABEL[a.event] || a.event));
    if (a.detail) left.appendChild(h("div", "sub", a.detail));
    head.appendChild(left);
    head.appendChild(h("span", "sub", when(a.at)));
    it.appendChild(head);
    return it;
  }

  function renderActivity(root) {
    root.appendChild(h("h1", null, "Activity"));
    root.appendChild(h("p", "hint", "Every save, restore, upload, message and sign-in. Kept on the server, never served to visitors."));
    var g = group(null);
    var list = loadingBox();
    g.appendChild(list);
    root.appendChild(g);

    api("activity").then(function (j) {
      clear(list);
      var rows = j.activity || [];
      if (!rows.length) { list.appendChild(h("p", "sub", "Nothing logged yet.")); return; }
      rows.forEach(function (a) { list.appendChild(activityRow(a)); });
    }).catch(function (e) { failBox(list, e); });
  }

  /* ---------- MESSAGES / LEADS ---------------------------------------- */
  var LEAD_LABEL = {
    name: "Name", phone: "Phone", email: "Email", company: "Company",
    message: "Message", destination: "Destination", currency: "Currency",
    standard: "Standard", dimensions: "Dimensions", modelCode: "Model",
    source: "Came from"
  };

  function renderLeads(root) {
    root.appendChild(h("h1", null, "Messages"));
    root.appendChild(h("p", "hint", "Quote requests and contact enquiries sent from the site. These are not part of the page content, so they save the moment you change them \u2014 no Save needed."));

    var bar = group(null);
    bar.style.display = "flex";
    bar.style.alignItems = "center";
    bar.style.gap = "10px";

    var filter = document.createElement("select");
    ["all", "new", "contacted", "quoted", "won", "lost"].forEach(function (v) {
      var o = document.createElement("option");
      o.value = v;
      o.textContent = v === "all" ? "All messages" : v.charAt(0).toUpperCase() + v.slice(1);
      filter.appendChild(o);
    });
    bar.appendChild(filter);

    var csv = h("a", "btn", "Download CSV");
    csv.href = "api.php?action=leads-csv";
    csv.style.textDecoration = "none";
    bar.appendChild(csv);

    var refresh = h("button", "ghost", "Refresh");
    refresh.type = "button";
    bar.appendChild(refresh);
    root.appendChild(bar);

    var g = group(null);
    var list = loadingBox();
    g.appendChild(list);
    root.appendChild(g);

    var all = [];
    function paint() {
      clear(list);
      var want = filter.value;
      var rows = all.filter(function (l) { return want === "all" || (l.status || "new") === want; });
      if (!rows.length) {
        list.appendChild(h("p", "sub", all.length ? "Nothing with that status." : "No messages yet."));
        return;
      }
      rows.forEach(function (l) { list.appendChild(leadRow(l, reload)); });
    }
    function reload() {
      api("leads").then(function (j) {
        all = j.leads || [];
        paint();
      }).catch(function (e) { failBox(list, e); });
    }
    filter.addEventListener("change", paint);
    refresh.addEventListener("click", reload);
    reload();
  }

  function leadRow(l, reload) {
    var it = h("div", "item");
    var head = h("div", "item-head");

    var who = h("div");
    who.style.flex = "1";
    var title = h("strong", null, (l.fields && l.fields.name) || "(no name)");
    who.appendChild(title);
    who.appendChild(h("div", "sub",
      (l.kind === "quote" ? "Quote request" : "Contact enquiry") + " \u00b7 " + when(l.at) +
      ((l.fields && l.fields.phone) ? " \u00b7 " + l.fields.phone : "")));
    head.appendChild(who);

    var status = document.createElement("select");
    ["new", "contacted", "quoted", "won", "lost"].forEach(function (v) {
      var o = document.createElement("option");
      o.value = v;
      o.textContent = v.charAt(0).toUpperCase() + v.slice(1);
      status.appendChild(o);
    });
    status.value = l.status || "new";
    status.addEventListener("change", function () {
      saveLead(l.id, { status: status.value }, function () {
        l.status = status.value;
        toast("Marked " + status.value + ".", "ok");
      });
    });
    head.appendChild(status);

    var del = h("button", "danger", "Delete");
    del.type = "button";
    del.addEventListener("click", function () {
      if (!confirm("Delete this message for good?")) return;
      api("lead-delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: l.id })
      }).then(function () { toast("Deleted.", "ok"); reload(); })
        .catch(function (e) { if (e.message !== "auth") toast("Could not delete: " + e.message, "err"); });
    });
    head.appendChild(del);
    it.appendChild(head);

    Object.keys(LEAD_LABEL).forEach(function (k) {
      var v = l.fields && l.fields[k];
      if (!v || k === "name" || k === "phone") return;
      var row = h("div", "sub");
      row.style.margin = "2px 0";
      row.appendChild(h("strong", null, LEAD_LABEL[k] + ": "));
      row.appendChild(document.createTextNode(String(v)));
      it.appendChild(row);
    });
    if (l.fields && l.fields.phone) {
      var wa = h("a", null, "Reply on WhatsApp \u2197");
      wa.href = "https://wa.me/" + String(l.fields.phone).replace(/[^0-9]/g, "");
      wa.target = "_blank";
      wa.rel = "noopener";
      // The admin CSS never styles bare links, and the browser default is
      // unreadable on this background.
      wa.style.cssText = "display:inline-block; margin:8px 0 4px; color:var(--accent); " +
        "font-size:.85rem; font-weight:700; text-decoration:none;";
      it.appendChild(wa);
    }

    var noteWrap = fieldWrap("Your note");
    var note = document.createElement("textarea");
    note.value = l.note || "";
    note.rows = 2;
    note.addEventListener("blur", function () {
      if (note.value === (l.note || "")) return;
      saveLead(l.id, { note: note.value }, function () {
        l.note = note.value;
        toast("Note saved.", "ok");
      });
    });
    noteWrap.appendChild(note);
    it.appendChild(noteWrap);
    return it;
  }

  function saveLead(id, patch, done) {
    patch.id = id;
    api("lead-update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch)
    }).then(done).catch(function (e) {
      if (e.message !== "auth") toast("Could not save: " + e.message, "err");
    });
  }

  /* ---------- NAVIGATION ---------------------------------------------- */
  function renderNav(root) {
    root.appendChild(h("h1", null, "Navigation"));
    root.appendChild(h("p", "hint", "The wording in the top bar and the mobile menu. What each button does is fixed \u2014 only the label changes here."));

    var g1 = group("Menu bar");
    var r1 = rowGrid();
    r1.appendChild(tField("nav.home", "Home"));
    r1.appendChild(tField("nav.products", "Products"));
    g1.appendChild(r1);
    var r2 = rowGrid();
    r2.appendChild(tField("nav.services", "Services"));
    r2.appendChild(tField("nav.safety", "Safety policy"));
    g1.appendChild(r2);
    var r3 = rowGrid();
    r3.appendChild(tField("nav.faq", "FAQ"));
    r3.appendChild(tField("nav.contact", "Contact"));
    g1.appendChild(r3);
    g1.appendChild(tField("nav.quote", "Quote button", { sub: "The blue button on the right of the bar." }));
    root.appendChild(g1);

    var g2 = group("Products dropdown");
    g2.appendChild(h("p", "sub", "Top level of the mega menu. The model names underneath come from the Categories tab."));
    var r4 = rowGrid();
    r4.appendChild(tField("nav.cat.prefab", "Prefab buildings"));
    r4.appendChild(tField("nav.cat.structure", "Steel structure"));
    g2.appendChild(r4);
    var r5 = rowGrid();
    r5.appendChild(tField("nav.cat.furniture", "Steel furniture"));
    r5.appendChild(tField("nav.cat.doorgate", "Door and gate"));
    g2.appendChild(r5);
    g2.appendChild(tField("nav.cat.siteothers", "Other products"));
    root.appendChild(g2);
  }

  /* ---------- TESTIMONIALS -------------------------------------------- */
  function renderTestimonials(root) {
    root.appendChild(h("h1", null, "Testimonials"));
    root.appendChild(h("p", "hint", "Shown on the home page under the trust bar. The whole block stays hidden while this list is empty."));

    var g1 = group("Headings");
    g1.appendChild(tField("testimonials.subtitle", "Subtitle"));
    g1.appendChild(tField("testimonials.title", "Title"));
    root.appendChild(g1);

    var g2 = group("Quotes");
    g2.appendChild(arrayEditor(content.sections.testimonials, [
      { key: "quote", label: "What they said", type: "textarea" },
      { key: "author", label: "Name" },
      { key: "role", label: "Role / company", sub: "Optional." }
    ], {
      addLabel: "+ Add testimonial",
      blank: function () { return { quote: "", author: "", role: "" }; },
      title: function (it) { return it.author || "Testimonial"; }
    }));
    root.appendChild(g2);
  }

  /* ---------- TEAM ----------------------------------------------------- */
  function renderTeam(root) {
    root.appendChild(h("h1", null, "Team"));
    root.appendChild(h("p", "hint", "Shown at the bottom of the Services page. Hidden while the list is empty."));

    var g1 = group("Headings");
    g1.appendChild(tField("team.subtitle", "Subtitle"));
    g1.appendChild(tField("team.title", "Title"));
    root.appendChild(g1);

    var g2 = group("People");
    g2.appendChild(arrayEditor(content.sections.team, [
      { key: "name", label: "Name" },
      { key: "role", label: "Role" },
      { key: "bio", label: "Short bio", type: "textarea", sub: "Optional \u2014 one or two lines." },
      { key: "photo", label: "Photo", type: "image" }
    ], {
      addLabel: "+ Add person",
      blank: function () { return { name: "", role: "", bio: "", photo: "" }; },
      title: function (it) { return it.name || "Team member"; }
    }));
    root.appendChild(g2);
  }

  /* ---------- SERVICE AREAS -------------------------------------------- */
  function renderAreas(root) {
    root.appendChild(h("h1", null, "Service areas"));
    root.appendChild(h("p", "hint", "Listed as tags in the contact card. Hidden while the list is empty."));

    var g1 = group("Heading");
    g1.appendChild(tField("serviceAreas.title", "Title"));
    root.appendChild(g1);

    var g2 = group("Places");
    g2.appendChild(arrayEditor(content.sections.serviceAreas, [
      { key: "name", label: "Place" },
      { key: "note", label: "Tooltip", sub: "Optional \u2014 shown on hover." }
    ], {
      addLabel: "+ Add area",
      blank: function () { return { name: "", note: "" }; },
      title: function (it) { return it.name || "Area"; }
    }));
    root.appendChild(g2);
  }

  /* ---------- BACKUPS & EXPORT -------------------------------------- */
  function downloadJSON(name, obj) {
    var url = URL.createObjectURL(new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" }));
    var a = h("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  /** content-20260918-141951.json -> "18 Sep 2026, 14:19 UTC" */
  function backupWhen(id) {
    var m = /^content-(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})\.json$/.exec(id);
    if (!m) return id;
    var MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return Number(m[3]) + " " + MON[Number(m[2]) - 1] + " " + m[1] + ", " + m[4] + ":" + m[5] + " UTC";
  }

  function renderBackups(root) {
    root.appendChild(h("h1", null, "Backups & export"));
    root.appendChild(h("p", "hint", "All of this runs in the browser or on the host — nothing to install."));

    var g1 = group("Download");
    g1.appendChild(h("p", "sub", "A copy of the content currently open in this dashboard."));
    var dl = h("button", null, "Download content.json");
    dl.type = "button";
    dl.addEventListener("click", function () { downloadJSON("content.json", content); });
    var seed = h("button", null, "Download content.default.json (seed)");
    seed.type = "button";
    seed.style.marginLeft = "8px";
    seed.addEventListener("click", function () { downloadJSON("content.default.json", content); });
    g1.appendChild(dl);
    g1.appendChild(seed);
    g1.appendChild(h("p", "sub",
      "The seed is what the site shows if data/content.json ever goes missing. To refresh it: "
      + "download it, put it in the repo at data/content.default.json, commit and push. "
      + "The editor never writes that file itself — it is git-tracked, and a local change there "
      + "would make the next cPanel pull fail."));
    root.appendChild(g1);

    var g2 = group("Import a JSON file");
    var pick = document.createElement("input");
    pick.type = "file";
    pick.accept = ".json,application/json";
    var imp = h("button", null, "Load into editor");
    imp.type = "button";
    imp.style.marginLeft = "8px";
    imp.addEventListener("click", function () {
      if (!pick.files || !pick.files[0]) { toast("Choose a .json file first.", "err"); return; }
      var fr = new FileReader();
      fr.onload = function () {
        var j;
        try { j = JSON.parse(String(fr.result)); }
        catch (e) { toast("That file is not valid JSON.", "err"); return; }
        if (!j || typeof j !== "object" || Array.isArray(j) || !(j.text || j.sections || j.products)) {
          toast("That JSON does not look like site content.", "err");
          return;
        }
        content = j;
        normalise();
        markDirty();
        renderTab("backups");
        toast("Loaded into the editor. Nothing is live until you press Save.", "ok");
      };
      fr.onerror = function () { toast("Could not read that file.", "err"); };
      fr.readAsText(pick.files[0]);
    });
    g2.appendChild(pick);
    g2.appendChild(imp);
    root.appendChild(g2);

    var g3 = group("Snapshots on the server");
    g3.appendChild(h("p", "sub",
      "One is taken before every save and before every restore. The newest 15 are kept."));
    var list = h("div", "card-list", "Loading…");
    g3.appendChild(list);
    root.appendChild(g3);
    loadBackups(list);
  }

  function loadBackups(list) {
    api("backups").then(function (j) {
      clear(list);
      var rows = j.backups || [];
      if (!rows.length) {
        list.appendChild(h("p", "sub", "None yet — the first one appears after your next save."));
        return;
      }
      rows.forEach(function (b) {
        var it = h("div", "item");
        var head = h("div", "item-head");
        var meta = h("div");
        meta.style.flex = "1";
        meta.appendChild(h("div", null, backupWhen(b.id)));
        meta.appendChild(h("div", "sub", b.id + " · " + Math.max(1, Math.round(b.size / 1024)) + " kB"));
        head.appendChild(meta);

        var btn = h("button", "danger", "Restore");
        btn.type = "button";
        btn.addEventListener("click", function () {
          if (!confirm("Replace the live content with the snapshot from " + backupWhen(b.id)
                       + "?\n\nThe content that is live now gets snapshotted first.")) return;
          btn.disabled = true;
          btn.textContent = "Restoring…";
          api("restore", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: b.id })
          }).then(function () {
            dirty = false;
            toast("Restored.", "ok");
            load();
          }).catch(function (e) {
            if (e.message !== "auth") toast("Restore failed: " + e.message, "err");
            btn.disabled = false;
            btn.textContent = "Restore";
          });
        });
        head.appendChild(btn);
        it.appendChild(head);
        list.appendChild(it);
      });
    }).catch(function (e) {
      if (e.message === "auth") return;
      clear(list);
      list.appendChild(h("p", "sub", "Could not list snapshots: " + e.message));
    });
  }

  /* ---------- normalise before save --------------------------------- */
  function coerceTypes() {
    content.mainCategories.forEach(function (c) {
      if (typeof c.ready === "string") c.ready = /^(true|1|yes)$/i.test(c.ready.trim());
    });
    content.products.forEach(function (p) { if (typeof p.order === "string") p.order = Number(p.order) || 0; });
  }

  /* ---------- wire up ----------------------------------------------- */
  $saveBtn.addEventListener("click", function () { coerceTypes(); save(); });
  document.getElementById("logoutBtn").addEventListener("click", function () {
    api("logout", { method: "POST" }).then(function () { location.href = "login.php"; })
      .catch(function () { location.href = "login.php"; });
  });
  window.addEventListener("beforeunload", function (e) {
    if (dirty) { e.preventDefault(); e.returnValue = ""; }
  });
  window.addEventListener("keydown", function (e) {
    if ((e.ctrlKey || e.metaKey) && e.key === "s") { e.preventDefault(); if (dirty) { coerceTypes(); save(); } }
    if (e.key === "Escape") closeModal();
  });

  load();
})();
