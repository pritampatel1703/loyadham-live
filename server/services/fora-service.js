const net = require('net');

/**
 * FOR-A Video Switcher Service
 * Controls FOR-A HVS series via TCP serial protocol
 * Supports: HVS-100, HVS-110, HVS-2000, HVS-6000
 * Default port: 20001 (FOR-A TCP control)
 * 
 * FOR-A Protocol: ASCII text commands over TCP
 * Commands follow pattern: @<CMD><PARAM>\r\n
 */
class ForaService {
  constructor(ip = '192.168.1.100', port = 20001) {
    this.ip = ip;
    this.port = port;
    this.connected = false;
    this.lastError = '';
    this.modelName = 'FOR-A HVS Switcher';
    this.socket = null;
    this._programInput = null;
    this._previewInput = null;
    this._responseBuffer = '';
  }

  async connect(timeoutMs = 5000) {
    if (this.connected && this.socket) return { success: true, connected: true, model: this.modelName };

    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        if (!this.connected) {
          this.lastError = `Connection timeout to FOR-A at ${this.ip}:${this.port}`;
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
          console.log(`[FOR-A] ✅ Connected to ${this.ip}:${this.port}`);
          
          // Query model info
          this._send('@VER?\r\n');
          // Query ME1 PGM/PST bus
          this._send('@GPG,1\r\n');
          this._send('@GPS,1\r\n');
          
          resolve({ success: true, connected: true, model: this.modelName });
        });

        this.socket.on('data', (buf) => this._handleResponse(buf));
        this.socket.on('error', (err) => {
          clearTimeout(timer);
          this.lastError = err.message;
          this.connected = false;
          resolve({ success: false, connected: false, error: err.message });
        });
        this.socket.on('close', () => { this.connected = false; });
      } catch (err) {
        clearTimeout(timer);
        this.lastError = err.message;
        resolve({ success: false, connected: false, error: err.message });
      }
    });
  }

  _send(cmd) {
    if (this.socket && this.connected) {
      try { this.socket.write(cmd); } catch { /* ignore */ }
    }
  }

  _handleResponse(buf) {
    this._responseBuffer += buf.toString('ascii');
    const lines = this._responseBuffer.split('\r\n');
    this._responseBuffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('@VER,')) {
        this.modelName = 'FOR-A ' + trimmed.substring(5).trim();
      } else if (trimmed.startsWith('@GPG,')) {
        // Program bus response: @GPG,ME,INPUT
        const parts = trimmed.split(',');
        if (parts.length >= 3) this._programInput = parseInt(parts[2]);
      } else if (trimmed.startsWith('@GPS,')) {
        // Preset bus response: @GPS,ME,INPUT
        const parts = trimmed.split(',');
        if (parts.length >= 3) this._previewInput = parseInt(parts[2]);
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
      { id: 1, shortName: 'IN 1', longName: 'SDI Input 1' },
      { id: 2, shortName: 'IN 2', longName: 'SDI Input 2' },
      { id: 3, shortName: 'IN 3', longName: 'SDI Input 3' },
      { id: 4, shortName: 'IN 4', longName: 'SDI Input 4' },
      { id: 5, shortName: 'IN 5', longName: 'SDI Input 5' },
      { id: 6, shortName: 'IN 6', longName: 'SDI Input 6' },
      { id: 7, shortName: 'IN 7', longName: 'HDMI Input 7' },
      { id: 8, shortName: 'IN 8', longName: 'HDMI Input 8' },
      { id: 0, shortName: 'BLK', longName: 'Black' },
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
    if (this.connected) {
      this._send('@GPG,1\r\n');
      this._send('@GPS,1\r\n');
    }
    return { success: true, connected: this.connected, status: this.getStatusSync() };
  }

  // ═══ Production Controls ═══
  // FOR-A uses ME=1 for main ME bus

  async setProgram(input) {
    if (!this.connected) throw new Error('FOR-A not connected');
    this._send(`@SPG,1,${parseInt(input)}\r\n`); // Set PGM on ME1
    this._programInput = parseInt(input);
    return { success: true };
  }

  async setPreview(input) {
    if (!this.connected) throw new Error('FOR-A not connected');
    this._send(`@SPS,1,${parseInt(input)}\r\n`); // Set PST on ME1
    this._previewInput = parseInt(input);
    return { success: true };
  }

  async cut() {
    if (!this.connected) throw new Error('FOR-A not connected');
    this._send('@CUT,1\r\n'); // Cut on ME1
    const tmp = this._programInput;
    this._programInput = this._previewInput;
    this._previewInput = tmp;
    return { success: true };
  }

  async auto() {
    if (!this.connected) throw new Error('FOR-A not connected');
    this._send('@AUT,1\r\n'); // Auto transition on ME1
    return { success: true };
  }

  async fadeToBlack() {
    if (!this.connected) throw new Error('FOR-A not connected');
    this._send('@FTB\r\n');
    return { success: true };
  }

  async setTransitionPosition(position) {
    if (!this.connected) throw new Error('FOR-A not connected');
    const val = Math.max(0, Math.min(1000, Math.round(Number(position) * 1000)));
    this._send(`@TBA,1,${val}\r\n`);
    return { success: true };
  }

  async setTransitionStyle(style) {
    if (!this.connected) throw new Error('FOR-A not connected');
    // 0 = MIX, 1 = WIPE, 2 = DVE
    this._send(`@STY,1,${parseInt(style)}\r\n`);
    return { success: true };
  }

  async startRecording() { return { success: false, error: 'Recording not supported via FOR-A protocol' }; }
  async stopRecording() { return { success: false, error: 'Recording not supported via FOR-A protocol' }; }
  async startStreaming() { return { success: false, error: 'Streaming not supported via FOR-A protocol' }; }
  async stopStreaming() { return { success: false, error: 'Streaming not supported via FOR-A protocol' }; }
}

module.exports = ForaService;
