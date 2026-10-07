// ================= state =================
const S = {
  cases: [], meta: {}, ctx: null, result: null, current: null,
  filters: { status: null, type: null, next: null, prio: new Set(), q: "" },
  sort: { key: "LastModifiedDate", dir: -1 },
  charts: {}
};
const LS = {
  get(k, d){ try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch(e){ return d; } },
  set(k, v){ try { localStorage.setItem(k, JSON.stringify(v)); } catch(e){} }
};
let DRAFTS = LS.get("cdr_drafts", {});
function saveDraft(no, obj){
  DRAFTS[no] = Object.assign({ savedAt: Date.now() }, obj);
  const keys = Object.keys(DRAFTS).sort((a,b)=>DRAFTS[b].savedAt-DRAFTS[a].savedAt);
  keys.slice(30).forEach(k=>delete DRAFTS[k]);
  LS.set("cdr_drafts", DRAFTS);
}

// ================= small utils =================
const qEsc = s => String(s||"").replace(/\\/g,"\\\\").replace(/'/g,"\\'");
function alertType(subj){
  let s = String(subj||"").replace(/^\[[^\]]*\]\s*/,"");
  const m = s.match(/Proactive Case:\s*\([^)]*\)\s*(.+)$/i);
  if (m) s = m[1]; else s = s.replace(/\s*\[[^\]]*\]\s*$/,"");
  s = s.split(" -> ")[0].trim();
  return s || "Other";
}
function clusterOf(subj){
  const m = String(subj||"").match(/Cluster name:\s*([^)]+)\)/i) || String(subj||"").match(/\[([^\]]+)\]\s*$/);
  return m ? m[1].trim() : "";
}
function ago(iso){
  if(!iso) return "";
  const t = Date.parse(iso.replace(/\+0000$/,"Z")); if (isNaN(t)) return iso;
  const h = (Date.now()-t)/36e5;
  if (h<1) return Math.max(1,Math.round(h*60))+"m ago";
  if (h<48) return Math.round(h)+"h ago";
  return Math.round(h/24)+"d ago";
}
function prioClass(p){ return p==="P1"?"b-p1":p==="P2"?"b-p2":"b-p3"; }

// ================= tabs =================
document.querySelectorAll(".tab").forEach(b=>b.onclick=()=>{
  document.querySelectorAll(".tab").forEach(x=>x.classList.toggle("active", x===b));
  $("tab-mine").classList.toggle("hidden", b.dataset.tab!=="mine");
  $("tab-single").classList.toggle("hidden", b.dataset.tab!=="single");
  LS.set("cdr_tab", b.dataset.tab);
});

// ================= load cases =================
function listStatus(msg, err){ const s=$("listStatus"); s.textContent=msg||""; s.className="status"+(err?" err":""); }
async function loadCases(){
  const owner = $("owner").value.trim();
  if (!owner){ listStatus("Enter the case owner's full name.", true); return; }
  LS.set("cdr_owner", owner); LS.set("cdr_scope", $("scope").value);
  $("loadCases").disabled = true; listStatus("Loading cases from Salesforce…");
  try{
    let where = `Owner.Name = '${qEsc(owner)}'`;
    const sc = $("scope").value;
    if (sc==="open") where += " AND IsClosed = false";
    if (sc==="active") where += " AND IsClosed = false AND (NOT Status LIKE 'Resolved%')";
    if (sc==="all30") where += " AND CreatedDate = LAST_N_DAYS:30";
    const t = await query({ objectName:"Case", fields:["CaseNumber","Subject","Account.Name","Status","Priority","CreatedDate","LastModifiedDate","Owner.Name"], whereClause: where, orderBy:"LastModifiedDate DESC", limit: 200 });
    S.cases = parseRecords(t).map(c=>Object.assign(c,{ _type: alertType(c.Subject), _cluster: clusterOf(c.Subject) }));
    S.meta = {};
    listStatus(`${S.cases.length} case${S.cases.length===1?"":"s"} loaded for ${owner}.`);
    renderAll();
    if (S.cases.length) scan();
  } catch(e){ console.error(e); listStatus("Could not load cases: "+(e.message||e), true); }
  finally { $("loadCases").disabled = false; }
}

// ================= scan: what needs a reply =================
function analyse(c, desc){
  const cm = desc.slice().reverse(); // oldest -> newest
  let lastCust=-1, lastRub=-1, lastAlert=-1;
  cm.forEach((x,i)=>{ const k=classify(x); if(k.startsWith("customer")) lastCust=i; else if(k==="rubrik") lastRub=i; else if(k==="alert") lastAlert=i; });
  const st = String(c.Status||"");
  const tags = [];
  let next = { label:"Review", cls:"b-wait", rank:5 };
  if (/^Resolved/i.test(st)) next = { label:"Resolved – close out", cls:"b-ok", rank:6 };
  if (lastRub<0 && cm.length<8 && !/^Resolved/i.test(st)) next = { label:"Send IR", cls:"b-reply", rank:1 };
  else if (lastCust>lastRub && lastCust>=0) next = { label:"Customer replied", cls:"b-reply", rank:1 };
  else if (lastRub>=0){
    const fu = cm.slice(lastCust+1).filter(x=>classify(x)==="rubrik").length;
    const body = decode(cm[lastRub].CommentBody);
    const dm = body.match(/by\s+([A-Z][a-z]+\s+\d{1,2},?\s+\d{4})/);
    let overdue = false;
    if (dm){ const d = Date.parse(dm[1].replace(",","") + " 23:59 UTC"); if(!isNaN(d) && d < Date.now()) overdue = true; }
    if (!/^Resolved/i.test(st)){
      if (overdue) next = { label:"Update overdue", cls:"b-over", rank:0 };
      else if (fu>=3) next = { label:`No reply ×${fu}`, cls:"b-ghost", rank:3 };
      else next = { label: fu>1?`Waiting on customer ×${fu}`:"Waiting on customer", cls:"b-wait", rank:4 };
    }
  }
  if (lastRub>=0 && lastAlert>lastRub && !/^Resolved/i.test(st)) tags.push({ label:"New alert", cls:"b-alert" });
  return { next, tags, lastActivity: (cm[cm.length-1]||{}).CreatedDate };
}
async function scan(){
  if (!S.cases.length){ listStatus("Load cases first.", true); return; }
  $("scanBtn").disabled = true; const prog=$("prog"); prog.classList.remove("hidden");
  let done=0; const total=S.cases.length; const queue=S.cases.slice();
  const bar = ()=>{ prog.firstElementChild.style.width = (100*done/total)+"%"; listStatus(`Checking latest comments… ${done}/${total}`); };
  bar();
  async function worker(){
    while(queue.length){
      const c = queue.shift();
      try{
        const t = await query({ objectName:"CaseComment", fields:["CommentBody","CreatedDate","CreatedBy.Name"], whereClause:`ParentId IN (SELECT Id FROM Case WHERE CaseNumber = '${c.CaseNumber}')`, orderBy:"CreatedDate DESC", limit: 8 }, "low");
        S.meta[c.CaseNumber] = analyse(c, parseRecords(t));
      } catch(e){ S.meta[c.CaseNumber] = { next:{label:"Couldn't check", cls:"b-wait", rank:7}, tags:[] }; }
      done++; bar(); if (done%4===0) renderAll();
    }
  }
  await Promise.all([worker(),worker()]);
  prog.classList.add("hidden"); $("scanBtn").disabled = false;
  listStatus(`${total} cases checked. Click a tile or chart to filter; click a row to draft.`);
  renderAll();
}

