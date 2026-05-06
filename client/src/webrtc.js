// Shared ICE server config with dedicated Metered TURN credentials
export const ICE_SERVERS = {
  iceServers: [
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
  ],
  iceCandidatePoolSize: 10,
};
