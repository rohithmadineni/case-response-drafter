# Proactive Support Sample Mails

Reference mails for Rubrik Proactive Support cases. Each sample is plain text, ready to copy into Salesforce.

House rules applied to every sample:

- Never "data loss". Never "No data disruption to backup/restore operations was observed".
- Use "close", never "archive".
- Every mail has a concrete next-update date (default: 2 days from today, 12:00 PM UTC) except closures.
- Business Impact appears in the first three mails of a case.
- No commands, log lines or internal IDs in customer mails.
- Closures are followed by 1-2 lines of Resolution Details (for the case record, not the customer).

Contents

1. Initial Response (IR)
2. Support tunnel
3. Follow-ups
4. Shipping, RMA and Field Engineer
5. Updates and approval requests
6. No further action: monitoring and asking for closure
7. Closures

---

## 1. Initial Response (IR)

### 1a. IR: Node Bad

```
Hello Team,

Greetings of the day! I hope you're doing well.

My name is Rohith, and I'm from the Proactive Support Team at Rubrik.

Our proactive monitoring system has detected a Node Bad alert on your Rubrik cluster, and I would like to investigate the alert and assist further:

===========
Description: Node Bad

Business Impact: The affected node was temporarily marked BAD but has since recovered to an OK state. The node is currently healthy, and no active production impact has been observed. However, if the condition recurs, it could affect workloads running on or protected by this node.

Case ID: 01318617

Cluster UUID: 10d20981-979d-429e-8bb8-3a58f129c701
Cluster Tag: rubrikhunt
Node: RVMHM197S002689
Incident Time (UTC): 2026-09-21 06:34:00
===========

Could you please enable the support tunnel for the cluster so we can begin our investigation?
App Tray → Settings → Customer Support → Support Tunnel

Could you please confirm whether any maintenance, activity, or outage occurred on the host side during the incident time?

Once I have access, I will begin reviewing the node status and provide you with an update on my findings by September 23, 2026, 12:00 PM UTC.

Please note that this proactive case is monitored 24×7, so feel free to reply at any time for immediate assistance.

Thanks and Regards,

Rohith Madineni
Customer Success Engineer – Proactive Support
Rubrik
```

If the node is still BAD, use this Business Impact instead: "The affected node is marked BAD. No active production impact has been observed. However, if the condition persists, it could affect workloads running on or protected by this node."

### 1b. IR: Hardware health check (power supply AC lost)

```
Hello Team,

Greetings of the day! I hope you're doing well.

My name is Rohith, and I'm from the Proactive Support Team at Rubrik.

Our proactive monitoring system has detected a hardware health check failure on your Rubrik cluster, and I would like to investigate the alert and assist further:

===========
Description: Hardware health check detected errors: PS2's AC cord and/or AC circuit must be checked.

Business Impact: Loss of power redundancy on the affected node, increasing the risk of node downtime and potential disruption to backup and recovery operations if the remaining power path fails.

Case ID: 01325005

Cluster UUID: 06fcbf46-a813-434b-abaa-ed1dea3e37d0
Cluster Tag: DCLFARBK01
Node: RVMHM223S007406
Incident Time (UTC): 2026-09-29 05:48:21
===========

This alert is raised when the power supply and its power cable are healthy and connected, but no power is reaching the cable. This usually indicates a power outage in the data center, or that the other end of the power cable is disconnected or loose at the rack.

Could you please confirm whether any activity was performed on your side, and verify the following:

* The PDUs supplying power to the Brik.
* The connection from the AC circuit to the PDU.
* The connection from the PDU to PS2 on the Brik.

To begin my investigation, could you please enable the support tunnel for the above cluster at your earliest convenience?
App Tray → Settings → Customer Support → Support Tunnel

Once I have access, I will review the node status and provide you with an update on my findings by October 1, 2026, 2:00 PM UTC, or sooner if you respond on the case.

Please note that this proactive case is monitored 24×7, so feel free to reply at any time for immediate assistance.

Thanks and Regards,

Rohith Madineni
Customer Success Engineer – Proactive Support
Rubrik
```

---

## 2. Support tunnel

### 2a. Asking to enable or re-enable the support tunnel

```
Hello Team,

Greetings!

We attempted to connect to the cluster, but the support tunnel is currently closed. Could you please re-enable the support tunnel and share the port number with us?
App Tray → Settings → Customer Support → Support Tunnel

Once I have access, I will continue the investigation and share my next update by October 8, 2026, 12:00 PM UTC.

Please note that this proactive case is monitored 24×7, so feel free to reply at any time if you have questions or require immediate assistance.

Thanks and Regards,

Rohith Madineni
Customer Success Engineer – Proactive Support
Rubrik
```