// ================= filtering / sorting =================
function filtered(){
  const f = S.filters, q = f.q.toLowerCase();
  return S.cases.filter(c=>{
    const m = S.meta[c.CaseNumber];
    if (f.status && c.Status!==f.status) return false;
    if (f.type && c._type!==f.type) return false;
    if (f.prio.size && !f.prio.has(c.Priority)) return false;
    if (f.next){
      const lab = m ? m.next.label : "";
      if (f.next==="reply" && !(lab==="Customer replied" || lab==="Send IR")) return false;
      if (f.next==="overdue" && lab!=="Update overdue") return false;
      if (f.next==="waiting" && !/^Waiting/.test(lab)) return false;
      if (f.next==="ghost" && !/^No reply/.test(lab)) return false;
      if (f.next==="alert" && !(m && m.tags.some(t=>t.label==="New alert"))) return false;
      if (f.next==="draft" && !DRAFTS[c.CaseNumber]) return false;
    }
    if (q){
      const hay = [c.CaseNumber,c["Account.Name"],c.Subject,c._cluster,c.Status].join(" ").toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  }).sort((a,b)=>{
    const k=S.sort.key, d=S.sort.dir;
    let va, vb;
    if (k==="next"){ va=(S.meta[a.CaseNumber]||{next:{rank:9}}).next.rank; vb=(S.meta[b.CaseNumber]||{next:{rank:9}}).next.rank; }
    else { va=a[k]||""; vb=b[k]||""; }
    return va<vb ? -d : va>vb ? d : 0;
  });
}

// ================= rendering =================
function renderAll(){ renderTiles(); renderCharts(); renderChips(); renderRows(); }
function renderTiles(){
  const all = S.cases, M = S.meta;
  const cnt = fn => all.filter(fn).length;
  const lab = c => (M[c.CaseNumber]||{next:{label:""}}).next.label;
  const tiles = [
    { k:"all", n: all.length, l:"Cases", on: !S.filters.next && !S.filters.prio.size && !S.filters.status && !S.filters.type },
    { k:"reply", n: cnt(c=>["Customer replied","Send IR"].includes(lab(c))), l:"Needs your reply" },
    { k:"overdue", n: cnt(c=>lab(c)==="Update overdue"), l:"Update overdue" },
    { k:"alert", n: cnt(c=>(M[c.CaseNumber]||{tags:[]}).tags.some(t=>t.label==="New alert")), l:"New alert since last email" },
    { k:"waiting", n: cnt(c=>/^Waiting/.test(lab(c))), l:"Waiting on customer" },
    { k:"ghost", n: cnt(c=>/^No reply/.test(lab(c))), l:"3+ follow-ups, no reply" },
    { k:"p1", n: cnt(c=>c.Priority==="P1"), l:"P1 cases" },
    { k:"draft", n: cnt(c=>!!DRAFTS[c.CaseNumber]), l:"Drafts saved" },
  ];
  $("tiles").innerHTML = tiles.map(t=>{
    const on = t.on || S.filters.next===t.k || (t.k==="p1" && S.filters.prio.has("P1") && S.filters.prio.size===1);
    return `<div class="tile ${on?"on":""}" data-k="${t.k}"><div class="n">${t.n}</div><div class="l">${esc(t.l)}</div></div>`;
  }).join("");
  $("tiles").querySelectorAll(".tile").forEach(el=>el.onclick=()=>{
    const k = el.dataset.k;
    if (k==="all"){ clearFilters(); return; }
    if (k==="p1"){ const on = S.filters.prio.has("P1") && S.filters.prio.size===1; S.filters.prio = on? new Set(): new Set(["P1"]); }
    else S.filters.next = S.filters.next===k ? null : k;
    renderAll();
  });
}
function countBy(arr, fn){ const m = {}; arr.forEach(x=>{ const k=fn(x)||"—"; m[k]=(m[k]||0)+1; }); return Object.entries(m).sort((a,b)=>b[1]-a[1]); }
const PALETTE = ["#00a37a","#2563eb","#f59e0b","#ef4444","#8b5cf6","#14b8a6","#ec4899","#64748b","#84cc16","#0ea5e9"];
function renderCharts(){
  if (typeof Chart==="undefined"){ $("chartsWrap").classList.add("hidden"); return; }
  const st = countBy(S.cases, c=>c.Status), ty = countBy(S.cases, c=>c._type);
  const mk = (id, type, entries, filterKey) => {
    const labels = entries.map(e=>e[0]), data = entries.map(e=>e[1]);
    const colors = labels.map((l,i)=> (S.filters[filterKey] && S.filters[filterKey]!==l) ? "#d1d5db" : PALETTE[i%PALETTE.length]);
    if (S.charts[id]){ const ch=S.charts[id]; ch.data.labels=labels; ch.data.datasets[0].data=data; ch.data.datasets[0].backgroundColor=colors; ch.update(); return; }
    S.charts[id] = new Chart($(id), {
      type, data:{ labels, datasets:[{ data, backgroundColor: colors, borderWidth: 0 }] },
      options:{ responsive:true, maintainAspectRatio:false, indexAxis: type==="bar"?"y":"x",
        plugins:{ legend:{ display: type!=="bar", position:"right", labels:{ boxWidth:10, font:{ size:11 } } } },
        scales: type==="bar" ? { x:{ ticks:{ precision:0 } }, y:{ ticks:{ font:{ size:11 } } } } : {},
        onClick:(evt, els)=>{ if(!els.length) return; const l = S.charts[id].data.labels[els[0].index]; S.filters[filterKey] = S.filters[filterKey]===l ? null : l; renderAll(); } }
    });
  };
  mk("chStatus","doughnut", st, "status");
  mk("chType","bar", ty.slice(0,10), "type");
}
function renderChips(){
  const pr = ["P1","P2","P3","P4"].filter(p=>S.cases.some(c=>c.Priority===p));
  $("prioChips").innerHTML = pr.map(p=>`<button class="chip ${S.filters.prio.has(p)?"on":""}" data-p="${p}">${p}</button>`).join("");
  $("prioChips").querySelectorAll(".chip").forEach(b=>b.onclick=()=>{ const p=b.dataset.p; S.filters.prio.has(p)?S.filters.prio.delete(p):S.filters.prio.add(p); renderAll(); });
  const f = S.filters, act = [];
  if (f.status) act.push(["status","Status: "+f.status]);
  if (f.type) act.push(["type","Type: "+f.type]);
  if (f.next) act.push(["next","Next: "+({reply:"Needs your reply",overdue:"Update overdue",alert:"New alert",waiting:"Waiting on customer",ghost:"3+ follow-ups",draft:"Drafts saved"}[f.next]||f.next)]);
  $("activeFilters").innerHTML = act.map(a=>`<button class="chip on" data-x="${a[0]}">${esc(a[1])} ✕</button>`).join("");
  $("activeFilters").querySelectorAll(".chip").forEach(b=>b.onclick=()=>{ S.filters[b.dataset.x]=null; renderAll(); });
}
function renderRows(){
  const rows = filtered();
  if (!S.cases.length){ $("rows").innerHTML = `<tr><td colspan="7" class="empty">No cases loaded.</td></tr>`; return; }
  if (!rows.length){ $("rows").innerHTML = `<tr><td colspan="7" class="empty">No cases match these filters.</td></tr>`; return; }
  $("rows").innerHTML = rows.map(c=>{
    const m = S.meta[c.CaseNumber];
    const nx = m ? `<span class="badge ${m.next.cls}">${esc(m.next.label)}</span>` + m.tags.map(t=>`<span class="badge ${t.cls}">${esc(t.label)}</span>`).join("") : `<span class="badge">…</span>`;
    const dr = DRAFTS[c.CaseNumber] ? `<span class="badge b-ok">Draft saved</span>` : "";
    return `<tr class="data ${S.current===c.CaseNumber?"sel":""}" data-no="${c.CaseNumber}">
      <td><b>${esc(c.CaseNumber)}</b></td>
      <td>${esc(c["Account.Name"]==="null"?"—":c["Account.Name"])}<div class="subj">${esc(c._type)}${c._cluster?" · "+esc(c._cluster):""}</div></td>
      <td><span class="badge ${prioClass(c.Priority)}">${esc(c.Priority||"")}</span></td>
      <td>${esc(c.Status)}</td>
      <td>${nx}${dr}</td>
      <td title="${esc(c.LastModifiedDate)}">${esc(ago(c.LastModifiedDate))}</td>
      <td><button class="small" data-draft="${c.CaseNumber}">Draft</button></td></tr>`;
  }).join("");
  $("rows").querySelectorAll("tr.data").forEach(tr=>tr.onclick=e=>{
    const auto = e.target && e.target.dataset && e.target.dataset.draft;
    openPanel(tr.dataset.no, "drawer", !!auto);
  });
}
document.querySelectorAll("th[data-sort]").forEach(th=>th.onclick=()=>{
  const k = th.dataset.sort; S.sort.dir = S.sort.key===k ? -S.sort.dir : (k==="next"?1:-1); S.sort.key = k; renderRows();
});
function clearFilters(){ S.filters = { status:null, type:null, next:null, prio:new Set(), q:"" }; $("q").value=""; renderAll(); }
$("clearF").onclick = clearFilters;
$("q").addEventListener("input", e=>{ S.filters.q = e.target.value.trim(); renderRows(); });
$("loadCases").onclick = loadCases;
$("scanBtn").onclick = scan;
$("owner").addEventListener("keydown", e=>{ if(e.key==="Enter") loadCases(); });

// ================= drafter panel =================
async function openPanel(caseNo, where, autoGen){
  const host = where==="drawer" ? $("drawerHost") : $("singleHost");
  const panel = $("panel");
  host.appendChild(panel); panel.classList.remove("hidden");
  if (where==="drawer"){ $("drawerHost").classList.remove("hidden"); $("backdrop").classList.remove("hidden"); $("drawerHost").scrollTop = 0; }
  else { panel.scrollIntoView({ behavior:"smooth", block:"start" }); }
  $("go").disabled = true; $("go").textContent = "Loading case…";
  S.current = caseNo; renderRows();
  $("caseTitle").textContent = caseNo + " · loading…";
  $("caseKv").innerHTML = ""; $("timeline").innerHTML = ""; $("resultArea").classList.add("hidden"); $("sumWrap").classList.add("hidden"); resetPipe();
  $("facts").value = ""; $("dtype").value = "Auto";
  try{
    setStatus("Reading the full case history…");
    const { c, comments } = await loadCase(caseNo);
    if (S.current!==caseNo) return;
    S.ctx = { caseNo, c, comments };
    resetPipe(); ensureSummary(S.ctx).catch(()=>{});
    renderCase(c, comments);
    rememberRecent(caseNo, c);
    const saved = DRAFTS[caseNo];
    if (saved){ $("dtype").value = saved.dtype||"Auto"; $("facts").value = saved.facts||""; renderResult(saved.result); setStatus(`Showing the draft saved ${ago(new Date(saved.savedAt).toISOString().replace("Z","+0000"))}. Click Generate for a fresh one.`); }
    else setStatus("Ready. Pick an email type (or leave Auto) and click Generate.");
    $("go").disabled = false; $("go").textContent = "AI draft";
    if (autoGen) generate(null);
  } catch(e){ console.error(e); setStatus("Could not load the case: "+(e.message||e), true); $("go").disabled = false; $("go").textContent = "AI draft"; }
}
function closePanel(){
  $("panel").classList.add("hidden"); $("drawerHost").classList.add("hidden"); $("backdrop").classList.add("hidden"); S.current=null; renderRows();
}
$("closePanel").onclick = closePanel;
$("backdrop").onclick = closePanel;
document.addEventListener("keydown", e=>{ if (e.key==="Escape" && !$("drawerHost").classList.contains("hidden")) closePanel(); });
function renderCase(c, comments){
  $("caseTitle").textContent = `${c.CaseNumber} · ${c["Account.Name"]&&c["Account.Name"]!=="null"?c["Account.Name"]:"(no account)"}`;
  const d = decode(c.Description);
  const get = re => (d.match(re)||[])[1]||"";
  const kv = [
    ["Subject", c.Subject], ["Status", c.Status],
    ["Cluster", get(/Cluster (?:Tag|Name\/Tag)\s*:\s*(.+)/i) || clusterOf(c.Subject)], ["Node", get(/Node:\s*(.+)/i)],
    ["Incident (UTC)", get(/Incident Time \(UTC\):\s*(.+)/i) || get(/Matching Time\s*:\s*(.+)/i)],
    ["Comments", String(comments.length)]
  ];
  $("caseKv").innerHTML = kv.map(([k,v])=>`<div class="kv"><b>${esc(k)}</b><span>${esc(v||"—")}</span></div>`).join("");
  $("tlSummary").textContent = `Case history (${comments.length} comments)`;
  $("timeline").innerHTML = comments.slice().reverse().map(cm=>{
    const kind = classify(cm);
    const cls = kind.startsWith("customer") ? "cust" : (kind==="rubrik" ? "rubrik" : "");
    let body = decode(cm.CommentBody); if (body.length>700) body = body.slice(0,700)+" …";
    return `<div class="tl-item"><span class="who">${esc(cm["CreatedBy.Name"])}</span><span class="tag ${cls}">${esc(kind)}</span> <span style="color:var(--muted)">${esc(ago(cm.CreatedDate))} · ${esc(cm.CreatedDate)}</span><pre>${esc(body)}</pre></div>`;
  }).join("");
}
function renderResult(res){
  if (!res) return;
  $("resultArea").classList.remove("hidden");
  const snap = Array.isArray(res.snapshot) ? res.snapshot : (res.snapshot ? [res.snapshot] : []);
  $("snapshot").innerHTML = (res.draft_type ? `<div><b>Draft type:</b> ${esc(res.draft_type)}</div>` : "") + snap.map(s=>`<div>${esc(s)}</div>`).join("");
  const flags = Array.isArray(res.flags) ? res.flags.filter(Boolean) : [];
  $("flagCard").classList.toggle("hidden", !flags.length);
  $("flags").innerHTML = flags.map(f=>`<li>${esc(f)}</li>`).join("");
  $("draftTitle").textContent = res.draft_type ? `Draft – ${res.draft_type}` : "Draft";
  $("draft").value = scrub(res.draft);
  const rd = scrub(res.resolution_details||"");
  $("resWrap").classList.toggle("hidden", !rd); $("resdet").value = rd;
}
async function generate(extra){
  const ctx = S.ctx; if (!ctx){ setStatus("Open a case first.", true); return; }
  $("go").disabled = true; $("tweakBtn").disabled = true;
  const t0 = Date.now(); const label = extra ? "Revising" : "Drafting";
  const tick = setInterval(()=>{ $("go").textContent = label + "… " + Math.round((Date.now()-t0)/1000) + "s"; }, 1000);
  $("go").textContent = label + "… 0s";
  try{
    setStatus(extra ? "Revising the draft…" : "Drafting… this usually takes 30–90 seconds.");
    const built = buildContext(ctx.c, ctx.comments, $("dtype").value, $("facts").value.trim());
    let prompt = RULES.replace("{{DEFAULT_DATE}}", built.defDate);
    if (extra) prompt += `\n\nREVISION REQUEST: Revise the previous draft as follows: "${extra}". Keep all hard rules and return the same JSON shape. Previous draft:\n${$("draft").value}`;
    console.log("askClaude start", ctx.caseNo, "context chars", built.text.length);
    const raw = await Promise.race([
      window.cowork.askClaude(prompt, [built.text]),
      new Promise((_,rej)=>setTimeout(()=>rej(new Error("Drafting took longer than 3 minutes. Please click Generate draft again.")), 180000))
    ]);
    console.log("askClaude done", ctx.caseNo, Math.round((Date.now()-t0)/1000)+"s");
    const res = parseJSON(raw);
    if (S.ctx!==ctx) return;
    S.result = res; renderResult(res);
    saveDraft(ctx.caseNo, { result: Object.assign({}, res, { draft: $("draft").value }), dtype: $("dtype").value, facts: $("facts").value.trim() });
    renderTiles(); renderRows();
    setStatus("Done. Review before posting.");
  } catch(e){ console.error(e); setStatus("Something went wrong: "+(e.message||e), true); }
  finally { clearInterval(tick); $("go").disabled = false; $("go").textContent = "AI draft"; $("tweakBtn").disabled = false; }
}
$("go").onclick = ()=>generate(null);
$("tweakBtn").onclick = ()=>{ const t=$("tweak").value.trim(); if(t) generate(t); };
$("tweak").addEventListener("keydown", e=>{ if(e.key==="Enter"){ const t=$("tweak").value.trim(); if(t) generate(t); } });
document.querySelectorAll("[data-tweak]").forEach(b=>b.onclick=()=>generate(b.dataset.tweak));
$("draft").addEventListener("change", ()=>{ if(S.ctx && DRAFTS[S.ctx.caseNo]){ DRAFTS[S.ctx.caseNo].result.draft = $("draft").value; LS.set("cdr_drafts", DRAFTS); } });
async function copyField(id, btn){
  const v = $(id).value;
  try { await navigator.clipboard.writeText(v); } catch(e){ $(id).select(); document.execCommand("copy"); }
  const t = btn.textContent; btn.textContent = "Copied"; setTimeout(()=>btn.textContent=t, 1200);
}
$("copyDraft").onclick = e=>copyField("draft", e.target);
$("copyRes").onclick = e=>copyField("resdet", e.target);

// ================= single case tab =================
function rememberRecent(no, c){
  let r = LS.get("cdr_recent", []).filter(x=>x.no!==no);
  r.unshift({ no, label: `${no}${c["Account.Name"]&&c["Account.Name"]!=="null" ? " · "+c["Account.Name"] : ""}` });
  LS.set("cdr_recent", r.slice(0,10)); showRecent();
}
function showRecent(){
  const r = LS.get("cdr_recent", []);
  $("recent").innerHTML = r.length ? `<span class="status" style="margin-right:4px">Recent:</span>` + r.map(x=>`<button class="chip" data-no="${esc(x.no)}">${esc(x.label)}</button>`).join("") : "";
  $("recent").querySelectorAll(".chip").forEach(b=>b.onclick=()=>{ $("caseNo").value=b.dataset.no; openPanel(b.dataset.no, "single"); });
}
$("openSingle").onclick = ()=>{ const n=$("caseNo").value.trim().replace(/\D/g,""); if(n) openPanel(n, "single"); };
$("caseNo").addEventListener("keydown", e=>{ if(e.key==="Enter") $("openSingle").click(); });

// ================= init =================
$("owner").value = LS.get("cdr_owner", "Rohith Madineni");
$("scope").value = LS.get("cdr_scope", "open");
showRecent();
const tab = LS.get("cdr_tab", "mine");
document.querySelector(`.tab[data-tab="${tab}"]`).click();
if (tab==="mine") loadCases();


// ================= instant template drafts (no AI, instant) =================
const SIGN_TXT = "Thanks and Regards,\n\nRohith Madineni\nCustomer Success Engineer – Proactive Support\nRubrik";
const MON_TXT = "Please note that this proactive case is monitored 24×7, so feel free to reply at any time for immediate assistance.";
function plusDays(n){ const d=new Date(); return utcDateStr(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()+n))); }
function facts(c, comments){
  const d = decode(c.Description);
  const g = re => ((d.match(re)||[])[1]||"").trim();
  const f = {
    caseNo: c.CaseNumber, subject: c.Subject||"", type: alertType(c.Subject),
    alert: g(/\nDescription:\s*(.+)/i) || g(/Description:\s*(.+)/i),
    uuid: g(/Cluster UUID\s*:\s*(.+)/i), tag: g(/Cluster (?:Tag|Name\/Tag)\s*:\s*(.+)/i) || clusterOf(c.Subject),
    node: g(/\nNode:\s*(.+)/i), time: g(/Incident Time \(UTC\):\s*(.+)/i), version: g(/Software Version\s*:\s*(.+)/i),
    details: g(/Details:\s*([\s\S]+?)\n\s*\n/i), cause: g(/Cause:\s*([\s\S]+?)\n\s*\n/i), fix: g(/Fix:\s*([\s\S]+?)\n\s*\n/i),
    issue: g(/Issue Summary:\s*([\s\S]+?)\n\s*\n/i),
    nodes: []
  };
  const seen = new Set();
  (comments||[]).forEach(cm=>{ if (classify(cm)!=="alert") return; const b=decode(cm.CommentBody);
    const n=(b.match(/\nNode:\s*(\S+)/)||[])[1], t=(b.match(/Incident Time \(UTC\):\s*(.+)/)||[])[1];
    if(n && !seen.has(n)){ seen.add(n); f.nodes.push([n,(t||"").trim()]); } });
  if (f.node && !seen.has(f.node)) f.nodes.unshift([f.node, f.time]);
  return f;
}
function impactFor(f){
  const a = (f.alert+" "+f.type).toLowerCase();
  if (/dimm/.test(a)) return `Node ${f.node} is reporting memory DIMM(s) as missing. The node may continue to operate with reduced memory, but this increases the risk of performance degradation or further hardware issues.`;
  if (/ierr/.test(a)) return `Node ${f.node} is reporting an internal error (IERR), which typically indicates a CPU, memory, or motherboard fault. An unaddressed IERR increases the risk of an unplanned node failure.`;
  if (/ac cord|power supply|psu/.test(a)) return `A power supply on node ${f.node} is not receiving power. This removes power redundancy on the node; if the other power supply also loses power, the node could go down.`;
  if (/disk|drive/.test(a) && /replace|missing/.test(a)) return `A disk on node ${f.node} has been flagged for replacement. Leaving a degrading or missing disk in place increases the risk of an unexpected disk failure and reduces the cluster's resiliency until it is replaced.`;
  if (/os_partition|os partition/.test(a)) { const p=(f.alert.match(/:\s*([\d.]+)\s*is less/)||[])[1]; return `The OS (root) partition on node ${f.node} is reporting only ${p||"low"}% free space, which has crossed the warning threshold of 5%. If it reaches the critical threshold of 2%, it could affect node stability and cluster operations.`; }
  if (/logs_partition|log partition/.test(a)) { const p=(f.alert.match(/:\s*([\d.]+)\s*is less/)||[])[1]; return `The log partition on node ${f.node} is reporting only ${p||"low"}% free space, which has crossed the warning threshold of 10%. If it continues to fill, it can affect node stability and block CDM upgrade pre-checks.`; }
  if (/read.?only|permanently failed/.test(a)) return `A disk on node ${f.node} has been marked permanently failed, causing the filesystem to become read-only. This can prevent backup jobs on this node from completing until the disk is replaced.`;
  if (f.nodes.length>1) return `${f.nodes.length} nodes in the cluster have reported a bad or stale state within a short period. With several nodes affected, the cluster has reduced resiliency, and backup and restore operations on these nodes may be affected.`;
  return "The affected node is marked BAD. No active production impact has been observed. However, if the condition recurs, it could affect workloads running on or protected by this node.";
}
function nextStepFor(f){
  const a = (f.alert+" "+f.type).toLowerCase();
  if (/dimm|ierr|ac cord|power supply|disk|drive|read.?only/.test(a)) return "review the node's hardware health to confirm the fault and arrange a replacement if needed";
  if (/partition/.test(a)) return "review the partition usage, identify any unusually large files or logs, and clear them as needed to restore headroom";
  return "review the node status";
}
function templateDraft(dtype, c, comments){
  const f = facts(c, comments), date = plusDays(2) + ", 12:00 PM UTC";
  const isNode = /node is (bad|stale)/i.test(f.type) || /NodeBad|NodeStale/i.test(f.alert);
  const multi = f.nodes.length>1;
  const nodeLines = multi ? "Impacted Nodes and Incident Times (UTC):\n" + f.nodes.map(n=>`${n[0]} — ${n[1]}`).join("\n") : `Node: ${f.node}\nIncident Time (UTC): ${f.time}`;
  const tunnel = "Could you please enable the support tunnel for the cluster so we can begin our investigation?\nApp Tray → Settings → Customer Support → Support Tunnel";
  const maint = "Could you also confirm whether any maintenance, activity, or outage occurred on the host or network side around the incident time?";
  const descLabel = isNode ? (/stale/i.test(f.type) ? "Node Stale" : "Node Bad") + (multi ? " — multiple nodes" : "") : (f.type || f.alert);
  const intro = isNode ? (multi ? "alerts on multiple nodes" : `a ${descLabel} alert`) : (/insight|stuck|failing|fingerprint|archival|hyperv/i.test(f.type) ? null : `a ${f.type || "hardware health"} alert`);
  const type = dtype==="Auto" ? autoType(c, comments) : dtype;
  let draft = null, label = type;

  if (/Initial Response/.test(type)){
    if (intro === null){ // proactive insight cases: use Details/Cause/Fix from the description
      draft = `Hello Team,\n\nGreetings of the day! I hope you're doing well.\n\nMy name is Rohith, and I'm from the Proactive Support Team at Rubrik.\n\nOur proactive monitoring system has identified an issue on cluster ${f.tag}, and I would like to walk you through our findings and next steps:\n\n===========\nDescription: ${f.type}\n\n` +
        (f.issue ? `Issue Summary: ${f.issue}\n\n` : "") + (f.details ? `Details: ${f.details}\n\n` : "") + (f.cause ? `Cause: ${f.cause}\n\n` : "") + (f.fix ? `Fix: ${f.fix}\n\n` : "") +
        `Case ID: ${f.caseNo}\n\nCluster UUID: ${f.uuid}\nCluster Tag: ${f.tag}` + (f.version ? `\nSoftware Version: ${f.version}` : "") + `\n===========\n\n${tunnel}\n\nOnce I have access, I will review the affected items and share an update by ${date}.\n\n${MON_TXT}\n\n${SIGN_TXT}`;
    } else {
      draft = `Hello Team,\n\nGreetings of the day! I hope you're doing well.\n\nMy name is Rohith, and I'm from the Proactive Support Team at Rubrik.\n\nOur proactive monitoring system has detected ${intro} on your Rubrik cluster, and I would like to investigate ${multi?"these alerts":"the alert"} and assist further:\n\n===========\nDescription: ${descLabel}\n\nBusiness Impact: ${impactFor(f)}\n\nCase ID: ${f.caseNo}\n\nCluster UUID: ${f.uuid}\nCluster Tag: ${f.tag}\n${nodeLines}\n===========\n\n${tunnel}\n\n` + (isNode ? (multi ? maint.replace("around the incident time","around these times") : maint) + "\n\n" : "") + `Once I have access, I will ${nextStepFor(f)} and share my findings by ${date}.\n\n${MON_TXT}\n\n${SIGN_TXT}`;
    }
  } else if (/Follow-up/.test(type)){
    const n = rubrikSinceCustomer(comments);
    draft = `Hello Team,\n\nGreetings of the day! I hope you're doing well.\n\nThis is ${n>=1 ? "the "+ordinal(n+1)+" " : "a "}follow-up on case ${f.caseNo}.\n\nOur proactive monitoring detected ${intro || "an alert"} on ${f.node ? "node "+f.node+" in " : ""}cluster ${f.tag}. We haven't yet received a response to our earlier request.\n\n${tunnel}\n\n${impactFor(f)}\n\nI will follow up again by ${date}, or sooner once we hear back from you.\n\n${MON_TXT}\n\n${SIGN_TXT}`;
  } else if (/Duplicate/.test(type)){
    draft = `Hello Team,\n\nGreetings!\n\nAs the alert triggered on this node is already being actively handled under case [OTHER CASE NUMBER], we are marking this case as a duplicate and proceeding to close it.\n\nPlease refer to case [OTHER CASE NUMBER] for further updates. If you have any questions, feel free to reach out.\n\n${SIGN_TXT}`;
  } else if (/Hold/.test(type)){
    draft = `Hello Team,\n\nThank you for the confirmation. As requested, we will place this case on hold for [PERIOD] to allow time for [REASON], and will follow up by ${plusDays(7)}, 12:00 PM UTC, or sooner if you have findings to share.\n\n${MON_TXT}\n\n${SIGN_TXT}`;
  } else if (/Simple closure|^Closure/.test(type)){
    draft = `Hello Team,\n\nThank you for your confirmation and patience while we investigated this alert.\n\nProblem Summary:\nOur proactive monitoring detected ${intro || "an alert"} on cluster ${f.tag}${f.node?`, node ${f.node}`:""}${f.time?`, at ${f.time} UTC`:""}.\n\nRoot Cause:\n[ROOT CAUSE IN PLAIN LANGUAGE]\n\nResolution Steps:\n\n* [What was investigated]\n* [What was done]\n* Confirmed the cluster is currently healthy with no further alerts.\n\nNo further action is required at this time. If any new alerts are triggered, please reach out, and we will be happy to assist.\n\nIt has been a pleasure working with you on this case. With the cluster confirmed healthy and all nodes stable, we are proceeding to close this case.\n\n${SIGN_TXT}`;
  } else if (/Monitoring update/.test(type)){
    draft = `Hello Team,\n\nThank you for the update.\n\n[What was done and validated.]\n\nNo further action is required at this time. We will continue to monitor the cluster and provide a status update by ${date}, or sooner if any additional alerts are triggered.\n\nIf the cluster remains stable, could you please confirm whether we can proceed to close this case?\n\n${MON_TXT}\n\n${SIGN_TXT}`;
  }
  if (!draft) return null;
  const left = (draft.match(/\[[A-Z][A-Z \-/]+\]|\[[A-Z][a-z][^\]]{3,60}\]/g)||[]);
  return { draft_type: label + " (instant template)", snapshot: ["Built instantly from the case details – no AI. Use AI draft for case-specific findings or if anything below needs judgment."], flags: left.length ? ["Fill in the bracketed parts before sending: " + [...new Set(left)].join(", ")] : [], draft, resolution_details: "" };
}
function rubrikSinceCustomer(comments){
  let n=0; for (let i=comments.length-1;i>=0;i--){ const k=classify(comments[i]); if (k.startsWith("customer")) break; if (k==="rubrik") n++; } return n;
}
function ordinal(n){ return n+(["th","st","nd","rd"][(n%100>10&&n%100<14)?0:(n%10<4?n%10:0)]); }
function autoType(c, comments){
  const hasRub = comments.some(x=>classify(x)==="rubrik");
  if (!hasRub) return "Initial Response (IR)";
  const lastCust = comments.map(classify).lastIndexOf("customer"), lastRub = comments.map(classify).lastIndexOf("rubrik");
  if (lastRub > lastCust) return "Follow-up (no customer reply)";
  return "Monitoring update + request to close";
}
function instant(){
  const ctx = S.ctx; if (!ctx){ setStatus("Open a case first.", true); return; }
  const res = templateDraft($("dtype").value, ctx.c, ctx.comments);
  if (!res){ setStatus("No instant template for this email type – use AI draft.", true); return; }
  S.result = res; renderResult(res);
  saveDraft(ctx.caseNo, { result: res, dtype: $("dtype").value, facts: $("facts").value.trim() });
  renderTiles(); renderRows();
  setStatus("Instant template ready. Click AI draft for a case-specific version.");
}

