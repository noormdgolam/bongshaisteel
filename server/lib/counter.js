/* Page-view counter, in server/var/counter.txt (private). The first read
   carries over the count the old PHP counter kept at <site>/counter.txt. */
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { ROOT, VAR } = require("./paths");

const FILE = path.join(VAR, "counter.txt");
const LEGACY = path.join(ROOT, "counter.txt");

const readInt = (f) => { try { return parseInt(fs.readFileSync(f, "utf8"), 10) || 0; } catch { return null; } };

function read() {
  const n = readInt(FILE);
  return n === null ? (readInt(LEGACY) || 0) : n;
}

function hit() {
  const n = read() + 1;
  try {
    fs.mkdirSync(VAR, { recursive: true });
    fs.writeFileSync(FILE, String(n));
  } catch (err) {
    console.error("counter:", err.message);
  }
  return n;
}

module.exports = { read, hit, FILE };
