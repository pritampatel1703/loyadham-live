import { io } from 'socket.io-client';
import { SERVER_URL, HEARTBEAT_INTERVAL, RECONNECT_INTERVAL, MAX_RECONNECT_ATTEMPTS } from './config';

class ConnectionManager {
  constructor() {
    this.deviceSocket = null;
    this.signalingSocket = null;
    this.deviceId = null;
    this.deviceName = null;
    this.pairingToken = null;
    this.isConnected = false;
    this.reconnectAttempts = 0;
    this.heartbeatTimer = null;
    this.listeners = new Map();
    this.serverUrl = SERVER_URL;
  }

  setServerUrl(url) {
    this.serverUrl = url;
  }

  on(event, cb) {
    if (!this.listeners.has(event)) this.listeners.set(event, []);
    this.listeners.get(event).push(cb);
  }

  emit(event, data) {
    (this.listeners.get(event) || []).forEach(cb => cb(data));
  }

  off(event, cb) {
    if (!this.listeners.has(event)) return;
    if (cb) this.listeners.set(event, this.listeners.get(event).filter(fn => fn !== cb));
    else this.listeners.delete(event);
  }

  async pair(qrData) {
    try {
      const parsed = typeof qrData === 'string' ? JSON.parse(qrData) : qrData;
      this.serverUrl = parsed.server || this.serverUrl;
      this.pairingToken = parsed.token;
      this.deviceId = parsed.device_id;

      const res = await fetch(`${this.serverUrl}/api/devices/pair`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: this.pairingToken }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Pairing failed');

      this.deviceId = data.device_id;
      this.deviceName = data.device_name;
      this.emit('paired', { deviceId: this.deviceId, deviceName: this.deviceName });
      return data;
    } catch (err) {
      this.emit('error', { message: 'Pairing failed: ' + err.message });
      throw err;
    }
  }

  connect() {
    if (!this.deviceId) { this.emit('error', { message: 'Not paired yet' }); return; }

    this.deviceSocket = io(`${this.serverUrl}/devices`, { transports: ['websocket', 'polling'], reconnection: true, reconnectionAttempts: MAX_RECONNECT_ATTEMPTS, reconnectionDelay: RECONNECT_INTERVAL });
    this.signalingSocket = io(`${this.serverUrl}/signaling`, { transports: ['websocket', 'polling'], reconnection: true });

    this.deviceSocket.on('connect', () => {
      this.isConnected = true;
      this.reconnectAttempts = 0;
      this.deviceSocket.emit('device:register', { device_id: this.deviceId, pairing_token: this.pairingToken });
      this.emit('connected', {});
    });

    this.deviceSocket.on('device:registered', (data) => {
      this.deviceName = data.device_name;
      this.startHeartbeat();
      this.emit('registered', data);
    });

    this.deviceSocket.on('device:error', (data) => { this.emit('error', data); });

    this.deviceSocket.on('device:tally', (data) => { this.emit('tally', data); });

    // Forward remote camera commands from Production dashboard
    this.deviceSocket.on('camera-cmd', (data) => { this.emit('camera-cmd', data); });

    this.deviceSocket.on('disconnect', () => {
      this.isConnected = false;
      this.stopHeartbeat();
      this.emit('disconnected', {});
    });

    this.deviceSocket.on('reconnect_attempt', (n) => {
      this.reconnectAttempts = n;
      this.emit('reconnecting', { attempt: n });
    });

    this.deviceSocket.on('reconnect_failed', () => { this.emit('error', { message: 'Connection lost. Please restart.' }); });

    // Signaling events (for WebRTC)
    this.signalingSocket.on('connect', () => { this.signalingSocket.emit('join-room', { roomId: this.deviceId }); });
    this.signalingSocket.on('offer', (data) => { this.emit('webrtc:offer', data); });
    this.signalingSocket.on('answer', (data) => { this.emit('webrtc:answer', data); });
    this.signalingSocket.on('ice-candidate', (data) => { this.emit('webrtc:ice', data); });
  }

  startHeartbeat() {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (!this.isConnected || !this.deviceSocket) return;
      const heartbeat = this._getHeartbeatData ? this._getHeartbeatData() : {};
      this.deviceSocket.emit('device:heartbeat', heartbeat);
    }, HEARTBEAT_INTERVAL);
  }

  setHeartbeatProvider(fn) { this._getHeartbeatData = fn; }

  stopHeartbeat() { if (this.heartbeatTimer) { clearInterval(this.heartbeatTimer); this.heartbeatTimer = null; } }

  sendSignaling(event, data) { if (this.signalingSocket?.connected) this.signalingSocket.emit(event, data); }

  disconnect() {
    this.stopHeartbeat();
    this.deviceSocket?.disconnect();
    this.signalingSocket?.disconnect();
    this.isConnected = false;
    this.emit('disconnected', {});
  }

  destroy() { this.disconnect(); this.listeners.clear(); }
}

export default new ConnectionManager();
