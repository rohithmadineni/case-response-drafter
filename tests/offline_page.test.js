#!/usr/bin/env node
// Browser-level smoke test of dist/Case-Response-Drafter-Offline.html using jsdom.
// Install once: npm install   |   Run: npm run test:page
"use strict";
const fs = require("fs");
const path = require("path");
let JSDOM;
try { ({ JSDOM } = require("jsdom")); } catch (e) { console.log("jsdom not installed – run `npm install` first. Skipping."); process.exit(0); }
const file = path.join(__dirname, "..", "dist", "Case-Response-Drafter-Offline.html");
const dom = new JSDOM(fs.readFileSync(file, "utf8"), { runScripts: "dangerously", url: "file:///offline.html" });
const w = dom.window, d = w.document, errors = [];
w.addEventListener("error", e => errors.push(e.message));
const fx = f => fs.readFileSync(path.join(__dirname, "fixtures", f), "utf8");
setTimeout(() => {
  d.getElementById("caseNo").value = "01999999";
  d.getElementById("subject").value = "[AcmeCorp] Proactive Case: (Cluster name: ACME-PROD-01) Node is Bad";
  d.getElementById("statusIn").value = "In Progress";
  d.getElementById("desc").value = fx("sample_description.txt");
  d.getElementById("hist").value = fx("sample_history.txt");
  d.getElementById("go").click();
  const draft = d.getElementById("draft").value;
  const checks = [...d.querySelectorAll("#iqs li")].map(li => li.className);
  const ok = draft.includes("ACME-PROD-01") && checks.length > 5 && !errors.length;
  console.log(d.getElementById("msg").textContent);
  console.log(d.getElementById("draftTitle").textContent);
  console.log("IQS:", [...d.querySelectorAll("#iqs li")].map(li => li.textContent).join(" | "));
  console.log(ok ? "✔ offline page works" : "✘ offline page failed " + JSON.stringify(errors));
  process.exit(ok ? 0 : 1);
}, 50);
