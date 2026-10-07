#!/usr/bin/env node
/*
 * Command-line drafter (offline, no network).
 *
 *   node tools/draft.js --history tests/fixtures/sample_history.txt --desc tests/fixtures/sample_description.txt \
 *        --case 01999999 --subject "[Acme] Proactive Case: (Cluster name: ACME-01) Node is Bad" --status "In Progress" \
 *        [--type "Closure"] [--days 2] [--notes "Root cause: ...\nAction taken: ..."] [--json]
 *
 * History accepts the Salesforce query output ("Record 1: ..."), a CSV export, or a plain email thread.
 * Run `python3 tools/build.py` first to generate dist/lib.cjs.
 */
"use strict";
const fs = require("fs");
const path = require("path");
const L = require(path.join(__dirname, "..", "dist", "lib.cjs"));

function args(argv) {
  const out = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const k = a.slice(2);
      const v = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : true;
      out[k] = v;
    }
  }
  return out;
}
const A = args(process.argv);
if (!A.history && !A.desc) {
  console.error("Usage: node tools/draft.js --history <file> --desc <file> [--case N] [--subject S] [--status S] [--type T] [--days N] [--notes TEXT] [--json]");
  process.exit(1);
}
const readMaybe = p => (p && p !== true ? fs.readFileSync(p, "utf8") : "");
const comments = L.parseInput(readMaybe(A.history));
comments.sort((a, b) => (a.CreatedDate || "") < (b.CreatedDate || "") ? -1 : (a.CreatedDate || "") > (b.CreatedDate || "") ? 1 : 0);
const subject = A.subject && A.subject !== true ? A.subject : "";
const c = {
  CaseNumber: A.case && A.case !== true ? String(A.case) : "[CASE NUMBER]",
  Subject: subject,
  "Account.Name": (subject.match(/^\[([^\]]+)\]/) || [])[1] || "",
  Status: A.status && A.status !== true ? A.status : "",
  Resolution__c: "",
  Description: readMaybe(A.desc)
};
const notes = A.notes && A.notes !== true ? String(A.notes).replace(/\\n/g, "\n") : "";
const t0 = process.hrtime.bigint();
const S1 = L.localSummary(c, comments);
const ms = Number(process.hrtime.bigint() - t0) / 1e6;
let type = A.type && A.type !== true ? A.type : "Auto";
if (type === "Auto") type = L.STAGE_TO_TYPE[S1.suggested_stage] || "Update with findings";
const days = Math.max(1, Math.min(14, parseInt(A.days, 10) || 2));
const draft = L.buildDraft(type, c, comments, S1, notes, days) || "";
const checks = L.iqsCheck(type, draft, S1);
const resolution = L.resolutionDetails(type, c, comments, S1, notes);

if (A.json) {
  console.log(JSON.stringify({ type, summary: S1, draft, resolution_details: resolution, iqs: checks, ms }, null, 2));
} else {
  console.log(`# Case ${c.CaseNumber} – ${type}   (${comments.length} comments, summary in ${ms.toFixed(1)} ms)\n`);
  console.log(`Stage: ${S1.suggested_stage} | Contact: ${S1.contact_name} | Health: ${S1.current_health}`);
  if ((S1.risks_or_flags || []).length) console.log("Check before sending:\n  - " + S1.risks_or_flags.join("\n  - "));
  console.log("\n----- DRAFT -----\n" + draft + "\n-----------------\n");
  if (resolution) console.log("Resolution Details: " + resolution + "\n");
  console.log("IQS check:");
  checks.forEach(x => console.log(`  ${x.ok ? "✔" : "✘"} ${x.label}`));
}
