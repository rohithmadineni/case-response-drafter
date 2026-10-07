const TOOL = "mcp__salesforce__salesforce_query_records";
const $ = id => document.getElementById(id);
// ---------- helpers ----------
function setStatus(msg, err) { const s=$("status"); s.textContent=msg||""; s.className="status"+(err?" err":""); }
function esc(s){ return String(s??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[c])); }
function decode(html) {
  let t = String(html||"")
    .replace(/<br\s*\/?>/gi,"\n").replace(/<\/(p|div|li|tr|h\d)>/gi,"\n").replace(/<li[^>]*>/gi,"• ")
    .replace(/<[^>]+>/g,"");
  const ta=document.createElement("textarea"); ta.innerHTML=t; t=ta.value;
  return t.replace(/ /g," ").replace(/[ \t]+\n/g,"\n").replace(/\n{3,}/g,"\n\n").trim();
}
function toText(r){
  if (r == null) return "";
  if (typeof r === "string") return r;
  if (r.isError) throw new Error((r.content&&r.content[0]&&r.content[0].text)||"Salesforce tool returned an error");
  if (r.content && r.content.length) return r.content.map(c=>c.text||"").join("\n");
  if (r.structuredContent) return JSON.stringify(r.structuredContent);
  return String(r);
}
function parseRecords(text){
  const out=[]; if(!text) return out;
  const parts = text.split(/\n\s*Record \d+:\s*\n/).slice(1);
  for (const p of parts){
    const rec={};
    const fieldRe = /^\s{2,}(CaseNumber|Subject|Account\.Name|Status|Priority|Resolution__c|Description|CommentBody|CreatedDate|LastModifiedDate|CreatedBy\.Name|Owner\.Name): /gm;
    const marks=[]; let m;
    while((m=fieldRe.exec(p))) marks.push({k:m[1], i:m.index, v:m.index+m[0].length});
    for(let i=0;i<marks.length;i++){
      const end = i+1<marks.length ? marks[i+1].i : p.length;
      rec[marks[i].k]=p.slice(marks[i].v,end).trim();
    }
    out.push(rec);
  }
  return out;
}
// Throttled, prioritised Salesforce calls with retry on rate limits.
const QQ = { high: [], low: [], running: 0, MAX: 2, GAP: 250, last: 0 };
function query(args, priority){
  return new Promise((resolve, reject)=>{
    (priority==="low" ? QQ.low : QQ.high).push({ args, resolve, reject, tries: 0 });
    pump();
  });
}
function pump(){
  while (QQ.running < QQ.MAX && (QQ.high.length || QQ.low.length)){
    const job = QQ.high.length ? QQ.high.shift() : QQ.low.shift();
    QQ.running++;
    const wait = Math.max(0, QQ.last + QQ.GAP - Date.now());
    QQ.last = Date.now() + wait;
    setTimeout(()=>runJob(job), wait);
  }
}
async function runJob(job){
  try {
    const r = await window.cowork.callMcpTool(TOOL, job.args);
    job.resolve(toText(r));
  } catch(e){
    const msg = String((e && e.message) || e);
    if (/rate limit/i.test(msg) && job.tries < 6){
      job.tries++;
      setTimeout(()=>{ QQ.high.unshift(job); pump(); }, 1200 * job.tries);
      QQ.running--; return;
    }
    job.reject(e);
  }
  QQ.running--; pump();
}

function utcDateStr(d){ return d.toLocaleDateString("en-US",{month:"long",day:"numeric",year:"numeric",timeZone:"UTC"}); }

// ---------- data load ----------
async function loadCase(caseNo){
  const caseText = await query({objectName:"Case", fields:["CaseNumber","Subject","Account.Name","Status","Resolution__c","Description"], whereClause:`CaseNumber = '${caseNo}'`});
  const recs = parseRecords(caseText);
  if(!recs.length) throw new Error(`No case found for ${caseNo}.`);
  const c = recs[0];
  // comments, paged by CreatedDate so long histories are read completely
  const comments=[]; const seen=new Set(); let after=null, guard=0;
  const key = r => (r.CreatedDate||"")+"|"+(r["CreatedBy.Name"]||"")+"|"+(r.CommentBody||"").slice(0,120);
  while(guard++<40){
    let where = `ParentId IN (SELECT Id FROM Case WHERE CaseNumber = '${caseNo}')`;
    if(after) where += ` AND CreatedDate >= ${after}`;
    const t = await query({objectName:"CaseComment", fields:["CommentBody","CreatedDate","CreatedBy.Name"], whereClause:where, orderBy:"CreatedDate ASC", limit:15});
    const page = parseRecords(t);
    const fresh = page.filter(r=>!seen.has(key(r)));
    fresh.forEach(r=>{ seen.add(key(r)); comments.push(r); });
    if(!fresh.length || page.length<15) break;
    const last = page[page.length-1]["CreatedDate"]||"";
    after = last.replace(/\.\d{3}\+0000$/,"Z").replace(/\+0000$/,"Z");
    if(!after) break;
    setStatus(`Reading case history… ${comments.length} comments so far`);
  }
  return {c, comments};
}

