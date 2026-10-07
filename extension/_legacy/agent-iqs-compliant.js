/**
 * IQS-Compliant Agent - Based on Official IQS Scoring Guide
 * Generates responses that meet the 5 core IQS metrics:
 * 1. Business Impact (10 pts)
 * 2. Technical Definition (10 pts)
 * 3. WWW Quality (20 pts) - What, When, Why
 * 4. Reliability (20 pts) - Concrete deadlines
 * 5. Clear Resolution (15 pts) - Problem, Resolution, Validation
 */

class IQSCompliantAgent {
  constructor() {
    this.learningDb = new LocalLearningDB();
    this.userSignature = this.loadSignature();
  }

  loadSignature() {
    const stored = localStorage.getItem('iqs_user_signature');
    return stored ? JSON.parse(stored) : null;
  }

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
          error: 'Signature required',
          needsSignature: true
        };
      }

      const responseType = this.detectResponseType(userPrompt);
      const analysis = this.analyzeCaseForIQS(caseData, userPrompt);
      const response = this.buildIQSCompliantResponse(responseType, caseData, analysis);

      return {
        success: true,
        responseType,
        content: response,
        analysis: analysis,
        validation: this.validateIQSCompliance(response, analysis)
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Analyze case data for IQS compliance
   */
  analyzeCaseForIQS(caseData, userPrompt) {
    const analysis = {};

    // Extract alert type - check subject, alertDescription, and node info
    const subject = (caseData.subject || '').toLowerCase();
    const alertDesc = (caseData.alertDescription || '').toLowerCase();
    const nodeInfo = (caseData.node || '').toLowerCase();

    // Check description first (more reliable), then subject
    if (alertDesc.includes('nodebad') || subject.includes('node bad') || alertDesc.includes('node') && alertDesc.includes('bad')) {
      analysis.alertType = 'Node Bad';
      analysis.technicalIssue = 'Node marked BAD';
    } else if (alertDesc.includes('hardware') || subject.includes('hardware')) {
      analysis.alertType = 'Hardware Health Check';
      analysis.technicalIssue = 'Hardware failure detected';
    } else if (alertDesc.includes('disk') || subject.includes('disk')) {
      analysis.alertType = 'Disk Failure';
      analysis.technicalIssue = 'Disk component failure';
    } else if (alertDesc.includes('power') || alertDesc.includes('redundancy')) {
      analysis.alertType = 'Hardware Health Check';
      analysis.technicalIssue = 'Power redundancy loss detected';
    } else {
      analysis.alertType = 'Proactive Alert';
      analysis.technicalIssue = 'Alert triggered';
    }

    // Business Impact - connect to real-world consequences
    analysis.businessImpact = this.generateBusinessImpact(analysis.alertType, caseData);

    // Technical Definition - problem + plan
    analysis.problemStatement = this.generateProblemStatement(analysis.technicalIssue, caseData);
    analysis.concreteNextAction = this.getConcreteAction(userPrompt, analysis.alertType);
    analysis.rationale = this.generateRationale(analysis.alertType);

    // Reliability - concrete deadline (always required)
    analysis.deadline = this.getConcreteDeadline(2); // 2 days default

    // Clear Resolution - for closure responses
    analysis.includeResolution = userPrompt.toLowerCase().includes('closure') || userPrompt.toLowerCase().includes('close');

    return analysis;
  }

  /**
   * Generate Business Impact statement (IQS requirement)
   * Must be POSITIVE - what we're preventing, not what might go wrong
   */
  generateBusinessImpact(alertType, caseData) {
    const impacts = {
      'Node Bad': 'The affected node was marked BAD. No active production impact has been observed. However, if the condition recurs, it could affect workloads running on or protected by this node.',
      'Hardware Health Check': 'Loss of power redundancy on the affected node, increasing the risk of node downtime if the remaining power path fails.',
      'Disk Failure': 'Loss of storage redundancy, increasing the risk to cluster operations if additional failures occur during the event window.',
      'Proactive Alert': 'We have detected a potential issue on your cluster. Proactive investigation will help us prevent impact to your backup and recovery operations.'
    };

    return impacts[alertType] || impacts['Proactive Alert'];
  }

  /**
   * Generate problem statement (IQS: Technical Definition)
   */
  generateProblemStatement(technicalIssue, caseData) {
    const clusterTag = caseData.clusterTag || caseData.cluster || 'cluster';
    const nodeInfo = caseData.node ? ` on node ${caseData.node}` : '';

    // Use actual alert description if available
    if (caseData.alertDescription) {
      return `Alert Details: ${caseData.alertDescription}\n\nOur proactive monitoring system has identified this condition on your ${clusterTag} cluster${nodeInfo}. Investigation is required to determine the root cause and prevent potential impact to your backup and recovery operations.`;
    }

    // Fallback to generated statement
    const article = technicalIssue.toLowerCase().startsWith('alert') ? '' : 'A ';
    return `${article}${technicalIssue} on your ${clusterTag} cluster${nodeInfo}. Our proactive monitoring system identified this condition, which requires investigation to prevent potential impact to your backup and recovery operations.`;
  }

  /**
   * Get concrete next action (IQS: What)
   */
  getConcreteAction(userPrompt, alertType) {
    const lower = userPrompt.toLowerCase();

    if (lower.includes('tunnel') || lower.includes('support tunnel')) {
      return 'I have logged into the cluster and am now reviewing the alert condition';
    } else if (lower.includes('investigation')) {
      return 'I am analyzing the cluster logs and health metrics to identify the root cause';
    } else if (lower.includes('approval')) {
      return 'I am preparing a remediation plan for your approval';
    } else if (lower.includes('follow')) {
      return 'I am continuing the investigation and monitoring cluster status';
    } else if (lower.includes('closure') || lower.includes('close')) {
      return 'I am documenting the resolution with all details for case closure';
    }

    return 'I am investigating the alert condition and will provide findings';
  }

  /**
   * Generate rationale (IQS: Why)
   * Explain WHY you're taking the action
   */
  generateRationale(alertType) {
    const rationales = {
      'Node Bad': 'This will help us determine whether this was a transient condition or indicates an underlying node health issue.',
      'Hardware Health Check': 'This will identify the specific hardware component that needs attention and what remediation is required.',
      'Disk Failure': 'This will confirm whether the disk requires replacement and allow us to restore storage redundancy.',
      'Proactive Alert': 'This will help us understand the root cause and prevent potential impact to your cluster.'
    };

    return rationales[alertType] || rationales['Proactive Alert'];
  }

  /**
   * Get concrete deadline (IQS: When)
   * Must be a specific day/time, not vague like "soon" or "shortly"
   */
  getConcreteDeadline(daysFromNow) {
    const date = new Date();
    date.setDate(date.getDate() + daysFromNow);

    const day = date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    const time = '12:00 PM UTC';

    return `${day}, ${time}`;
  }

  /**
   * Detect response type
   */
  detectResponseType(prompt) {
    const lower = prompt.toLowerCase();

    if (lower.includes('initial') || lower.includes('ir')) return 'INITIAL_RESPONSE';
    if (lower.includes('thank') || lower.includes('update') || lower.includes('posted')) return 'THANK_YOU';
    if (lower.includes('follow')) return 'FOLLOW_UP';
    if (lower.includes('tunnel')) return 'SUPPORT_TUNNEL';
    if (lower.includes('approval')) return 'APPROVAL';
    if (lower.includes('closure') || lower.includes('close')) return 'CLOSURE';
    if (lower.includes('shipping')) return 'SHIPPING';

    return 'FOLLOW_UP';
  }

  /**
   * Build IQS-compliant response
   */
  buildIQSCompliantResponse(type, caseData, analysis) {
    const greeting = this.getGreeting();
    let body = '';

    // Defensive: ensure caseData has required properties
    const safeData = {
      caseId: caseData?.caseId || 'XXXXX',
      subject: caseData?.subject || 'Case',
      account: caseData?.account || 'Customer',
      ...caseData
    };

    switch (type) {
      case 'INITIAL_RESPONSE':
        body = this.buildInitialResponse(greeting, analysis, safeData);
        break;
      case 'THANK_YOU':
        body = this.buildThankYou(greeting, analysis);
        break;
      case 'FOLLOW_UP':
        body = this.buildFollowUp(greeting, analysis, safeData);
        break;
      case 'SUPPORT_TUNNEL':
        body = this.buildSupportTunnel(greeting, analysis);
        break;
      case 'APPROVAL':
        body = this.buildApproval(greeting, analysis);
        break;
      case 'CLOSURE':
        body = this.buildClosure(greeting, analysis, safeData);
        break;
      case 'SHIPPING':
        body = this.buildShipping(greeting, analysis);
        break;
      default:
        body = this.buildFollowUp(greeting, analysis, safeData);
    }

    const subject = `[ProactiveCare] Case #${safeData.caseId} - ${analysis.alertType}`;
    const signature = `\n\nThanks and Regards,\n\n${this.userSignature.name}\n${this.userSignature.designation}\nRubrik`;

    return `Subject: ${subject}\n\n${body}${signature}`;
  }

  getGreeting() {
    const hour = new Date().getHours();
    return hour < 12
      ? 'Hello Team,\n\nGreetings of the day! I hope you\'re doing well.'
      : 'Hello Team,\n\nGreetings!';
  }

  /**
   * Build Initial Response (IR)
   * Must include: Business Impact, Problem Statement, Concrete Action, Deadline, Rationale
   */
  buildInitialResponse(greeting, analysis, caseData) {
    const clusterInfo = caseData.clusterTag || caseData.cluster || 'cluster';
    const nodeInfo = caseData.node || 'Node';
    const incidentTime = caseData.incidentTime || new Date().toISOString().split('T')[0];

    return `${greeting}

My name is ${this.userSignature.name}, and I'm from the Proactive Support Team at Rubrik.

Our proactive monitoring system has detected a ${analysis.alertType} alert on your Rubrik cluster, and I would like to investigate the alert and assist further:

===========
Description: ${analysis.alertType}

Business Impact: ${analysis.businessImpact}

Case ID: ${caseData.caseId}

Cluster UUID: ${caseData.clusterUuid || 'N/A'}

Cluster Tag: ${clusterInfo}

Node: ${nodeInfo}

Incident Time (UTC): ${incidentTime}
===========

Could you please enable the support tunnel for the cluster so we can begin our investigation?
App Tray → Settings → Customer Support → Support Tunnel

Could you also confirm whether any maintenance, activity, or outage occurred on the host side around the incident time?

Once I have access, I will begin reviewing the node status and provide you with an update on my findings by ${analysis.deadline}.

Please note that this proactive case is monitored 24×7, so feel free to reply at any time for immediate assistance.`;
  }

  /**
   * Build Follow-up
   * Must include: What, When, Why (WWW Quality) + Problem Statement
   * Note: No generic maintenance question unless it's Node Bad alert
   */
  buildFollowUp(greeting, analysis, caseData) {
    const nodeInfo = caseData.node || 'the affected node';
    const clusterTag = caseData.clusterTag || 'your cluster';
    const incidentTime = caseData.incidentTime || 'the incident time';

    let maintenanceQuestion = '';
    if (analysis.alertType.includes('Node Bad')) {
      maintenanceQuestion = '\nCould you please confirm whether any maintenance, activity, or outage occurred on the host side around the incident time?';
    }

    return `${greeting}

This is a follow-up on the ${analysis.alertType} alert detected on node ${nodeInfo} in your ${clusterTag} cluster at ${incidentTime} UTC.

Business Impact: ${analysis.businessImpact}

To proceed with the investigation, could you please enable the support tunnel for the cluster?
App Tray → Settings → Customer Support → Support Tunnel${maintenanceQuestion}

I will follow up again by ${analysis.deadline}.

Please note that this proactive case is monitored 24×7, so feel free to reply at any time for immediate assistance.`;
  }

  /**
   * Build Support Tunnel Response - for when customer enables tunnel
   */
  buildSupportTunnel(greeting, analysis) {
    const isNodeBadAlert = analysis.alertType.includes('Node Bad') || analysis.alertType.includes('BAD');

    let scope = isNodeBadAlert
      ? 'I will review the node and cluster health details, check the alert state around the incident time, and validate whether this is an active hardware or node issue or a transient condition.'
      : 'I will review the cluster health details and determine the appropriate remediation steps.';

    return `${greeting}

Thank you for enabling the support tunnel.

With the support tunnel available, ${scope}

I will share my next update by ${analysis.deadline}.

Please note that this proactive case is monitored 24×7, so feel free to reply at any time for immediate assistance.`;
  }

  /**
   * Build Approval Request
   */
  buildApproval(greeting, analysis) {
    return `${greeting}

Thank you for your patience while I investigated this alert.

${analysis.problemStatement}

${analysis.concreteNextAction} to address this condition. This action will not require a cluster reboot or service interruption. ${analysis.rationale}

I need your approval to proceed with this remediation. Could you confirm whether we have authorization to proceed?

I will await your confirmation and will proceed immediately upon approval.

Please note that this proactive case is monitored 24×7, so feel free to reply at any time if you have questions.`;
  }

  /**
   * Build Closure
   * Must include: Problem Summary, Resolution Steps, Validation
   */
  buildClosure(greeting, analysis, caseData) {
    const alertType = analysis.alertType || 'alert';
    const nodeInfo = caseData.node || 'the affected node';
    const clusterTag = caseData.clusterTag || 'your cluster';

    return `${greeting}

Thank you for working with us on this case. This is regarding the closure of case ${caseData.caseId}.

Issue: A proactive ${alertType.toLowerCase()} alert was triggered on node ${nodeInfo} in your ${clusterTag} cluster.

Business Impact: ${analysis.businessImpact}

Validation: The cluster has been thoroughly reviewed. All nodes and FRUs are healthy, no active alerts are observed, and the cluster is operating normally.

No further action is required at this time. If any new alerts are triggered, please reach out, and we will be happy to assist.

It has been a pleasure working with you on this case. With the cluster confirmed healthy and all nodes stable, we are proceeding to close this case.`;
  }

  /**
   * Build Thank You / Status Update Response
   */
  buildThankYou(greeting, analysis) {
    return `${greeting}

Thank you for the update. I appreciate you keeping us posted on the progress.

I acknowledge receipt of your message and the activity you've completed. Please continue to update us as additional work is completed. I will monitor this case closely and provide any assistance needed.

I will follow up by ${analysis.deadline} to check on progress and ensure everything is proceeding smoothly.

Please note that this proactive case is monitored 24×7, so feel free to reply at any time for immediate assistance.`;
  }

  /**
   * Build Shipping/RMA Response
   */
  buildShipping(greeting, analysis) {
    return `${greeting}

Greetings!

Based on my investigation, a hardware component on your cluster needs to be replaced. To raise the RMA for the replacement part, could you please share the following shipping details:

* Contact name:
* Contact phone number:
* Contact email address:
* Complete shipping address (including postal code):
* Any site access or delivery instructions:

Once I receive these details, I will raise the RMA and share the tracking information as soon as the dispatch is confirmed. I will follow up again by ${analysis.deadline}.

Please note that this proactive case is monitored 24×7, so feel free to reply at any time for immediate assistance.`;
  }

  /**
   * Validate IQS Compliance
   */
  validateIQSCompliance(response, analysis) {
    const checks = {
      hasBusinessImpact: /impact|redundancy|risk|condition|issue/i.test(response),
      hasProblemStatement: /detected|alert|condition|issue|found/i.test(response),
      hasConcreteAction: /investigating|reviewing|monitoring|proceeding|will proceed/i.test(response),
      hasConcreteDeadline: /\d{1,2}:\d{2}\s*(?:AM|PM|UTC)|(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|Today|Tomorrow)/i.test(response),
      hasRationale: /so that|to|will help|prevent|understand/i.test(response),
      hasSignature: /Thanks and Regards/i.test(response),
      hasCaseId: /Case #\d/i.test(response),
      noVagueLanguage: !/soon|shortly|asap|when i know more/i.test(response),
      plainText: !/```|###|\*\*/i.test(response)
    };

    const passed = Object.values(checks).filter(v => v).length;
    const total = Object.keys(checks).length;

    return {
      checks,
      passed,
      total,
      score: Math.round((passed / total) * 100),
      meetsStandard: (passed / total) >= 0.75 // 75% = Meeting Standards
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

  async findSimilarCases(userPrompt, limit = 2) {
    const db = await this.getDB();

    return new Promise((resolve) => {
      const tx = db.transaction(this.storeName, 'readonly');
      const store = tx.objectStore(this.storeName);
      const request = store.getAll();

      request.onsuccess = () => {
        let results = request.result || [];
        results = results.slice(-limit);
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