### 2b. Thanking for the support tunnel and starting the investigation (short)

```
Hello Israel,

Thank you for enabling the support tunnel. I have logged into the cluster and am now reviewing the alert.

I will share my findings by October 3, 2026, 5:00 PM UTC.

Please note that this proactive case is monitored 24×7, so feel free to reply at any time for immediate assistance.

Thanks and Regards,

Rohith Madineni
Customer Success Engineer – Proactive Support
Rubrik
```

### 2c. Thanking for the support tunnel and starting the investigation (with scope)

```
Hello Team,

Thank you for enabling the support tunnel.

With the support tunnel available, I will review the node and cluster health details, check the alert state around the incident time, and validate whether this is an active hardware power-path issue on the node or a transient condition around the reported incident time.

I will share my next update by September 8, 2026, 1:30 PM UTC.

Please note that this proactive case is monitored 24×7, so feel free to reply at any time for immediate assistance.

Thanks and Regards,

Rohith Madineni
Customer Success Engineer – Proactive Support
Rubrik
```

---

## 3. Follow-ups

### 3a. Follow-up: no response to the IR

```
Hello Team,

This is a follow-up on the Node Bad alert detected on node [Node] in your [Cluster Tag] cluster at [Incident Time] UTC.

Business Impact: The affected node was marked BAD. No active production impact has been observed. However, if the condition recurs, it could affect workloads running on or protected by this node.

To proceed with the investigation, could you please enable the support tunnel for the cluster?
App Tray → Settings → Customer Support → Support Tunnel

Could you also confirm whether any maintenance, activity, or outage occurred on the host side around the incident time?

I will follow up again by October 8, 2026, 12:00 PM UTC.

Please note that this proactive case is monitored 24×7, so feel free to reply at any time for immediate assistance.

Thanks and Regards,

Rohith Madineni
Customer Success Engineer – Proactive Support
Rubrik
```

### 3b. Follow-up: part delivered, asking self-replacement or Field Engineer

```
Hello Team,

This is a follow-up email.

From the available tracking details, I see that the part was delivered on Wednesday, August 26, 2026, at 10:21 AM.

Could you please let us know whether you will be performing the hardware replacement yourself, or whether you would like us to schedule a Rubrik Field Engineer? If you require a Field Engineer, please share a convenient time for the replacement. Please note that we require at least 24 hours' advance notice to schedule an engineer.

Please refer to the articles below for the disk replacement steps:
https://support.rubrik.com/s/article/000001599 - Disk replacement procedure
https://support.rubrik.com/s/article/000004750 - Turning on the red locate LED on the disk

I will follow up again by August 28, 2026, 12:00 PM UTC.

Please note that this proactive case is monitored 24×7, so feel free to reply at any time for immediate assistance.

Thanks and Regards,

Rohith Madineni
Customer Success Engineer – Proactive Support
Rubrik
```

### 3c. Follow-up: part delivered, offering a Zoom session

```
Hello Team,

This is a follow-up email.

From the available tracking details, I see that the part was delivered on Friday, August 28, 2026, at 09:56 AM.

Could you please let us know when you will be performing the hardware replacement? If you would like Rubrik's assistance, we are happy to schedule a Zoom session and guide you throughout the replacement.

Please refer to the articles below for the disk replacement steps:
https://support.rubrik.com/s/article/000001599 - Disk replacement procedure
https://support.rubrik.com/s/article/000004750 - Turning on the red locate LED on the disk

I will follow up again by August 30, 2026, 12:00 PM UTC.

Please note that this proactive case is monitored 24×7, so feel free to reply at any time for immediate assistance.

Thanks and Regards,

Rohith Madineni
Customer Success Engineer – Proactive Support
Rubrik
```

---

## 4. Shipping, RMA and Field Engineer

### 4a. Asking for shipping details

```
Hello Team,

Greetings!

Based on our investigation, the [failed part, e.g. disk / power supply / DIMM] on node [Node] in your [Cluster Tag] cluster needs to be replaced. To raise the RMA for the replacement part, could you please share the following shipping details:

* Contact name:
* Contact phone number:
* Contact email address:
* Complete shipping address (including postal code):
* Any site access or delivery instructions:

Once we receive these details, I will raise the RMA and share the tracking information as soon as the dispatch is confirmed. I will follow up again by October 8, 2026, 12:00 PM UTC.

Please note that this proactive case is monitored 24×7, so feel free to reply at any time for immediate assistance.

Thanks and Regards,

Rohith Madineni
Customer Success Engineer – Proactive Support
Rubrik
```

