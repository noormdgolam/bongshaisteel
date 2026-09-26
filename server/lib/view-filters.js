/* ==========================================================================
   NUNJUCKS FILTERS shared by the app and every test that renders templates.
     require("./lib/view-filters").register(env)
   ========================================================================== */
"use strict";

const DHAKA = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Dhaka",
  day: "numeric", month: "short", year: "numeric",
  hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});

/** A stored UTC instant, shown in Dhaka time: "24 Sept 2026, 21:58". */
function dhaka(value) {
  if (value == null || value === "") return "";
  const d = value instanceof Date ? value : new Date(value);
  return isNaN(d.getTime()) ? String(value) : DHAKA.format(d);
}

/** Digits only — for wa.me and tel: links built from a typed phone number. */
function digits(value) {
  return String(value == null ? "" : value).replace(/\D+/g, "");
}

// The two JS line separators, built from code points so no editor mangles them.
const LS = new RegExp(String.fromCharCode(0x2028), "g");
const PS = new RegExp(String.fromCharCode(0x2029), "g");

/** JSON for inside a <script>: no string can close the element. */
function jsonScript(value) {
  return (JSON.stringify(value === undefined ? null : value) || "null")
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(LS, "\\u2028")
    .replace(PS, "\\u2029");
}

function register(env) {
  env.addFilter("dhaka", dhaka);
  env.addFilter("digits", digits);
  env.addFilter("jsonScript", jsonScript);
  return env;
}

module.exports = { register, dhaka, digits, jsonScript };