// ================= background pre-drafting =================
const PRE = { running:false, stop:false };
async function preDraft(){
  if (PRE.running){ PRE.stop = true; $("preBtn").textContent = "Stopping…"; return; }
  const targets = S.cases.filter(c=>{ const m=S.meta[c.CaseNumber]; return m && ["Customer replied","Send IR","Update overdue"].includes(m.next.label) && !DRAFTS[c.CaseNumber]; });
  if (!targets.length){ listStatus("Nothing to pre-draft – run the reply check first, or all cases needing a reply already have drafts."); return; }
  PRE.running = true; PRE.stop = false; $("preBtn").textContent = "Stop pre-drafting";
  let done = 0;
  for (const c of targets){
    if (PRE.stop) break;
    listStatus(`Pre-drafting ${done+1}/${targets.length}: ${c.CaseNumber} (${c["Account.Name"]})… you can keep working.`);
    try{
      const { c: full, comments } = await loadCase(c.CaseNumber);
      const built = buildContext(full, comments, "Auto", "");
      const raw = await Promise.race([ window.cowork.askClaude(RULES.replace("{{DEFAULT_DATE}}", built.defDate), [built.text]), new Promise((_,rej)=>setTimeout(()=>rej(new Error("timeout")),180000)) ]);
      const res = parseJSON(raw); res.draft = scrub(res.draft); res.resolution_details = scrub(res.resolution_details||"");
      saveDraft(c.CaseNumber, { result: res, dtype: "Auto", facts: "" });
      if (S.current === c.CaseNumber && S.ctx){ renderResult(res); }
    } catch(e){ console.warn("pre-draft failed", c.CaseNumber, e); }
    done++; renderTiles(); renderRows();
  }
  PRE.running = false; $("preBtn").textContent = "Pre-draft replies";
  listStatus(PRE.stop ? `Stopped after ${done} draft(s).` : `Pre-drafted ${done} case(s). Click a row to review – the draft opens instantly.`);
}
$("instantBtn").onclick = instant;
$("preBtn").onclick = preDraft;