### 4b. Shipping details received, RMA raised

```
Hi Brian,

Thank you for the shipping details.

We have raised the RMA for the replacement disk, and the request is now in process. We will share the tracking information with you as soon as the dispatch is confirmed. I will share my next update by October 8, 2026, 12:00 PM UTC.

Please note that this proactive case is monitored 24×7, so feel free to reply at any time for immediate assistance.

Thanks and Regards,

Rohith Madineni
Customer Success Engineer – Proactive Support
Rubrik
```

### 4c. Field Engineer details

```
Hello Team,

Greetings of the day!

Please find the Field Engineer details below:

Name: MD Azizul Haque
Contact: +81 70-1577-6139
Email: operations@techsource-managaed.com.au

Arrival date: September 30, 2026
Arrival time: 09:00 AM (local time)

Please generate a site access ticket if required and share it with us, along with any special instructions the engineer will need on arrival.

Please note that this proactive case is monitored 24×7, so feel free to reply at any time for immediate assistance.

Thanks and Regards,

Rohith Madineni
Customer Success Engineer – Proactive Support
Rubrik
```

---

## 5. Updates and approval requests

### 5a. Approval request: remediation script

```
Hello Team,

Thank you for enabling the support tunnel. I have logged into the cluster and validated the alert.

An archival job is stuck in the UNDOING state. To resolve this, our engineering team has developed a remediation script. Running the script on cluster ntt_rubrik01 updates the internal metadata of child upload jobs that are stuck in a CANCELING/UNDOING loop due to a missing metadata field. This releases the held disk-space reservations so that queued archival upload operations can resume. The script runs as a live metadata update, and no cluster reboot, node restart, or service interruption is required.

Could you please confirm whether we have your approval to proceed? I will follow up by October 8, 2026, 12:00 PM UTC, or sooner once we receive your approval.

Please note that this proactive case is monitored 24×7, so feel free to reply at any time if you have questions or require immediate assistance.

Thanks and Regards,

Rohith Madineni
Customer Success Engineer – Proactive Support
Rubrik
```

### 5b. Recommendation paragraph: disk replacement with SAS reseat

Insert into an update mail when SAS link errors are found alongside a disk failure.

```
The failed disk needs to be physically replaced. During the replacement, we also recommend reseating the SAS controller and SAS cable on this node, as SAS link errors were detected that may have contributed to the failure.
```

### 5c. Update after an activity (node addition)

```
Hello Team,

We have completed the logical steps for adding the new node RVMHM264S008628.

After the logical steps, we verified that the node is stable and all FRUs are reporting healthy. The overall cluster is also healthy, and no active alerts are currently observed.

We will continue to monitor the cluster and keep you updated if any issues arise. I will provide my next update by July 29, 2026, 12:00 PM UTC.

Please note that this proactive case is monitored 24×7, so feel free to reply at any time if you encounter any issues or need immediate assistance.

Thanks and Regards,

Rohith Madineni
Customer Success Engineer – Proactive Support
Rubrik
```

---

## 6. No further action: monitoring and asking for closure

### 6a. 24-hour monitoring complete, asking to close

```
Hello Andrea,

Greetings!

We have monitored the cluster for the past 24 hours, and no alerts have been triggered since the incident. All FRUs in the cluster are currently healthy.

Given this, could you please confirm whether we can proceed to close this case? I will provide my next update by June 17, 2026, 5:00 PM UTC.

Please note that this proactive case is monitored 24×7, so feel free to reply at any time if you have questions or require immediate assistance.

Thanks and Regards,

Rohith Madineni
Customer Success Engineer – Proactive Support
Rubrik
```

### 6b. No further action, monitoring period, then closure

```
Hello Team,

No further action is required at this time. We will continue to actively monitor the cluster and provide you with a status update by October 1, 2026, 12:00 PM UTC, or sooner if any additional alerts are triggered.

If the cluster remains stable with no new alerts during this period, could you please confirm whether we can proceed to close this case?

Please note that this proactive case is monitored 24×7, so feel free to reach out at any time for immediate assistance.

Thanks and Regards,

Rohith Madineni
Customer Success Engineer – Proactive Support
Rubrik
```

