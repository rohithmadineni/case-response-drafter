/**
 * IQS Agent V2 - Real Salesforce Proactive Support responses
 * Based on Proactive_Support_Sample_Mails.md standards
 */

class IQSAgentV2 {
  constructor() {
    this.learningDb = new LocalLearningDB();
    this.userSignature = this.loadSignature();
  }

  /**
   * Load or create user signature
   */
  loadSignature() {
    const stored = localStorage.getItem('iqs_user_signature');
    if (stored) {
      return JSON.parse(stored);
    }
    return null;
  }

  /**
   * Set user signature
   */
  setSignature(name, designation) {
    const signature = { name, designation };
    localStorage.setItem('iqs_user_signature', JSON.stringify(signature));
    this.userSignature = signature;
    return signature;
  }

  /**
   * Generate IQS-compliant response
   */
  async generateResponse(caseData, userPrompt) {
    try {
      if (!this.userSignature) {
        return {
          success: false,
          error: 'Signature required. Please set up your signature in Settings first.',
          needsSignature: true
        };
      }

      const responseType = this.detectResponseType(userPrompt);
      const caseSummary = this.buildCaseSummary(caseData, userPrompt);
      const responseBody = this.buildResponseBody(responseType, caseData, userPrompt, caseSummary);

      const response = this.formatEmail(responseBody, caseSummary);

      return {
        success: true,
        responseType,
        content: response,
        caseSummary: caseSummary,
        validation: this.validateIQSCompliance(response)
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Detect response type from user prompt
   */
  detectResponseType(prompt) {
    const lower = prompt.toLowerCase();

    if (lower.includes('initial') || lower.includes('ir')) return 'INITIAL_RESPONSE';
    if (lower.includes('follow')) return 'FOLLOW_UP';
    if (lower.includes('tunnel') || lower.includes('support tunnel')) return 'SUPPORT_TUNNEL';
    if (lower.includes('approval') || lower.includes('approve')) return 'APPROVAL';
    if (lower.includes('closure') || lower.includes('close')) return 'CLOSURE';
    if (lower.includes('shipping') || lower.includes('rma')) return 'SHIPPING';
    if (lower.includes('monitoring') || lower.includes('monitoring period')) return 'MONITORING';
    if (lower.includes('field engineer')) return 'FIELD_ENGINEER';

    return 'FOLLOW_UP';
  }

  /**
   * Build case summary from extracted data
   */
  buildCaseSummary(caseData, userPrompt) {
    let summary = {};

    // Case ID
    summary.caseId = caseData.caseId || 'Unknown';

    // Alert Type - extract from subject
    const subject = caseData.subject || '';
    if (subject.includes('Node Bad') || subject.includes('BAD')) {
      summary.alertType = 'Node Bad';
      summary.businessImpact = 'The affected node was marked BAD. No active production impact has been observed. However, if the condition recurs, it could affect workloads running on or protected by this node.';
    } else if (subject.includes('Hardware') || subject.includes('health')) {
      summary.alertType = 'Hardware Health Check';
      summary.businessImpact = 'Loss of hardware redundancy, increasing the risk of node downtime if additional failures occur.';
    } else if (subject.includes('Disk')) {
      summary.alertType = 'Disk Failure';
      summary.businessImpact = 'Loss of storage redundancy, increasing the risk to cluster operations if additional failures occur.';
    } else {
      summary.alertType = 'Proactive Alert';
      summary.businessImpact = 'Alert detected. Investigating impact.';
    }

    // Cluster info
    const clusterMatch = subject.match(/Cluster:?\s+([^\)]+)/i);
    summary.clusterTag = clusterMatch ? clusterMatch[1].trim() : 'Unknown Cluster';

    // Node info
    const nodeMatch = subject.match(/Node:?\s+([A-Z0-9]+)/i) || subject.match(/RVMHM\d+S\d+/);
    summary.node = nodeMatch ? (Array.isArray(nodeMatch) ? nodeMatch[1] || nodeMatch[0] : nodeMatch[0]) : 'Node';

    // Status
    summary.status = caseData.status || 'Active';

    // Account
    summary.account = caseData.account || 'Customer';

    // Incident time
    summary.incidentTime = this.extractIncidentTime(caseData);

    return summary;
  }

  /**
   * Extract incident time from case data
   */
  extractIncidentTime(caseData) {
    const text = (caseData.description || caseData.subject || '').toLowerCase();

    if (text.includes('utc') || text.match(/\d{4}-\d{2}-\d{2}/)) {
      const dateMatch = text.match(/\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}/);
      return dateMatch ? dateMatch[0] + ' UTC' : new Date().toISOString().slice(0, 19) + ' UTC';
    }

    return new Date().toISOString().slice(0, 19) + ' UTC';
  }

  /**
   * Build email body based on response type
   */
  buildResponseBody(type, caseData, userPrompt, summary) {
    let body = '';

    const greeting = this.getGreeting();
    const followUpDate = this.getFollowUpDate(2);

    switch (type) {
      case 'INITIAL_RESPONSE':
        body = this.buildIR(greeting, summary, followUpDate);
        break;
      case 'FOLLOW_UP':
        body = this.buildFollowUp(greeting, summary, followUpDate);
        break;
      case 'SUPPORT_TUNNEL':
        body = this.buildSupportTunnel(greeting, summary, followUpDate);
        break;
      case 'APPROVAL':
        body = this.buildApproval(greeting, summary, followUpDate, userPrompt);
        break;
      case 'CLOSURE':
        body = this.buildClosure(greeting, summary);
        break;
      case 'SHIPPING':
        body = this.buildShipping(greeting, summary, followUpDate);
        break;
      case 'MONITORING':
        body = this.buildMonitoring(greeting, summary, followUpDate);
        break;
      case 'FIELD_ENGINEER':
        body = this.buildFieldEngineer(greeting, summary);
        break;
      default:
        body = this.buildFollowUp(greeting, summary, followUpDate);
    }

    return body;
  }

  getGreeting() {
    const hour = new Date().getHours();
    if (hour < 12) return 'Hello Team,\n\nGreetings of the day! I hope you\'re doing well.';
    return 'Hello Team,\n\nGreetings!';
  }

  buildIR(greeting, summary, followUpDate) {
    return `${greeting}

My name is ${this.userSignature.name}, and I'm from the Proactive Support Team at Rubrik.

Our proactive monitoring system has detected a ${summary.alertType} alert on your Rubrik cluster, and I would like to investigate the alert and assist further:

===========
Description: ${summary.alertType}

Business Impact: ${summary.businessImpact}

Case ID: ${summary.caseId}

Cluster Tag: ${summary.clusterTag}

Node: ${summary.node}

Incident Time (UTC): ${summary.incidentTime}
===========

Could you please enable the support tunnel for the cluster so we can begin our investigation?
App Tray → Settings → Customer Support → Support Tunnel

Once I have access, I will begin reviewing the cluster status and provide you with an update on my findings by ${followUpDate}.

Please note that this proactive case is monitored 24×7, so feel free to reply at any time for immediate assistance.`;
  }

  buildFollowUp(greeting, summary, followUpDate) {
    return `${greeting}

This is a follow-up on the ${summary.alertType} alert detected on node ${summary.node} in your ${summary.clusterTag} cluster.

Business Impact: ${summary.businessImpact}

To proceed with the investigation, could you please enable the support tunnel for the cluster if not already enabled?
App Tray → Settings → Customer Support → Support Tunnel

I will follow up again by ${followUpDate}.

Please note that this proactive case is monitored 24×7, so feel free to reply at any time for immediate assistance.`;
  }

  buildSupportTunnel(greeting, summary, followUpDate) {
    return `${greeting}

Thank you for enabling the support tunnel. I have logged into the cluster and am now reviewing the ${summary.alertType} alert.

I will review the cluster health details and provide you with my findings by ${followUpDate}.

Please note that this proactive case is monitored 24×7, so feel free to reply at any time for immediate assistance.`;
  }

  buildApproval(greeting, summary, followUpDate, userPrompt) {
    const approvalText = userPrompt.includes('script') ? 'a remediation script' : 'a configuration change';
    return `${greeting}

Thank you for enabling the support tunnel. I have logged into the cluster and validated the alert.

To resolve this ${summary.alertType}, our engineering team has developed ${approvalText}. This will address the underlying issue without requiring a cluster reboot or service interruption.

Could you please confirm whether we have your approval to proceed? I will follow up by ${followUpDate}, or sooner once we receive your approval.

Please note that this proactive case is monitored 24×7, so feel free to reply at any time if you have questions or require immediate assistance.`;
  }

  buildClosure(greeting, summary) {
    const closureDate = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    return `${greeting}

Thank you for your patience while we investigated this alert. This is regarding the closure of case ${summary.caseId}.

Problem Summary:
A ${summary.alertType} alert was triggered on node ${summary.node} in your ${summary.clusterTag} cluster.

Business Impact:
${summary.businessImpact}

Resolution:
The cluster has been thoroughly investigated and validated. All nodes and FRUs are healthy, no active alerts are observed, and the cluster is operating normally.

No further action is required at this time. If any new alerts are triggered, please reach out, and we will be happy to assist.

It has been a pleasure working with you on this case. With the cluster confirmed healthy and all nodes stable, we are proceeding to close this case.`;
  }

  buildShipping(greeting, summary, followUpDate) {
    return `${greeting}

Based on our investigation, a hardware component on node ${summary.node} in your ${summary.clusterTag} cluster needs to be replaced. To raise the RMA for the replacement part, could you please share the following shipping details:

* Contact name:
* Contact phone number:
* Contact email address:
* Complete shipping address (including postal code):
* Any site access or delivery instructions:

Once we receive these details, I will raise the RMA and share the tracking information. I will follow up again by ${followUpDate}.

Please note that this proactive case is monitored 24×7, so feel free to reply at any time for immediate assistance.`;
  }

  buildMonitoring(greeting, summary, followUpDate) {
    return `${greeting}

No further action is required at this time. We will continue to actively monitor the cluster and provide you with a status update by ${followUpDate}, or sooner if any additional alerts are triggered.

If the cluster remains stable with no new alerts during this period, could you please confirm whether we can proceed to close this case?

Please note that this proactive case is monitored 24×7, so feel free to reach out at any time for immediate assistance.`;
  }

  buildFieldEngineer(greeting, summary) {
    return `${greeting}

Please find the Field Engineer details below:

Name: [Engineer Name]
Contact: [Phone]
Email: [Email]

Arrival date: [Date]
Arrival time: [Time] (local time)

Please generate a site access ticket if required and share it with us, along with any special instructions the engineer will need on arrival.

Please note that this proactive case is monitored 24×7, so feel free to reply at any time for immediate assistance.`;
  }

  /**
   * Get follow-up date (N days from now)
   */
  getFollowUpDate(daysFromNow) {
    const date = new Date();
    date.setDate(date.getDate() + daysFromNow);

    const options = { month: 'long', day: 'numeric', year: 'numeric' };
    const dateStr = date.toLocaleDateString('en-US', options);
    const timeStr = '12:00 PM UTC';

    return `${dateStr}, ${timeStr}`;
  }

  /**
   * Format final email with signature
   */
  formatEmail(body, summary) {
    let subject = `[ProactiveCare] Case #${summary.caseId} - ${summary.alertType}`;

    const signature = `\n\nThanks and Regards,\n\n${this.userSignature.name}\n${this.userSignature.designation}\nRubrik`;

    return `Subject: ${subject}\n\n${body}${signature}`;
  }

  /**
   * Validate IQS compliance
   */
  validateIQSCompliance(response) {
    const checks = {
      hasGreeting: /^Hello|^Hi/im.test(response),
      hasSignature: /Thanks and Regards/i.test(response) || /Best Regards/i.test(response),
      hasCaseId: /Case #[A-Z0-9]+/i.test(response),
      noBadWords: !/data loss|archive|delete/i.test(response),
      plainText: !/```|###|__|\*\*/i.test(response),
      hasFollowUpDate: /\d{1,2}:\d{2}\s*(?:AM|PM)|UTC/i.test(response),
      hasRubrik: /Rubrik/i.test(response),
      properLength: response.length > 200 && response.length < 3000,
      noPlaceholders: !/\[.*?\]/g.test(response.replace(/\[ProactiveCare\]/, ''))
    };

    const passed = Object.values(checks).filter(v => v).length;
    const total = Object.keys(checks).length;

    return {
      checks,
      passed,
      total,
      score: Math.round((passed / total) * 100)
    };
  }
}

/**
 * Local Learning Database - IndexedDB
 */
class LocalLearningDB {
  constructor() {
    this.dbName = 'IQSResponses';
    this.storeName = 'approvedResponses';
    this.initDB();
  }

  initDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, 1);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          db.createObjectStore(this.storeName, { keyPath: 'id', autoIncrement: true });
        }
      };
    });
  }

  async storeApprovedResponse(caseData, userPrompt, generatedResponse, validation) {
    const db = await this.getDB();

    const record = {
      caseId: caseData.caseId,
      userPrompt,
      generatedResponse,
      validation,
      timestamp: new Date().toISOString()
    };

    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.storeName, 'readwrite');
      const store = tx.objectStore(this.storeName);
      const request = store.add(record);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(record);
    });
  }

  async findSimilarCases(userPrompt, caseData, limit = 2) {
    const db = await this.getDB();

    return new Promise((resolve) => {
      const tx = db.transaction(this.storeName, 'readonly');
      const store = tx.objectStore(this.storeName);
      const request = store.getAll();

      request.onsuccess = () => {
        let results = request.result || [];
        results = results
          .filter(r => r.userPrompt && r.userPrompt.toLowerCase().includes('follow'))
          .slice(-limit);

        resolve(results);
      };

      request.onerror = () => resolve([]);
    });
  }

  getDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, 1);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
  }
}
