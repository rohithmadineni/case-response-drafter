// Supabase client for the extension
// Handles all sync, search, and analytics

class SupabaseClient {
  constructor(projectUrl, anonKey) {
    this.projectUrl = projectUrl;
    this.anonKey = anonKey;
    this.headers = {
      'apikey': anonKey,
      'Authorization': `Bearer ${anonKey}`,
      'Content-Type': 'application/json'
    };
  }

  // ============= STORE APPROVED DRAFT =============

  async storeApprovedDraft(draft) {
    /**
     * Stores an approved draft and generates embedding for semantic search
     *
     * draft = {
     *   caseNumber: "0133XXXX",
     *   draftText: "Hello Team...",
     *   responseType: "Initial Response",
     *   subject: "...",
     *   accountName: "AcmeCorp",
     *   description: "...",
     *   status: "In Progress",
     *   alertType: "Node Bad",
     *   nodeId: "5",
     *   customerComments: 1,
     *   rubrikComments: 2
     * }
     */

    try {
      // Step 1: Generate embedding from draft text + case info
      const embeddingText = `
        ${draft.draftText}
        Alert: ${draft.alertType}
        Type: ${draft.responseType}
        Account: ${draft.accountName}
      `.trim();

      const embedding = await this._generateEmbedding(embeddingText);

      // Step 2: Store in database
      const response = await fetch(
        `${this.projectUrl}/rest/v1/approved_drafts`,
        {
          method: 'POST',
          headers: this.headers,
          body: JSON.stringify({
            case_number: draft.caseNumber,
            draft_text: draft.draftText,
            response_type: draft.responseType,
            subject: draft.subject,
            account_name: draft.accountName,
            description: draft.description,
            status: draft.status,
            alert_type: draft.alertType,
            node_id: draft.nodeId,
            customer_comments: draft.customerComments,
            rubrik_comments: draft.rubrikComments,
            embedding: embedding
          })
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to store draft: ${response.statusText}`);
      }

      const result = await response.json();
      console.log('Draft stored:', result);
      return result;
    } catch (e) {
      console.error('Store draft error:', e);
      throw e;
    }
  }

  // ============= FIND SIMILAR CASES =============

  async findSimilarDrafts(caseText, responseType = null, limit = 3) {
    /**
     * Find similar approved drafts based on semantic similarity
     * Returns top N matches with similarity scores
     */

    try {
      // Generate embedding for the input text
      const embedding = await this._generateEmbedding(caseText);

      // Query Supabase for similar drafts
      const query = new URLSearchParams();
      query.append('select', '*');
      query.append('order', 'embedding.distance');
      query.append('limit', limit.toString());

      // Use RPC function with cosine distance
      const response = await fetch(
        `${this.projectUrl}/rest/v1/rpc/find_similar_drafts`,
        {
          method: 'POST',
          headers: this.headers,
          body: JSON.stringify({
            p_embedding: embedding,
            p_limit: limit,
            p_response_type: responseType
          })
        }
      );

      if (!response.ok) {
        console.warn('Semantic search unavailable, returning empty');
        return [];
      }

      const results = await response.json();
      console.log('Found similar drafts:', results);
      return results;
    } catch (e) {
      console.error('Find similar error:', e);
      return []; // Graceful fallback
    }
  }

  // ============= GET STATS =============

  async getStats() {
    /**
     * Get overall stats about stored drafts
     */
    try {
      const response = await fetch(
        `${this.projectUrl}/rest/v1/rpc/get_stats`,
        {
          method: 'POST',
          headers: this.headers,
          body: '{}'
        }
      );

      if (!response.ok) return null;
      const result = await response.json();
      return result[0] || null;
    } catch (e) {
      console.error('Get stats error:', e);
      return null;
    }
  }

  // ============= RECORD EDITS =============

  async recordEdit(draftId, originalText, editedText, sectionChanged) {
    /**
     * Track what users edit in drafts
     * This helps improve templates over time
     */
    try {
      const response = await fetch(
        `${this.projectUrl}/rest/v1/draft_edits`,
        {
          method: 'POST',
          headers: this.headers,
          body: JSON.stringify({
            draft_id: draftId,
            original_text: originalText,
            edited_text: editedText,
            section_changed: sectionChanged
          })
        }
      );

      if (!response.ok) throw new Error('Failed to record edit');
      return await response.json();
    } catch (e) {
      console.error('Record edit error:', e);
    }
  }

  // ============= RECORD IQS SCORES =============

  async recordIQSScore(draftId, responseType, checksPassed, checksTotal, failedChecks) {
    /**
     * Track IQS validation results
     * Helps identify which checks fail most often
     */
    try {
      const response = await fetch(
        `${this.projectUrl}/rest/v1/iqs_scores`,
        {
          method: 'POST',
          headers: this.headers,
          body: JSON.stringify({
            draft_id: draftId,
            response_type: responseType,
            checks_passed: checksPassed,
            checks_total: checksTotal,
            failed_checks: failedChecks
          })
        }
      );

      if (!response.ok) throw new Error('Failed to record IQS score');
      return await response.json();
    } catch (e) {
      console.error('Record IQS score error:', e);
    }
  }

  // ============= RECORD ANALYTICS =============

  async recordAnalytic(metricName, metricValue, context = {}) {
    /**
     * Track custom analytics
     * Examples:
     * - metric: "approval_rate", value: 0.95, context: {responseType: "Closure"}
     * - metric: "edit_count", value: 1, context: {customerName: "AcmeCorp"}
     */
    try {
      const response = await fetch(
        `${this.projectUrl}/rest/v1/analytics`,
        {
          method: 'POST',
          headers: this.headers,
          body: JSON.stringify({
            metric_name: metricName,
            metric_value: metricValue,
            response_type: context.responseType,
            alert_type: context.alertType,
            customer_name: context.customerName
          })
        }
      );

      if (!response.ok) throw new Error('Failed to record analytic');
      return await response.json();
    } catch (e) {
      console.error('Record analytic error:', e);
    }
  }

  // ============= EMBEDDING GENERATION =============

  async _generateEmbedding(text) {
    /**
     * Generate embedding using Claude API
     * For MVP, we'll use a simple token-based embedding
     * Later: replace with actual embedding model
     */

    try {
      // For now, use a simple embedding based on text hash
      // In production: call OpenAI/Cohere/Claude to generate real embeddings

      // This is a placeholder - returns a random vector for demo
      // Real implementation would call: https://api.openai.com/v1/embeddings

      const embedding = this._hashToVector(text);
      return embedding;
    } catch (e) {
      console.error('Generate embedding error:', e);
      // Return null vector if embedding fails
      return Array(1536).fill(0);
    }
  }

  _hashToVector(text) {
    /**
     * TEMPORARY: Hash text to a vector
     * This is for MVP testing only
     *
     * In production, replace with:
     * - OpenAI embeddings: text-embedding-3-small
     * - or call Supabase's built-in embeddings if available
     */

    // Simple hash-based vector (1536 dimensions like OpenAI)
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      const char = text.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }

    // Generate deterministic vector from hash
    const vector = [];
    let seed = hash;
    for (let i = 0; i < 1536; i++) {
      // Pseudo-random number generator
      seed = (seed * 9301 + 49297) % 233280;
      vector.push((seed / 233280) * 2 - 1); // Normalize to [-1, 1]
    }

    return vector;
  }

  // ============= UTILITY: CHECK CONNECTION =============

  async checkConnection() {
    /**
     * Test if Supabase is reachable
     */
    try {
      const response = await fetch(
        `${this.projectUrl}/rest/v1/`,
        {
          method: 'GET',
          headers: this.headers
        }
      );
      return response.ok;
    } catch (e) {
      console.error('Connection check failed:', e);
      return false;
    }
  }
}

// Export for use in extension
if (typeof module !== 'undefined' && module.exports) {
  module.exports = SupabaseClient;
}
