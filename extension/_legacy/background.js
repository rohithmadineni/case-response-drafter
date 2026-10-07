/**
 * Background Service Worker
 * Keeps extension active and handles messaging
 */

console.log('🚀 Service Worker loaded');

// Handle extension installation
chrome.runtime.onInstalled.addListener((details) => {
  console.log('✅ Extension installed/updated:', details.reason);
});

// Keep service worker alive by handling messages
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('📨 Message received:', request.action, 'from', sender.url);

  if (request.action === 'getStatus') {
    sendResponse({ status: 'active', timestamp: Date.now() });
  }

  if (request.action === 'ping') {
    sendResponse({ pong: true });
  }

  // Keep listener alive for async responses
  return true;
});

// Periodic heartbeat to keep service worker warm
setInterval(() => {
  console.log('💓 Service worker heartbeat');
}, 30000);
