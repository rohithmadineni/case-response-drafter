# Salesforce Case Response Drafter

Reads the full history of a Rubrik Proactive Support case in Salesforce, works out where the case stands, and drafts the right next customer email in an IQS-compliant format: an Initial Response (IR), a follow-up or update, an approval request, a hold notice, or a closure. **Draft only. Never send email and never write to Salesforce.**

## Inputs

- Required: a Salesforce case number (e.g. 01334886).
- Optional: the draft type the user wants ("IR", "follow-up", "closure", "simple", "short"), or extra facts the user gives (e.g. "the issue is resolved, no new alerts"). User-supplied facts override what the case history implies, but flag any conflict.

## Steps

### 1. Pull the case and its full history

Use `mcp__salesforce__salesforce_query_records` (load it with ToolSearch if it is deferred). Run both queries in parallel:

- Case: objectName `Case`, fields `CaseNumber, Subject, Account.Name, Status, Resolution__c, Description`, whereClause `CaseNumber = '<case>'`.
- Comments: objectName `CaseComment`, fields `CommentBody, CreatedDate, CreatedBy.Name`, whereClause `ParentId IN (SELECT Id FROM Case WHERE CaseNumber = '<case>')`, orderBy `CreatedDate ASC`.

If the comment result is too large and is saved to a file, read the file in sequential chunks (offset/limit, about 150–250 lines per read; smaller if a read is truncated) until every record has been read. Do not draft from a partial history. If part could not be read, say which part.

Get today's date in UTC with `date -u +%Y-%m-%d` for date calculations.

### 2. Analyse the case (internal – do not paste into the email)

Build a short working picture:

- **Alert**: type, cluster tag/UUID, node(s), incident time(s) from the Description and any later alert-bot comments. Note if 2+ nodes or alerts arrived close together.
- **Who's who**: the customer contact's first name (the most recent customer reply). Customer replies appear as `CreatedBy.Name = Support Bot` with a non-Rubrik `From:`, or as the customer's own name. Rubrik emails come from `support@rubrik.com` with a To: line. Comments with only Cc: and command output are internal notes.
- **Timeline**: last customer message (date and content), last Rubrik customer-facing email (date and content), and every promise Rubrik made with its date.
- **Open asks**: what Rubrik asked the customer that is still unanswered, and what the customer asked Rubrik that is still unanswered.
- **Unanswered follow-ups**: count substantive Rubrik emails sent since the last customer reply.
- **Evidence**: findings from internal notes (node-status-history, syslog lines, hw_health, SEL, atop, RMA/shipment comments, "removed ... from impacted nodes" alert-bot notes).
- **Current health**: is the alert cleared? Is the cluster stated as healthy? Any monitoring period promised or requested?

### 3. Decide which draft to write

If the user named a type, write that type, but flag anything in the history that argues against it (for example, closing before a monitoring window the customer asked for has ended).

Otherwise pick the first row that matches:

| Situation in the history | Draft |
|---|---|
| No Rubrik customer-facing email yet | **Initial Response (IR)** |
| Customer confirmed the case can be closed, or the fix is applied, monitoring is done, and the cluster is healthy | **Closure** |
| Duplicate of another active case | **Duplicate closure** |
| 3+ substantive Rubrik follow-ups with no customer reply, and the alert has cleared / cluster stable | **Ghosted closure** |
| Customer asked to hold or monitor for a period that has not ended | **Hold acknowledgement** (do not close) |
| Root cause found and a change needs customer approval | **Approval request** |
| Customer gave approval | **Proceeding / will update within N hours** |
| Customer opened the tunnel, Rubrik hasn't replied with findings yet | **Tunnel ack + findings or investigation update** |
| Rubrik asked for the tunnel/info and the customer hasn't replied | **Follow-up** (state which number follow-up it is) |
| Tunnel connection failed | **Tunnel not accessible – reopen** |
| RMA / part / Field Engineer step pending | The matching hardware logistics snippet |
| Customer raised a concern or escalation | **Acknowledgement with an RCA commitment** |
| Fix applied and monitoring under way | **Monitoring update + request to close** |

### 4. Match the scenario

Use the Scenario Library below to pick the root-cause language, business impact, and closure steps. Only state a root cause the evidence supports. If the evidence is thin, say what was observed and what is still being checked.

### 5. Draft the email

