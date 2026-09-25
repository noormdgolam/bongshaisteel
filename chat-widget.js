/* ==========================================================================
   BONGSHAI STEEL — AI CHAT WIDGET (English)
   --------------------------------------------------------------------------
   Floating button + panel. Talks to POST /api/chat. The conversation lives in
   sessionStorage for this tab only. Replies are built from DOM text nodes —
   never innerHTML — with a few safe links recognised: /products/<code>,
   /category/<key>, /projects, wa.me links and phone numbers.
   ========================================================================== */
(function () {
  "use strict";
  if (window.__bsChat) return;
  window.__bsChat = true;

  var KEY = "bs_chat_v1";
  var GREETING = "Hi! I'm Bongshai Steel's assistant. Tell me what you'd like to build — a factory, warehouse, home or something else — and I'll point you to the right models or get a quote started.";

  function load() {
    try { var s = JSON.parse(sessionStorage.getItem(KEY) || "null"); if (s && s.id && Array.isArray(s.messages)) return s; } catch (e) { /* storage off */ }
    return { id: Math.random().toString(36).slice(2) + Date.now().toString(36), messages: [] };
  }
  function save() { try { sessionStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* storage off */ } }
  var state = load();

  var css = [
    ".bs-chat-btn{position:fixed;right:34px;bottom:104px;width:52px;height:52px;border-radius:50%;border:0;cursor:pointer;",
    "background:#0b2545;color:#fff;box-shadow:0 8px 24px rgba(11,37,69,.35);z-index:2600;display:flex;align-items:center;justify-content:center}",
    ".bs-chat-btn svg{width:26px;height:26px;fill:currentColor}",
    "@media (max-width:768px){.bs-chat-btn{bottom:170px}}",
    ".bs-chat{position:fixed;right:24px;bottom:24px;width:380px;max-width:calc(100vw - 32px);height:560px;max-height:calc(100vh - 48px);",
    "background:#fff;border-radius:16px;box-shadow:0 24px 60px rgba(0,0,0,.28);z-index:2700;display:none;flex-direction:column;overflow:hidden;",
    "font-family:inherit;color:#0f172a}",
    ".bs-chat.open{display:flex}",
    "@media (max-width:560px){.bs-chat{right:0;bottom:0;width:100vw;max-width:100vw;height:100%;max-height:100%;border-radius:0}}",
    ".bs-chat-head{background:#0b2545;color:#fff;padding:14px 16px;display:flex;align-items:center;gap:10px}",
    ".bs-chat-head b{font-size:1rem}.bs-chat-head small{display:block;opacity:.75;font-size:.78rem}",
    ".bs-chat-x{margin-left:auto;background:none;border:0;color:#fff;font-size:1.4rem;cursor:pointer;line-height:1}",
    ".bs-chat-log{flex:1;overflow-y:auto;padding:14px;background:#f5f8fc;display:flex;flex-direction:column;gap:10px}",
    ".bs-msg{max-width:85%;padding:10px 13px;border-radius:14px;font-size:.93rem;line-height:1.5;white-space:pre-wrap;word-wrap:break-word}",
    ".bs-msg.a{background:#fff;border:1px solid #e3e9f2;align-self:flex-start;border-bottom-left-radius:4px}",
    ".bs-msg.u{background:#0466c8;color:#fff;align-self:flex-end;border-bottom-right-radius:4px}",
    ".bs-msg a{color:#0466c8;font-weight:700}.bs-msg.u a{color:#fff}",
    ".bs-msg.err{background:#fff4f4;border:1px solid #f5c2c2}",
    ".bs-typing{align-self:flex-start;color:#64748b;font-size:.85rem;padding:4px 6px}",
    ".bs-chat-form{display:flex;gap:8px;padding:10px;border-top:1px solid #e3e9f2;background:#fff}",
    ".bs-chat-form textarea{flex:1;resize:none;border:1px solid #cbd5e1;border-radius:10px;padding:10px;font:inherit;font-size:.93rem;max-height:120px}",
    ".bs-chat-form button{border:0;border-radius:10px;background:#0466c8;color:#fff;font-weight:800;padding:0 16px;cursor:pointer}",
    ".bs-chat-form button[disabled]{opacity:.5;cursor:default}",
    ".bs-chat-note{font-size:.72rem;color:#64748b;text-align:center;padding:0 10px 8px;background:#fff}"
  ].join("");
  var style = document.createElement("style");
  style.textContent = css;
  document.head.appendChild(style);

  var btn = document.createElement("button");
  btn.type = "button";
  btn.className = "bs-chat-btn";
  btn.setAttribute("aria-label", "Chat with Bongshai Steel");
  btn.title = "Chat with us";
  btn.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9l-5 4v-4H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zm3 6.5a1.5 1.5 0 1 0 0 .01zm5 0a1.5 1.5 0 1 0 0 .01zm5 0a1.5 1.5 0 1 0 0 .01z"/></svg>';

  var panel = document.createElement("div");
  panel.className = "bs-chat";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", "Bongshai Steel chat");
  panel.innerHTML =
    '<div class="bs-chat-head"><div><b>Bongshai Steel</b><small>AI assistant · usually answers in seconds</small></div>' +
    '<button type="button" class="bs-chat-x" aria-label="Close chat">×</button></div>' +
    '<div class="bs-chat-log" aria-live="polite"></div>' +
    '<form class="bs-chat-form"><textarea rows="1" maxlength="1500" placeholder="Type your question…" aria-label="Your message"></textarea>' +
    '<button type="submit">Send</button></form>' +
    '<div class="bs-chat-note">AI answers — our engineers confirm every quote.</div>';

  document.body.appendChild(btn);
  document.body.appendChild(panel);
  var log = panel.querySelector(".bs-chat-log");
  var form = panel.querySelector("form");
  var input = form.querySelector("textarea");
  var send = form.querySelector("button");

  // Text -> DOM with safe links only.
  var LINK = /(\/products\/[A-Z0-9-]+|\/category\/[a-z0-9-]+|\/projects\b|https:\/\/wa\.me\/\d+|\+?880[\d\s-]{9,14}\d|\*\*[^*\n]+\*\*)/g;
  function render(el, text) {
    var last = 0, m;
    LINK.lastIndex = 0;
    while ((m = LINK.exec(text))) {
      if (m.index > last) el.appendChild(document.createTextNode(text.slice(last, m.index)));
      var t = m[0], node;
      if (t.indexOf("**") === 0) { node = document.createElement("strong"); node.textContent = t.slice(2, -2); }
      else {
        node = document.createElement("a");
        node.textContent = t;
        if (/^\+?880/.test(t)) node.href = "tel:" + t.replace(/[^\d+]/g, "");
        else { node.href = t; if (/^https:/.test(t)) { node.target = "_blank"; node.rel = "noopener noreferrer"; } }
      }
      el.appendChild(node);
      last = m.index + t.length;
    }
    if (last < text.length) el.appendChild(document.createTextNode(text.slice(last)));
  }
  function bubble(role, text, extra) {
    var d = document.createElement("div");
    d.className = "bs-msg " + (role === "user" ? "u" : "a") + (extra ? " " + extra : "");
    render(d, text);
    log.appendChild(d);
    log.scrollTop = log.scrollHeight;
  }
  function paint() {
    log.textContent = "";
    bubble("assistant", GREETING);
    state.messages.forEach(function (m) { bubble(m.role, m.content); });
  }

  function open() { panel.classList.add("open"); btn.style.display = "none"; paint(); setTimeout(function () { input.focus(); }, 50); }
  function close() { panel.classList.remove("open"); btn.style.display = ""; }
  btn.addEventListener("click", open);
  panel.querySelector(".bs-chat-x").addEventListener("click", close);
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && panel.classList.contains("open")) close(); });

  input.addEventListener("keydown", function (e) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); form.requestSubmit ? form.requestSubmit() : form.dispatchEvent(new Event("submit")); }
  });

  var busy = false;
  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var text = input.value.trim();
    if (!text || busy) return;
    busy = true; send.disabled = true;
    input.value = "";
    state.messages.push({ role: "user", content: text });
    save();
    bubble("user", text);
    var typing = document.createElement("div");
    typing.className = "bs-typing";
    typing.textContent = "Typing…";
    log.appendChild(typing);
    log.scrollTop = log.scrollHeight;

    fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify({ chat: state.id, page: { path: location.pathname, title: document.title }, messages: state.messages.slice(-14) })
    }).then(function (r) { return r.json().catch(function () { return { ok: false }; }); })
      .then(function (data) {
        typing.remove();
        if (data && data.ok && data.reply) {
          state.messages.push({ role: "assistant", content: data.reply });
          save();
          bubble("assistant", data.reply);
        } else {
          bubble("assistant", (data && data.message) || "Something went wrong. Please call +8801789-949060 or message us on WhatsApp.", "err");
        }
      })
      .catch(function () {
        typing.remove();
        bubble("assistant", "No connection just now. Please try again, or message us on WhatsApp.", "err");
      })
      .then(function () { busy = false; send.disabled = false; input.focus(); });
  });
})();
