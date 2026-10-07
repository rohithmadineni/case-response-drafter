#!/usr/bin/env node
// Popup smoke test: real popup.html + engine.js + popup.js in jsdom with a stubbed chrome API. node extension/tests/popup.test.js
"use strict";
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");
const { extractCase } = require("../extract.js");
const { PAGE } = require("./page-fixture.js");

const ROOT = path.join(__dirname, "..");
const rd = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
let passed = 0, failed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log("  ✔ " + name); }
  catch (e) { failed++; console.log("  ✘ " + name + "\n      " + (e && e.stack || e).split("\n").slice(0, 4).join("\n      ")); }
}
const tick = (ms) => new Promise((r) => setTimeout(r, ms || 20));

/** Boot the popup. opts: { url, pageHtml, execError, storage } */
async function boot(opts) {
  opts = opts || {};
  const html = rd("popup.html").replace('<script src="engine.js"></script>', () => "<script>" + rd("engine.js") + "</script>").replace('<script src="popup.js"></script>', () => "<script>" + rd("popup.js") + "</script>");
  const errors = [];
  const dom = new JSDOM(html, {
    url: "https://popup.test/popup.html", runScripts: "dangerously", pretendToBeVisual: true,
    beforeParse(win) {
      win.addEventListener("error", (e) => errors.push(e.message));
      win.HTMLElement.prototype.scrollIntoView = function () {};
      win.confirm = () => true;
      win.__copied = null;
      Object.defineProperty(win.navigator, "clipboard", { value: { writeText: async (t) => { win.__copied = t; } } });
      if (opts.storage) Object.entries(opts.storage).forEach(([k, v]) => win.localStorage.setItem(k, v));
      win.chrome = {
        tabs: { query: async () => [{ id: 1, url: opts.url === undefined ? "https://acme.lightning.force.com/lightning/r/Case/500xx/view" : opts.url }] },
        scripting: {
          executeScript: async () => {
            if (opts.execError) throw new Error(opts.execError);
            const page = new JSDOM(`<!doctype html><title>${opts.title === undefined ? "01318617 | Case | Salesforce" : opts.title}</title><body>${opts.pageHtml || PAGE}</body>`);
            return [{ result: extractCase(page.window.document, page.window.location) }];
          }
        }
      };
    }
  });
  await tick(60);
  return { win: dom.window, doc: dom.window.document, errors, $: (id) => dom.window.document.getElementById(id), click: (id) => dom.window.document.getElementById(id).click() };
}

