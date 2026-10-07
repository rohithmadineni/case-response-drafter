#!/usr/bin/env node
// Page-reader tests (synthetic Lightning-style DOM, no real customer data): node extension/tests/extract.test.js
"use strict";
const assert = require("assert");
const path = require("path");
const { JSDOM } = require("jsdom");
const { extractCase } = require(path.join(__dirname, "..", "extract.js"));
const E = require(path.join(__dirname, "..", "engine.js"));

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log("  ✔ " + name); }
  catch (e) { failed++; console.log("  ✘ " + name + "\n      " + e.message); }
}
const run = (html, title) => { const dom = new JSDOM(`<!doctype html><title>${title || ""}</title><body>${html}</body>`, { url: "https://acme.lightning.force.com/lightning/r/Case/500xx000000AAAA/view" }); return extractCase(dom.window.document, dom.window.location); };

const { field, item, DESC, EMAIL, PAGE } = require("./page-fixture.js");

console.log("Lightning field markers");
test("reads case number, subject, status, account, priority, description", () => {
  const r = run(PAGE, "01318617 | Case | Salesforce");
  assert.strictEqual(r.ok, true); assert.strictEqual(r.case.CaseNumber, "01318617");
  assert.strictEqual(r.case.Subject, "[AcmeCorp] Proactive Case: (Cluster name: ACME-PROD-01) Node is Bad");
  assert.strictEqual(r.case.Status, "Waiting for Customer Input"); assert.strictEqual(r.case["Account.Name"], "AcmeCorp"); assert.strictEqual(r.case.Priority, "P3");
  assert.ok(/Cluster UUID: 00000000/.test(r.case.Description));
});
test("history is de-duplicated (collapsed snippet + repeated panel merged)", () => {
  const r = run(PAGE, "01318617 | Case | Salesforce");
  assert.strictEqual(r.comments.length, 2, JSON.stringify(r.stats));
  assert.ok(r.stats.merged >= 2);
});
test("history is chronological and parsed with dates", () => {
  const r = run(PAGE); assert.ok(r.comments[0].CreatedDate && r.comments[0].CreatedDate <= r.comments[1].CreatedDate);
});
test("feeds straight into the engine and yields a useful summary + draft", () => {
  const r = run(PAGE); const S1 = E.localSummary(r.case, r.comments);
  assert.strictEqual(S1.cluster, "ACME-PROD-01"); assert.strictEqual(S1.nodes[0].node, "RVMHM000S000001");
  assert.strictEqual(S1.rubrik_customer_emails_total, 1); assert.ok(/October 1, 2026/.test(S1.last_rubrik_email.promised_next_update));
  assert.ok(S1.actions_taken.some((a) => /Alert cleared/.test(a)));
  assert.strictEqual(E.STAGE_TO_TYPE[S1.suggested_stage], "Follow-up (no customer reply)");
});

console.log("Fallbacks");
test("label / value on separate lines (no colon) as Lightning prints them", () => {
  const r = run(`<div>Case 01318617</div>\n<div>Status</div>\n<div>In Progress</div>\n<div>Subject</div>\n<div>[Acme] Proactive Case: (Cluster name: X) Node is Bad</div>\n<div>Account Name</div>\n<div>Acme</div>`);
  assert.strictEqual(r.case.CaseNumber, "01318617"); assert.strictEqual(r.case.Status, "In Progress"); assert.strictEqual(r.case.Account || r.case["Account.Name"], "Acme");
  assert.ok(/Node is Bad/.test(r.case.Subject));
});
test("alert block found in page text when the Description field is missing", () => {
  const r = run(`<div>Case 01318617</div>\n<pre>${DESC}</pre>`);
  assert.ok(/Incident Time \(UTC\): 2026-09-29 02:54:30/.test(r.case.Description));
});
test("history from page text when no timeline markup exists", () => {
  const r = run(`<div>Case 01318617</div>\n<div>Activity</div>\n<pre>${EMAIL}\n2026-09-29 04:00</pre>\n<pre>Alert Bot\nRemoved RVMHM000S000001 from impacted nodes 2026-09-29 09:00</pre>`);
  assert.strictEqual(r.source, "page-text"); assert.ok(r.comments.length >= 2);
});

console.log("Error handling");
test("non-case page → ok:false with a clear warning, never throws", () => {
  const r = run("<div>Home</div><p>Nothing here</p>", "Home | Salesforce");
  assert.strictEqual(r.ok, false); assert.ok(r.warnings.some((w) => /case number/i.test(w)));
});
test("empty history is reported, not silently accepted", () => {
  const r = run(field("CaseNumber", "Case Number", "01318617") + field("Subject", "Subject", "x"));
  assert.strictEqual(r.comments.length, 0); assert.ok(r.warnings.some((w) => /No case history/.test(w)));
});
test("an unrelated 8-digit number (phone) is not mistaken for the case number", () => {
  const r = run(`<div>Call 12345678 or 98765432</div>`); assert.strictEqual(r.case.CaseNumber, "");
});
test("'Show more' warning when older history may be missing", () => {
  const r = run(PAGE + "<a>Show more activities</a>"); assert.ok(r.warnings.some((w) => /older history/i.test(w)));
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
