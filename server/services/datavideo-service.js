const net = require('net');

/**
 * Datavideo Video Switcher Service
 * Controls Datavideo switchers via TCP (dVIP protocol)
 * Supports: SE-500HD, SE-650, SE-700, SE-1200MU, SE-2200, SE-3200, HS-1300, HS-1600T, HS-2200
 * Default port: 5728 (Datavideo dVIP)
 * 
 * dVIP Protocol: Binary TCP protocol sending hex command frames
 * Frame format: [STX][Length][Command][Data][Checksum][ETX]
 */
class DatavideoService {
  constructor(ip = '192.168.1.100', port = 5728) {
    this.ip = ip;
    this.port = port;
    this.connected = false;
    this.lastError = '';
    this.modelName = 'Datavideo Switcher';
    this.socket = null;
    this._state = {};
    this._programInput = null;
    this._previewInput = null;
    this._reconnectTimer = null;
  }

  _buildCommand(cmd, data = []) {
    // dVIP frame: 0x06 (STX) + length + cmd bytes + data + checksum + 0x04 (ETX)
    const payload = [...cmd, ...data];
    const len = payload.length;
    const frame = [0x06, len, ...payload];
    let checksum = 0;
    for (const b of payload) checksum ^= b;
    frame.push(checksum, 0x04);
    return Buffer.from(frame);
  }

  async connect(timeoutMs = 5000) {
    if (this.connected && this.socket) return { success: true, connected: true, model: this.modelName };

    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        if (!this.connected) {
          this.lastError = `Connection timeout to Datavideo at ${this.ip}:${this.port}`;
          if (this.socket) { this.socket.destroy(); this.socket = null; }
          resolve({ success: false, connected: false, error: this.lastError });
        }
      }, timeoutMs);

      try {
        this.socket = new net.Socket();

        this.socket.connect(this.port, this.ip, () => {
          clearTimeout(timer);
          this.connected = true;
          this.lastError = '';
          console.log(`[Datavideo] ✅ Connected to ${this.ip}:${this.port}`);
          
          // Query device info
          this._send(this._buildCommand([0x01, 0x00])); // Request device info
          
          resolve({ success: true, connected: true, model: this.modelName });
        });

        this.socket.on('data', (buf) => this._handleResponse(buf));
        this.socket.on('error', (err) => {
          clearTimeout(timer);
          this.lastError = err.message;
          this.connected = false;
          console.error(`[Datavideo Error] ${err.message}`);
          resolve({ success: false, connected: false, error: err.message });
        });
        this.socket.on('close', () => {
          this.connected = false;
        });
      } catch (err) {
        clearTimeout(timer);
        this.lastError = err.message;
        resolve({ success: false, connected: false, error: err.message });
      }
    });
  }

  _send(buffer) {
    if (this.socket && this.connected) {
      try { this.socket.write(buffer); } catch { /* ignore */ }
    }
  }

  _handleResponse(buf) {
    // Parse dVIP responses to track state
    if (buf.length >= 4 && buf[0] === 0x06) {
      const cmd = buf[2];
      if (cmd === 0x01) {
        // Device info response
        this.modelName = 'Datavideo ' + (buf.slice(3, buf.length - 2).toString('ascii').replace(/\0/g, '').trim() || 'Switcher');
      } else if (cmd === 0x82) {
        // PGM/PVW status response
        if (buf.length >= 5) {
          this._programInput = buf[3];
          this._previewInput = buf[4];
        }
      }
    }
  }

  async disconnect() {
    try {
      if (this.socket) { this.socket.destroy(); this.socket = null; }
      this.connected = false;
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  async testConnection() {
    if (this.connected) return { success: true, connected: true, model: this.modelName };
    return this.connect(4000);
  }

  getStatusSync() {
    const defaultInputs = [
      { id: 1, shortName: 'IN 1', longName: 'Input 1' },
      { id: 2, shortName: 'IN 2', longName: 'Input 2' },
      { id: 3, shortName: 'IN 3', longName: 'Input 3' },
      { id: 4, shortName: 'IN 4', longName: 'Input 4' },
      { id: 5, shortName: 'IN 5', longName: 'Input 5' },
      { id: 6, shortName: 'IN 6', longName: 'Input 6' },
    ];

    return {
      connected: this.connected,
      model: this.modelName,
      ip: this.ip,
      inputs: defaultInputs,
      programInput: this._programInput,
      previewInput: this._previewInput,
      inTransition: false,
      transitionPosition: 0,
      transitionStyle: 0,
      fadeToBlack: false,
      streaming: false,
      recording: false,
      downstreamKeyer: false,
      macros: [],
      lastError: this.lastError
    };
  }

  async getStatus() {
    // Request current state from hardware
    if (this.connected) {
      this._send(this._buildCommand([0x02, 0x00])); // Request PGM/PVW status
    }
    return { success: true, connected: this.connected, status: this.getStatusSync() };
  }

  // ═══ Production Controls ═══
  // dVIP commands: 0x80 = PGM select, 0x81 = PVW select, 0x83 = Cut, 0x84 = Auto

  async setProgram(input) {
    if (!this.connected) throw new Error('Datavideo not connected');
    const inputNum = parseInt(input) - 1; // 0-indexed internally
    this._send(this._buildCommand([0x80], [inputNum]));
    this._programInput = parseInt(input);
    return { success: true };
  }

  async setPreview(input) {
    if (!this.connected) throw new Error('Datavideo not connected');
    const inputNum = parseInt(input) - 1;
    this._send(this._buildCommand([0x81], [inputNum]));
    this._previewInput = parseInt(input);
    return { success: true };
  }

  async cut() {
    if (!this.connected) throw new Error('Datavideo not connected');
    this._send(this._buildCommand([0x83]));
    // Swap PGM/PVW tracking
    const tmp = this._programInput;
    this._programInput = this._previewInput;
    this._previewInput = tmp;
    return { success: true };
  }

  async auto() {
    if (!this.connected) throw new Error('Datavideo not connected');
    this._send(this._buildCommand([0x84]));
    return { success: true };
  }

  async fadeToBlack() {
    if (!this.connected) throw new Error('Datavideo not connected');
    this._send(this._buildCommand([0x85])); // FTB command
    return { success: true };
  }

  async setTransitionPosition(position) {
    if (!this.connected) throw new Error('Datavideo not connected');
    const val = Math.max(0, Math.min(255, Math.round(Number(position) * 255)));
    this._send(this._buildCommand([0x86], [val]));
    return { success: true };
  }

  async setTransitionStyle(style) {
    if (!this.connected) throw new Error('Datavideo not connected');
    this._send(this._buildCommand([0x87], [parseInt(style)]));
    return { success: true };
  }

  async startRecording() { return { success: false, error: 'Recording not supported via dVIP' }; }
  async stopRecording() { return { success: false, error: 'Recording not supported via dVIP' }; }
  async startStreaming() { return { success: false, error: 'Streaming not supported via dVIP' }; }
  async stopStreaming() { return { success: false, error: 'Streaming not supported via dVIP' }; }
}

module.exports = DatavideoService;
