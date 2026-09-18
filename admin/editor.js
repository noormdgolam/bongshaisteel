/* ==========================================================================
   BONGSHAI STEEL — IN-PLACE VISUAL EDITOR
   --------------------------------------------------------------------------
   Loaded on every page (<script src="admin/editor.js" defer>) but stays
   completely dormant unless:
     • the URL has ?cms=1, AND
     • the visitor has a valid admin session (admin/api.php?action=whoami)

   Reached from the dashboard's "Visual editor" link, which opens /?cms=1.
   With no ?cms=1 in the URL this script does nothing at all — zero network
   requests for normal visitors. Editing covers the flat [data-cms] /
   [data-cms-html] / [data-cms-set] text nodes and [data-cms-img] images.
   Lists (products, FAQ, stats, categories) are managed in the dashboard.
   ========================================================================== */
(function () {
  "use strict";

  var params = new URLSearchParams(location.search);
  if (params.get("cms") !== "1") return; // dormant for normal visitors

  var API = "admin/api.php";
  var LOGIN = "admin/login.php";

  // Resolve paths whether we're at "/" or a deeper path.
  var basePrefix = location.pathname.replace(/[^/]*$/, "");
  if (basePrefix.indexOf("/admin/") !== -1) return; // never run inside the dashboard
  function apiURL(action) { return basePrefix + API + "?action=" + action; }

  fetch(apiURL("whoami"), { credentials: "same-origin" })
    .then(function (r) { return r.json(); })
    .then(function (j) { return !!(j && j.authed); })
    .catch(function () { return false; })
    .then(function (authed) {
      if (authed) startEditor();
      else location.href = basePrefix + LOGIN + "?return=" +
        encodeURIComponent(location.pathname + location.search);
    });

  /* --------------------------------------------------------------------- */
  function startEditor() {
    injectCSS();
    var ready = window.__cmsReady && window.__cmsReady.then
      ? window.__cmsReady
      : Promise.resolve(window.__CMS__ || null);

    ready.then(function (loaded) {
      var base = loaded || window.__CMS__ || {};
      var work = JSON.parse(JSON.stringify(base));
      ["text", "html", "settings", "media"].forEach(function (k) {
        if (typeof work[k] !== "object" || !work[k]) work[k] = {};
      });

      var dirty = false;
      document.body.classList.add("cms-editing");

      wireText("[data-cms]", function (el, v) {
        work.text[el.getAttribute("data-cms")] = v;
      }, "text");
      wireText("[data-cms-html]", function (el, v) {
        work.html[el.getAttribute("data-cms-html")] = v;
      }, "html");
      wireText("[data-cms-set]", function (el, v) {
        work.settings[el.getAttribute("data-cms-set")] = v;
      }, "text");
      wireImages();

      var bar = buildBar();

      function setDirty() {
        dirty = true;
        bar.status.textContent = "● Unsaved changes";
        bar.status.className = "status dirty";
        bar.save.disabled = false;
      }
      function clearDirty() {
        dirty = false;
        bar.status.textContent = "All changes saved";
        bar.status.className = "status";
        bar.save.disabled = true;
      }

      function wireText(sel, apply, mode) {
        each(sel, function (el) {
          el.setAttribute("contenteditable", "true");
          el.setAttribute("spellcheck", "false");
          el.addEventListener("input", function () {
            apply(el, mode === "html" ? el.innerHTML : el.textContent);
            setDirty();
          });
          el.addEventListener("paste", function (e) {
            e.preventDefault();
            var cd = e.clipboardData || window.clipboardData;
            if (mode !== "html") {
              document.execCommand("insertText", false, cd.getData("text/plain"));
              return;
            }
            // Word and Docs paste carries fonts, colours and wrapper divs, and
            // it used to land in content.json verbatim. Keep the words and a
            // little inline markup; drop the rest.
            var rich = cd.getData("text/html");
            document.execCommand("insertHTML", false,
              rich ? cleanHTML(rich) : escHTML(cd.getData("text/plain")));
          });
        });
      }

      function wireImages() {
        each("[data-cms-img]", function (img) {
          if (img.tagName !== "IMG") return;
          var key = img.getAttribute("data-cms-img");
          var wrap = document.createElement("span");
          wrap.className = "cms-img-wrap";
          img.parentNode.insertBefore(wrap, img);
          wrap.appendChild(img);

          var btn = document.createElement("button");
          btn.type = "button";
          btn.className = "cms-img-btn";
          btn.textContent = "Replace image";
          wrap.appendChild(btn);

          var input = document.createElement("input");
          input.type = "file";
          input.accept = "image/*";
          input.style.display = "none";
          wrap.appendChild(input);

          btn.addEventListener("click", function () { input.click(); });
          input.addEventListener("change", function () {
            if (!input.files || !input.files[0]) return;
            btn.textContent = "Uploading…"; btn.disabled = true;
            uploadImage(input.files[0]).then(function (res) {
              work.text[key] = res.path;
              work.media[res.path] = { widths: res.widths || [] };
              img.removeAttribute("srcset");
              img.src = basePrefix + res.path;
              setDirty();
            }).catch(function (e) {
              alert("Upload failed: " + e.message);
            }).then(function () {
              btn.textContent = "Replace image"; btn.disabled = false; input.value = "";
            });
          });
        });
      }

      function uploadImage(file) {
        var fd = new FormData();
        fd.append("file", file);
        return fetch(apiURL("upload"), { method: "POST", body: fd, credentials: "same-origin" })
          .then(function (r) { return r.json(); })
          .then(function (j) {
            if (!j || !j.ok) throw new Error((j && j.message) || "upload error");
            return j;
          });
      }

      function buildBar() {
        var el = document.createElement("div");
        el.id = "cms-bar";
        el.innerHTML =
          '<span class="brand">Bongshai Steel</span>' +
          '<span class="status">All changes saved</span>' +
          '<span class="grow"></span>' +
          '<a href="' + basePrefix + 'admin/" target="_blank" rel="noopener">Dashboard ↗</a>' +
          '<button type="button" data-act="discard">Discard</button>' +
          '<button type="button" data-act="exit">Exit</button>' +
          '<button type="button" class="primary" data-act="save" disabled>Save</button>';
        document.body.appendChild(el);
        var refs = {
          status: el.querySelector(".status"),
          save: el.querySelector('[data-act="save"]')
        };
        el.querySelector('[data-act="save"]').addEventListener("click", doSave);
        el.querySelector('[data-act="discard"]').addEventListener("click", function () {
          if (dirty && !confirm("Discard all unsaved changes?")) return;
          reloadPlain(true);
        });
        el.querySelector('[data-act="exit"]').addEventListener("click", function () {
          if (dirty && !confirm("Leave the editor? Unsaved changes will be lost.")) return;
          reloadPlain(false);
        });
        return refs;
      }

      function doSave() {
        bar.save.disabled = true;
        bar.status.textContent = "Saving…";
        bar.status.className = "status";
        fetch(apiURL("save"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({ content: work })
        }).then(function (r) { return r.json().then(function (j) { return { r: r, j: j }; }); })
          .then(function (o) {
            if (o.r.status === 403) { location.href = basePrefix + LOGIN; return; }
            if (!o.j || !o.j.ok) throw new Error((o.j && o.j.message) || ("HTTP " + o.r.status));
            clearDirty();
            bar.status.textContent = "Saved ✓";
            setTimeout(function () { if (!dirty) bar.status.textContent = "All changes saved"; }, 2500);
          }).catch(function (e) {
            bar.status.textContent = "Save failed: " + e.message;
            bar.status.className = "status dirty";
            bar.save.disabled = false;
          });
      }

      function reloadPlain(keepEdit) {
        var p = new URLSearchParams(location.search);
        if (!keepEdit) p.delete("cms");
        var qs = p.toString();
        // The unload guard is an addEventListener handler, so nulling
        // window.onbeforeunload never silenced it — clear the flag it reads.
        dirty = false;
        location.href = location.pathname + (qs ? "?" + qs : "") + location.hash;
      }

      window.addEventListener("beforeunload", function (e) {
        if (dirty) { e.preventDefault(); e.returnValue = ""; }
      });

      // block navigation from editable CTAs / nav while editing
      document.addEventListener("click", function (e) {
        var t = e.target;
        while (t && t !== document.body) {
          if (t.id === "cms-bar" || (t.parentNode && t.parentNode.id === "cms-bar")) return;
          if (t.classList && t.classList.contains("cms-img-btn")) return;
          if (t.isContentEditable) { e.preventDefault(); e.stopPropagation(); return; }
          t = t.parentNode;
        }
      }, true);
    });
  }

  /* --------------------------------------------------------------------- */
  function each(sel, fn) {
    var n = document.querySelectorAll(sel);
    for (var i = 0; i < n.length; i++) fn(n[i]);
  }

  // Uppercase keys, so nothing here can collide with Object.prototype.
  var INLINE_OK = { B: 1, STRONG: 1, I: 1, EM: 1, U: 1, BR: 1, A: 1, SMALL: 1, SUP: 1, SUB: 1 };

  // Unwrapping these would leave their source text behind as visible content:
  // a pasted <script> became the literal words "alert(1)" in the page.
  var DROP = { SCRIPT: 1, STYLE: 1, NOSCRIPT: 1, TEMPLATE: 1, IFRAME: 1, OBJECT: 1,
               EMBED: 1, APPLET: 1, LINK: 1, META: 1, TITLE: 1, HEAD: 1, BASE: 1, XMP: 1 };

  function escHTML(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  /** Strip a pasted fragment down to text plus a few inline tags. */
  function cleanHTML(src) {
    var box = document.createElement("div");
    box.innerHTML = String(src || "");
    (function walk(parent) {
      var kids = Array.prototype.slice.call(parent.childNodes);
      for (var i = 0; i < kids.length; i++) {
        var n = kids[i];
        if (n.nodeType === 3) continue;                        // text survives as-is
        if (n.nodeType !== 1) { parent.removeChild(n); continue; }
        if (DROP[n.tagName]) { parent.removeChild(n); continue; }  // tag and its text both go
        walk(n);
        if (!INLINE_OK[n.tagName]) {                           // unwrap, keep the words
          while (n.firstChild) parent.insertBefore(n.firstChild, n);
          parent.removeChild(n);
          continue;
        }
        var attrs = Array.prototype.slice.call(n.attributes);
        for (var a = 0; a < attrs.length; a++) {
          if (!(n.tagName === "A" && attrs[a].name.toLowerCase() === "href")) {
            n.removeAttribute(attrs[a].name);
          }
        }
        if (n.tagName === "A") {
          var href = n.getAttribute("href") || "";
          if (!/^(https?:|mailto:|tel:|\/|#)/i.test(href)) n.removeAttribute("href");
          else { n.setAttribute("rel", "noopener"); n.setAttribute("target", "_blank"); }
        }
      }
    })(box);
    return box.innerHTML;
  }
  function injectCSS() {
    if (document.getElementById("cms-editor-css")) return;
    var l = document.createElement("link");
    l.id = "cms-editor-css";
    l.rel = "stylesheet";
    l.href = basePrefix + "admin/editor.css";
    document.head.appendChild(l);
  }
})();