(async () => {
  console.log("Loading a case from the page");
  await test("auto-reads the open case and shows summary + stage", async () => {
    const p = await boot();
    assert.deepStrictEqual(p.errors, []);
    assert.strictEqual(p.$("caseNo").textContent, "Case 01318617");
    assert.strictEqual(p.$("caseStatus").textContent, "Waiting for Customer Input");
    assert.strictEqual(p.$("caseStage").textContent, "Follow-up (no reply)");
    assert.ok(/ACME-PROD-01/.test(p.$("summaryBody").textContent));
    assert.strictEqual(p.$("genBtn").disabled, false);
    // de-duplicated: the single Rubrik email and the single alert-bot item, not repeated
    const tl = p.$("summaryBody").textContent;
    assert.strictEqual((tl.match(/alert cleared for RVMHM000S000001/gi) || []).length, 1, tl);
  });
  await test("generates a case-specific draft with a live IQS checklist", async () => {
    const p = await boot(); p.click("genBtn");
    const d = p.$("draft").value;
    assert.ok(/This is a follow-up on case 01318617/.test(d) || /follow-up/i.test(d), d);
    assert.ok(/node RVMHM000S000001/.test(d)); assert.ok(/by [A-Z][a-z]+ \d{1,2}, \d{4}, 12:00 PM UTC/.test(d));
    assert.ok(p.$("iqs").children.length >= 8); assert.ok(/^IQS \d+\/\d+$/.test(p.$("score").textContent));
    assert.ok(!p.$("draftOut").classList.contains("hidden"));
  });
  await test("editing the draft re-runs the IQS check", async () => {
    const p = await boot(); p.click("genBtn");
    const before = p.$("score").textContent;
    p.$("draft").value = "Hello Team,\n\nPlease do something."; p.$("draft").dispatchEvent(new p.win.Event("input"));
    assert.notStrictEqual(p.$("score").textContent, before);
    assert.ok([...p.$("iqs").children].some((li) => li.classList.contains("fail")));
  });
  await test("choosing a type, notes and days is honoured; closure shows Resolution Details", async () => {
    const p = await boot();
    p.$("typeSel").value = "Closure – Resolution Summary"; p.$("daysSel").value = "5";
    p.$("notes").value = "Root cause: Site power outage.\nAction taken: Power restored.\nValidation: All nodes up.";
    p.click("genBtn");
    assert.ok(/Root Cause: Site power outage\./.test(p.$("draft").value));
    assert.ok(!p.$("resWrap").classList.contains("hidden")); assert.ok(/Site power outage/.test(p.$("resdet").value));
  });
  await test("Copy puts the (edited) draft on the clipboard", async () => {
    const p = await boot(); p.click("genBtn"); p.$("draft").value += "\nEDIT"; p.click("copyBtn"); await tick();
    assert.ok(/EDIT$/.test(p.win.__copied));
  });

  console.log("Error handling");
  await test("non-Salesforce tab → readable message, no crash", async () => {
    const p = await boot({ url: "https://example.com/" });
    assert.ok(/not a Salesforce page/.test(p.$("warnings").textContent)); assert.strictEqual(p.$("genBtn").disabled, true); assert.deepStrictEqual(p.errors, []);
  });
  await test("script injection failure → readable message", async () => {
    const p = await boot({ execError: "Cannot access contents of the page" });
    assert.ok(/Reload the Salesforce page/.test(p.$("warnings").textContent));
  });
  await test("page that is not a case → clear message", async () => {
    const p = await boot({ pageHtml: "<div>Home</div>", title: "Home | Salesforce" });
    assert.ok(/case number/i.test(p.$("warnings").textContent)); assert.strictEqual(p.$("genBtn").disabled, true);
  });
  await test("corrupted saved state / signature never breaks start-up", async () => {
    const p = await boot({ url: "https://example.com/", storage: { iqs_state_v2: "{not json", iqs_signature_v2: "][" } });
    assert.deepStrictEqual(p.errors, []); p.click("genBtn"); // disabled → no-op
  });
  await test("hostile case content is rendered as text, never as HTML", async () => {
    const evil = PAGE.replace("Waiting for Customer Input", "&lt;img src=x onerror=alert(1)&gt;Waiting");
    const p = await boot({ pageHtml: evil });
    assert.strictEqual(p.doc.querySelectorAll("img").length, 0); assert.ok(/<img/.test(p.$("caseStatus").textContent));
  });

  console.log("Paste fallback, persistence, settings");
  await test("paste details when not on Salesforce", async () => {
    const p = await boot({ url: "https://example.com/" });
    p.$("pCase").value = "01999999"; p.$("pSubject").value = "[Acme] Proactive Case: (Cluster name: ACME-01) Node is Bad";
    p.$("pDesc").value = "Summary of Alert:\nDescription: NodeBad: 4\nCluster UUID: 1\nCluster Tag: ACME-01\nNode: RVMHM1\nIncident Time (UTC): 2026-09-29 02:54:30";
    p.$("pHist").value = "Record 1:\n    CommentBody: From: support@rubrik.com<br>To: a@b.c<br><br>Hello Team, please enable the support tunnel. I will update by October 1, 2026, 12:00 PM UTC.\n    CreatedDate: 2026-09-29T04:00:07.000+0000\n    CreatedBy.Name: Rohith Madineni";
    p.click("usePasteBtn");
    assert.strictEqual(p.$("caseNo").textContent, "Case 01999999"); assert.strictEqual(p.$("genBtn").disabled, false);
    p.click("genBtn"); assert.ok(/RVMHM1/.test(p.$("draft").value));
  });
  await test("the loaded case and notes survive closing/reopening the popup", async () => {
    const p1 = await boot(); p1.$("notes").value = "Root cause: x"; p1.$("notes").dispatchEvent(new p1.win.Event("change"));
    const saved = {}; for (let i = 0; i < p1.win.localStorage.length; i++) { const k = p1.win.localStorage.key(i); saved[k] = p1.win.localStorage.getItem(k); }
    const p2 = await boot({ url: "https://example.com/", storage: saved });
    assert.strictEqual(p2.$("caseNo").textContent, "Case 01318617"); assert.strictEqual(p2.$("notes").value, "Root cause: x"); assert.strictEqual(p2.$("genBtn").disabled, false);
  });
  await test("saved sign-off is applied to the draft", async () => {
    const p = await boot();
    p.$("sigName").value = "Priya Shah"; p.$("sigDesig").value = "Support Engineer"; p.click("saveSig"); p.click("genBtn");
    assert.ok(/Priya Shah\nSupport Engineer\nRubrik/.test(p.$("draft").value)); assert.ok(!/Rohith/.test(p.$("draft").value));
  });
  await test("clear saved data resets the UI", async () => {
    const p = await boot(); p.click("clearBtn");
    assert.strictEqual(p.$("genBtn").disabled, true); assert.strictEqual(p.win.localStorage.getItem("iqs_state_v2"), null);
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
