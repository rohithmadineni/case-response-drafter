/**
 * Content Script - Runs on Salesforce case pages
 * Extracts ALL visible text and parses it like Gemini does
 * This approach works regardless of DOM structure
 */

function extractCaseDetails() {
  try {
    // Get ALL visible text from the page (like Gemini does)
    const fullPageText = document.body.innerText;
    const pageHtml = document.body.innerHTML;

    console.log('📄 Full page text length:', fullPageText.length);

    const caseData = {};

    // ===== CASE NUMBER =====
    // Try multiple patterns
    let caseNumber = 'Unknown';

    // Pattern 1: URL
    const urlMatch = window.location.href.match(/\/([a-zA-Z0-9]{15,18})/);
    if (urlMatch) caseNumber = urlMatch[1];

    // Pattern 2: "Case Number: XXXXX"
    const caseNumMatch = fullPageText.match(/Case\s+Number\s*[:]\s*([0-9a-zA-Z]+)/i);
    if (caseNumMatch) caseNumber = caseNumMatch[1].trim();

    // Pattern 3: "Case 01234567"
    if (caseNumber === 'Unknown') {
      const simpleMatch = fullPageText.match(/Case\s+([0-9]{8})/i);
      if (simpleMatch) caseNumber = simpleMatch[1];
    }

    caseData.caseId = caseNumber;

    // ===== SUBJECT =====
    let subject = 'Unknown Case';

    // Pattern 1: "Subject: ..."
    const subjectMatch = fullPageText.match(/Subject\s*[:]\s*(.+?)(?:\n|$)/i);
    if (subjectMatch) subject = subjectMatch[1].trim();

    // Pattern 2: Page title
    if (!subject || subject === 'Unknown Case') {
      subject = document.title || 'Case';
    }

    caseData.subject = subject.substring(0, 150);

    // ===== ACCOUNT =====
    let account = 'Unknown';

    // Pattern 1: "Account Name: ..."
    const accountMatch = fullPageText.match(/Account\s+(?:Name)?\s*[:]\s*(.+?)(?:\n|$)/i);
    if (accountMatch) account = accountMatch[1].trim();

    // Pattern 2: Look for company names (ends with Inc, LLC, Corp, Ltd)
    if (account === 'Unknown') {
      const companyMatch = fullPageText.match(/([A-Z][A-Za-z\s&]+(?:Inc|LLC|Corp|Ltd|Limited|Company))/);
      if (companyMatch) account = companyMatch[1].trim();
    }

    caseData.account = account.substring(0, 100);

    // ===== STATUS =====
    let status = 'Open';

    // Pattern 1: "Status: ..."
    const statusMatch = fullPageText.match(/Status\s*[:]\s*([^\n]+)/i);
    if (statusMatch) status = statusMatch[1].trim();

    caseData.status = status.substring(0, 50);

    // ===== PRIORITY =====
    let priority = 'Normal';

    // Pattern 1: "Priority: P1 - Critical" or similar
    const priorityMatch = fullPageText.match(/Priority\s*[:]\s*([^\n]+)/i);
    if (priorityMatch) priority = priorityMatch[1].trim();

    caseData.priority = priority.substring(0, 50);

    // ===== CASE OWNER =====
    let owner = 'Unknown';

    // Pattern 1: "Case Owner: ..."
    const ownerMatch = fullPageText.match(/Case\s+Owner\s*[:]\s*([^\n]+)/i);
    if (ownerMatch) owner = ownerMatch[1].trim();

    // Pattern 2: "Assigned to: ..."
    if (owner === 'Unknown') {
      const assignedMatch = fullPageText.match(/Assigned\s+to\s*[:]\s*([^\n]+)/i);
      if (assignedMatch) owner = assignedMatch[1].trim();
    }

    caseData.owner = owner.substring(0, 100);

    // ===== DESCRIPTION / CASE SUMMARY =====
    let description = '';

    // Pattern 1: "Case Summary" or "Description"
    const descMatch = fullPageText.match(/(?:Case\s+Summary|Description)\s*[:]\s*([\s\S]{1,500}?)(?:\n\n|$)/i);
    if (descMatch) description = descMatch[1].trim();

    // Pattern 2: Initial Issue / Root Cause section
    if (!description) {
      const issueMatch = fullPageText.match(/Initial\s+Issue\s*[:]\s*([\s\S]{1,500}?)(?:\n\n|Root Cause|$)/i);
      if (issueMatch) description = issueMatch[1].trim();
    }

    caseData.description = description.substring(0, 500);

    // ===== COMMENTS / ACTIVITY HISTORY =====
    caseData.comments = [];

    // Extract all lines that look like comments (after timestamps or author names)
    const lines = fullPageText.split('\n');
    let inCommentSection = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      // Look for comment indicators
      if (line.match(/Comment|Activity|History|Message/i)) {
        inCommentSection = true;
      }

      // Extract actual comment text (multi-line blocks)
      if (inCommentSection && line.length > 10 && !line.match(/^[\d\/\-:]+$/)) {
        caseData.comments.push({
          author: 'Support Team',
          text: line.substring(0, 300)
        });
      }

      if (caseData.comments.length >= 5) break; // Limit to 5 most recent
    }

    // If no comments found, get page summary
    if (caseData.comments.length === 0) {
      const summary = fullPageText.substring(0, 800);
      caseData.comments = [{
        author: 'Case Information',
        text: summary
      }];
    }

    // ===== CREATED DATE =====
    let createdDate = 'Unknown';
    const dateMatch = fullPageText.match(/(?:Created|Opened)\s*[:]\s*([^\n]+)/i);
    if (dateMatch) createdDate = dateMatch[1].trim();

    caseData.createdDate = createdDate.substring(0, 50);

    console.log('✅ Case details parsed from page text:', caseData);
    return caseData;

  } catch (error) {
    console.error('❌ Error extracting case details:', error);
    return {
      caseId: 'ERROR',
      subject: 'Error reading page',
      account: 'N/A',
      status: 'N/A',
      priority: 'N/A',
      owner: 'N/A',
      description: 'Could not parse page: ' + error.message,
      comments: [],
      error: error.message
    };
  }
}

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getCaseDetails') {
    try {
      console.log('📋 Received request to extract case details');
      const details = extractCaseDetails();

      // Send back success response
      sendResponse({
        success: true,
        data: details
      });
    } catch (e) {
      console.error('❌ Error in message handler:', e);
      sendResponse({
        success: false,
        error: e.message
      });
    }
  }
});

// Auto-run on load to verify script is active
console.log('✅ IQS Content script loaded and ready');
