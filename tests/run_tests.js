#!/usr/bin/env node
// Unit tests for the shared drafting logic. Run: npm test  (or: node tests/run_tests.js)
"use strict";
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const L = require(path.join(__dirname, "..", "dist", "lib.cjs"));
const fx = f => fs.readFileSync(path.join(__dirname, "fixtures", f), "utf8");

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log("  ✔ " + name); }
  catch (e) { failed++; console.log("  ✘ " + name + "\n      " + e.message); }
}
const caseObj = (over = {}) => Object.assign({
  CaseNumber: "01999999", Subject: "[AcmeCorp] Proactive Case: (Cluster name: ACME-PROD-01) Node is Bad",
  "Account.Name": "AcmeCorp", Status: "In Progress", Resolution__c: "", Description: fx("sample_description.txt")
}, over);
const history = () => L.parseInput(fx("sample_history.txt"));

console.log("Parsing");
test("parses Salesforce query output", () => { const c = history(); assert.strictEqual(c.length, 5); assert.ok(c[0].CreatedDate.startsWith("2026-09-29")); });
test("parses CSV export", () => { const c = L.parseInput(fx("sample_comments.csv")); assert.strictEqual(c.length, 2); assert.ok(/tunnel/.test(c[1].CommentBody)); });
test("parses plain email thread", () => { const c = L.parseInput(fx("sample_thread.txt")); assert.strictEqual(c.length, 2); assert.strictEqual(L.classify(c[1]).startsWith("customer"), true); });
test("classifies comment kinds", () => { const k = history().map(L.classify); assert.deepStrictEqual(k, ["rubrik", "alert", "customer", "internal", "rubrik"]); });

console.log("Summary (Agent 1, local)");
test("extracts alert facts", () => { const f = L.facts(caseObj(), history()); assert.strictEqual(f.tag, "ACME-PROD-01"); assert.strictEqual(f.node, "RVMHM000S000001"); });
test("finds stage, follow-ups and promised date", () => {
  const s = L.localSummary(caseObj(), history());
  assert.strictEqual(s.rubrik_followups_since_last_customer_reply, 1);
  assert.ok(/October 2, 2026/.test(s.last_rubrik_email.promised_next_update));
  assert.strictEqual(s.suggested_stage, "Follow-up (no reply)");
});
test("captures stale-on-startup evidence", () => { const s = L.localSummary(caseObj(), history()); assert.ok(s.evidence.some(e => /stale on system startup/i.test(e))); });
test("records cleared alert as an action", () => { const s = L.localSummary(caseObj(), history()); assert.ok(s.actions_taken.some(a => /Alert cleared for RVMHM000S000001/.test(a))); });
test("summary is small and fast", () => {
  const big = [];
  for (let i = 0; i < 300; i++) big.push(...history().map(c => Object.assign({}, c)));
  const t = Date.now(); const s = L.localSummary(caseObj(), big); const ms = Date.now() - t;
  assert.ok(ms < 1500, "took " + ms + " ms"); assert.ok(JSON.stringify(s).length < 8000);
});
test("IR stage when no Rubrik email yet", () => { const s = L.localSummary(caseObj(), [history()[1]]); assert.strictEqual(s.suggested_stage, "IR needed"); });
test("Ready to close when status is Resolved", () => { const s = L.localSummary(caseObj({ Status: "Resolved" }), history()); assert.strictEqual(s.suggested_stage, "Ready to close"); });

console.log("Drafts (Agent 2, templates)");
const draftOf = (type, over, notes) => { const c = caseObj(over), h = history(); const s = L.localSummary(c, h); return { s, d: L.buildDraft(type, c, h, s, notes || "", 2) }; };
test("IR contains alert block, tunnel ask and date", () => {
  const { d } = draftOf("Initial Response (IR)");
  assert.ok(/Case ID: 01999999/.test(d)); assert.ok(/Support Tunnel/.test(d)); assert.ok(/by [A-Z][a-z]+ \d{1,2}, \d{4}, 12:00 PM UTC/.test(d));
});
test("follow-up counts prior emails", () => { const c = caseObj(), h = history().slice(0, 2); const s = L.localSummary(c, h); assert.ok(/2nd follow-up/.test(L.buildDraft("Follow-up (no customer reply)", c, h, s, "", 2))); });
test("closure fills notes", () => {
  const { d } = draftOf("Closure", {}, "Root cause: The node restarted.\nAction taken: Confirmed recovery.");
  assert.ok(/Root Cause:\nThe node restarted\./.test(d)); assert.ok(/\* Confirmed recovery\./.test(d));
});
test("duplicate fills other case number", () => { const { d } = draftOf("Duplicate closure", {}, "Duplicate of: 01888888"); assert.ok(/case 01888888/.test(d)); });
test("never contains banned phrases", () => {
  ["Initial Response (IR)", "Follow-up (no customer reply)", "Update with findings", "Approval request", "Proceeding after approval", "Hold acknowledgement",
   "Monitoring update + request to close", "Short summary requesting closure", "Closure", "Simple closure", "Ghosted closure", "Duplicate closure"].forEach(t => {
    const { d } = draftOf(t); assert.ok(d, t + " produced no draft");
    assert.ok(!/data loss|No data disruption to backup\/restore|archive this case|\*\*/i.test(d), t);
    assert.ok(/Rohith Madineni\nCustomer Success Engineer – Proactive Support\nRubrik/.test(d), t + " signature");
  });
});
test("scrub removes banned wording and markdown", () => { assert.strictEqual(L.scrub("**Root Cause:** archive this case"), "Root Cause: close this case"); });

console.log("IQS check");
test("non-closure passes When/Why/What on IR", () => {
  const { s, d } = draftOf("Initial Response (IR)"); const r = L.iqsCheck("Initial Response (IR)", d, s);
  ["WHEN", "WHY", "WHAT", "24×7"].forEach(k => assert.ok(r.find(x => x.label.includes(k)).ok, k));
});
test("flags a missing When", () => { const r = L.iqsCheck("Follow-up (no customer reply)", "Hello Team,\n\nPlease enable the tunnel so we can check.\n", { rubrik_customer_emails_total: 5 }); assert.ok(!r.find(x => x.label.startsWith("WHEN")).ok); });
test("flags unfilled placeholders", () => { const r = L.iqsCheck("Closure", "Root Cause:\n[ROOT CAUSE IN PLAIN LANGUAGE]", {}); assert.ok(!r[r.length - 1].ok); });

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
