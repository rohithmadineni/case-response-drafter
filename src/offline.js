const $ = id => document.getElementById(id);
function msg(t, err){ const m=$("msg"); m.textContent=t||""; m.className="status"+(err?" err":""); }
const LSO = { get(k,d){ try{ const v=localStorage.getItem(k); return v?JSON.parse(v):d; }catch(e){ return d; } }, set(k,v){ try{ localStorage.setItem(k, JSON.stringify(v)); }catch(e){} } };

// ---------- input parsing (all local) ----------
function parseCSV(text){
  const rows=[]; let row=[], cell="", q=false;
  for (let i=0;i<text.length;i++){
    const ch=text[i];
    if (q){ if (ch==='"'){ if (text[i+1]==='"'){ cell+='"'; i++; } else q=false; } else cell+=ch; }
    else if (ch==='"') q=true;
    else if (ch===','){ row.push(cell); cell=""; }
    else if (ch==='\n' || ch==='\r'){ if (ch==='\r' && text[i+1]==='\n') i++; row.push(cell); rows.push(row); row=[]; cell=""; }
    else cell+=ch;
  }
  if (cell || row.length){ row.push(cell); rows.push(row); }
  const head = rows.shift().map(h=>h.trim().replace(/^"|"$/g,""));
  const ix = n => head.findIndex(h=>h.toLowerCase()===n.toLowerCase());
  const ib = ix("CommentBody"), id = ix("CreatedDate"), iw = Math.max(ix("CreatedBy.Name"), ix("CreatedBy"), ix("Created By"));
  return rows.filter(r=>r.length>1).map(r=>({ CommentBody: r[ib]||"", CreatedDate: r[id]||"", "CreatedBy.Name": iw>=0 ? r[iw] : "" }));
}
function toIso(s){
  if (!s) return "";
  const t = Date.parse(String(s).replace(/(\d{1,2})(st|nd|rd|th)/,"$1").replace(/\bat\b/,""));
  return isNaN(t) ? "" : new Date(t).toISOString().replace(/\.\d{3}Z$/,".000+0000");
}
function parseThread(text){
  const parts = ("\n"+text).split(/\n(?=\s*From:\s)/).map(s=>s.trim()).filter(Boolean);
  return parts.map(p=>{
    const date = (p.match(/^\s*(?:Sent|Date|Envoyé)\s*:\s*(.+)$/im)||[])[1] || (p.match(/(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(?::\d{2})?)/)||[])[1] || "";
    return { CommentBody: p, CreatedDate: toIso(date), "CreatedBy.Name": /From:\s*\S*rubrik\.com/i.test(p) ? "Rubrik" : "Support Bot" };
  });
}
function parseInput(text){
  text = String(text||"").replace(/\r\n/g,"\n").trim();
  if (!text) return [];
  if (/Record \d+:/.test(text)) return parseRecords("\n" + text);
  const firstLine = text.split("\n")[0];
  if (/CommentBody/i.test(firstLine) && firstLine.includes(",")) return parseCSV(text);
  if (/^\s*\[/.test(text)) { try { const a = JSON.parse(text); return a.map(x=>({ CommentBody:x.CommentBody||x.body||"", CreatedDate:x.CreatedDate||x.date||"", "CreatedBy.Name":(x.CreatedBy&&x.CreatedBy.Name)||x["CreatedBy.Name"]||x.author||"" })); } catch(e){} }
  return parseThread(text);
}

// ---------- drafting (local templates) ----------
function dateStr(days){ return plusDays(days) + ", 12:00 PM UTC"; }
function noteField(notes, key){ const m = String(notes||"").match(new RegExp(key + "\\s*[:\\-]\\s*([^\\n]+)", "i")); return m ? m[1].trim() : ""; }
function hello(S1){ return "Hello " + (S1.contact_name && S1.contact_name!=="Team" ? S1.contact_name : "Team") + ","; }
function extraTemplate(type, c, comments, S1, notes, days){
  const f = facts(c, comments), date = dateStr(days);
  const rc = noteField(notes,"root cause") || "[ROOT CAUSE IN PLAIN LANGUAGE]";
  const act = noteField(notes,"action(?: taken)?") || "[WHAT WAS DONE]";
  const node = f.node ? `node ${f.node}` : "the affected node";
  const ev = (S1.evidence||[]).slice(0,3).map(e=>"* "+e).join("\n");
  if (/Update with findings/.test(type)) return `${hello(S1)}\n\nThank you for your patience while we investigated this alert.\n\nFindings:\nWe reviewed ${node} on cluster ${f.tag}. ${rc}\n${ev ? "\nWhat we observed:\n" + ev + "\n" : ""}\nBusiness Impact:\n${impactFor(f)}\n\nNext Steps:\n[NEXT STEP / ASK]\n\nWe will share an update by ${date}, or sooner if we have more to share.\n\n${MON_TXT}\n\n${SIGN_TXT}`;
  if (/Approval request/.test(type)) return `${hello(S1)}\n\nThank you for your patience while we investigated this alert.\n\nWe found that ${rc.replace(/^[A-Z]/, s=>s.toLowerCase())}\n\nTo resolve this, we recommend ${act.replace(/^[A-Z]/, s=>s.toLowerCase())}. [DOWNTIME: none / about N minutes]. This will prevent the alert from recurring.\n\nCould you please confirm if we can proceed with this change? If we haven't heard back, we will follow up by ${date}.\n\n${MON_TXT}\n\n${SIGN_TXT}`;
  if (/Proceeding/.test(type)) return `${hello(S1)}\n\nThank you for the confirmation.\n\nWe will now proceed with ${act === "[WHAT WAS DONE]" ? "[THE ACTIVITY]" : act.replace(/^[A-Z]/, s=>s.toLowerCase())}. Once it's done, we will check the cluster's health and confirm everything is working normally.\n\nWe will share an update by ${date}, or sooner once the activity is complete.\n\n${MON_TXT}\n\n${SIGN_TXT}`;
  if (/Short summary/.test(type)) return `${hello(S1)}\n\nThank you for your help.\n\nHere is a short summary of this case:\n\n* Our proactive monitoring detected ${f.type || "an alert"} on ${node} in cluster ${f.tag}${f.time ? " on " + f.time + " UTC" : ""}.\n* ${rc}\n* ${act}\n* The cluster is currently healthy with no further alerts.\n\nSince the cluster is healthy, could you please confirm if we can close this case? If we don't hear back, we will follow up by ${date}.\n\n${MON_TXT}\n\n${SIGN_TXT}`;
  if (/Ghosted/.test(type)){
    const rub = comments.filter(x=>classify(x)==="rubrik").map(x=>(x.CreatedDate||"").slice(0,10)).filter(Boolean);
    const first = rub.length ? rub[0] : "[FIRST DATE]", last = rub.length ? rub[rub.length-1] : "[LAST DATE]";
    return `Hello Team,\n\nThank you for your patience while we followed up on this alert.\n\nProblem Summary:\nOur proactive monitoring detected ${f.type || "an alert"} on ${node} in cluster ${f.tag}${f.time ? " on " + f.time + " UTC" : ""}.\n\nOutreach Summary:\nBetween ${first} and ${last}, we sent ${S1.rubrik_followups_since_last_customer_reply || "several"} emails asking for ${(S1.open_asks_to_customer||[]).join(", ").toLowerCase() || "[WHAT WE ASKED FOR]"}, but we were unable to reach your team.\n\nCurrent Status:\n${S1.current_health && S1.current_health!=="Not stated" ? S1.current_health : "[CURRENT STATUS]"}. [If not verified: Without tunnel access, we were not able to check this directly.]\n\nNext Steps:\n\n* If the issue is still present, please reply to this thread and enable the support tunnel, and we will pick this up right away.\n* If any new alerts are triggered on this cluster, we will reach out to you.\n\nAs we have not received a response and the cluster is currently stable, we are proceeding to close this case. You can reopen it at any time by replying to this email.\n\n${SIGN_TXT}`;
  }
  return null;
}
function buildDraft(type, c, comments, S1, notes, days){
  let draft = extraTemplate(type, c, comments, S1, notes, days);
  if (!draft){
    const t = templateDraft(type, c, comments);
    draft = t ? t.draft : null;
  }
  if (!draft) return null;
  if (/Follow-up/.test(type)){
    const asks = S1.open_asks_to_customer || [];
    const tunnelBlock = "Could you please enable the support tunnel for the cluster so we can begin our investigation?\nApp Tray → Settings → Customer Support → Support Tunnel";
    if (asks.length && !asks.some(a=>/tunnel/i.test(a))) draft = draft.replace(tunnelBlock, "Could you please help us with the following so we can complete our investigation?\n\n" + asks.map(a=>"* " + a).join("\n"));
  }
  draft = draft.replace(new RegExp(plusDays(2).replace(/[.*+?^${}()|[\]\\]/g,"\\$&"), "g"), plusDays(days));
  if (S1.contact_name && S1.contact_name!=="Team" && !/Initial Response/.test(type)) draft = draft.replace(/^Hello Team,/, `Hello ${S1.contact_name},`);
  const rc = noteField(notes,"root cause"), act = noteField(notes,"action(?: taken)?"), dup = noteField(notes,"duplicate(?: of)?");
  if (rc) draft = draft.replace("[ROOT CAUSE IN PLAIN LANGUAGE]", rc);
  if (act) draft = draft.replace("[What was done]", act).replace("[What was done and validated.]", act);
  if (dup) draft = draft.replace(/\[OTHER CASE NUMBER\]/g, dup);
  draft = draft.replace("[What was investigated]", "Reviewed the node status history and logs around the incident time.");
  return scrub(draft);
}
function resolutionDetails(type, c, comments, S1, notes){
  if (!/closure/i.test(type)) return "";
  const f = facts(c, comments);
  const rc = noteField(notes,"root cause") || "[cause]", act = noteField(notes,"action(?: taken)?") || "[action taken]";
  return `${f.type || "Alert"} on ${f.node ? "node " + f.node : "the cluster"} (cluster ${f.tag}): ${rc} ${act}. The cluster has been confirmed healthy with no further alerts.`.replace(/\.\s*\./g,".");
}

// ---------- IQS check (local) ----------
function iqsCheck(type, text, S1){
  const isClose = /closure/i.test(type);
  const r = [];
  const add = (ok, label) => r.push({ ok, label });
  add(!/\bdata loss\b/i.test(text), 'No "data loss" wording');
  add(!/No data disruption to backup\/restore operations was observed/i.test(text), 'No "No data disruption…" line');
  add(!/\barchive\b/i.test(text), 'Uses "close", not "archive"');
  add(!/\*\*|^#{1,6}\s/m.test(text), "Plain text (no markdown)");
  add(/Thanks and Regards,\s*\n\s*\nRohith Madineni\nCustomer Success Engineer – Proactive Support\nRubrik/.test(text) || /Regards,[\s\S]{0,40}\n[A-Z][a-z]+/.test(text), "Sign-off present");
  if (isClose){
    add(/Problem Summary:/i.test(text) || /Outreach Summary:/i.test(text) || /duplicate/i.test(text), "Problem summary");
    add(/Root Cause:/i.test(text) || /duplicate|Outreach Summary/i.test(text), "Root cause");
    add(/Resolution Steps:|Next Steps:/i.test(text) || /duplicate/i.test(text), "Resolution / next steps");
    add(/healthy|stable|no further alerts|confirmed/i.test(text), "Validation of current health");
    add(/recommend|prevent|going forward|reopen|reach out/i.test(text), "Prevention / follow-up or reopen invite");
  } else {
    add(new RegExp("by\\s+(?:" + MONTHS + ")\\s+\\d{1,2},\\s+\\d{4}", "i").test(text), "WHEN – concrete next-update date (Reliability)");
    add(/so (that )?we can|to (help|confirm|find|prevent|restore|check|complete|get|ensure)|because|this will|in order to/i.test(text), "WHY – reason for the finding or ask");
    add(/could you|please|we (have|found|confirmed|reviewed|will)/i.test(text), "WHAT – action or finding stated");
    if ((S1.rubrik_customer_emails_total||0) < 3) add(/Business Impact|could (affect|impact)|risk|reduced resiliency|redundancy/i.test(text), "Business impact (first 3 emails)");
    add(/monitored 24×7|monitored 24x7/i.test(text), "24×7 monitoring line");
  }
  const br = (text.match(/\[[A-Z][^\]]{2,60}\]/g)||[]);
  add(!br.length, br.length ? "Fill placeholders: " + [...new Set(br)].join(", ") : "No unfilled placeholders");
  return r;
}
function renderChecks(type, text, S1){
  const rs = iqsCheck(type, text, S1);
  $("iqs").innerHTML = rs.map(x=>`<li class="${x.ok?"pass":"fail"}">${x.ok?"✔":"✘"} ${esc(x.label)}</li>`).join("");
}

// ---------- main ----------
let LAST = null;
function run(){
  const comments = parseInput($("hist").value);
  comments.sort((a,b)=> (a.CreatedDate||"") < (b.CreatedDate||"") ? -1 : (a.CreatedDate||"") > (b.CreatedDate||"") ? 1 : 0);
  const subj = $("subject").value.trim();
  const c = { CaseNumber: $("caseNo").value.trim() || "[CASE NUMBER]", Subject: subj, "Account.Name": (subj.match(/^\[([^\]]+)\]/)||[])[1] || "", Status: $("statusIn").value.trim(), Resolution__c: "", Description: $("desc").value };
  if (!c.Description.trim() && !comments.length){ msg("Paste the case description and/or comment history first.", true); return; }
  const t0 = performance.now();
  const S1 = localSummary(c, comments);
  const ms = Math.max(1, Math.round(performance.now()-t0));
  let type = $("dtype").value; if (type==="Auto") type = STAGE_TO_TYPE[S1.suggested_stage] || "Update with findings";
  const days = Math.max(1, Math.min(14, parseInt($("fudays").value,10) || 2));
  const draft = buildDraft(type, c, comments, S1, $("notes").value, days);
  LAST = { c, comments, S1, type };
  renderSummary(S1, comments, ms);
  $("draftCard").classList.remove("hidden");
  $("draftTitle").textContent = "3. Draft – " + type;
  $("draft").value = draft || "No template for this email type. Pick another type.";
  const rd = resolutionDetails(type, c, comments, S1, $("notes").value);
  $("resWrap").classList.toggle("hidden", !rd); $("resdet").value = rd;
  renderChecks(type, $("draft").value, S1);
  msg(`Done in ${ms} ms. ${comments.length} comment(s) read.`);
  LSO.set("cdo_last", { caseNo:$("caseNo").value, subject:subj, status:$("statusIn").value, desc:$("desc").value, hist:$("hist").value.slice(0, 400000), notes:$("notes").value, dtype:$("dtype").value, days });
}
function renderSummary(S1, comments, ms){
  $("sumCard").classList.remove("hidden");
  $("sumTime").textContent = ms + " ms";
  const kv = [["Stage", S1.suggested_stage], ["Contact", S1.contact_name], ["Cluster", S1.cluster], ["Health now", S1.current_health], ["Follow-ups since reply", String(S1.rubrik_followups_since_last_customer_reply)], ["Rubrik emails", String(S1.rubrik_customer_emails_total)]];
  $("sumKv").innerHTML = kv.map(([k,v])=>`<div class="kv"><b>${esc(k)}</b><span>${esc(v||"—")}</span></div>`).join("");
  const li = a => (a||[]).filter(Boolean).map(x=>`<li>${esc(typeof x==="string"?x:JSON.stringify(x))}</li>`).join("");
  const nodes = (S1.nodes||[]).map(n=>`${n.node}${n.incident_utc?" · "+n.incident_utc:""}`);
  $("sumBody").innerHTML =
    (S1.alert?`<div class="note"><b>Alert:</b> ${esc(S1.alert)}</div>`:"") +
    (nodes.length?`<div class="note"><b>Nodes:</b> ${esc(nodes.join(" | "))}</div>`:"") +
    ((S1.timeline||[]).length?`<div class="note"><b>Timeline</b><ul class="tight">${li(S1.timeline)}</ul></div>`:"") +
    ((S1.evidence||[]).length?`<div class="note"><b>Evidence</b><ul class="tight">${li(S1.evidence)}</ul></div>`:"") +
    ((S1.actions_taken||[]).length?`<div class="note"><b>Actions</b><ul class="tight">${li(S1.actions_taken)}</ul></div>`:"") +
    ((S1.open_asks_to_customer||[]).length?`<div class="note"><b>Waiting on customer for</b><ul class="tight">${li(S1.open_asks_to_customer)}</ul></div>`:"") +
    (S1.last_rubrik_email && S1.last_rubrik_email.promised_next_update ? `<div class="note"><b>Last promised update:</b> ${esc(S1.last_rubrik_email.promised_next_update)}</div>` : "");
  const fl = (S1.risks_or_flags||[]).concat((S1.unanswered_customer_questions||[]).map(q=>"Customer asked: " + q));
  $("flagBox").classList.toggle("hidden", !fl.length); $("flags").innerHTML = li(fl);
  $("nComments").textContent = comments.length;
  $("parsed").innerHTML = comments.map(cm=>`<div>• ${esc((cm.CreatedDate||"no date").slice(0,16))} · ${esc(cm["CreatedBy.Name"]||"")} · ${esc(classify(cm))}</div>`).join("") || "None";
}

