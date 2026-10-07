/**
 * Salesforce case-page reader. Injected into the active tab by the popup (chrome.scripting, files: ["extract.js"]).
 * Returns { ok, case, comments, warnings, source } where case/comments use the same field names as the
 * Salesforce queries the drafting engine understands (CaseNumber, Subject, Description, Status, Account.Name;
 * CommentBody, CreatedDate, CreatedBy.Name).
 *
 * Strategies, best first:
 *   1. Lightning record fields   [data-target-selection-name="sfdc:RecordField.Case.<Api>"]
 *   2. Classic / label-value DOM (th.labelCol + td.dataCol)
 *   3. Label/value line pairs in the visible text (Lightning prints the label and value on separate lines)
 * History items come from the activity timeline / feed DOM; if none are found the visible text is split on
 * email headers. Duplicates (collapsed snippet + expanded body, or the same item in two panels) are merged.
 * Nothing here sends data anywhere.
 */
function extractCase(doc, loc) {
  const warnings = [];
  // innerText (real browsers) keeps line breaks; the fallback honours <br> and block elements so it behaves the same elsewhere
  const flat = (el) => (el.innerHTML || "").replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|div|li|tr|h\d)>/gi, "\n").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
  const text = (el) => (el ? (el.innerText != null ? el.innerText : flat(el)) : "").replace(/ /g, " ").trim();
  const bodyText = text(doc.body);
  const lines = bodyText.split("\n").map((l) => l.trim()).filter(Boolean);

  // ---------- fields ----------
  const fields = {};
  doc.querySelectorAll('[data-target-selection-name^="sfdc:RecordField.Case."]').forEach((el) => {
    const api = el.getAttribute("data-target-selection-name").replace("sfdc:RecordField.Case.", "");
    const valEl = el.querySelector(".test-id__field-value, .slds-form-element__static, lightning-formatted-text, lightning-formatted-rich-text");
    const v = text(valEl || el).replace(new RegExp("^" + api + "\\s*", "i"), "");
    if (v && !(api in fields)) fields[api] = v;
  });
  doc.querySelectorAll("th.labelCol").forEach((th) => {
    const td = th.nextElementSibling;
    if (td && td.classList.contains("dataCol")) fields["label:" + text(th).toLowerCase()] = text(td);
  });
  const KNOWN = ["Case Number", "Subject", "Status", "Priority", "Case Owner", "Account Name", "Account", "Description", "Date/Time Opened", "Case Origin", "Type", "Contact Name"];
  const pair = (label) => {
    const i = lines.findIndex((l) => l.replace(/:$/, "").toLowerCase() === label.toLowerCase());
    if (i < 0) return "";
    for (let j = i + 1; j < Math.min(lines.length, i + 4); j++) {
      const v = lines[j];
      if (/^(edit|help|copy|show more|more actions)\b/i.test(v) || KNOWN.some((k) => k.toLowerCase() === v.toLowerCase())) continue;
      return v;
    }
    return "";
  };
  const field = (api, ...labels) => fields[api] || labels.map((l) => fields["label:" + l.toLowerCase()]).find(Boolean) || labels.map(pair).find(Boolean) || "";

  // case number: field → title → page header → "Case 0123…" near the top of the page
  let caseNumber = (field("CaseNumber", "Case Number").match(/\b0\d{7}\b/) || [])[0] || "";
  if (!caseNumber) caseNumber = (doc.title.match(/\b0\d{7}\b/) || [])[0] || "";
  if (!caseNumber) caseNumber = (text(doc.querySelector(".slds-page-header, .entityNameTitle, h1")).match(/\b0\d{7}\b/) || [])[0] || "";
  if (!caseNumber) caseNumber = (bodyText.slice(0, 6000).match(/\bCase(?:\s+Number)?\s*[:#]?\s*(0\d{7})\b/i) || [])[1] || "";

  let subject = field("Subject", "Subject");
  if (!subject) subject = doc.title.replace(/\s*\|\s*Salesforce.*$/i, "").replace(/^\s*0\d{7}\s*\|\s*(Case\s*\|\s*)?/i, "").trim();

  // Description: the field, or the alert block anywhere on the page (the field can be collapsed/truncated)
  let description = field("Description", "Description");
  const blockStart = bodyText.search(/(?:The automated alert processing system|Summary of Alert:)/i);
  if (blockStart >= 0 && !/Incident Time \(UTC\)|Cluster UUID/i.test(description)) {
    const block = bodyText.slice(blockStart, blockStart + 3500);
    const end = block.search(/Incident Time \(UTC\):[^\n]*/i);
    const cut = end >= 0 ? end + (block.slice(end).match(/Incident Time \(UTC\):[^\n]*/i) || [""])[0].length : Math.min(block.length, 1500);
    const alertBlock = block.slice(0, cut);
    if (alertBlock.length > description.length) description = alertBlock;
  }
  if (/\.\.\.$|…$/.test(description) || /\bShow more\b/i.test(description)) warnings.push("The Description looks truncated – click 'Show more' on the case and reload.");

  const c = {
    CaseNumber: caseNumber,
    Subject: subject.slice(0, 250),
    "Account.Name": field("AccountId", "Account Name", "Account").slice(0, 150),
    Status: field("Status", "Status").slice(0, 80),
    Priority: field("Priority", "Priority").slice(0, 60),
    Owner: field("OwnerId", "Case Owner").slice(0, 100),
    Resolution__c: field("Resolution__c", "Resolution"),
    Description: description.slice(0, 6000),
  };
  if (!caseNumber) warnings.push("Could not find a case number on this page – open a Case record page.");
  if (!subject) warnings.push("Could not read the case subject.");

  // ---------- history ----------
  const DATE_RE = /(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?(?:Z|[+-]\d{4})?)|(\d{1,2}\/\d{1,2}\/\d{2,4},?\s+\d{1,2}:\d{2}(?::\d{2})?\s*(?:AM|PM)?)|((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.? \d{1,2},? \d{4},?\s+\d{1,2}:\d{2}\s*(?:AM|PM)?)/i;
  const toIso = (s) => {
    if (!s) return "";
    const t = Date.parse(s.replace(/(\d{4}-\d{2}-\d{2}) (\d)/, "$1T$2"));
    return isNaN(t) ? "" : new Date(t).toISOString().replace(/\.\d{3}Z$/, ".000+0000");
  };
  const items = [];
  const ITEM_SEL = ".slds-timeline__item_expandable, li.slds-timeline__item, article.slds-timeline__item, .cuf-feed-item, .forceChatterFeedItem, .feeditem, [data-target-selection-name*='CaseComment'], [data-target-selection-name*='EmailMessage']";
  doc.querySelectorAll(ITEM_SEL).forEach((el, idx) => {
    if (el.parentElement && el.parentElement.closest(ITEM_SEL)) return; // only outermost
    const raw = text(el);
    if (raw.length < 15) return;
    const m = raw.match(DATE_RE);
    const by = text(el.querySelector(".slds-timeline__actors a, .feeditemfirstentity a, .cuf-entityLink, a[data-refid='recordId']"));
    // keep the message itself: the author and timestamp are carried in their own fields, not repeated in the body
    let body = raw;
    if (by) body = body.replace(by, "");
    if (m) body = body.replace(m[0], "");
    body = body.replace(/\n{3,}/g, "\n\n").trim();
    items.push({ CommentBody: body.length >= 15 ? body : raw, CreatedDate: toIso(m ? m[0] : ""), "CreatedBy.Name": by, _i: idx });
  });
  let source = "timeline";
  if (!items.length) {
    source = "page-text";
    // Split the visible text at email headers / alert-bot lines.
    const startAt = Math.max(0, bodyText.search(/\b(Activity|Case Comments|Feed|History)\b/));
    const chunks = bodyText.slice(startAt).split(/\n(?=From:\s|Alert Bot\b|Support Bot\b)/i);
    chunks.forEach((ch, idx) => {
      ch = ch.trim();
      if (ch.length < 25 || !/From:\s|Removed .* from impacted nodes|Alert Bot|Current Status:/i.test(ch)) return;
      const m = ch.match(DATE_RE);
      items.push({ CommentBody: ch.slice(0, 6000), CreatedDate: toIso(m ? m[0] : ""), "CreatedBy.Name": /^Alert Bot/i.test(ch) ? "alert bot" : "", _i: idx });
    });
  }

  // de-duplicate: compare the message core (no author/date/header lines); merge an item into a longer one that
  // contains it when the dates agree (or one is undated). Identical emails on different dates are kept.
  const norm = (s) => s.toLowerCase().replace(/\s+/g, " ").replace(/[^\p{L}\p{N} ]/gu, "").trim();
  const core = (it) => {
    let t = it.CommentBody.replace(new RegExp(DATE_RE.source, "gi"), " ");
    if (it["CreatedBy.Name"]) t = t.split(it["CreatedBy.Name"]).join(" ");
    t = t.replace(/^\s*(From|To|Cc|Bcc|Subject|Sent|Date)\s*:.*$/gim, " ");
    return norm(t);
  };
  const sorted = items.map((it) => Object.assign(it, { _c: core(it) })).filter((it) => it._c.length >= 12).sort((a, b) => b._c.length - a._c.length);
  const kept = [];
  sorted.forEach((it) => {
    const probe = it._c.slice(0, 120);
    const dup = kept.some((k) => (!k.CreatedDate || !it.CreatedDate || k.CreatedDate === it.CreatedDate) && (k._c === it._c || k._c.includes(probe)));
    if (!dup) kept.push(it);
  });
  const dropped = items.length - kept.length;
  const dated = kept.filter((k) => k.CreatedDate).length;
  kept.sort((a, b) => (dated === kept.length ? (a.CreatedDate < b.CreatedDate ? -1 : a.CreatedDate > b.CreatedDate ? 1 : 0) : b._i - a._i));
  if (kept.length && dated < kept.length) warnings.push("Some history items have no readable date – the order was inferred from the page (newest first).");
  const comments = kept.map(({ _c, _i, ...rest }) => rest);

  if (/\b(Show more|View more|View All|Load more)\b/i.test(bodyText) && comments.length) warnings.push("The page shows 'Show more / View All' – older history may not be loaded. Expand it and reload, or paste the full history.");
  if (!comments.length) warnings.push("No case history could be read from this page. Open the Activity/Comments tab, or paste the history below.");

  return { ok: !!caseNumber, case: c, comments, warnings, source, stats: { found: items.length, merged: dropped, kept: comments.length } };
}

(typeof module !== "undefined" && module.exports) ? (module.exports = { extractCase }) : extractCase(document, location);
