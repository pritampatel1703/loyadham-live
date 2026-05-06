// ═══════════════════════════════════════════
//  Pixel Perfect Camera — Configuration
// ═══════════════════════════════════════════

// CHANGE THIS to your server's IP address on the same network
// Find it with: ipconfig (Windows) or ifconfig (Mac/Linux)
export const SERVER_URL = 'http://192.168.1.8:3001';

export const APP_VERSION = '2.0.0';
export const HEARTBEAT_INTERVAL = 5000; // ms
export const RECONNECT_INTERVAL = 3000;
export const MAX_RECONNECT_ATTEMPTS = 20;

export const STREAM_DEFAULTS = {
  resolution: { width: 1920, height: 1080 },
  fps: 30,
  bitrate: 4000, // kbps
  codec: 'H264',
  protocol: 'webrtc',
};

export const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
];