---

## 7. Closures

### 7a. Closure: site power outage (Resolution Summary format)

```
Hello Team,

Thank you for the update. This is regarding the closure of case 01247866.

Resolution Summary:

Issue: A proactive power supply alert was triggered on node RVMHM256S005681 in your AER-PPRD-RUBRIK01 cluster.

Business Impact: The power outage resulted in a temporary loss of power redundancy on the affected node, increasing the risk of node unavailability during the event window. No active production impact has been reported.

Root Cause: The alert was triggered by a site-level power outage on 2026-06-25.

Validation: Based on the cluster stats, all nodes are up following the power activity window on 2026-06-25, and the available health metrics confirm the cluster is healthy.

No further action is required at this time. If any new alerts are triggered, please reach out, and we will be happy to assist.

It has been a pleasure working with you on this case. With the cluster confirmed healthy and all nodes stable, we are proceeding to close this case.

Thanks and Regards,

Rohith Madineni
Customer Success Engineer – Proactive Support
Rubrik
```

Resolution Details: A power supply alert on node RVMHM256S005681 was caused by a site-level power outage on 2026-06-25. After power was restored, cluster stats confirmed all nodes were up and the cluster was healthy, so the case was closed with no further action.

### 7b. Closure: disk replacement (Resolution Summary format)

```
Hello Team,

Greetings! This is regarding the closure of case 01231481.

Resolution Summary:
=======
Issue: A proactive hardware health check alert was triggered on the sbeurbckcluster1 cluster due to a disk failure on node RVMHM205S013749.

Business Impact: The faulty disk resulted in a loss of storage redundancy on the affected node, increasing the risk to cluster operations if additional failures had occurred during the event window.

Resolution: The faulty drive (Serial: WJG1PAC4) was logically removed from the cluster, and the replacement drive (Serial: VBH228YF) was successfully added. The cluster completed the data restripe across healthy nodes, and the replacement drive is now fully active.

Validation: We performed a thorough health check. All nodes and FRUs in the cluster are healthy, storage redundancy has been fully restored, and no active alerts have been observed.
=======

No further action is required at this time. If any new alerts are triggered, please reach out, and we will be happy to assist.

It has been a pleasure working with you on this case. With the cluster confirmed healthy and all nodes stable, we are proceeding to close this case.

Thanks and Regards,

Rohith Madineni
Customer Success Engineer – Proactive Support
Rubrik
```

Resolution Details: A failed disk on node RVMHM205S013749 caused a loss of storage redundancy. The disk was replaced and added back to the cluster, the data restripe completed, and a health check confirmed all nodes and FRUs are healthy with redundancy restored.

### 7c. Closure: customer confirmed maintenance (short)

```
Hello Team,

Thank you for confirming the maintenance activity at the site. We are glad to hear everything is good on your side.

No further action is required at this time. If any new alerts are triggered, please reach out, and we will be happy to assist.

It has been a pleasure working with you on this case. With the cluster confirmed healthy and all nodes stable, we are proceeding to close this case.

Thanks and Regards,

Rohith Madineni
Customer Success Engineer – Proactive Support
Rubrik
```

Resolution Details: The alert was caused by planned maintenance at the customer site, which the customer confirmed. The cluster and all nodes were healthy after the activity, so the case was closed with no further action.

### 7d. Closure: standard format (Problem Summary / Root Cause / Resolution Steps)

```
Hello [Name],

Thank you for your confirmation and patience while we investigated this alert.

Problem Summary:
A Node Bad alert was triggered on node [Node] in your [Cluster Tag] cluster at [Incident Time] UTC.

Root Cause:
[Plain-language root cause, e.g. the node entered a stale state during system startup after a host reboot.]

Resolution Steps:
* [Action taken, e.g. reviewed the node and cluster logs around the incident time.]
* [Fix applied, e.g. restarted the affected service on the node.]
* [Validation, e.g. confirmed the node is OK, all FRUs are healthy, and no new alerts were observed during monitoring.]

No further action is required at this time. If any new alerts are triggered, please reach out, and we will be happy to assist.

It has been a pleasure working with you on this case. With the cluster confirmed healthy and all nodes stable, we are proceeding to close this case.

Thanks and Regards,

Rohith Madineni
Customer Success Engineer – Proactive Support
Rubrik
```

If the customer never confirmed, open with "Thank you for your patience while we investigated this alert."

Resolution Details: [Issue in plain language]. [Action or fix applied], and [how it was validated and the current status].