// ---------- events ----------
$("go").onclick = run;
$("recheck").onclick = ()=>{ if (LAST) renderChecks(LAST.type, $("draft").value, LAST.S1); };
$("draft").addEventListener("input", ()=>{ if (LAST) renderChecks(LAST.type, $("draft").value, LAST.S1); });
async function copyField(id, btn){ const v=$(id).value; try{ await navigator.clipboard.writeText(v); }catch(e){ $(id).select(); document.execCommand("copy"); } const t=btn.textContent; btn.textContent="Copied"; setTimeout(()=>btn.textContent=t,1200); }
$("copy").onclick = e=>copyField("draft", e.target);
$("copyRes").onclick = e=>copyField("resdet", e.target);
$("download").onclick = ()=>{ const blob = new Blob([$("draft").value], {type:"text/plain"}); const a=document.createElement("a"); a.href=URL.createObjectURL(blob); a.download=`case-${($("caseNo").value||"draft").replace(/\W+/g,"")}-draft.txt`; a.click(); URL.revokeObjectURL(a.href); };
$("clear").onclick = ()=>{ ["caseNo","subject","statusIn","desc","hist","notes"].forEach(id=>$(id).value=""); $("sumCard").classList.add("hidden"); $("draftCard").classList.add("hidden"); msg(""); LSO.set("cdo_last", null); };
function readFile(file){ const r = new FileReader(); r.onload = ()=>{ $("hist").value = String(r.result); msg(`Loaded ${file.name} (${Math.round(file.size/1024)} KB). Click Build.`); }; r.readAsText(file); }
$("file").onchange = e=>{ if (e.target.files[0]) readFile(e.target.files[0]); };
const drop = $("drop");
["dragenter","dragover"].forEach(ev=>drop.addEventListener(ev, e=>{ e.preventDefault(); drop.classList.add("over"); }));
["dragleave","drop"].forEach(ev=>drop.addEventListener(ev, e=>{ e.preventDefault(); drop.classList.remove("over"); }));
drop.addEventListener("drop", e=>{ const f = e.dataTransfer.files[0]; if (f) readFile(f); });
$("sample").onclick = ()=>{
  $("caseNo").value = "01324908";
  $("subject").value = "[MercedesAmgFormula1Team] Proactive Case: (Cluster name: R-DAP-001) Node is Bad";
  $("statusIn").value = "Waiting for Customer Input";
  $("desc").value = "Summary of Alert:\nDescription: NodeBad: 4 is greater than or equal to threshold. Critical: 0, Warning: -18\nCluster UUID: 12325052-a432-40fa-acbf-998faf34430c\nCluster Tag: R-DAP-001\nNode: VRVW422EAD26E\nIncident Time (UTC): 2026-09-29 02:54:30";
  $("hist").value = "Record 1:\n    CommentBody: From: support@rubrik.com<br>To: customer@example.com<br><br>Hello Team,<br/>Our proactive monitoring system has detected a Node Bad alert on your Rubrik cluster. Could you please enable the support tunnel for the cluster so we can begin our investigation? I will provide you with an update on my findings by October 1, 2026, 12:00 PM UTC.\n    CreatedDate: 2026-09-29T04:00:07.000+0000\n    CreatedBy.Name: Rohith Madineni\n\nRecord 2:\n    CommentBody: Removed VRVW422EAD26E from impacted nodes\n    CreatedDate: 2026-09-29T09:00:14.000+0000\n    CreatedBy.Name: alert bot\n\nRecord 3:\n    CommentBody: From: support@rubrik.com<br>Cc: rohith.rohith@rubrik.com<br><br>2026-09-29 02:05:18: BAD. Status stale on system startup<br/>2026-09-29 02:33:18: OK. Node revived from BAD state\n    CreatedDate: 2026-10-01T00:49:11.000+0000\n    CreatedBy.Name: Rohith Madineni";
  $("notes").value = "Root cause: The node restarted, and its status went stale during startup before cluster communication was re-established.\nAction taken: Verified the node self-recovered and has remained stable.";
  msg("Example loaded. Click Build summary + draft.");
};
(function restore(){ const s = LSO.get("cdo_last", null); if (!s) return; $("caseNo").value=s.caseNo||""; $("subject").value=s.subject||""; $("statusIn").value=s.status||""; $("desc").value=s.desc||""; $("hist").value=s.hist||""; $("notes").value=s.notes||""; $("dtype").value=s.dtype||"Auto"; $("fudays").value=s.days||2; msg("Restored your last case from this browser."); })();