Use the shared blocks and templates below. Fill every placeholder. Remove optional [bracketed] text that does not apply.

### 6. IQS self-check (fix before output)

- Non-closing email: **What** was found/done, **When** (concrete UTC date for the next update), **Why** (reason for the finding or ask). No When means Reliability 0/20.
- Among the first three customer-facing comments on the case: a **Business Impact** sentence.
- Closure: (1) problem summary + root cause, (2) resolution steps, (3) validation of current health, (4) a prevention or follow-up note where one applies.
- Ghosted closure: case closed out, outreach attempts acknowledged, status recapped, reopen invited.
- Don't ask the customer for anything they have already given (repetition penalty).
- Every promised date in the draft is realistic and in UTC.

### 7. Output

Return, in this order:

1. **Case snapshot**: 2–4 short lines with the stage, what you chose to draft and why, and the key evidence.
2. **Flags** (only if any): items from "Always flag" below, one line each.
3. **The draft**, between `---` lines, ready to paste.
4. For closures only: **Resolution Details**: 1–2 plain-language lines covering the issue, the fix, and how it was validated / current status.

Keep the snapshot and flags brief. Don't recap the whole history.

## Rules

**Wording**
- Never use the phrase "data loss".
- Never include the line "No data disruption to backup/restore operations was observed".
- Write "close this case", never "archive".
- Plain language. Explain jargon briefly the first time it appears (e.g. "the node's network bond (bond0)", "the hardware event log (SEL)").
- Correct grammar and spelling. Keep closures concise.

**Times and dates**
- All times in UTC. Include timestamps only where they matter (incident, BAD/revived, deadlines).
- Default next-update date: today + 2 days, 12:00 PM UTC, written as "October 7, 2026, 12:00 PM UTC".
- If the customer gave a date for their work (part arrival, replacement, maintenance), set the follow-up one day after the latest date they gave.
- Never leave [DATE] or [TIME] placeholders.

**Content that stays internal**
- No raw commands, `>>` log lines, debug output, internal insight IDs, internal Jira or engineering tickets, Slack links, or IPMI credentials.
- Short quoted error text is fine when the customer must act on it (e.g. a tunnel error).
- Public support.rubrik.com KB links are fine.

**Sign-off**
- Default:
  ```
  Thanks and Regards,

  Rohith Madineni
  Customer Success Engineer – Proactive Support
  Rubrik
  ```
- If the user pastes a snippet written by another engineer, keep that engineer's name and title.

**Always flag to the user (above the draft)**
- Closing earlier than a monitoring period the customer asked for.
- Customer questions in the thread that were never answered.
- Approval that came from a third party (e.g. an MSSP SOC) rather than the cluster owner.
- Multiple nodes or clusters affected at the same time (possible shared cause), especially events at the same second or the same clock time.
- Empty Account or contact data, or a contact that doesn't match the account.
- The Support Bot "unsupported CDM version" notice.
- Truncated log output that could hide another event.
- Anything the draft claims that the history does not prove (e.g. a part replacement that was never confirmed).

**Never**
- Send email, post to Salesforce, change case status, or contact anyone.
- Invent root causes, part numbers, RMA numbers, dates, or customer statements.

## Shared blocks

**IR opening**
```
Hello {{Name or Team}},

Greetings of the day! I hope you're doing well.

My name is Rohith, and I'm from the Proactive Support Team at Rubrik.

Our proactive monitoring system has detected {{a/an <alert>}} on your Rubrik cluster, and I would like to investigate the alert and assist further:
```

**Alert block**
```
===========
Description: {{alert}}

Business Impact: {{impact}}

Case ID: {{case}}

Cluster UUID: {{uuid}}
Cluster Tag: {{tag}}
Node: {{node}}
Incident Time (UTC): {{time}}
===========
```
For multiple nodes, replace the Node/Time lines with `Impacted Nodes and Incident Times (UTC):` followed by one line per node.

**Tunnel request**
```
Could you please enable the support tunnel for the cluster so we can begin our investigation?
App Tray → Settings → Customer Support → Support Tunnel
```

**Maintenance question** (Node Bad/Stale)
`Could you also confirm whether any maintenance, activity, or outage occurred on the host or network side around the incident time?`

**IR next step**
`Once I have access, I will review {{what}} and share my findings by {{date}}, 12:00 PM UTC.`
If the tunnel is already open: `The support tunnel is already open, so we are reviewing {{what}} now.`

