// Synthetic Lightning-style case page (no real customer data), shared by the extractor and popup tests.
"use strict";
const field = (api, label, value) => `<records-record-layout-item data-target-selection-name="sfdc:RecordField.Case.${api}"><span class="test-id__field-label">${label}</span>\n<span class="test-id__field-value"><lightning-formatted-text>${value}</lightning-formatted-text></span></records-record-layout-item>\n`;
const DESC = "The automated alert processing system at Rubrik has detected a possible issue on your Rubrik cluster.\n\nSummary of Alert:\nDescription: NodeBad: 4 is greater than or equal to threshold\nCluster UUID: 00000000-1111-2222-3333-444444444444\nCluster Tag: ACME-PROD-01\nNode: RVMHM000S000001\nIncident Time (UTC): 2026-09-29 02:54:30";
const EMAIL = "From: support@rubrik.com\nTo: it@acme.example\n\nHello Team,\nPlease enable the support tunnel so we can begin our investigation. I will update you by October 1, 2026, 12:00 PM UTC.\nThanks and Regards,\nRohith Madineni";
const item = (when, body, by) => `<li class="slds-timeline__item_expandable"><div class="slds-timeline__actors"><a>${by || "Rohith Madineni"}</a></div><div>${when}</div><div>${body}</div></li>\n`;

const PAGE = `<div class="slds-page-header">Case 01318617</div>\n` +
  field("CaseNumber", "Case Number", "01318617") + field("Subject", "Subject", "[AcmeCorp] Proactive Case: (Cluster name: ACME-PROD-01) Node is Bad") +
  field("Status", "Status", "Waiting for Customer Input") + field("Priority", "Priority", "P3") + field("AccountId", "Account Name", "AcmeCorp") +
  field("Description", "Description", DESC.replace(/\n/g, "<br>")) +
  `<ul>\n` +
  item("2026-09-29 04:00", EMAIL.replace(/\n/g, "<br>")) +
  item("2026-09-29 04:00", "Hello Team, Please enable the support tunnel so we can begin our investigation…") + // collapsed snippet of the same email
  item("2026-09-29 09:00", "Removed RVMHM000S000001 from impacted nodes", "alert bot") +
  `</ul>\n<div class="feed"><ul>` + item("2026-09-29 09:00", "Removed RVMHM000S000001 from impacted nodes", "alert bot") + `</ul></div>`; // same item in a second panel


module.exports = { field, item, DESC, EMAIL, PAGE };