// ================= two-agent pipeline =================
// Agent 1 (Summarizer): reads the slimmed case history and returns a compact, factual JSON summary.
// Agent 2 (Drafter): reads only that summary + IQS rules and writes the email.
// Summaries are cached per case and reused until a new comment arrives, so changing the email type,
// adding facts, or revising only runs Agent 2.

const SUMMARY_RULES = `You are Agent 1, a case-history summarizer for Rubrik Proactive Support. Read the Salesforce case and its comment history and extract ONLY facts that are present. Do not draft any email. Do not guess.

Comment kinds: "customer"/"customer?" = customer replies; "rubrik" = Rubrik customer-facing emails; "internal" = Rubrik internal notes/command output (use for evidence, never quote commands); "alert" = automated alerts; "rma" = shipment/RMA notices.

RETURN ONLY JSON, no markdown fences, using this shape (use "" or [] when unknown):
{"alert":"one line: alert type and what it means",
 "cluster":"cluster tag","cluster_uuid":"",
 "nodes":[{"node":"","incident_utc":"","note":"e.g. recovered / still bad / replaced"}],
 "contact_name":"first name of the most recent customer contact, or Team",
 "timeline":["YYYY-MM-DD – who – what happened (max 18 words)"],
 "last_customer_message":{"date":"","summary":""},
 "last_rubrik_email":{"date":"","summary":"","promised_next_update":""},
 "rubrik_followups_since_last_customer_reply":0,
 "open_asks_to_customer":[],
 "unanswered_customer_questions":[],
 "evidence":["plain-language technical findings from internal notes"],
 "actions_taken":["fixes, reboots, RMAs, approvals, with dates"],
 "current_health":"",
 "monitoring_or_hold_requested":"",
 "suggested_stage":"one of: IR needed | Follow-up (no reply) | Customer replied - respond | Approval needed | Proceeding after approval | Hold | Monitoring | Ready to close | Ghosted close | Duplicate",
 "risks_or_flags":["anything the engineer must check before sending: third-party approver, early close vs requested monitoring, multiple nodes/clusters, unsupported CDM notice, missing account, unproven claims"]}
Limits: timeline max 12 items (keep the most important, newest last); evidence max 6; each item short. Be precise with dates (UTC).`;