**24×7 line**
`Please note that this proactive case is monitored 24×7, so feel free to reply at any time for immediate assistance.`

**Closure format**
```
Hello {{Name}},

Thank you for your confirmation and patience while we investigated this alert.

Problem Summary:
{{what was detected, where, when, current recovery}}

Root Cause:
{{plain-language cause supported by evidence}}

Resolution Steps:

* {{investigation step}}
* {{fix/action, with approval if applicable}}
* {{validation of current health}}
* {{prevention or follow-up, if applicable}}

No further action is required at this time. If any new alerts are triggered, please reach out, and we will be happy to assist.

It has been a pleasure working with you on this case. With the cluster confirmed healthy and all nodes stable, we are proceeding to close this case.

{{sign-off}}
```
Section headers are plain text. Use "Thank you for your patience" (without "confirmation") if the customer never confirmed.

**Ghosted closure**
```
Hello Team,

Thank you for your patience while we followed up on this alert.

Problem Summary:
{{alert summary}}

Outreach Summary:
Between {{first date}} and {{last date}}, we sent several emails [and called {{numbers}}] asking for {{ask}}, but we were unable to reach your team.

Current Status:
{{what is known}}. [Without tunnel access, we were not able to verify {{item}} directly.]

Next Steps:

* If {{condition}}, please reply to this thread and enable the support tunnel, and we will pick this up right away.
* If any new alerts are triggered on this cluster, we will reach out to you.

As we have not received a response and the cluster is currently stable, we are proceeding to close this case. You can reopen it at any time by replying to this email.

{{sign-off}}
```

**Business Impact lines**
- Node Bad, recovered: "The affected node was temporarily marked BAD but has since recovered. No active production impact has been observed. However, if the condition recurs, it could affect workloads running on or protected by this node."
- Multiple nodes: "With several nodes affected, the cluster has reduced resiliency, and backup and restore operations on these nodes may be affected."
- Disk flagged: "Leaving a degrading disk in place increases the risk of an unexpected disk failure and reduces the cluster's resiliency until it is replaced."
- DIMM missing: "The node may continue to operate with reduced memory, but this increases the risk of performance degradation or further hardware issues."
- PSU AC lost: "This removes power redundancy on the node; if the other power supply also loses power, the node could go down."
- IERR: "An unaddressed IERR increases the risk of an unplanned node failure."
- Log partition: "If it continues to fill, it can affect node stability and block CDM upgrade pre-checks."
- OS partition: "If it reaches the critical threshold of 2%, it could affect node stability and cluster operations." (Single-node cluster: "and with it, your backup and restore operations.")
- Read-only filesystem: "This can prevent backup jobs on this node from completing and reduces backup and recovery capacity until the disk is replaced."
- Archival stuck: "Stuck archival jobs hold cluster resources and can prevent new archival uploads from completing, which may delay copies of your data reaching the archival location."

## Scenario library

Match on the alert text and the evidence in internal notes. Customer-language root causes are shown in quotes.

**Node Bad / Stale – stale on startup** (node-status-history "Status stale on system startup"; boot lines in kern.log; `poweroff` in auth.log; log gap while the node was off)
"The node restarted [planned power-off / reboot / site power event]. During startup its status timestamp went stale before cluster communication was fully re-established, which triggered the alert. This is expected after a restart and does not indicate a hardware or software fault."
If it repeats at the same hour on many dates, ask about scheduled host/site activity.

**Node Bad – bond0 network loss** (syslog "bond0: now running without any active interface!", "NIC Link is Down" on both slaves)
"Both network interfaces in the node's network bond (bond0) lost their link at the same time, so the node had no connectivity and could not send its health updates. It recovered once connectivity returned." Physical nodes: point to the switch or cabling. Virtual edge (VRHV/VRVW/VREC): point to the host's virtual switch, host backups/checkpoints, patching, or NIC teaming. Drops starting within seconds of the hour (00:00, 08:00 UTC) mean a scheduled job. Check sibling clusters for the same second.

**Node Bad – IP conflict** (arping shows a non-Rubrik MAC answering for the node IP)
"Another device on the network is using the same IP address as the node, so it intermittently loses connectivity." Fix: the customer changes the device's IP. Prevention: reserve the node IPs or exclude them from DHCP.

