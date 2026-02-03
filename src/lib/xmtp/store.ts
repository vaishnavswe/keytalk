/**
 * Simple in-memory store for XMTP client.
 * For MVP, we don't persist across refresh.
 * Uses sessionStorage as fallback identifier to avoid cross-tab conflicts.
 */
import type { Client } from "@xmtp/browser-sdk";

// Use a combination of in-memory and sessionStorage key to isolate sessions
let xmtpClient: Client | null = null;
let sessionKey: string | null = null;

// Generate a unique session key for this browser tab
function getSessionKey(): string {
  if (!sessionKey) {
    if (typeof window !== 'undefined') {
      // Check if we have a session key in sessionStorage
      sessionKey = sessionStorage.getItem('keytalk-session') || 
                   `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      sessionStorage.setItem('keytalk-session', sessionKey);
    } else {
      sessionKey = `ssr-${Date.now()}`;
    }
  }
  return sessionKey;
}

export function setXmtpClient(client: Client): void {
  xmtpClient = client;
  // Store a flag that this session has an XMTP client
  if (typeof window !== 'undefined') {
    sessionStorage.setItem(`keytalk-client-${getSessionKey()}`, 'true');
  }
}

export function getXmtpClient(): Client | null {
  // Verify this session should have a client
  if (typeof window !== 'undefined') {
    const hasClient = sessionStorage.getItem(`keytalk-client-${getSessionKey()}`);
    if (!hasClient) {
      xmtpClient = null;
    }
  }
  return xmtpClient;
}

export function clearXmtpClient(): void {
  xmtpClient = null;
  if (typeof window !== 'undefined') {
    sessionStorage.removeItem(`keytalk-client-${getSessionKey()}`);
  }
}