const DRAFT_PREFIX = `You are Agent 2, the email drafter. Your INPUT is a structured case summary produced by Agent 1 (not the raw history). Base every statement on that summary. If the summary lacks something the email needs, use a clearly bracketed placeholder and add a flag – never invent facts.\n\n`;

let SUMS = LS.get("cdr_summaries", {});
function sumKey(ctx){ const last = ctx.comments.length ? ctx.comments[ctx.comments.length-1].CreatedDate : ""; return ctx.comments.length + "|" + last; }
function saveSummary(no, key, summary){
  SUMS[no] = { key, summary, savedAt: Date.now() };
  const ks = Object.keys(SUMS).sort((a,b)=>SUMS[b].savedAt-SUMS[a].savedAt); ks.slice(40).forEach(k=>delete SUMS[k]);
  LS.set("cdr_summaries", SUMS);
}
function pipe(step, state, extra){
  const el = $("pipe"); if (!el) return;
  const icon = state==="run" ? "⏳" : state==="ok" ? "✅" : state==="err" ? "⚠️" : "•";
  const lines = (el.dataset.lines ? JSON.parse(el.dataset.lines) : {});
  lines[step] = `${icon} ${step}${extra?" – "+extra:""}`;
  el.dataset.lines = JSON.stringify(lines);
  el.innerHTML = Object.values(lines).map(l=>`<div>${esc(l)}</div>`).join("");
}
function resetPipe(){ const el=$("pipe"); if(el){ el.dataset.lines=""; el.innerHTML=""; } }
const inflight = {};
async function ensureSummary(ctx, force){
  const key = sumKey(ctx), no = ctx.caseNo;
  if (!force && SUMS[no] && SUMS[no].key===key){ showSummary(SUMS[no].summary, true); pipe("Agent 1 · Summary","ok","reused (no new comments)"); return SUMS[no].summary; }
  if (!force && inflight[no+key]) return inflight[no+key];
  const t0 = Date.now();
  pipe("Agent 1 · Summary","run","reading the case history…");
  const job = (async ()=>{
    const built = buildContext(ctx.c, ctx.comments, "Summary", "");
    const raw = await Promise.race([ window.cowork.askClaude(SUMMARY_RULES, [built.text]),
      new Promise((_,rej)=>setTimeout(()=>rej(new Error("Summary took longer than 2 minutes")),120000)) ]);
    const s = typeof raw === "string" ? raw : (raw && (raw.text || raw.content || JSON.stringify(raw)));
    const str = String(s); const a = str.indexOf("{"), b = str.lastIndexOf("}");
    let summary;
    try { summary = JSON.parse(str.slice(a, b+1)); } catch(e){ summary = { raw_summary: str.slice(0, 6000) }; }
    saveSummary(no, key, summary);
    if (S.ctx && S.ctx.caseNo===no) { showSummary(summary, false); pipe("Agent 1 · Summary","ok", Math.round((Date.now()-t0)/1000)+"s"); }
    return summary;
  })();
  inflight[no+key] = job;
  try { return await job; } catch(e){ if (S.ctx && S.ctx.caseNo===no) pipe("Agent 1 · Summary","err", e.message||String(e)); throw e; }
  finally { delete inflight[no+key]; }
}
function showSummary(summary, cached){
  const box = $("summary"); if (!box) return;
  box.value = JSON.stringify(summary, null, 2);
  $("sumWrap").classList.remove("hidden");
  $("sumNote").textContent = cached ? "Reused saved summary – no new comments since it was made." : "Fresh summary. You can edit it before drafting.";
  renderSummaryView(summary);
}
function renderSummaryView(s){
  const v = $("sumView"); if (!v) return;
  const li = arr => (arr||[]).filter(Boolean).map(x=>`<li>${esc(typeof x==="string"?x:JSON.stringify(x))}</li>`).join("");
  const nodes = (s.nodes||[]).map(n=>`${n.node||""}${n.incident_utc?" · "+n.incident_utc:""}${n.note?" · "+n.note:""}`);
  v.innerHTML = `
    <div class="grid2">
      <div class="kv"><b>Stage</b><span>${esc(s.suggested_stage||"—")}</span></div>
      <div class="kv"><b>Contact</b><span>${esc(s.contact_name||"—")}</span></div>
      <div class="kv"><b>Health now</b><span>${esc(s.current_health||"—")}</span></div>
      <div class="kv"><b>Follow-ups since reply</b><span>${esc(String(s.rubrik_followups_since_last_customer_reply??"—"))}</span></div>
    </div>
    ${s.alert?`<div class="note"><b>Alert:</b> ${esc(s.alert)}</div>`:""}
    ${nodes.length?`<div class="note"><b>Nodes:</b> ${esc(nodes.join(" | "))}</div>`:""}
    ${(s.timeline||[]).length?`<div class="note"><b>Timeline</b><ul style="margin:4px 0 0;padding-left:18px">${li(s.timeline)}</ul></div>`:""}
    ${(s.evidence||[]).length?`<div class="note"><b>Evidence</b><ul style="margin:4px 0 0;padding-left:18px">${li(s.evidence)}</ul></div>`:""}
    ${(s.open_asks_to_customer||[]).length?`<div class="note"><b>Waiting on customer for</b><ul style="margin:4px 0 0;padding-left:18px">${li(s.open_asks_to_customer)}</ul></div>`:""}
    ${(s.unanswered_customer_questions||[]).length?`<div class="note" style="color:var(--warn)"><b>Unanswered customer questions</b><ul style="margin:4px 0 0;padding-left:18px">${li(s.unanswered_customer_questions)}</ul></div>`:""}
    ${s.raw_summary?`<pre class="note" style="white-space:pre-wrap">${esc(s.raw_summary)}</pre>`:""}`;
}
function currentSummary(){
  try { return JSON.parse($("summary").value); } catch(e){ return { raw_summary: $("summary").value }; }
}

// Override: generate = Agent 1 (cached) → Agent 2
async function generate(extra, opts){
  const ctx = S.ctx; if (!ctx){ setStatus("Open a case first.", true); return; }
  opts = opts || {};
  $("go").disabled = true; $("tweakBtn").disabled = true;
  const t0 = Date.now(); const label = extra ? "Revising" : "Drafting";
  const tick = setInterval(()=>{ $("go").textContent = label + "… " + Math.round((Date.now()-t0)/1000) + "s"; }, 1000);
  try{
    if (!extra) resetPipe();
    let summary;
    if ((opts.useEdited || extra) && $("summary").value.trim()){ summary = currentSummary(); pipe("Agent 1 · Summary","ok", extra ? "kept" : "using your edited summary"); }
    else { setStatus("Agent 1 is summarizing the case history…"); summary = await ensureSummary(ctx, !!opts.forceSummary); }
    if (S.ctx!==ctx) return;
    setStatus(extra ? "Agent 2 is revising the draft…" : "Agent 2 is drafting the email from the summary…");
    const t1 = Date.now(); pipe("Agent 2 · Draft","run", extra ? "revising…" : "writing the IQS draft…");
    const today = new Date(); const def = utcDateStr(new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()+2)));
    const input = [
      `TODAY (UTC): ${utcDateStr(today)}`,
      `Requested type: ${$("dtype").value}`,
      $("facts").value.trim() ? `User-supplied facts/instructions (override the summary, flag conflicts): ${$("facts").value.trim()}` : "",
      `CASE ${ctx.c.CaseNumber} | Subject: ${ctx.c.Subject} | Account: ${ctx.c["Account.Name"]} | Status: ${ctx.c.Status}`,
      `CASE SUMMARY FROM AGENT 1:\n${JSON.stringify(summary)}`
    ].filter(Boolean).join("\n");
    let prompt = DRAFT_PREFIX + RULES.replace("{{DEFAULT_DATE}}", def);
    if (extra) prompt += `\n\nREVISION REQUEST: Revise the previous draft as follows: "${extra}". Keep all hard rules and return the same JSON shape. Previous draft:\n${$("draft").value}`;
    const raw = await Promise.race([ window.cowork.askClaude(prompt, [input]),
      new Promise((_,rej)=>setTimeout(()=>rej(new Error("Drafting took longer than 2 minutes. Please try again.")),120000)) ]);
    if (S.ctx!==ctx) return;
    const res = parseJSON(raw);
    S.result = res; renderResult(res);
    saveDraft(ctx.caseNo, { result: Object.assign({}, res, { draft: $("draft").value }), dtype: $("dtype").value, facts: $("facts").value.trim() });
    renderTiles(); renderRows();
    pipe("Agent 2 · Draft","ok", Math.round((Date.now()-t1)/1000)+"s");
    setStatus(`Done in ${Math.round((Date.now()-t0)/1000)}s. Review before posting.`);
  } catch(e){ console.error(e); pipe("Agent 2 · Draft","err", e.message||String(e)); setStatus("Something went wrong: "+(e.message||e), true); }
  finally { clearInterval(tick); $("go").disabled = false; $("go").textContent = "AI draft"; $("tweakBtn").disabled = false; }
}

