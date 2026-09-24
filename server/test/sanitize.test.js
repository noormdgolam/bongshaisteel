/* The HTML sanitiser: current content must survive byte for byte, attacks must not.
     node test/sanitize.test.js */
"use strict";

const path = require("node:path");
const { sanitizeHtml: s } = require("../lib/sanitize-html");

let pass = 0, fail = 0;
const check = (ok, label, detail) => {
  ok ? pass++ : fail++;
  console.log((ok ? "PASS  " : "FAIL  ") + label + (ok || detail === undefined ? "" : "\n        " + detail));
};

const seed = require(path.join(__dirname, "..", "..", "data", "content.default.json"));
const x = seed.sections;
const blobs = [...Object.values(seed.html), ...x.services.map((v) => v.desc), ...x.faq.map((v) => v.a),
  ...x.trustBar.map((v) => v.text), ...x.safety.points];
const changed = blobs.filter((b) => s(b) !== b);
check(!changed.length, "all " + blobs.length + " HTML values in the seed survive unchanged", changed[0]);

const cases = [
  ["<script>alert(1)</script>ok", "ok", "script removed with its content"],
  ["<img src=x onerror=alert(1)>ok", "ok", "img with an event handler removed"],
  ['<a href="javascript:alert(1)">x</a>', "<a>x</a>", "javascript: link loses its href"],
  ['<a href="java\tscript:alert(1)">x</a>', "<a>x</a>", "tab-split javascript: is caught too"],
  ['<a href="JaVaScRiPt:alert(1)">x</a>', "<a>x</a>", "mixed-case javascript: is caught"],
  ['<a href="//evil.example">x</a>', "<a>x</a>", "protocol-relative link refused"],
  ['<a href="data:text/html,x">x</a>', "<a>x</a>", "data: link refused"],
  ['<a href="https://ok.example" target="_blank">x</a>', '<a href="https://ok.example" target="_blank" rel="noopener">x</a>', "target=_blank gains rel=noopener"],
  ['<a href="/products" onclick="x()" style="c">x</a>', '<a href="/products">x</a>', "event handlers and styles stripped"],
  ['<a href="https://ok.example" target="_top">x</a>', '<a href="https://ok.example">x</a>', "only _blank is kept as a target"],
  ['<strong onmouseover="x()">b</strong>', "<strong>b</strong>", "handler stripped from an allowed tag"],
  ["<div><span>keep</span> text</div>", "keep text", "unknown tags unwrapped, words kept"],
  ["<iframe src=x></iframe><style>*{}</style>t", "t", "iframe and style removed"],
  ["<!-- c -->t", "t", "comments removed"],
  ["<svg><script>alert(1)</script></svg>t", "t", "svg removed with its content"],
  ["plain & simple", "plain & simple", "plain text untouched, bare & kept"],
  ['<time datetime="2004">2004</time>', '<time datetime="2004">2004</time>', "time[datetime] kept"],
  ['<time datetime="x" onload="y">t</time>', "<time>t</time>", "bad datetime and handler removed"],
  ['<p>a<br>b</p><ul><li>c</li></ul>', '<p>a<br>b</p><ul><li>c</li></ul>', "basic structure kept"],
];
for (const [input, want, label] of cases) {
  const got = s(input);
  check(got === want, label, JSON.stringify(input) + " -> " + JSON.stringify(got) + " (want " + JSON.stringify(want) + ")");
}
check(s(null) === null && s(undefined) === undefined, "null and undefined pass through");

console.log("\n" + pass + " passed, " + fail + " failed");
process.exitCode = fail ? 1 : 0;
