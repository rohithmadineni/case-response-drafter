#!/usr/bin/env node
// Engine tests for the extension: node extension/tests/engine.test.js
"use strict";
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const E = require(path.join(__dirname, "..", "engine.js"));
const fx = (f) => fs.readFileSync(path.join(__dirname, "..", "..", "tests", "fixtures", f), "utf8");

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log("  ✔ " + name); }
  catch (e) { failed++; console.log("  ✘ " + name + "\n      " + e.message); }
}

const caseOf = (subject, desc, over) => Object.assign({
  CaseNumber: "01999999", Subject: subject, "Account.Name": "AcmeCorp", Status: "In Progress", Resolution__c: "", Description: desc
}, over);
const alertDesc = (description, node, extra) => `Summary of Alert:\nDescription: ${description}\nCluster UUID: 00000000-1111-2222-3333-444444444444\nCluster Tag: ACME-PROD-01\nNode: ${node || "RVMHM000S000001"}\nIncident Time (UTC): 2026-09-29 02:54:30${extra || ""}`;
const mail = (from, body, date, by) => ({ CommentBody: `From: ${from}<br>To: x@y.example<br><br>${body}`, CreatedDate: date, "CreatedBy.Name": by || "Rohith Madineni" });
const rubrik = (body, date) => mail("support@rubrik.com", body, date || "2026-09-29T04:00:00.000+0000");
const customer = (body, date) => mail("jane.doe@acme.example", body, date || "2026-09-30T08:00:00.000+0000", "Support Bot");

const SCENARIOS = {
  nodeBad: ["[Acme] Proactive Case: (Cluster name: ACME-PROD-01) Node is Bad", alertDesc("NodeBad: 4 is greater than or equal to threshold")],
  psu: ["[Acme] Proactive Case: (Cluster name: ACME-PROD-01) Hardware health check failed", alertDesc("Hardware health check detected errors: PS2's AC cord and/or AC circuit must be checked.")],
  disk: ["[Acme] Proactive Case: (Cluster name: ACME-PROD-01) Disk proactive replace", alertDesc("Disk sdc is flagged for proactive replacement")],
  dimm: ["[Acme] Proactive Case: (Cluster name: ACME-PROD-01) DIMM missing", alertDesc("DIMM(s) missing on the node")],
  part: ["[Acme] Proactive Case: (Cluster name: ACME-PROD-01) OS_PARTITION low", alertDesc("OS_PARTITION: 4.2 is less than threshold")],
  unknown: ["[Acme] Proactive Case: (Cluster name: ACME-PROD-01) Something New", alertDesc("Brand new alert type")],
};
const impactOf = (k, comments) => { const [s, d] = SCENARIOS[k]; return E.impactFor(E.facts(caseOf(s, d), comments || [])); };

console.log("Business impact is case-specific (was: same summary for everything)");
test("every alert type gets a different impact", () => {
  const set = new Set(Object.keys(SCENARIOS).map((k) => impactOf(k)));
  assert.strictEqual(set.size, Object.keys(SCENARIOS).length, [...set].join("\n"));
});
test("PSU impact matches the sample mail wording", () => assert.ok(/Loss of power redundancy on the affected node/.test(impactOf("psu"))));
test("Node Bad: still BAD vs recovered", () => {
  assert.ok(/is marked BAD\./.test(impactOf("nodeBad")));
  const rec = impactOf("nodeBad", [{ CommentBody: "Removed RVMHM000S000001 from impacted nodes", CreatedDate: "2026-09-29T09:00:00.000+0000", "CreatedBy.Name": "alert bot" }]);
  assert.ok(/temporarily marked BAD but has since recovered/.test(rec));
});
test("unknown alert never claims the node is BAD", () => assert.ok(!/BAD/.test(impactOf("unknown"))));
test("disk / DIMM / partition mention the right component", () => {
  assert.ok(/disk/i.test(impactOf("disk"))); assert.ok(/DIMM/.test(impactOf("dimm"))); assert.ok(/OS \(root\) partition/.test(impactOf("part")) && /4\.2%/.test(impactOf("part")));
});

