/**
 * Injected script - runs directly on the page
 * Extracts case details and returns to popup
 */

function extractPageContent() {
  const pageText = document.body.innerText;
  const pageTitle = document.title;
  const pageUrl = window.location.href;

  console.log('📄 Extracting page content...');

  const caseData = {
    pageText: pageText,
    pageTitle: pageTitle,
    pageUrl: pageUrl,
    timestamp: new Date().toISOString()
  };

  // Try to extract case number
  const caseMatch = pageText.match(/(\d{8})|Case\s+Number\s*:\s*([^\n]+)/i);
  caseData.caseId = (caseMatch ? caseMatch[1] || caseMatch[2] : 'Unknown').trim();

  // Try to extract subject
  const subjectMatch = pageText.match(/Subject\s*:\s*([^\n]+)/i);
  caseData.subject = (subjectMatch ? subjectMatch[1] : pageTitle).trim().substring(0, 150);

  // Try to extract account
  const accountMatch = pageText.match(/Account\s+(?:Name)?\s*:\s*([^\n]+)/i);
  caseData.account = (accountMatch ? accountMatch[1] : 'Unknown').trim().substring(0, 100);

  // Try to extract status
  const statusMatch = pageText.match(/Status\s*:\s*([^\n]+)/i);
  caseData.status = (statusMatch ? statusMatch[1] : 'Open').trim().substring(0, 50);

  console.log('✅ Extracted data:', caseData);
  return caseData;
}

// Return the extracted data
extractPageContent();
