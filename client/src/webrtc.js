// ── WebRTC ICE Configuration ──
// Fetches TURN credentials dynamically from the backend (Twilio NTS).
// Falls back to free STUN-only if the backend is unreachable.

const API_URL = import.meta.env.VITE_API_URL || '';

// Minimal STUN-only fallback (works on same network, no TURN)
const FALLBACK_ICE = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun.cloudflare.com:3478' },
  ],
  iceCandidatePoolSize: 10,
};

// Cache so we don't hit the API on every peer connection
let cachedConfig = null;
let cacheExpiry = 0;

/**
 * Fetches fresh ICE server configuration.
 * Twilio tokens are short-lived (~24h), so we re-fetch when expired.
 * Returns a full RTCConfiguration object.
 */
export async function getIceConfig() {
  const now = Date.now();

  // Return cached config if still valid (refresh 5 min before expiry)
  if (cachedConfig && now < cacheExpiry - 300000) {
    return cachedConfig;
  }

  try {
    const res = await fetch(`${API_URL}/api/turn`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    if (data.iceServers && data.iceServers.length > 0) {
      cachedConfig = {
        iceServers: [
          // Always include Google STUN for fast P2P on same network
          { urls: 'stun:stun.l.google.com:19302' },
          ...data.iceServers,
        ],
        iceCandidatePoolSize: 10,
      };
      // Twilio tokens last ~24h; cache for 12h to be safe
      cacheExpiry = now + 12 * 60 * 60 * 1000;
      console.log('[WebRTC] Got fresh Twilio TURN credentials');
      return cachedConfig;
    }
  } catch (err) {
    console.warn('[WebRTC] Could not fetch TURN credentials, using STUN-only fallback:', err.message);
  }

  // Fallback: STUN-only (P2P works on same network, cross-network may fail)
  return FALLBACK_ICE;
}

// ── Legacy exports for backward compatibility ──
// These are used as immediate defaults before async fetch completes
export const ICE_SERVERS = FALLBACK_ICE;
export const ICE_SERVERS_RELAY = FALLBACK_ICE;