// Override: background pre-drafting runs Agent 1 for several cases in parallel, then Agent 2.
async function preDraft(){
  if (PRE.running){ PRE.stop = true; $("preBtn").textContent = "Stopping…"; return; }
  const targets = S.cases.filter(c=>{ const m=S.meta[c.CaseNumber]; return m && ["Customer replied","Send IR","Update overdue"].includes(m.next.label) && !DRAFTS[c.CaseNumber]; });
  if (!targets.length){ listStatus("Nothing to pre-draft – run the reply check first, or all cases needing a reply already have drafts."); return; }
  PRE.running = true; PRE.stop = false; $("preBtn").textContent = "Stop pre-drafting";
  let done = 0; const queue = targets.slice();
  async function worker(){
    while (queue.length && !PRE.stop){
      const c = queue.shift();
      listStatus(`Pre-drafting ${done+1}/${targets.length}… you can keep working.`);
      try{
        const { c: full, comments } = await loadCase(c.CaseNumber);
        const ctx = { caseNo: c.CaseNumber, c: full, comments };
        const summary = await ensureSummary(ctx);
        const today = new Date(); const def = utcDateStr(new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()+2)));
        const input = `TODAY (UTC): ${utcDateStr(today)}\nRequested type: Auto\nCASE ${full.CaseNumber} | Subject: ${full.Subject} | Account: ${full["Account.Name"]} | Status: ${full.Status}\nCASE SUMMARY FROM AGENT 1:\n${JSON.stringify(summary)}`;
        const raw = await Promise.race([ window.cowork.askClaude(DRAFT_PREFIX + RULES.replace("{{DEFAULT_DATE}}", def), [input]), new Promise((_,rej)=>setTimeout(()=>rej(new Error("timeout")),120000)) ]);
        const res = parseJSON(raw); res.draft = scrub(res.draft); res.resolution_details = scrub(res.resolution_details||"");
        saveDraft(c.CaseNumber, { result: res, dtype: "Auto", facts: "" });
        if (S.current === c.CaseNumber && S.ctx) renderResult(res);
      } catch(e){ console.warn("pre-draft failed", c.CaseNumber, e); }
      done++; renderTiles(); renderRows();
    }
  }
  await Promise.all([worker(), worker()]);
  PRE.running = false; $("preBtn").textContent = "Pre-draft replies";
  listStatus(PRE.stop ? `Stopped after ${done} draft(s).` : `Pre-drafted ${done} case(s). Click a row – the draft opens instantly.`);
}
$("preBtn").onclick = preDraft;
$("go").onclick = ()=>generate(null);
$("redraftBtn").onclick = ()=>generate(null, { useEdited: true });
$("resumBtn").onclick = async ()=>{ if(!S.ctx) return; resetPipe(); try{ await ensureSummary(S.ctx, true); }catch(e){} };
$("sumToggle").onclick = ()=>{ const ta=$("summary"); ta.classList.toggle("hidden"); $("sumToggle").textContent = ta.classList.contains("hidden") ? "Edit summary" : "Hide editor"; };
$("summary").addEventListener("change", ()=>{ try{ renderSummaryView(JSON.parse($("summary").value)); }catch(e){} });


// ================= v2 pipeline: instant local Agent 1 + one compact AI call for Agent 2 =================
// Measured: each AI call has ~90 s of fixed latency regardless of input size, so the AI summarizer step
// is replaced by an instant rule-based summarizer (linear pass over the comments). Agent 2 gets a
// ~2 KB fact sheet and a prompt trimmed to the chosen email type and scenario.

