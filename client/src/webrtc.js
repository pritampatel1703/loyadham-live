// Shared ICE server list with dedicated Metered TURN credentials
const iceServerList = [
  // Standard high-reliability STUN servers
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' },

  // Dedicated Metered TURN/STUN (bypasses restrictive symmetric NATs)
  { urls: "stun:stun.relay.metered.ca:80" },
  {
    urls: "turn:global.relay.metered.ca:80",
    username: "8cfe66e48e2624767802c667",
    credential: "mFuP68l/r58qCLDf",
  },
  {
    urls: "turn:global.relay.metered.ca:80?transport=tcp",
    username: "8cfe66e48e2624767802c667",
    credential: "mFuP68l/r58qCLDf",
  },
  {
    urls: "turn:global.relay.metered.ca:443",
    username: "8cfe66e48e2624767802c667",
    credential: "mFuP68l/r58qCLDf",
  },
  {
    urls: "turns:global.relay.metered.ca:443?transport=tcp",
    username: "8cfe66e48e2624767802c667",
    credential: "mFuP68l/r58qCLDf",
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
