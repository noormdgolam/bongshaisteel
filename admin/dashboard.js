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

  function load() {
    api("load").then(function (j) {
      if (!j.authed) { location.href = "login.php?return=" + encodeURIComponent("/admin/"); return; }
      content = j.content || {};
      ["text", "html", "settings", "seo", "sections", "media"].forEach(function (k) {
        if (typeof content[k] !== "object" || content[k] == null) content[k] = {};
      });
      ["products", "categories", "mainCategories", "featuredIds"].forEach(function (k) {
        if (!Array.isArray(content[k])) content[k] = [];
      });
      var s = content.sections;
      ["stats", "trustBar", "services", "faq"].forEach(function (k) { if (!Array.isArray(s[k])) s[k] = []; });
      if (typeof s.safety !== "object" || !s.safety) s.safety = { intro: "", points: [] };
      if (!Array.isArray(s.safety.points)) s.safety.points = [];
      if (!Array.isArray(content.settings.sisterLinks)) content.settings.sisterLinks = [];

      buildNav();
      var start = (location.hash || "").replace(/^#/, "");
      renderTab(TABS.some(function (t) { return t.id === start; }) ? start : TABS[0].id);
      syncDirty();
    }).catch(function (e) {
      if (e.message === "auth") return;
      $main.innerHTML = '<div class="loading">Could not load content: ' + e.message + "</div>";
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
    { id: "site", label: "Site & SEO", render: renderSite },
    { id: "home", label: "Home page", render: renderHome },
    { id: "services", label: "Services", render: renderServices },
    { id: "safety", label: "Safety (EHS)", render: renderSafety },
    { id: "faq", label: "FAQ", render: renderFaq },
    { id: "products", label: "Products", render: renderProducts },
    { id: "categories", label: "Categories", render: renderCategories },
    { id: "media", label: "Media", render: renderMedia }
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
    root.appendChild(g3);
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
        out.innerHTML = 'Uploaded: <code>' + p + '</code> — copied to clipboard.';
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