console.log("Initial Response per alert");
const ir = (k) => { const [s, d] = SCENARIOS[k]; const c = caseOf(s, d); const S1 = E.localSummary(c, []); return E.buildDraft("Initial Response (IR)", c, [], S1, "", 2); };
test("IR drafts are different per alert and carry case data", () => {
  const drafts = Object.keys(SCENARIOS).map(ir);
  assert.strictEqual(new Set(drafts).size, drafts.length);
  drafts.forEach((d) => { assert.ok(/Case ID: 01999999/.test(d)); assert.ok(/Cluster Tag: ACME-PROD-01/.test(d)); assert.ok(/RVMHM000S000001/.test(d)); assert.ok(/Support Tunnel/.test(d)); });
});
test("Node Bad IR asks about maintenance; PSU IR asks PDU/AC checks instead", () => {
  assert.ok(/maintenance, activity, or outage/.test(ir("nodeBad")));
  const p = ir("psu"); assert.ok(/PDUs supplying power/.test(p)); assert.ok(!/maintenance, activity, or outage/.test(p));
  assert.ok(/Description: Hardware health check detected errors: PS2's AC cord/.test(p));
});
test("IR date is a concrete UTC date (no weekday, no placeholder)", () => assert.ok(/by [A-Z][a-z]+ \d{1,2}, \d{4}, 12:00 PM UTC/.test(ir("psu"))));

console.log("Stage → draft type from the case history");
const typeFor = (comments, over) => { const c = caseOf(...SCENARIOS.nodeBad, over); const S1 = E.localSummary(c, comments); return { S1, type: E.STAGE_TO_TYPE[S1.suggested_stage] }; };
test("no Rubrik email yet → IR", () => assert.strictEqual(typeFor([]).type, "Initial Response (IR)"));
test("Rubrik asked, customer silent → follow-up", () => assert.strictEqual(typeFor([rubrik("Please enable the support tunnel.")]).type, "Follow-up (no customer reply)"));
test("customer enabled tunnel → tunnel thank-you", () => {
  const r = typeFor([rubrik("Please enable the support tunnel."), customer("Hi Rohith, the support tunnel is now open on port 1234.")]);
  assert.strictEqual(r.type, "Support tunnel enabled – starting investigation"); assert.strictEqual(r.S1.contact_name, "Jane");
});
test("customer sent shipping details → RMA raised", () => {
  const r = typeFor([rubrik("Could you share shipping details?"), customer("Contact: Brian, phone +44 1234 567890, address 1 Main Street, London")]);
  assert.strictEqual(r.type, "RMA raised");
});
test("customer replied with a question → update with findings and the question is surfaced", () => {
  const r = typeFor([rubrik("Please enable the tunnel."), customer("Thanks. Can you tell us why the node went down?")]);
  assert.strictEqual(r.type, "Update with findings"); assert.ok(r.S1.unanswered_customer_questions.length === 1);
});
test("part delivered by RMA bot → part delivered follow-up", () => {
  const r = typeFor([rubrik("RMA raised."), { CommentBody: "RMA shipment information [RMA-123] Status: Delivered on 2026-08-26 10:21", CreatedDate: "2026-08-26T10:30:00.000+0000", "CreatedBy.Name": "mulesoft" }]);
  assert.strictEqual(r.type, "Part delivered – follow-up"); assert.ok(/2026-08-26 10:21/.test(r.S1.delivery));
});

console.log("Every draft type");
test("all types render, are plain text, signed, banned-phrase free", () => {
  const h = E.parseInput(fx("sample_history.txt")); const c = caseOf("[Acme] Proactive Case: (Cluster name: ACME-PROD-01) Disk proactive replace", alertDesc("Disk sdc is flagged for proactive replacement"));
  const S1 = E.localSummary(c, h);
  E.DRAFT_TYPES.forEach((t) => {
    const d = E.buildDraft(t, c, h, S1, "Root cause: The disk failed.\nAction taken: Replaced the disk.\nValidation: All FRUs healthy.\nDuplicate of: 01888888", 2);
    assert.ok(d, t + " produced no draft");
    assert.ok(!/data loss|No data disruption to backup\/restore|archive this case|\*\*/i.test(d), t);
    assert.ok(/Rohith Madineni\nCustomer Success Engineer – Proactive Support\nRubrik/.test(d), t + " signature");
  });
});
test("shipping request names the failed part", () => {
  const c = caseOf(...SCENARIOS.disk); const d = E.buildDraft("Request shipping details", c, [], E.localSummary(c, []), "", 2);
  assert.ok(/the disk on node RVMHM000S000001 in your ACME-PROD-01 cluster/.test(d));
});
test("part delivered includes disk KB links and Zoom variant", () => {
  const c = caseOf(...SCENARIOS.disk); const S1 = E.localSummary(c, []);
  assert.ok(/000001599/.test(E.buildDraft("Part delivered – follow-up", c, [], S1, "", 2)));
  assert.ok(/Zoom session/.test(E.buildDraft("Part delivered – follow-up", c, [], S1, "Zoom", 2)));
});
test("Field Engineer details come from notes", () => {
  const c = caseOf(...SCENARIOS.disk); const d = E.buildDraft("Field Engineer details", c, [], E.localSummary(c, []), "Name: Sam Fox\nContact: +1 555 0100\nEmail: sam@fe.example\nArrival date: October 9, 2026\nArrival time: 09:00 AM", 2);
  assert.ok(/Name: Sam Fox/.test(d) && /Arrival date: October 9, 2026/.test(d) && !/\[ENGINEER/.test(d));
});
test("Resolution Summary closure fills notes and leaves visible placeholders otherwise", () => {
  const c = caseOf(...SCENARIOS.psu), S1 = E.localSummary(c, []);
  const ok = E.buildDraft("Closure – Resolution Summary", c, [], S1, "Root cause: Site power outage.\nAction taken: Power restored.\nValidation: All nodes up.", 2);
  assert.ok(/Root Cause: Site power outage\./.test(ok) && /Validation: All nodes up\./.test(ok) && !/\[/.test(ok));
  const gap = E.buildDraft("Closure – Resolution Summary", c, [], S1, "", 2);
  assert.ok(/\[ROOT CAUSE IN PLAIN LANGUAGE\]/.test(gap) && /\[VALIDATION/.test(gap));
  assert.ok(E.iqsCheck("Closure – Resolution Summary", ok, S1).every((x) => x.ok), JSON.stringify(E.iqsCheck("Closure – Resolution Summary", ok, S1).filter((x) => !x.ok)));
  assert.ok(E.iqsCheck("Closure – Resolution Summary", gap, S1).some((x) => !x.ok));
});
test("business impact appears in first three Rubrik emails only", () => {
  const c = caseOf(...SCENARIOS.nodeBad);
  assert.ok(/Business Impact:/.test(E.buildDraft("Support tunnel enabled – starting investigation", c, [], E.localSummary(c, []), "", 2)));
  const many = [rubrik("a. by October 1, 2026, 12:00 PM UTC"), rubrik("b", "2026-09-30T04:00:00.000+0000"), rubrik("c", "2026-10-01T04:00:00.000+0000")];
  assert.ok(!/Business Impact:/.test(E.buildDraft("Support tunnel enabled – starting investigation", c, many, E.localSummary(c, many), "", 2)));
});

test("follow-up numbering: IR is not a follow-up", () => {
  const c = caseOf(...SCENARIOS.nodeBad);
  const one = [rubrik("IR. by October 1, 2026, 12:00 PM UTC")];
  const two = one.concat([rubrik("FU1", "2026-09-30T04:00:00.000+0000")]);
  const fu = (h) => E.buildDraft("Follow-up (no customer reply)", c, h, E.localSummary(c, h), "", 2);
  assert.ok(/This is a follow-up on case/.test(fu(one)), "after IR only");
  assert.ok(/This is the 2nd follow-up on case/.test(fu(two)), "after IR + 1 follow-up");
});
test("intro reads naturally for non-node alerts", () => {
  assert.ok(/detected a hardware health check failure on your Rubrik cluster/.test(ir("psu")));
  assert.ok(!/and arrange a replacement if needed and share/.test(ir("disk")));
});

console.log("Case summary");
test("summary is compact, de-duplicated and has no raw HTML", () => {
  const h = E.parseInput(fx("sample_history.txt")); const S1 = E.localSummary(caseOf(...SCENARIOS.nodeBad), h.concat(h));
  assert.ok(JSON.stringify(S1).length < 6000);
  S1.timeline.forEach((l) => assert.ok(!/<br|&nbsp;/.test(l), l));
});
test("contact name / follow-up count / promised date", () => {
  const h = E.parseInput(fx("sample_history.txt")); const S1 = E.localSummary(caseOf("[AcmeCorp] Proactive Case: (Cluster name: ACME-PROD-01) Node is Bad", fx("sample_description.txt")), h);
  assert.strictEqual(S1.contact_name, "Jane"); assert.strictEqual(S1.rubrik_followups_since_last_customer_reply, 1); assert.ok(/October 2, 2026/.test(S1.last_rubrik_email.promised_next_update));
});

console.log("Personalisation / robustness");
test("personalize swaps name and signature", () => {
  const c = caseOf(...SCENARIOS.nodeBad); const d = E.personalize(E.buildDraft("Initial Response (IR)", c, [], E.localSummary(c, []), "", 2), { name: "Priya Shah", designation: "Support Engineer" });
  assert.ok(/My name is Priya,/.test(d) && /Priya Shah\nSupport Engineer\nRubrik/.test(d) && !/Rohith/.test(d));
});
test("engine tolerates empty / hostile input", () => {
  const c = { CaseNumber: "", Subject: "", Description: "" };
  [[], [{ CommentBody: null }], [{ CommentBody: "<script>alert(1)</script>", CreatedDate: "garbage" }]].forEach((h) => {
    const S1 = E.localSummary(c, h); assert.ok(S1.suggested_stage);
    E.DRAFT_TYPES.forEach((t) => E.buildDraft(t, c, h, S1, "", 2));
  });
  assert.deepStrictEqual(E.parseInput(""), []); assert.deepStrictEqual(E.parseInput(null), []);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