**Node Bad – bond0/bond1 cross connection**
"The cabling or switch configuration links the node's two network bonds to each other, so traffic can take the wrong path." Fix (approval needed): bring bond1 down and make it persistent across reboots.

**Node Bad – memory pressure** (atop low available memory, high load/IO wait; many INDEX_SNAPPABLE_SNAPSHOTS guests; verification jobs; possible CockroachDB kronos stall; often 64 GB nodes)
"Several resource-intensive jobs (VM snapshot indexing and backup verification) ran at the same time and used up the node's memory. The node could not send its health updates in time and was marked BAD, then recovered once memory was freed. It was not a hardware failure, network problem, or crash." First occurrence: no change. Recurring: with approval, lower the number of indexing jobs allowed in memory at once (e.g. 5 → 3, no downtime). Prevention: stagger SLA Domain backup windows in RSC.

**Node Bad – SystemdCheck failure** (health-monitor "SystemdCheck check FAILED"; systemctl for udev/networking/dbus timing out)
"An operating system health check failed because the OS networking service had trouble bringing up the bonded interface, even though Rubrik services stayed up." Fix: controlled reboot. If it recurs across nodes, ask for the tunnel and investigate further.

**Node Bad – mdadm memory leak** (r7000 nodes, mdadm 4.3)
"A known memory leak in the upstream mdadm package (not a Rubrik bug) causes its monitoring process to keep using more memory until the node runs low; it is fixed in mdadm 4.5." Fix: stop and mask mdmonitor on all r7000 nodes, plus a daily safeguard job. The permanent fix arrives in a future CDM release.

**Node Bad – Azure storage queue saturation** (Azure VRAZ nodes; hv_storvsc rejections)
"A disk-identification check sends storage commands Azure's virtual disks don't support. Azure rejects them, they build up until the storage queue is full, and disk I/O blocks." Fix: apply the workaround (with approval).

**Node Bad – TCP retransmits / packet loss** (TCPRetransmitChecker > 1%)
"High packet retransmissions and packet loss on the node's network interface paused its health updates." Recommend checking upstream network devices for congestion.

**Node Bad – HPE firmware defect** (ASR events, "Unable to read memory SDR", old firmware baseline)
"An older firmware baseline with a known defect caused automatic recovery reboots." Fix: HPE-recommended SPP update, excluding TPM firmware.

**Node unreachable – node hardware failure** (no SSH/IPMI; power reverts to off; power cycle and reseat fail)
Path: physical power cycle → reseat → node RMA (shipping details) → Field Engineer or customer swap → logical setup → 24-hour monitoring → closure.

**Disk flagged / missing** ("DATA Disk /dev/sdX must be proactively replaced", "is missing", READY_TO_REMOVE)
Path: confirm in hw_health → shipping details → RMA → customer swaps → set up the disk → LEDs off → health check → monitoring → closure.

**Multiple disks missing** (hw_health "has 2 drives, 5 drives are required")
Path: power cycle (15–20 min downtime, approval) → reseat node, SAS cables, and disks → if the node fails, node RMA → if drives still fail, chassis/SAS connectors → after a chassis swap, check the PSUs.

**DIMM missing** ("Memory DIMM P1-DIMMxx is missing")
Path: confirm the slot → Dell: TSR (SupportAssist) from iDRAC; HPE: AHS from iLO → vendor case → part delivered → replacement → health check.

**PSU AC lost** ("PSx's AC cord and/or AC circuit must be checked")
"The power supply is healthy but isn't receiving power from its cable – usually a loose cable, a PDU problem, or a circuit/power event." The same PS across several nodes at once points to the PDU or circuit. Ask for on-site checks: connections, power source, reseat. A faulty PSU means replacement. If old SEL entries keep the alert active after the fix, back up the SEL and clear it with approval (no downtime).

**IERR** ("Node must be replaced. IERR reports a problem.")
CPU, memory, or motherboard fault. Confirm, then replace the node or part.

**High temperature** (high inlet temperature)
Airflow checks: blanking panels, cable management, aisle containment, solid front doors. Possibly a BIOS update (needs a downtime window and approval).

**Log partition capacity** (logs_partition_disk_space)
Find the large or old logs (e.g. job-fetcher, cockroach_backup_tool). With approval, clean them up and add a retention job. Note that this can block the CDM upgrade pre-check.