function classify(cm){
  const body = cm.CommentBody||"";
  const by = cm["CreatedBy.Name"]||"";
  const from = (body.match(/From:\s*([^\s<]+)/i)||[])[1]||"";
  const hasTo = /(^|<br>|\n)To:/i.test(body.slice(0,400));
  if (/alert bot/i.test(by)) return "alert";
  if (/ attached .*\(\d+(\.\d+)?\s*(KB|MB|GB)\)/i.test(body)) return "internal";
  if (from && !/rubrik\.com/i.test(from)) return "customer";
  if (/rubrik\.com/i.test(from) && hasTo) return "rubrik";
  if (!from && !/support bot|alert bot|mulesoft/i.test(by) && !/^Current Status:/i.test(body)) {
    // portal reply typed directly by a customer contact, or an internal note without headers
    return /rksupport|rkcl|rubrik_tool|ipmitool|>>|\$ /.test(body) ? "internal" : "customer?";
  }
  if (/mulesoft|rmarequester/i.test(by+from)) return "rma";
  return "internal";
}

// ---------- prompt ----------
const RULES = `You are drafting the next customer-facing email for a Rubrik Proactive Support Salesforce case, written for Rohith Madineni (Customer Success Engineer – Proactive Support). Draft only.

DECIDE THE DRAFT TYPE (if "Requested type" is Auto, pick the first that matches):
1. No Rubrik customer-facing email yet -> Initial Response (IR).
2. Customer confirmed closure, or fix applied + monitoring done + cluster healthy -> Closure.
3. Duplicate of another active case -> Duplicate closure.
4. 3+ substantive Rubrik follow-ups since the last customer reply and the alert cleared / cluster stable -> Ghosted closure.
5. Customer asked to hold/monitor for a period not yet ended -> Hold acknowledgement (do not close).
6. Root cause found, change needs approval -> Approval request.
7. Customer gave approval -> Proceeding.
8. Customer opened tunnel, Rubrik hasn't sent findings -> Update with findings / investigation update.
9. Rubrik asked for tunnel/info and customer hasn't replied -> Follow-up (say which follow-up number).
10. RMA / part / Field Engineer step pending -> matching logistics email (shipping details, part delivered, FE scheduling).
11. Customer raised a concern -> acknowledgement with an RCA commitment.
12. Fix applied and monitoring under way -> Monitoring update + request to close.
If a requested type conflicts with the history (e.g. closing before a customer-requested monitoring window ends), still write it but add a flag.

HARD RULES:
- Never write "data loss". Never write "No data disruption to backup/restore operations was observed". Say "close this case", never "archive".
- All times UTC. Only include timestamps that matter. Never leave [DATE]/[TIME] placeholders.
- Next-update date default: {{DEFAULT_DATE}}, 12:00 PM UTC. If the customer named a date for their work, use one day after the latest date they gave.
- Every non-closing email must have WHAT (finding/action), WHEN (concrete UTC date for next update), WHY (reason for the finding or ask). Include a Business Impact sentence if this is one of the first three customer-facing Rubrik emails.
- Closure must contain: Problem Summary, Root Cause, Resolution Steps (investigation, fix/action, validation of current health, prevention/follow-up where applicable).
- Ghosted closure must acknowledge outreach attempts with dates, recap status, close the case, and invite reopening; never claim something was fixed that the history doesn't prove.
- Only state root causes the evidence supports. Never invent RMA numbers, part numbers, dates, or customer statements.
- Plain text only: no markdown, no **bold**, no # headings. Section headers are plain lines ending in a colon (e.g. "Root Cause:"). Bullets use "* ".
- Plain language; explain jargon briefly (e.g. "the node's network bond (bond0)", "hardware event log (SEL)"). Correct grammar.
- No raw commands, ">>" lines, debug output, internal insight IDs, internal Jira/Slack links, or credentials in the email. Short quoted errors the customer must act on are fine. Public support.rubrik.com KB links are fine.
- Address the most recent customer contact by first name if known, else "Team".
- Sign-off exactly:
Thanks and Regards,

Rohith Madineni
Customer Success Engineer – Proactive Support
Rubrik
- Non-closure emails end (before the sign-off) with: "Please note that this proactive case is monitored 24×7, so feel free to reply at any time for immediate assistance."

FORMATS:
IR: "Hello {Name or Team},\\n\\nGreetings of the day! I hope you're doing well.\\n\\nMy name is Rohith, and I'm from the Proactive Support Team at Rubrik.\\n\\nOur proactive monitoring system has detected {alert} on your Rubrik cluster, and I would like to investigate the alert and assist further:\\n\\n===========\\nDescription: ...\\n\\nBusiness Impact: ...\\n\\nCase ID: ...\\n\\nCluster UUID: ...\\nCluster Tag: ...\\nNode: ...\\nIncident Time (UTC): ...\\n===========" then the support tunnel request ("Could you please enable the support tunnel for the cluster so we can begin our investigation?\\nApp Tray → Settings → Customer Support → Support Tunnel"), for Node Bad/Stale also ask about maintenance/outage around the incident time, then "Once I have access, I will ... and share my findings by {date}, 12:00 PM UTC." For multiple nodes list "Impacted Nodes and Incident Times (UTC):". For insights (VMware fingerprint, archival stuck, HyperV RCT) include Details/Cause/Fix from the case description.
CLOSURE: "Hello {Name},\\n\\nThank you for your confirmation and patience while we investigated this alert.\\n\\nProblem Summary:\\n...\\n\\nRoot Cause:\\n...\\n\\nResolution Steps:\\n\\n* ...\\n* ...\\n\\nNo further action is required at this time. If any new alerts are triggered, please reach out, and we will be happy to assist.\\n\\nIt has been a pleasure working with you on this case. With the cluster confirmed healthy and all nodes stable, we are proceeding to close this case.\\n\\n" + sign-off. Plain-text section headers. Use "Thank you for your patience" if the customer never confirmed.
DUPLICATE: "As the alert triggered on this node is already being actively handled under case {other}, we are marking this case as a duplicate and proceeding to close it."

SCENARIO HINTS (customer language):
- "Status stale on system startup": node restarted (power-off/reboot/power event); status went stale during startup; expected, not a fault.
- syslog "bond0: now running without any active interface": both bond interfaces lost link -> no connectivity -> marked BAD; check switch/cabling, or for virtual edge (VRHV/VRVW/VREC) the host virtual switch / scheduled host jobs. Drops at the same clock time on many dates = scheduled job.
- arping conflict: another device uses the node's IP; customer changes it; recommend reserving node IPs.
- Memory pressure (low available memory, many indexing jobs, verification jobs): concurrent indexing used up memory; not hardware/network/crash; recurring -> reduce concurrent in-memory indexing jobs (approval, no downtime); stagger SLA backup windows.
- SystemdCheck failed: OS networking service couldn't bring up bond0; controlled reboot.
- mdadm leak on r7000: upstream mdadm 4.3 leak; mask mdmonitor; fixed in mdadm 4.5.
- Disk proactive replace / missing: confirm, shipping details, RMA, customer swaps, set up disk, health check.
- DIMM missing: Dell TSR (iDRAC) or HPE AHS (iLO) logs -> vendor case -> replace.
- PSU AC lost: PSU healthy but no input power -> check cables/PDU/circuit; same PS on many nodes = PDU/circuit; stale SEL entries may need backup + clear (approval, no downtime).
- IERR: CPU/memory/motherboard fault -> replacement.
- Log/OS partition capacity: identify large logs, clean up with approval, add retention.
- ReadOnlyFileSystem disk permanently failed: tunnel, then disk replacement.
- Archival upload stuck after 9.6.0: remediation script, live metadata update, no downtime.

ALWAYS FLAG (in "flags"): closing before a customer-requested monitoring period ends; unanswered customer questions; approval from a third party (e.g. MSSP SOC); multiple nodes/clusters at once; empty Account; "unsupported CDM version" bot notice; any claim the history doesn't prove; anything uncertain the user must fill in.

RETURN ONLY a JSON object, no markdown fences:
{"draft_type": "short name", "snapshot": ["max 3 lines, each under 20 words"], "flags": ["max 4, each under 25 words; [] if none"], "draft": "full email text with \\n newlines", "resolution_details": "1-2 lines for closures, else empty string"}
Be concise. Do not explain your reasoning outside the JSON.`;