function firstSentence(t, max){
  t = String(t||"");
  if (t.indexOf("{") >= 0) t = t.replace(/[^{}\n]{0,200}\{[^}]*\}/g, " ");
  t = t.replace(/\s+/g," ").trim().replace(/^From:\s*\S+\s*/i, "").replace(/^Cc:\s*\S+\s*/i, "");
  t = t.replace(/^(hello|hi|hey|dear|good day|greetings)[^,.!:]*[,.!:]?\s*/i,"")
       .replace(/^(greetings( of the day)?!?|good day!?|i hope (you'?re|you are) doing well\.?|thank you( for [^.]{0,80})?\.|thanks( for [^.]{0,80})?\.)\s*/gi,"")
       .replace(/^(greetings( of the day)?!?|i hope (you'?re|you are) doing well\.?)\s*/gi,"");
  const m = t.match(/^(.{20,}?[.?!])(\s|$)/);
  let s = m ? m[1] : t;
  const w = s.split(" "); if (w.length > (max||22)) s = w.slice(0, max||22).join(" ") + "…";
  return s;
}
const MONTHS = "January|February|March|April|May|June|July|August|September|October|November|December";
function promisedDate(t){ const m = String(t).match(new RegExp("by\\s+((?:"+MONTHS+")\\s+\\d{1,2}(?:st|nd|rd|th)?,?\\s+\\d{4}(?:,?\\s+\\d{1,2}(?::\\d{2})?\\s*(?:AM|PM)?\\s*UTC)?)","i")); return m ? m[1] : ""; }
function nameFrom(cm){
  const b = cm.CommentBody||"", by = cm["CreatedBy.Name"]||"";
  if (by && !/support bot|alert bot|mulesoft/i.test(by) && !/rubrik/i.test(by)) return by.split(" ")[0];
  const greet = decode(b).match(/\n\s*(?:Regards|Best Regards|Kindest Regards|Thanks|Thank you|Cdlt|KR)[,!.]?\s*\n+\s*([A-Z][a-zA-Z]+)/);
  if (greet) return greet[1];
  const f = b.match(/From:\s*([a-z]+)[._]/i); if (f && !/^(support|service|no|do|soc|it|storage|techops)$/i.test(f[1])) return f[1][0].toUpperCase()+f[1].slice(1);
  return "";
}
function localSummary(c, comments){
  const F = facts(c, comments);
  const isAuto = cm => { const b = String(cm.CommentBody||""); return /Support Notification|pending solution acceptance|Rubrik Support updated case|customerthermometer|Gold Alert!|^From:\s*(service|do_not_reply|donotreply|noreply|cm)@/im.test(b); };
  const kinds = comments.map(cm => { if (isAuto(cm)) return "auto"; const k = classify(cm); if (k==="rubrik" && /rksupport@|^\s*(>>|\+\+)/m.test(decode(cm.CommentBody))) return "internal"; return k; });
  const lastIdx = k => { for (let i=kinds.length-1;i>=0;i--) if (k(kinds[i])) return i; return -1; };
  const iCust = lastIdx(k=>k.startsWith("customer")), iRub = lastIdx(k=>k==="rubrik");
  const fu = kinds.slice(iCust+1).filter(k=>k==="rubrik").length;
  const S1 = {
    alert: (F.type||"") + (F.alert ? " – " + F.alert.slice(0,140) : ""),
    cluster: F.tag, cluster_uuid: F.uuid,
    nodes: F.nodes.map(n=>({ node:n[0], incident_utc:n[1], note:"" })),
    contact_name: iCust>=0 ? (nameFrom(comments[iCust]) || "Team") : "Team",
    timeline: [], last_customer_message: {date:"",summary:""}, last_rubrik_email: {date:"",summary:"",promised_next_update:""},
    rubrik_followups_since_last_customer_reply: fu, rubrik_customer_emails_total: kinds.filter(k=>k==="rubrik").length,
    open_asks_to_customer: [], unanswered_customer_questions: [], evidence: [], actions_taken: [],
    current_health: "", monitoring_or_hold_requested: "", suggested_stage: "", risks_or_flags: []
  };
  // timeline (customer, rubrik, rma, alert) – newest 12
  comments.forEach((cm,i)=>{
    const k = kinds[i]; if (k==="internal" || k==="auto") return;
    const d = (cm.CreatedDate||"").slice(0,10), body = slim(decode(cm.CommentBody), k);
    let who = k.startsWith("customer") ? "Customer" + (nameFrom(cm)?" ("+nameFrom(cm)+")":"") : k==="rubrik" ? "Rubrik ("+(cm["CreatedBy.Name"]||"").split(" ")[0]+")" : k==="rma" ? "RMA" : "Alert";
    const full = decode(cm.CommentBody);
    let what = k==="alert" ? (/Removed (\S+) from impacted nodes/i.test(full) ? "alert cleared for " + full.match(/Removed (\S+)/i)[1] : "new alert: " + ((full.match(/\nDescription:\s*([^\n]+)/)||[])[1]||"").split(" is ")[0] + ((full.match(/\nNode:\s*(\S+)/)||[])[1] ? " on " + full.match(/\nNode:\s*(\S+)/)[1] : ""))
             : k==="rma" ? firstSentence(body.replace(/RMA shipment information\s*\[[^\]]*\]/i,""), 18) : firstSentence(body, 20);
    if (k.startsWith("customer") && (what.length < 12 || /\|/.test(what))) what = String(body).replace(/^From:\s*\S+\s*/i,"").replace(/\s+/g," ").trim().slice(0,120);
    S1.timeline.push(`${d} – ${who} – ${what}`);
  });
  S1.timeline = S1.timeline.slice(-12);
  if (iCust>=0){ const b = slim(decode(comments[iCust].CommentBody),"customer"); S1.last_customer_message = { date:(comments[iCust].CreatedDate||"").slice(0,16).replace("T"," "), summary: b.slice(0,400) };
    const qs = (b.match(/[^.?!\n]{8,200}\?/g)||[]).map(s=>s.trim()); if (iCust > iRub) S1.unanswered_customer_questions = qs.slice(0,3);
    if (/\b(on hold|keep (the|this) (case|ticket) (open|on hold)|monitor (for|over) (a|one|two|\d+) (week|day)|couple of weeks)\b/i.test(b)) S1.monitoring_or_hold_requested = firstSentence(b.match(/[^.\n]*(hold|monitor)[^.\n]*/i)[0], 30);
  }
  if (iRub>=0){ const b = decode(comments[iRub].CommentBody); S1.last_rubrik_email = { date:(comments[iRub].CreatedDate||"").slice(0,16).replace("T"," "), summary: firstSentence(slim(b,"rubrik"), 30), promised_next_update: promisedDate(b) };
    if (/support tunnel/i.test(b) && iCust < iRub) S1.open_asks_to_customer.push("Enable the support tunnel");
    if (/shipping details|Ship To Contact/i.test(b) && iCust < iRub) S1.open_asks_to_customer.push("Shipping details for the replacement");
    if (/maintenance|outage|activity/i.test(b) && iCust < iRub) S1.open_asks_to_customer.push("Confirm any maintenance/activity around the incident time");
    if (/approv|confirm if we can proceed|proceed with/i.test(b) && iCust < iRub) S1.open_asks_to_customer.push("Approval to proceed with the proposed change");
    if (/proceed to close|close this case/i.test(b) && iCust < iRub) S1.open_asks_to_customer.push("Confirmation to close the case");
  }
  // evidence from internal notes and status comments (newest first, dedup)
  const ev = new Set(), act = new Set();
  for (let i=comments.length-1;i>=0;i--){
    const b = decode(comments[i].CommentBody), k = kinds[i];
    let m;
    const statusRe = /(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})[:|]\s*(?:\d\|)?\s*(BAD\.?|OK\.?)?\s*([^\n|]*(stale|revived|systemd|NfsdDState|check)[^\n]*)/gi;
    let ns = 0; while ((m = statusRe.exec(b)) && ns < 6){ const line = `Node status ${m[1]} UTC: ${m[3].trim().slice(0,80)}`; if (!ev.has(line)){ ev.add(line); ns++; } }
    if (/without any active interface/i.test(b)) { const t=(b.match(/(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})[^\n]*without any active interface/)||[])[1]; ev.add("Network bond (bond0) lost all active interfaces" + (t?" at "+t.replace("T"," ")+" UTC":"")); }
    if (/IP conflict/i.test(b)) ev.add("IP address conflict detected on bond0 with an external device");
    if (/SystemdCheck check FAILED/i.test(b)) ev.add("Health-monitor SystemdCheck failing (OS networking/systemd unresponsive)");
    if (/NfsdDState/i.test(b)) ev.add("Health-monitor NfsdDState check failed");
    if (/kronos stall|memory reclaim|avail\s+[\d.]+[MG]/i.test(b) && k==="internal") ev.add("Memory pressure observed on the node around the incident");
    if (/INDEX_SNAPPABLE_SNAPSHOTS/i.test(b)) ev.add("Multiple VM snapshot indexing jobs running during the incident window");
    if (/ACTION:\s*([^\n]+)/.test(b)) ev.add("Hardware health: " + b.match(/ACTION:\s*([^\n]+)/)[1].slice(0,100));
    if (/All FRUS in the node are healthy/i.test(b) && !/ACTION:/i.test(b)) ev.add("Hardware health check: all FRUs healthy");
    if (/Power Supply AC lost|Redundancy Lost/i.test(b)) ev.add("Power supply reported AC lost / redundancy lost");
    if (/Fully Redundant/i.test(b) && !/Redundancy Lost/i.test(b)) ev.add("Power supplies fully redundant");
    if (/\bMISSING\b|PRE_REMOVAL|READY_TO_REMOVE/.test(b) && k==="internal") ev.add("Disk status shows MISSING / pending removal");
    if (/Removed (\S+) from impacted nodes/i.test(b)) act.add("Alert cleared for " + b.match(/Removed (\S+)/i)[1] + " on " + (comments[i].CreatedDate||"").slice(0,10));
    if ((m = b.match(/RMA:\s*(RMA-\d+)[\s\S]{0,80}Status:\s*(\w+)/i))) act.add(`${m[1]} ${m[2]} on ${(comments[i].CreatedDate||"").slice(0,10)}`);
    if (/^Current Status:/i.test(b) && !S1.current_health) S1.current_health = firstSentence(b.replace(/^Current Status:[^\n]*\n/i,""), 30);
    if (/unsupported CDM version/i.test(b)) S1.risks_or_flags.push("Support Bot flagged an unsupported CDM version on this cluster.");
  }
  S1.evidence = [...ev].slice(0,8); S1.actions_taken = [...act].slice(0,6);
  if (!S1.current_health){ const clr = S1.actions_taken.find(a=>/Alert cleared/.test(a)); S1.current_health = clr ? "Alert has cleared; node reported OK" : "Not stated"; }
  if (!c["Account.Name"] || c["Account.Name"]==="null") S1.risks_or_flags.push("Account is empty in Salesforce – check the recipient.");
  if (S1.nodes.length>1) S1.risks_or_flags.push(`${S1.nodes.length} nodes affected – possible shared cause.`);
  if (fu>=3) S1.risks_or_flags.push(`${fu} Rubrik follow-ups since the customer last replied – consider a ghosted closure.`);
  if (S1.monitoring_or_hold_requested) S1.risks_or_flags.push("Customer asked to hold/monitor – check the period has ended before closing.");
  if (S1.unanswered_customer_questions.length) S1.risks_or_flags.push("Customer asked questions that need an answer in this email.");
  S1.risks_or_flags = [...new Set(S1.risks_or_flags)];
  // stage
  if (iRub<0) S1.suggested_stage = "IR needed";
  else if (iCust>iRub) S1.suggested_stage = /approve|go ahead|proceed|you can do it|happy for you/i.test(S1.last_customer_message.summary) ? "Proceeding after approval" : /close/i.test(S1.last_customer_message.summary) ? "Ready to close" : "Customer replied - respond";
  else if (fu>=3 && S1.actions_taken.some(a=>/cleared/i.test(a))) S1.suggested_stage = "Ghosted close";
  else S1.suggested_stage = "Follow-up (no reply)";
  if (/^Resolved/i.test(c.Status||"") && S1.suggested_stage!=="Customer replied - respond") S1.suggested_stage = "Ready to close";
  return S1;
}

// Agent 2 – compact prompt built only for the chosen type and scenario
const TYPE_FORMATS = {
  "Initial Response (IR)": `IR format: "Hello {Name or Team},\\n\\nGreetings of the day! I hope you're doing well.\\n\\nMy name is Rohith, and I'm from the Proactive Support Team at Rubrik.\\n\\nOur proactive monitoring system has detected {alert} on your Rubrik cluster, and I would like to investigate the alert and assist further:\\n\\n===========\\nDescription: ...\\n\\nBusiness Impact: ...\\n\\nCase ID: ...\\n\\nCluster UUID: ...\\nCluster Tag: ...\\nNode: ...\\nIncident Time (UTC): ...\\n===========" then "Could you please enable the support tunnel for the cluster so we can begin our investigation?\\nApp Tray → Settings → Customer Support → Support Tunnel", for Node Bad/Stale ask about maintenance/outage at the incident time, then "Once I have access, I will ... and share my findings by {DATE}, 12:00 PM UTC." Multiple nodes: "Impacted Nodes and Incident Times (UTC):" list.`,
  "Follow-up (no customer reply)": "Follow-up: say which follow-up number it is, restate the alert in one line, repeat the outstanding ask(s), add one Business Impact sentence, and the When line.",
  "Update with findings": "Update: Findings (plain language, from evidence only) → Business Impact → Next Steps/ask → When line.",
  "Approval request": "Approval request: finding → why the change → what it does → downtime yes/no → 'Could you please confirm if we can proceed?' → When line.",
  "Proceeding after approval": "Proceeding: thank them, say what you will now do and that you'll check cluster health afterwards, When line (or 'within the next 4 hours').",
  "Hold acknowledgement": "Hold: confirm the hold period and reason, and the date you'll follow up.",
  "Monitoring update + request to close": "Monitoring update: what was done and validated → will monitor until When → 'If the cluster remains stable, could you please confirm whether we can proceed to close this case?'",
  "Short summary requesting closure": "Short summary: 3-4 '* ' bullets of what happened and was done → 'Since the cluster is healthy, could you please confirm if we can close this case?' → When line.",
  "Closure": "Closure: 'Thank you for your confirmation and patience while we investigated this alert.' then Problem Summary: / Root Cause: / Resolution Steps: (bullets: investigation, action, validation, prevention) then 'No further action is required at this time. If any new alerts are triggered, please reach out, and we will be happy to assist.\\n\\nIt has been a pleasure working with you on this case. With the cluster confirmed healthy and all nodes stable, we are proceeding to close this case.' No 24x7 line, no When.",
  "Simple closure": "Simple closure: same as Closure but 1-2 sentences per section.",
  "Ghosted closure": "Ghosted closure: Problem Summary / Outreach Summary (dates of attempts) / Current Status (do not claim unverified fixes) / Next Steps (reply + tunnel to reopen) / 'As we have not received a response and the cluster is currently stable, we are proceeding to close this case. You can reopen it at any time by replying to this email.'",
  "Duplicate closure": "Duplicate: 'As the alert triggered on this node is already being actively handled under case [OTHER CASE], we are marking this case as a duplicate and proceeding to close it.'"
};
const STAGE_TO_TYPE = { "IR needed":"Initial Response (IR)", "Follow-up (no reply)":"Follow-up (no customer reply)", "Customer replied - respond":"Update with findings", "Approval needed":"Approval request", "Proceeding after approval":"Proceeding after approval", "Hold":"Hold acknowledgement", "Monitoring":"Monitoring update + request to close", "Ready to close":"Closure", "Ghosted close":"Ghosted closure", "Duplicate":"Duplicate closure" };
const HINTS = [
  [/stale on system startup|stale status on system startup/i, "Root cause language: the node restarted; its status went stale during startup before cluster communication was re-established; expected after a restart, not a fault."],
  [/bond0|without any active interface/i, "Root cause language: both interfaces in the node's network bond (bond0) lost link, so the node lost connectivity and was marked BAD; check switch/cabling, or for virtual edge appliances the host's virtual switch / scheduled host jobs."],
  [/IP address conflict/i, "Root cause language: another device on the network is using the node's IP address; recommend reserving node IPs / excluding them from DHCP."],
  [/memory pressure|indexing/i, "Root cause language: several VM indexing/verification jobs ran at once and used up memory; not hardware/network/crash; recurring fix = fewer concurrent in-memory indexing jobs (approval, no downtime)."],
  [/SystemdCheck/i, "Root cause language: an OS health check failed because the networking service couldn't bring up the bonded interface; fix = controlled reboot."],
  [/power supply|AC lost|redundan/i, "Root cause language: the power supply is healthy but not receiving power (cable/PDU/circuit); same supply on many nodes = PDU/circuit."],
  [/DIMM/i, "DIMM missing: request TSR (Dell iDRAC) or AHS (HPE iLO) logs, open vendor case, replace."],
  [/disk|MISSING|removal/i, "Disk flagged/missing: confirm, shipping details, RMA, customer swaps, set up disk, health check."],
  [/partition/i, "Partition capacity: identify large/old logs, clean up with approval, add retention."],
  [/IERR/i, "IERR: CPU/memory/motherboard fault → replacement."],
  [/archival/i, "Archival stuck after 9.6.0: remediation script, live metadata update, no downtime."]
];
function agent2Prompt(type, S1, defDate){
  const hay = [S1.alert, ...(S1.evidence||[])].join(" ");
  const hints = HINTS.filter(h=>h[0].test(hay)).slice(0,2).map(h=>"- "+h[1]).join("\n");
  return `You are Agent 2. Write the next customer email for a Rubrik Proactive Support case as Rohith Madineni. Use ONLY the facts in CASE FACTS; if something needed is missing, use a [bracketed placeholder] and add a flag.
Rules: never write "data loss"; never write "No data disruption to backup/restore operations was observed"; say "close this case", never "archive"; times in UTC; plain text only (no markdown, no **bold**); section headers like "Root Cause:"; bullets "* "; explain jargon in a few words; no commands, log lines, or internal IDs; address CASE FACTS contact_name (or "Team").
Non-closure emails: include What, Why, and "by ${defDate}, 12:00 PM UTC" (or one day after a date the customer gave), add a Business Impact sentence if rubrik_customer_emails_total < 3, and end with "Please note that this proactive case is monitored 24×7, so feel free to reply at any time for immediate assistance."
Sign-off exactly:
Thanks and Regards,

Rohith Madineni
Customer Success Engineer – Proactive Support
Rubrik
Email type: ${type}
${TYPE_FORMATS[type]||""}
${hints ? "Scenario guidance:\n"+hints : ""}
Return ONLY JSON: {"draft_type":"${type}","flags":["max 3 short"],"draft":"email with \\n newlines","resolution_details":"1-2 plain lines for closures, else empty"}`;
}

// Override Agent 1: instant local summary (AI deep summary still available on the Re-summarize button)
async function ensureSummary(ctx, force){
  const key = sumKey(ctx), no = ctx.caseNo;
  if (force) return deepSummary(ctx);
  if (SUMS[no] && SUMS[no].key===key && SUMS[no].summary && SUMS[no].summary.__deep){ showSummary(SUMS[no].summary, true); pipe("Agent 1 · Summary","ok","saved AI summary reused"); return SUMS[no].summary; }
  const t0 = performance.now();
  const s = localSummary(ctx.c, ctx.comments);
  saveSummary(no, key, s);
  if (S.ctx && S.ctx.caseNo===no){ showSummary(s, false); pipe("Agent 1 · Summary","ok", Math.max(1,Math.round(performance.now()-t0)) + " ms (instant)"); }
  return s;
}
async function deepSummary(ctx){
  const no = ctx.caseNo, key = sumKey(ctx), t0 = Date.now();
  pipe("Agent 1 · Summary","run","AI deep summary… (~1–2 min)");
  const built = buildContext(ctx.c, ctx.comments, "Summary", "");
  const raw = await Promise.race([ window.cowork.askClaude(SUMMARY_RULES, [built.text]), new Promise((_,rej)=>setTimeout(()=>rej(new Error("Deep summary timed out")),150000)) ]);
  const str = String(typeof raw==="string" ? raw : (raw && (raw.text||raw.content)) || JSON.stringify(raw));
  let s; try { s = JSON.parse(str.slice(str.indexOf("{"), str.lastIndexOf("}")+1)); } catch(e){ s = { raw_summary: str.slice(0,6000) }; }
  s.__deep = true;
  saveSummary(no, key, s);
  if (S.ctx && S.ctx.caseNo===no){ showSummary(s, false); pipe("Agent 1 · Summary","ok","AI deep summary · " + Math.round((Date.now()-t0)/1000) + "s"); }
  return s;
}

// Override Agent 2
async function generate(extra, opts){
  const ctx = S.ctx; if (!ctx){ setStatus("Open a case first.", true); return; }
  opts = opts || {};
  $("go").disabled = true; $("tweakBtn").disabled = true;
  const t0 = Date.now(); const label = extra ? "Revising" : "Drafting";
  const tick = setInterval(()=>{ $("go").textContent = label + "… " + Math.round((Date.now()-t0)/1000) + "s"; }, 1000);
  try{
    let S1;
    if ((opts.useEdited || extra) && $("summary").value.trim()) { S1 = currentSummary(); }
    else { S1 = await ensureSummary(ctx); }
    let type = $("dtype").value;
    if (type==="Auto") type = STAGE_TO_TYPE[S1.suggested_stage] || "Update with findings";
    const today = new Date(); const defDate = utcDateStr(new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()+2)));
    const factsTxt = $("facts").value.trim();
    const compact = Object.assign({}, S1); delete compact.__deep;
    const input = `TODAY (UTC): ${utcDateStr(today)}\nCASE ${ctx.c.CaseNumber} | ${ctx.c.Subject} | Account: ${ctx.c["Account.Name"]} | Status: ${ctx.c.Status}\n` +
      (factsTxt ? `ENGINEER NOTES (override facts, flag conflicts): ${factsTxt}\n` : "") + `CASE FACTS: ${JSON.stringify(compact)}`;
    let prompt = agent2Prompt(type, S1, defDate);
    if (extra) prompt += `\nREVISION: apply "${extra}" to this previous draft and return the same JSON:\n${$("draft").value}`;
    const t1 = Date.now(); pipe("Agent 2 · Draft","run", `${type} – writing… (input ${Math.round((prompt.length+input.length)/1000)} KB)`);
    setStatus("Agent 2 is writing the email…");
    const raw = await Promise.race([ window.cowork.askClaude(prompt, [input]), new Promise((_,rej)=>setTimeout(()=>rej(new Error("Drafting took longer than 2 minutes. Please try again.")),120000)) ]);
    if (S.ctx!==ctx) return;
    const res = parseJSON(raw);
    res.snapshot = [ `Stage: ${S1.suggested_stage} → ${type}`, S1.last_customer_message && S1.last_customer_message.date ? `Last customer reply ${S1.last_customer_message.date} UTC` : "No customer reply yet", `${S1.rubrik_followups_since_last_customer_reply} Rubrik follow-up(s) since then` ];
    res.flags = [...new Set([...(S1.risks_or_flags||[]), ...((res.flags)||[])])].slice(0,6);
    S.result = res; renderResult(res);
    saveDraft(ctx.caseNo, { result: Object.assign({}, res, { draft: $("draft").value }), dtype: $("dtype").value, facts: factsTxt });
    renderTiles(); renderRows();
    pipe("Agent 2 · Draft","ok", Math.round((Date.now()-t1)/1000)+"s");
    setStatus(`Done in ${Math.round((Date.now()-t0)/1000)}s. Review before posting.`);
  } catch(e){ console.error(e); pipe("Agent 2 · Draft","err", e.message||String(e)); setStatus("Something went wrong: "+(e.message||e), true); }
  finally { clearInterval(tick); $("go").disabled = false; $("go").textContent = "AI draft"; $("tweakBtn").disabled = false; }
}