**OS partition capacity** (rubrik_root_os_partition_disk_space)
Identify the large files and clear them. If it recurs, find out why cleanup isn't automatic.

**ReadOnlyFileSystem – disk permanently failed**
Request the tunnel, then disk replacement. If the customer never responds, use the ghosted closure and do not claim the disk was replaced.

**Insight – VMware fingerprint mismatch**
IR uses Details / Cause / Fix from the case Description plus the KB link https://support.rubrik.com/s/article/000001297. If the tunnel shows no failing CREATE_VMWARE_SNAPSHOT jobs, close as no active issue after the insight refreshes (about 48 hours).

**Insight – HyperV RCT failures**
If the cluster is already on a fixed version, close as no active issue. Track unrelated failures in a new case.

**Insight – archival uploads stuck after CDM 9.6.0**
"The upgrade changed how archival job tracking is stored; jobs running at upgrade time lack the new information and keep retrying." Fix: with approval, a remediation script (live metadata update, no downtime) → re-scan shows none affected → uploads resume.

## Process snippets

Each of these is "Hello {{Name}}," + body + When line (unless noted) + 24×7 line + sign-off.

- **Follow-up for the tunnel**: "This is a follow-up on case {{case}}. Our proactive monitoring detected {{alert}} on node {{node}} in cluster {{tag}}, which has since recovered. We haven't yet received a response to our earlier request…" + tunnel request + Business Impact + When.
- **Tunnel not accessible**: quote the error, ask the customer to close and reopen the tunnel and share the new port, ask about maintenance, When.
- **Tunnel enabled**: "Thank you for enabling the support tunnel. I have logged into the cluster and confirmed {{current state}}. Next, we will review {{what}} to find out what triggered the alert…" + When.
- **Approval request**: finding in plain words → why the change → what the change does → downtime yes/no → "Could you please confirm if we can proceed?" + When.
- **Proceeding**: "Thank you for the confirmation. We will now proceed with {{activity}}. Once it's done, we will check the cluster's health…" + When (or "within the next N hours").
- **Hold**: "As requested, we will place this case on hold for {{period}} to allow time for {{reason}}, and will follow up by {{date}}."
- **Hold or close?**: "As the cluster is currently confirmed healthy with no further alerts observed, could you please let us know whether you'd like us to keep this case on hold or close it for now?" + When.
- **Monitoring + request to close**: what was done and validated → "We will continue to monitor… by {{date}}… If the cluster remains stable, could you please confirm whether we can proceed to close this case?"
- **Short summary requesting closure**: 3–4 bullets → "Since the cluster is healthy, could you please confirm if we can close this case?" + When.
- **Customer confirmed – close**: "Thank you for the confirmation. With the cluster confirmed healthy and no further alerts observed, we will proceed to close this case. If any new alerts are triggered, please reach out…" (no When, no 24×7 line).
- **Duplicate**: "As the alert triggered on this node is already being actively handled under case {{other}}, we are marking this case as a duplicate and proceeding to close it." (no When).
- **Snooze confirmation**: alert type, node, cluster, duration; note that nothing will be notified automatically while snoozed; ask them to confirm the period; date by which we'll apply it and close.
- **Shipping details request**: component and node → Ship To Contact Name / Email / Phone / Street / City / State/Province / Zip / Country.
- **Part delivered**: delivery date → self-replace or Field Engineer? → 24 hours' notice → replacement KB link.
- **FE scheduling**: preferred date/time, 24 hours' notice, site access ticket and instructions.
- **FE details**: Name / Email / Phone, plus a request for a site access ticket and arrival instructions (no When).
- **Smart Hands**: limited on-site availability acknowledged → eligible for Smart Hands → ask for date/time, 24 hours' notice.
- **Vendor case opened**: "{{Vendor}} case [{{number}}] opened, {{logs}} and shipping details uploaded; {{Vendor}} will confirm the fault and ship the part." + When.
- **Customer gave a replacement date**: restate the dates → ask them to tell us when it's done → offer a Zoom call → follow-up one day after their latest date.
- **Zoom scheduled**: date, local time, and UTC conversion → link → agenda → offer to reschedule (no When).
- **Escalation / recurring-issue acknowledgement**: name the concern → commit to an RCA and recommendations by {{date}} → ask them to keep the tunnel enabled.
- **Error information request**: exact error or screenshot, where/browser, fails at once or midway → why we need it → When.
