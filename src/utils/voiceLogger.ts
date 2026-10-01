/**
 * src/utils/voiceLogger.ts
 *
 * Implements turn-based voice metadata logging via JSON-RPC 2.0 tools/call.
 *
 * All upstream destination endpoints are managed through the VOICE_URL and VOICE_URL_LABEL
 * environment variables and routed through the server proxy to ensure zero
 * client-side credential or URL exposure.
 */

export interface VoiceTurnArguments {
  session_id: string;
  domain: string;
  customer_id: string;
  audio_url: string;
  duration_seconds: number;
  assistant: string;
  user: string;
  timestamp: string;
}

export interface VoiceTurnOptions {
  userText?: string;
  assistantText?: string;
  audioUrl?: string;
  durationSeconds?: number;
  domain?: string;
  sessionId?: string;
  customerId?: string;
  endpointUrl?: string;
}

export interface R2ChatRpcPayload {
  jsonrpc: '2.0';
  id: number;
  method: 'tools/call';
  params: {
    name: 'r2-chat';
    arguments: VoiceTurnArguments;
  };
}

const DEFAULT_PROXY_ENDPOINT = '/api/voice-logger';
const CUSTOMER_ID_KEY = 'voice_session_customer_id';
const ACTIVE_SESSION_KEY = 'voice_session_active_id';

let messageCounter = 1;
let currentSessionId: string | null = null;

/**
 * Returns a persistent customer ID from localStorage or creates a new one.
 */
export function getOrCreateCustomerId(): string {
  if (typeof window === 'undefined') {
    return 'cust_server';
  }
  let id = localStorage.getItem(CUSTOMER_ID_KEY);
  if (!id) {
    id = `cust_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    try {
      localStorage.setItem(CUSTOMER_ID_KEY, id);
    } catch {}
  }
  return id;
}

/**
 * Starts or resets the active voice session ID.
 */
export function startVoiceSession(customSessionId?: string): string {
  const newId = customSessionId || `sess_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  currentSessionId = newId;
  if (typeof window !== 'undefined') {
    try {
      sessionStorage.setItem(ACTIVE_SESSION_KEY, newId);
    } catch {}
  }
  return newId;
}

/**
 * Retrieves the current session ID, or initializes a new one if not present.
 */
export function getActiveSessionId(): string {
  if (currentSessionId) return currentSessionId;

  if (typeof window !== 'undefined') {
    const saved = sessionStorage.getItem(ACTIVE_SESSION_KEY);
    if (saved) {
      currentSessionId = saved;
      return saved;
    }
  }

  return startVoiceSession();
}

/**
 * Ends the active voice session and clears stored session key.
 */
export function endVoiceSession(): void {
  currentSessionId = null;
  if (typeof window !== 'undefined') {
    try {
      sessionStorage.removeItem(ACTIVE_SESSION_KEY);
    } catch {}
  }
}

/**
 * Resolves current domain in browser or server context.
 */
export function resolveDomain(overrideDomain?: string): string {
  if (overrideDomain && overrideDomain.trim()) return overrideDomain.trim();
  if (typeof window !== 'undefined' && window.location?.hostname) {
    return window.location.hostname;
  }
  return '';
}

/**
 * Sends turn-based voice metadata using the r2-chat tool schema.
 *
 * @param options Voice turn content and metadata
 * @returns Real response object from the endpoint
 * @throws Error if network or upstream responds with failure
 */
export async function sendVoiceTurnMetadata(options: VoiceTurnOptions): Promise<any> {
  const rpcId = messageCounter++;
  const sessionId = options.sessionId || getActiveSessionId();
  const customerId = options.customerId || getOrCreateCustomerId();
  const domain = resolveDomain(options.domain);
  const timestamp = new Date().toISOString();

  const payload: R2ChatRpcPayload = {
    jsonrpc: '2.0',
    id: rpcId,
    method: 'tools/call',
    params: {
      name: 'r2-chat',
      arguments: {
        session_id: sessionId,
        domain: domain,
        customer_id: customerId,
        audio_url: options.audioUrl || '',
        duration_seconds: Math.max(0, Math.round(options.durationSeconds || 0)),
        assistant: options.assistantText || '',
        user: options.userText || '',
        timestamp: timestamp,
      },
    },
  };

  const targetEndpoint = options.endpointUrl || DEFAULT_PROXY_ENDPOINT;

  const response = await fetch(targetEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/event-stream',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new Error(`Voice logger failed with status ${response.status}: ${errText}`);
  }

  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return await response.json();
  }

  return await response.text();
}
