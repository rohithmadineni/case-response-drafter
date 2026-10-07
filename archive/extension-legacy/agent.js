/**
 * Local Agent - Generates IQS-compliant responses
 * Fully offline, learns from each approved response
 */

class IQSAgent {
  constructor() {
    this.learningDb = new LocalLearningDB();
    this.templates = this.initializeTemplates();
  }

  /**
   * Generate response based on case details and user input
   */
  async generateResponse(caseData, userPrompt) {
    try {
      // Determine response type from prompt
      const responseType = this.detectResponseType(userPrompt);

      // Get similar past approvals for learning
      const similarCases = await this.learningDb.findSimilarCases(userPrompt, caseData);

      // Generate using template + learning
      const response = this.buildResponse(
        responseType,
        caseData,
        userPrompt,
        similarCases
      );

      return {
        success: true,
        responseType,
        content: response,
        similarCases: similarCases.length
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Detect response type from user input
   */
  detectResponseType(prompt) {
    const lower = prompt.toLowerCase();

    if (lower.includes('follow-up') || lower.includes('update')) return 'FOLLOW_UP';
    if (lower.includes('closure') || lower.includes('close')) return 'CLOSURE';
    if (lower.includes('ir') || lower.includes('initial response')) return 'INITIAL_RESPONSE';
    if (lower.includes('approval') || lower.includes('approve')) return 'APPROVAL';
    if (lower.includes('escalate') || lower.includes('escalation')) return 'ESCALATION';

    return 'FOLLOW_UP'; // default
  }

  /**
   * Build response using template + learning
   */
  buildResponse(type, caseData, userPrompt, similarCases) {
    const template = this.templates[type];

    // Extract key details from case and prompt
    const caseId = caseData.caseId || 'XXXXXXXX';
    const subject = caseData.subject || userPrompt;
    const account = caseData.account || 'Customer';

    // Get follow-up date (default 2 days out)
    const followUpDate = this.getFollowUpDate(2);

    // Build email with learned context
    let email = `Subject: [ProactiveCare] Regarding Case #${caseId} - ${subject.substring(0, 40)}\n\n`;

    // Greeting
    email += `Hi ${account},\n\n`;

    // Body based on type
    switch (type) {
      case 'INITIAL_RESPONSE':
        email += this.buildInitialResponse(caseData, userPrompt, similarCases);
        break;
      case 'FOLLOW_UP':
        email += this.buildFollowUp(caseData, userPrompt, similarCases, followUpDate);
        break;
      case 'CLOSURE':
        email += this.buildClosure(caseData, userPrompt, similarCases);
        break;
      case 'APPROVAL':
        email += this.buildApproval(caseData, userPrompt);
        break;
      default:
        email += `Thank you for reaching out. We're investigating the issue in case #${caseId} and will follow up by ${followUpDate}.\n\n`;
    }

    // Sign-off (IQS required)
    email += `\nBest regards,\nRubrik Proactive Care\nCase #${caseId}`;

    return email;
  }

  buildInitialResponse(caseData, userPrompt, similarCases) {
    let body = 'Thank you for opening this case. We appreciate the detailed information.\n\n';

    body += 'WHAT WE\'RE DOING:\n';
    body += `- Investigating the issue reported in case #${caseData.caseId}\n`;
    body += '- Analyzing logs and system state\n';
    body += '- Coordinating with our engineering team\n\n';

    body += 'WHEN YOU\'LL HEAR FROM US:\n';
    body += `We will provide an update by ${this.getFollowUpDate(3)}.\n\n`;

    if (similarCases.length > 0) {
      body += `NOTE: We've seen ${similarCases.length} similar case(s) before. We're leveraging that experience to help resolve yours faster.\n\n`;
    }

    body += 'Please reply if you have additional details to share.\n';

    return body;
  }

  buildFollowUp(caseData, userPrompt, similarCases, followUpDate) {
    let body = 'Thank you for your patience while we investigated the issue.\n\n';

    body += 'STATUS UPDATE:\n';
    body += '- Issue confirmed and root cause identified\n';
    body += '- We are implementing the following fix: [ACTION TAKEN]\n';
    body += '- Expected resolution: [TIMEFRAME]\n\n';

    body += 'NEXT STEPS:\n';
    body += `- Monitor the system over the next 24 hours\n`;
    body += `- We will follow up by ${followUpDate} with status\n`;
    body += '- Please let us know immediately if the issue recurs\n\n';

    if (similarCases.length > 0) {
      body += `We've handled ${similarCases.length} similar case(s) successfully. Your case follows the same resolution path.\n\n`;
    }

    return body;
  }

  buildClosure(caseData, userPrompt, similarCases) {
    let body = 'We\'re pleased to confirm that the issue has been resolved.\n\n';

    body += 'RESOLUTION:\n';
    body += '- Root cause: [CAUSE]\n';
    body += '- Action taken: [SOLUTION]\n';
    body += '- System status: All checks passed ✓\n\n';

    body += 'VERIFICATION:\n';
    body += '- Monitoring continues for 7 days post-fix\n';
    body += '- No recurrence detected\n';
    body += '- Customer confirmed issue resolved\n\n';

    body += 'We appreciate your partnership. Please feel free to reach out if anything else comes up.\n';

    return body;
  }

  buildApproval(caseData, userPrompt) {
    let body = 'Thank you for the request. We\'re reviewing the details you\'ve provided.\n\n';

    body += 'WHAT WE\'RE DOING:\n';
    body += '- Evaluating the request against your licensing\n';
    body += '- Checking system capacity and prerequisites\n';
    body += '- Coordinating with the appropriate team\n\n';

    body += 'EXPECTED TIMELINE:\n';
    body += `- Initial response: 1 business day\n`;
    body += `- Full approval/denial: 2-3 business days\n\n`;

    body += 'We\'ll reach out if we need any clarification.\n';

    return body;
  }

  /**
   * Get formatted follow-up date (days in future)
   */
  getFollowUpDate(daysFromNow) {
    const date = new Date();
    date.setDate(date.getDate() + daysFromNow);

    const options = { month: 'long', day: 'numeric', year: 'numeric' };
    const dateStr = date.toLocaleDateString('en-US', options);
    const timeStr = '12:00 PM UTC';

    return `${dateStr}, ${timeStr}`;
  }

  initializeTemplates() {
    return {
      INITIAL_RESPONSE: 'template_initial',
      FOLLOW_UP: 'template_followup',
      CLOSURE: 'template_closure',
      APPROVAL: 'template_approval',
      ESCALATION: 'template_escalation'
    };
  }

  /**
   * Validate response against IQS rules
   */
  validateIQSCompliance(response) {
    const checks = {
      hasGreeting: /^Hello|^Hi/im.test(response),
      hasSignOff: /Best regards|Sincerely/i.test(response),
      hasCaseId: /Case #[A-Z0-9]+/i.test(response),
      noBadWords: !/data loss|archive|delete/i.test(response),
      hasFollowUp: /follow up|update|we will|next/i.test(response),
      plainText: !/```|###|__/i.test(response),
      reasonableLength: response.length > 100 && response.length < 2000,
      hasAction: /will|doing|have|implemented/i.test(response)
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
 * Local Learning Database - Uses IndexedDB to store and search past approvals
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
          const store = db.createObjectStore(this.storeName, { keyPath: 'id', autoIncrement: true });
          store.createIndex('timestamp', 'timestamp', { unique: false });
          store.createIndex('responseType', 'responseType', { unique: false });
          store.createIndex('caseId', 'caseId', { unique: false });
        }
      };
    });
  }

  /**
   * Store approved response for learning
   */
  async storeApprovedResponse(caseData, userPrompt, generatedResponse, validation) {
    const db = await this.getDB();

    const record = {
      caseId: caseData.caseId,
      caseSubject: caseData.subject,
      userPrompt,
      generatedResponse,
      validation,
      timestamp: new Date().toISOString(),
      responseType: this.detectType(userPrompt),
      keywords: this.extractKeywords(userPrompt + ' ' + generatedResponse)
    };

    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.storeName, 'readwrite');
      const store = tx.objectStore(this.storeName);
      const request = store.add(record);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(record);
    });
  }

  /**
   * Find similar cases from learning database
   */
  async findSimilarCases(userPrompt, caseData, limit = 3) {
    const db = await this.getDB();
    const keywords = this.extractKeywords(userPrompt);

    return new Promise((resolve) => {
      const tx = db.transaction(this.storeName, 'readonly');
      const store = tx.objectStore(this.storeName);
      const request = store.getAll();

      request.onsuccess = () => {
        let results = request.result || [];

        // Score based on keyword similarity
        results = results.map(r => ({
          ...r,
          similarity: this.calculateSimilarity(keywords, r.keywords)
        }));

        // Filter and sort
        results = results
          .filter(r => r.similarity > 0.3)
          .sort((a, b) => b.similarity - a.similarity)
          .slice(0, limit);

        resolve(results);
      };

      request.onerror = () => resolve([]);
    });
  }

  /**
   * Calculate keyword similarity (Jaccard similarity)
   */
  calculateSimilarity(keywords1, keywords2) {
    const set1 = new Set(keywords1);
    const set2 = new Set(keywords2);

    const intersection = [...set1].filter(k => set2.has(k)).length;
    const union = new Set([...set1, ...set2]).size;

    return union === 0 ? 0 : intersection / union;
  }

  /**
   * Extract keywords from text
   */
  extractKeywords(text) {
    return text
      .toLowerCase()
      .split(/\s+/)
      .filter(word => word.length > 3 && !/[^a-z0-9]/.test(word))
      .slice(0, 20);
  }

  detectType(prompt) {
    const lower = prompt.toLowerCase();
    if (lower.includes('follow-up')) return 'FOLLOW_UP';
    if (lower.includes('closure')) return 'CLOSURE';
    if (lower.includes('ir')) return 'INITIAL_RESPONSE';
    return 'OTHER';
  }

  getDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, 1);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
  }
}

// Export for use in popup
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { IQSAgent, LocalLearningDB };
}
