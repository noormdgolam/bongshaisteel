/* ==========================================================================
   ADMIN AUTH — sessions, CSRF, roles, sign-in throttle
   --------------------------------------------------------------------------
   Follows the Bongshai Housing admin, with the lessons from this session's
   PHP CMS carried over:
   - Sessions live in MySQL (no Redis on shared hosting), in an InnoDB table
     created by our own migration.
   - `trust proxy` in server.js is what lets the secure cookie be set at all.
   - CSRF is a per-session token AND a Sec-Fetch-Site check. The token alone
     would do; the header catches a cross-site request before it reaches a
     handler, and does not depend on Origin (which Chrome sends as "null" on
     some form navigations — the bug that locked out the PHP login).
   - Roles fail closed: every gate lists its roles, admin is not special-cased.
   ========================================================================== */
"use strict";

const crypto = require("node:crypto");
const session = require("express-session");
const { ConnectSessionKnexStore } = require("connect-session-knex");

const PROD = process.env.NODE_ENV === "production";
const IDLE_MS = 2 * 60 * 60 * 1000;          // 2 h without a request
const ABSOLUTE_MS = 12 * 60 * 60 * 1000;     // 12 h per sign-in, however active
const ROLES = ["superadmin", "admin", "editor", "sales"];

/* ------------------------------------------------------------------ session */

function sessionMiddleware(db) {
  let secret = process.env.SESSION_SECRET;
  if (!secret) {
    if (PROD) throw new Error("SESSION_SECRET must be set in production");
    secret = crypto.randomBytes(32).toString("hex");
    console.warn("auth: SESSION_SECRET not set — using a throwaway secret; sessions end on restart");
  }
  return session({
    name: "bs_admin",
    secret,
    store: new ConnectSessionKnexStore({
      knex: db,
      tableName: "sessions",
      createTable: false,           // our migration made it, as InnoDB
      cleanupInterval: 15 * 60 * 1000,
    }),
    resave: false,
    saveUninitialized: false,
    rolling: true,                  // each request pushes the idle expiry forward
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: PROD,
      path: "/admin",
      maxAge: IDLE_MS,
    },
  });
}

/* --------------------------------------------------------------------- CSRF */

function token(req) {
  if (!req.session.csrf) req.session.csrf = crypto.randomBytes(24).toString("hex");
  return req.session.csrf;
}

function sameToken(a, b) {
  const x = Buffer.from(String(a || ""));
  const y = Buffer.from(String(b || ""));
  return x.length === y.length && x.length > 0 && crypto.timingSafeEqual(x, y);
}

/** Blocks cross-site POSTs, and any POST without the session's token. */
function csrf(req, res, next) {
  res.locals.csrfToken = token(req);
  if (req.method !== "POST") return next();

  const site = String(req.get("sec-fetch-site") || "").toLowerCase();
  if (site && site !== "same-origin" && site !== "none") {
    return res.status(403).type("text").send("Cross-site request blocked.");
  }
  const sent = (req.body && req.body._csrf) || req.get("x-csrf-token");
  if (!sameToken(sent, req.session.csrf)) {
    return res.status(403).type("text").send("This form has expired. Go back, reload the page and try again.");
  }
  next();
}

/* ------------------------------------------------------------------- gates */

/** Signed in, account still active, within the absolute session lifetime. */
function requireAdmin(db) {
  return async (req, res, next) => {
    const s = req.session;
    const expired = s.adminUserId && s.signedInAt && Date.now() - s.signedInAt > ABSOLUTE_MS;
    if (!s.adminUserId || expired) {
      if (expired) return s.destroy(() => toLogin(req, res));
      return toLogin(req, res);
    }
    try {
      // Re-read on every request, so deactivating a user or changing a role
      // takes effect now, not when the cookie expires. Admin traffic is small.
      const user = await db("admin_users").where({ id: s.adminUserId }).first("id", "username", "name", "role", "active");
      if (!user || !user.active) return s.destroy(() => toLogin(req, res));
      req.admin = user;
      res.locals.adminName = user.name || user.username;
      res.locals.adminRole = user.role;
      next();
    } catch (err) {
      next(err);
    }
  };
}

function toLogin(req, res) {
  if (req.method === "GET" && req.accepts("html")) {
    return res.redirect("/admin/login?return=" + encodeURIComponent(req.originalUrl));
  }
  res.status(401).json({ ok: false, error: "unauthorized" });
}

/** Must run after requireAdmin. Lists every allowed role — no implicit admin. */
function requireRole(...allowed) {
  for (const r of allowed) if (!ROLES.includes(r)) throw new Error("unknown role " + r);
  return (req, res, next) => {
    if (req.admin && allowed.includes(req.admin.role)) return next();
    res.status(403).type("text").send("Your role does not have access to this page.");
  };
}

/* --------------------------------------------------------- sign-in throttle */

/* Per process. Under several Passenger workers each keeps its own count, so
   the effective limit is a small multiple of MAX — still ample against
   guessing a bcrypt-hashed password, and it needs no shared store. */
const MAX_FAILURES = 5;
const LOCK_MS = 15 * 60 * 1000;
const attempts = new Map();

function lockedFor(ip) {
  const a = attempts.get(ip);
  if (!a || a.n < MAX_FAILURES) return 0;
  const left = a.first + LOCK_MS - Date.now();
  if (left <= 0) { attempts.delete(ip); return 0; }
  return left;
}

function noteFailure(ip) {
  const now = Date.now();
  const a = attempts.get(ip);
  if (!a || now - a.first > LOCK_MS) attempts.set(ip, { n: 1, first: now });
  else a.n += 1;
  if (attempts.size > 5000) {                   // bounded memory
    for (const [k, v] of attempts) if (now - v.first > LOCK_MS) attempts.delete(k);
  }
}

function clearFailures(ip) {
  attempts.delete(ip);
}

/** A "return to" path is only honoured inside the admin area. */
function safeReturn(p) {
  const s = String(p || "");
  return /^\/admin(?:[/?#]|$)/.test(s) && !s.startsWith("//") && !/[\\\r\n]/.test(s) ? s : "/admin";
}

module.exports = {
  sessionMiddleware, csrf, requireAdmin, requireRole,
  lockedFor, noteFailure, clearFailures, safeReturn,
  ROLES, IDLE_MS, ABSOLUTE_MS,
  _resetThrottle: () => attempts.clear(),
};