function slim(body, kind){
  let t = body;
  // drop quoted earlier messages in replies
  const cut = t.search(/\n\s*(From:\s.*\n\s*(Sent|Date|To)\s*:|De\s*:\s.*\n\s*Envoy|-{3,}\s*Original Message|On .{5,80} wrote:|Rubrik Support updated case|_{10,})/i);
  if (cut > 120) t = t.slice(0, cut);
  t = t.replace(/^(To|Cc|Objet|Subject)\s*:.*$/gim, "");
  t = t.replace(/This message contains information which may be confidential[\s\S]*$/i, "");
  t = t.replace(/Please note that this proactive case is monitored 24.?7[^\n]*/gi, "");
  t = t.replace(/\n(Thanks and Regards|Thanks & Regards|Best Regards|Kindest Regards|Regards|Cdlt|With Best Regards|Thanks and regards)[,!.]?\s*\n[\s\S]{0,500}$/i, "\n[signature]");
  t = t.replace(/\n{2,}/g, "\n").trim();
  const cap = kind==="internal" ? 700 : kind==="alert" ? 350 : kind==="rma" ? 300 : 1600;
  if (t.length > cap) t = t.slice(0, cap) + " …[trimmed]";
  return t;
}
function buildContext(c, comments, dtype, facts){
  const today = new Date();
  const def = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()+2));
  const lines = [];
  lines.push(`TODAY (UTC): ${utcDateStr(today)}`);
  lines.push(`Requested type: ${dtype}`);
  if (facts) lines.push(`User-supplied facts/instructions (override history, flag conflicts): ${facts}`);
  let desc = decode(c.Description);
  if (desc.length > 2500) desc = desc.slice(0, 2500) + " …[trimmed]";
  lines.push(`\nCASE ${c.CaseNumber}\nSubject: ${c.Subject}\nAccount: ${c["Account.Name"]}\nStatus: ${c.Status}\nResolution: ${c.Resolution__c}\nDescription:\n${desc}`);
  const FULL = 14, BUDGET = 22000;
  const n = comments.length;
  lines.push(`\nCOMMENT HISTORY (oldest first, ${n} comments; older ones shortened):`);
  const out = [];
  comments.forEach((cm, i)=>{
    const kind = classify(cm);
    const head = `--- #${i+1} | ${cm.CreatedDate} | ${cm["CreatedBy.Name"]} | ${kind}`;
    if (i < n - FULL){
      const one = decode(cm.CommentBody).replace(/\s+/g, " ").slice(0, 160);
      out.push(head + " | " + one);
    } else {
      out.push(head + "\n" + slim(decode(cm.CommentBody), kind));
    }
  });
  let text = out.join("\n");
  if (text.length > BUDGET) text = text.slice(text.length - BUDGET);
  lines.push(text);
  return {text: lines.join("\n"), defDate: utcDateStr(def)};
}

function parseJSON(raw){
  const s = typeof raw==="string" ? raw : (raw && (raw.text || raw.content || raw.result || JSON.stringify(raw)));
  const str = typeof s==="string" ? s : JSON.stringify(s);
  const a = str.indexOf("{"), b = str.lastIndexOf("}");
  if (a<0||b<a) return {draft: str, snapshot:[], flags:["Could not parse a structured response – showing raw output."], draft_type:"", resolution_details:""};
  try { return JSON.parse(str.slice(a,b+1)); }
  catch(e){ return {draft: str, snapshot:[], flags:["Could not parse a structured response – showing raw output."], draft_type:"", resolution_details:""}; }
}

function scrub(t){
  return String(t||"")
    .replace(/\bdata loss\b/gi,"data impact")
    .replace(/No data disruption to backup\/restore operations was observed\.?\s*/gi,"")
    .replace(/\barchive (this|the) case\b/gi,"close $1 case")
    .replace(/\*\*([^*\n]+)\*\*/g,"$1")
    .replace(/^#{1,6}\s+/gm,"");
}