// Override pre-drafting: instant summaries, then up to 3 Agent-2 calls in parallel
async function preDraft(){
  if (PRE.running){ PRE.stop = true; $("preBtn").textContent = "Stopping…"; return; }
  const targets = S.cases.filter(c=>{ const m=S.meta[c.CaseNumber]; return m && ["Customer replied","Send IR","Update overdue"].includes(m.next.label) && !DRAFTS[c.CaseNumber]; });
  if (!targets.length){ listStatus("Nothing to pre-draft – run the reply check first, or all cases needing a reply already have drafts."); return; }
  PRE.running = true; PRE.stop = false; $("preBtn").textContent = "Stop pre-drafting";
  let done = 0; const queue = targets.slice();
  async function worker(){
    while (queue.length && !PRE.stop){
      const c = queue.shift();
      try{
        const { c: full, comments } = await loadCase(c.CaseNumber);
        const S1 = localSummary(full, comments); saveSummary(c.CaseNumber, comments.length+"|"+(comments.length?comments[comments.length-1].CreatedDate:""), S1);
        const type = STAGE_TO_TYPE[S1.suggested_stage] || "Update with findings";
        const today = new Date(); const defDate = utcDateStr(new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()+2)));
        const input = `TODAY (UTC): ${utcDateStr(today)}\nCASE ${full.CaseNumber} | ${full.Subject} | Account: ${full["Account.Name"]} | Status: ${full.Status}\nCASE FACTS: ${JSON.stringify(S1)}`;
        const raw = await Promise.race([ window.cowork.askClaude(agent2Prompt(type, S1, defDate), [input]), new Promise((_,rej)=>setTimeout(()=>rej(new Error("timeout")),120000)) ]);
        const res = parseJSON(raw); res.draft = scrub(res.draft); res.resolution_details = scrub(res.resolution_details||"");
        res.snapshot = [`Stage: ${S1.suggested_stage} → ${type}`]; res.flags = [...new Set([...(S1.risks_or_flags||[]), ...(res.flags||[])])].slice(0,6);
        saveDraft(c.CaseNumber, { result: res, dtype: "Auto", facts: "" });
        if (S.current === c.CaseNumber && S.ctx) renderResult(res);
      } catch(e){ console.warn("pre-draft failed", c.CaseNumber, e); }
      done++; listStatus(`Pre-drafted ${done}/${targets.length}… you can keep working.`); renderTiles(); renderRows();
    }
  }
  await Promise.all([worker(), worker(), worker()]);
  PRE.running = false; $("preBtn").textContent = "Pre-draft replies";
  listStatus(PRE.stop ? `Stopped after ${done} draft(s).` : `Pre-drafted ${done} case(s). Click a row – the draft opens instantly.`);
}
$("resumBtn").textContent = "AI deep summary";
$("resumBtn").title = "Optional: slower AI summary for complex cases (~1–2 min)";
$("resumBtn").onclick = async ()=>{ if(!S.ctx) return; try{ await deepSummary(S.ctx); }catch(e){ pipe("Agent 1 · Summary","err", e.message||String(e)); } };
