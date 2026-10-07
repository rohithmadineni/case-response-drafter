/**
 * Popup UI. Reads the open Salesforce case (extract.js), summarises it and drafts the next IQS-compliant email
 * with the engine in engine.js. Everything runs locally; nothing is sent anywhere.
 */
(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const STORE_KEY = "iqs_state_v2", SIG_KEY = "iqs_signature_v2", TTL_MS = 8 * 60 * 60 * 1000;
  const DEFAULT_SIG = { name: "Rohith Madineni", designation: "Customer Success Engineer – Proactive Support" };
  const SF_RE = /^https:\/\/[^/]+\.(salesforce\.com|force\.com|cloudforce\.com)(\/|$)/i;
  const hasChrome = typeof chrome !== "undefined" && chrome.tabs && chrome.scripting;

  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } },
    del(k) { try { localStorage.removeItem(k); } catch (e) { /* storage unavailable */ } }
  };

  const S = { c: null, comments: [], S1: null, warnings: [], busy: false, type: "", LAST_TYPE: "" };

  // ---------- tiny DOM helper (text only – never innerHTML with case data) ----------
  function h(tag, props, ...kids) {
    const e = document.createElement(tag);
    Object.entries(props || {}).forEach(([k, v]) => { if (k === "class") e.className = v; else if (v != null) e.setAttribute(k, v); });
    kids.flat().forEach((k) => { if (k != null && k !== false) e.append(k.nodeType ? k : document.createTextNode(String(k))); });
    return e;
  }
  let toastTimer;
  function toast(msg) {
    const t = $("toast"); t.textContent = msg; t.classList.remove("hidden");
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.add("hidden"), 2200);
  }
  function getSig() { const s = store.get(SIG_KEY, null); return s && s.name ? s : DEFAULT_SIG; }
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

  // ---------- reading the case ----------
  async function readPage() {
    if (!hasChrome) throw new Error("Not running inside the browser extension – use \"Paste case details instead\".");
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const tab = tabs && tabs[0];
    if (!tab || tab.id == null) throw new Error("No active tab found.");
    if (tab.url && !SF_RE.test(tab.url)) throw new Error("The active tab is not a Salesforce page. Open the case, then press ↻.");
    let res;
    try { res = await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["extract.js"] }); }
    catch (e) { throw new Error("Could not read this tab (" + ((e && e.message) || e) + "). Reload the Salesforce page and try again."); }
    const r = res && res[0] && res[0].result;
    if (!r) throw new Error("The page returned no data. Reload the case page and try again.");
    return r;
  }

  function byDate(a, b) { const x = a.CreatedDate || "", y = b.CreatedDate || ""; return x < y ? -1 : x > y ? 1 : 0; }

  function analyse(c, comments) {
    try { return { S1: localSummary(c, comments), err: "" }; }
    catch (e) { return { S1: null, err: "Could not summarise this case: " + ((e && e.message) || e) }; }
  }

  function applyCase(c, comments, warnings, opts) {
    const prev = S.c && S.c.CaseNumber;
    const list = (comments || []).slice(0, 400).map((x) => ({ CommentBody: String(x.CommentBody || "").slice(0, 8000), CreatedDate: x.CreatedDate || "", "CreatedBy.Name": x["CreatedBy.Name"] || "" }));
    if (list.every((x) => x.CreatedDate)) list.sort(byDate);
    const a = analyse(c, list);
    S.c = c; S.comments = list; S.S1 = a.S1; S.warnings = (warnings || []).concat(a.err ? [a.err] : []);
    if (prev && prev !== c.CaseNumber) { $("notes").value = ""; $("draftOut").classList.add("hidden"); }
    renderAll();
    if (!(opts && opts.noPersist)) persist();
  }

  function persist() {
    if (!S.c) return;
    store.set(STORE_KEY, { c: S.c, comments: S.comments, warnings: S.warnings, notes: $("notes").value, type: $("typeSel").value, days: $("daysSel").value, savedAt: Date.now() });
  }

  async function loadFromPage(soft) {
    if (S.busy) return;
    S.busy = true; $("reloadBtn").classList.add("spin");
    try {
      const r = await readPage();
      if (!r.ok) {
        S.warnings = r.warnings && r.warnings.length ? r.warnings : ["This does not look like a case page."];
        if (!S.c) renderAll(); else renderWarnings(true);
        if (!soft) toast("No case found on this page");
        return;
      }
      applyCase(r.case, r.comments, r.warnings);
      if (!soft) toast("Read " + r.comments.length + " history item" + (r.comments.length === 1 ? "" : "s"));
    } catch (e) {
      S.warnings = [e.message || String(e)];
      if (!S.c) renderAll(); else renderWarnings(true);
      if (!soft) toast("Could not read the page");
    } finally { S.busy = false; $("reloadBtn").classList.remove("spin"); }
  }

  // ---------- rendering ----------
  function renderAll() { renderCase(); renderSummary(); fillTypes(); $("genBtn").disabled = !S.S1; }

  function renderWarnings(isErr) {
    const ul = $("warnings"); ul.replaceChildren();
    (S.warnings || []).forEach((w) => ul.append(h("li", { class: isErr ? "err" : "" }, w)));
    ul.classList.toggle("hidden", !ul.children.length);
  }

  function renderCase() {
    const has = !!S.c;
    $("caseEmpty").classList.toggle("hidden", has); $("caseFull").classList.toggle("hidden", !has);
    $("caseCard").classList.toggle("empty", !has);
    if (has) {
      $("caseNo").textContent = "Case " + (S.c.CaseNumber || "—");
      $("caseStatus").textContent = S.c.Status || "Status ?"; $("casePrio").textContent = S.c.Priority || "";
      $("casePrio").classList.toggle("hidden", !S.c.Priority);
      $("caseSubject").textContent = S.c.Subject || "(no subject)"; $("caseSubject").title = S.c.Subject || "";
      $("caseAccount").textContent = S.c["Account.Name"] || "Account not found";
      $("caseStage").textContent = S.S1 ? S.S1.suggested_stage : "";
      $("caseStage").classList.toggle("hidden", !S.S1);
    }
    renderWarnings(!has);
  }

  function section(title, body, cls) { return h("div", { class: "sec " + (cls || "") }, h("h4", null, title), body); }
  const list = (items) => h("ul", null, items.filter(Boolean).map((t) => h("li", null, typeof t === "string" ? t : JSON.stringify(t))));

  function renderSummary() {
    const box = $("summaryBody"); box.replaceChildren();
    const s = S.S1;
    if (!s) { box.append(h("p", { class: "hint" }, S.c ? "Summary unavailable – see the warning above." : "Nothing loaded yet.")); return; }

    const flags = (s.risks_or_flags || []).concat((s.unanswered_customer_questions || []).map((q) => "Customer asked: " + q));
    if (flags.length) box.append(section("Check before sending", list(flags), "flag"));

    const rows = [
      ["Next email", (STAGE_TO_TYPE[s.suggested_stage] || "—")],
      ["Contact", s.contact_name], ["Cluster", s.cluster], ["Health now", s.current_health],
      ["Rubrik emails", String(s.rubrik_customer_emails_total)],
      ["Follow-ups", s.rubrik_followups_since_last_customer_reply ? s.rubrik_followups_since_last_customer_reply + " since the customer last replied" : ""],
      ["Promised update", s.last_rubrik_email && s.last_rubrik_email.promised_next_update]
    ].filter((r) => r[1]);
    const dl = h("dl", { class: "kv" });
    rows.forEach(([k, v]) => dl.append(h("dt", null, k), h("dd", null, v)));
    box.append(section("Where this case stands", dl));

    if (s.alert || (s.nodes || []).length) {
      const body = h("div", null, s.alert ? h("p", null, s.alert) : null,
        (s.nodes || []).length ? list(s.nodes.map((n) => n.node + (n.incident_utc ? " · " + n.incident_utc + " UTC" : ""))) : null);
      box.append(section("Alert", body));
    }
    if ((s.open_asks_to_customer || []).length) box.append(section("Waiting on the customer for", list(s.open_asks_to_customer)));
    if (s.last_customer_message && s.last_customer_message.summary) {
      box.append(section("Last customer message" + (s.last_customer_message.date ? " · " + s.last_customer_message.date : ""), h("p", null, s.last_customer_message.summary.slice(0, 300))));
    }
    const tl = s.timeline || [];
    if (tl.length) {
      const recent = tl.slice(-6), older = tl.slice(0, -6);
      const body = h("div", null, list(recent), older.length ? h("details", null, h("summary", null, "Earlier (" + older.length + ")"), list(older)) : null);
      box.append(section("Timeline", body));
    }
    if ((s.evidence || []).length) box.append(section("Evidence found", list(s.evidence)));
    // actions already visible in the timeline (e.g. "alert cleared for X") are not repeated
    const tlText = tl.join("\n").toLowerCase();
    const actions = (s.actions_taken || []).filter((a) => !tlText.includes(a.split(" on ")[0].toLowerCase()));
    if (actions.length) box.append(section("Actions so far", list(actions)));
  }

  function fillTypes() {
    const sel = $("typeSel"), keep = sel.value;
    const suggested = S.S1 ? STAGE_TO_TYPE[S.S1.suggested_stage] : "";
    sel.replaceChildren(h("option", { value: "" }, suggested ? "Auto – " + suggested : "Auto"));
    DRAFT_TYPES.forEach((t) => sel.append(h("option", { value: t }, t)));
    if (keep && DRAFT_TYPES.includes(keep)) sel.value = keep;
  }

  // ---------- drafting ----------
  function runChecks(type, text) {
    const rs = iqsCheck(type, text, S.S1 || {});
    const ul = $("iqs"); ul.replaceChildren();
    rs.forEach((x) => ul.append(h("li", { class: x.ok ? "pass" : "fail" }, x.ok ? "✔" : "✘", " ", x.label)));
    const ok = rs.filter((x) => x.ok).length, pct = rs.length ? ok / rs.length : 1;
    const pill = $("score"); pill.textContent = "IQS " + ok + "/" + rs.length;
    pill.className = "pill " + (pct === 1 ? "ok" : pct >= 0.8 ? "warn" : "bad");
  }

  function generate() {
    if (!S.S1 || !S.c) { toast("Load a case first"); return; }
    const type = $("typeSel").value || STAGE_TO_TYPE[S.S1.suggested_stage] || "Update with findings";
    const days = clamp(parseInt($("daysSel").value, 10) || 2, 1, 14);
    const notes = $("notes").value;
    let draft;
    try { draft = buildDraft(type, S.c, S.comments, S.S1, notes, days); }
    catch (e) { toast("Could not build the draft: " + ((e && e.message) || e)); return; }
    if (!draft) { toast("No template for “" + type + "”"); return; }
    draft = personalize(draft, getSig());
    S.type = type;
    $("draftTitle").textContent = type + (S.c.CaseNumber ? " · " + S.c.CaseNumber : "");
    $("draft").value = draft;
    let rd = "";
    try { rd = resolutionDetails(type, S.c, S.comments, S.S1, notes); } catch (e) { rd = ""; }
    $("resWrap").classList.toggle("hidden", !rd); $("resdet").value = rd;
    runChecks(type, draft);
    $("draftOut").classList.remove("hidden");
    $("genHint").textContent = $("typeSel").value ? "" : "Type chosen from the case history.";
    $("draft").scrollIntoView({ block: "nearest" });
    persist();
  }

  async function copyText(text, label) {
    try { await navigator.clipboard.writeText(text); }
    catch (e) {
      const ta = h("textarea", { style: "position:fixed;opacity:0" }); ta.value = text; document.body.append(ta); ta.select();
      let ok = false; try { ok = document.execCommand("copy"); } catch (e2) { ok = false; }
      ta.remove(); if (!ok) { toast("Copy failed – select the text and copy manually"); return; }
    }
    toast((label || "Draft") + " copied");
  }

  // ---------- paste fallback ----------
  function usePasted() {
    let comments = [];
    try { comments = parseInput($("pHist").value); } catch (e) { toast("Could not parse the pasted history"); return; }
    const subj = $("pSubject").value.trim();
    const c = {
      CaseNumber: $("pCase").value.trim() || "[CASE NUMBER]", Subject: subj, "Account.Name": (subj.match(/^\[([^\]]+)\]/) || [])[1] || "",
      Status: $("pStatus").value.trim(), Priority: "", Resolution__c: "", Description: $("pDesc").value
    };
    if (!c.Description.trim() && !comments.length) { toast("Paste a description and/or history first"); return; }
    applyCase(c, comments, comments.length ? [] : ["No history parsed from the pasted text – drafting from the description only."]);
    toast("Using pasted details · " + comments.length + " item" + (comments.length === 1 ? "" : "s"));
    $("pasteBox").open = false;
  }

  // ---------- tabs / settings ----------
  function showTab(name) {
    document.querySelectorAll(".tab").forEach((t) => { const on = t.dataset.tab === name; t.classList.toggle("active", on); t.setAttribute("aria-selected", String(on)); });
    $("pane-summary").classList.toggle("hidden", name !== "summary"); $("pane-draft").classList.toggle("hidden", name !== "draft");
  }
  function openSettings() { const s = getSig(); $("sigName").value = s.name; $("sigDesig").value = s.designation; $("settings").classList.remove("hidden"); $("sigName").focus(); }
  function closeSettings() { $("settings").classList.add("hidden"); }

  function bind() {
    document.querySelectorAll(".tab").forEach((t, i, all) => {
      t.addEventListener("click", () => showTab(t.dataset.tab));
      t.addEventListener("keydown", (e) => { if (e.key === "ArrowRight" || e.key === "ArrowLeft") { const n = all[(i + (e.key === "ArrowRight" ? 1 : all.length - 1)) % all.length]; n.focus(); showTab(n.dataset.tab); } });
    });
    $("reloadBtn").addEventListener("click", () => loadFromPage(false));
    $("settingsBtn").addEventListener("click", openSettings);
    $("closeSettings").addEventListener("click", closeSettings);
    $("settings").addEventListener("click", (e) => { if (e.target === $("settings")) closeSettings(); });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeSettings();
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && !$("genBtn").disabled) { e.preventDefault(); showTab("draft"); generate(); }
    });
    $("saveSig").addEventListener("click", () => {
      const name = $("sigName").value.trim(), designation = $("sigDesig").value.trim();
      if (!name) { toast("Enter a name"); return; }
      store.set(SIG_KEY, { name, designation: designation || DEFAULT_SIG.designation }); toast("Sign-off saved"); closeSettings();
    });
    $("resetSig").addEventListener("click", () => { store.del(SIG_KEY); openSettings(); toast("Sign-off reset"); });
    $("clearBtn").addEventListener("click", () => {
      if (!confirm("Clear the saved case, notes and draft?")) return;
      store.del(STORE_KEY); S.c = null; S.comments = []; S.S1 = null; S.warnings = [];
      $("notes").value = ""; $("draft").value = ""; $("draftOut").classList.add("hidden"); renderAll(); closeSettings(); toast("Cleared");
    });
    $("genBtn").addEventListener("click", generate);
    $("copyBtn").addEventListener("click", () => copyText($("draft").value, "Draft"));
    $("copyResBtn").addEventListener("click", () => copyText($("resdet").value, "Resolution details"));
    $("draft").addEventListener("input", () => runChecks(S.type || "", $("draft").value));
    $("usePasteBtn").addEventListener("click", usePasted);
    $("pasteBox").addEventListener("toggle", () => {
      if (!$("pasteBox").open || !S.c) return;
      const f = (id, v) => { if (!$(id).value && v) $(id).value = v; };
      f("pCase", /^\[/.test(S.c.CaseNumber) ? "" : S.c.CaseNumber); f("pStatus", S.c.Status); f("pSubject", S.c.Subject); f("pDesc", S.c.Description);
    });
    ["notes", "typeSel", "daysSel"].forEach((id) => $(id).addEventListener("change", persist));
    $("notes").addEventListener("input", () => { clearTimeout(bind.t); bind.t = setTimeout(persist, 400); });
  }

  function init() {
    bind(); fillTypes();
    const saved = store.get(STORE_KEY, null);
    if (saved && saved.c && Date.now() - (saved.savedAt || 0) < TTL_MS) {
      $("notes").value = saved.notes || ""; $("daysSel").value = saved.days || "2";
      applyCase(saved.c, saved.comments || [], saved.warnings || [], { noPersist: true });
      if (saved.type && DRAFT_TYPES.includes(saved.type)) $("typeSel").value = saved.type;
    } else if (saved) store.del(STORE_KEY);
    if (hasChrome) loadFromPage(true);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
