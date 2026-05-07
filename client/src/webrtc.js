// Shared ICE server list with dedicated Metered TURN credentials
const iceServerList = [
  // Standard high-reliability STUN servers
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' },

  // Public Free OpenRelay TURN (Temporary workaround for exceeded quota)
  // NOTE: For production reliability, upgrade your Metered.ca plan!
  { urls: "stun:openrelay.metered.ca:80" },
  {
    urls: "turn:openrelay.metered.ca:80",
    username: "openrelayproject",
    credential: "openrelayproject",
  },
  {
    urls: "turn:openrelay.metered.ca:443",
    username: "openrelayproject",
    credential: "openrelayproject",
  },
  {
    urls: "turn:openrelay.metered.ca:443?transport=tcp",
    username: "openrelayproject",
    credential: "openrelayproject",
  },
];

// Default config — tries direct P2P first, falls back to TURN
export const ICE_SERVERS = {
  iceServers: iceServerList,
  iceCandidatePoolSize: 10,
};

// Forced RELAY mode — always routes through TURN server
// Guarantees cross-network connectivity (different WiFi / mobile data)
export const ICE_SERVERS_RELAY = {
  iceServers: iceServerList,
  iceTransportPolicy: 'relay',
  iceCandidatePoolSize: 10,
};
