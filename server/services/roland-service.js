const net = require('net');

/**
 * Roland Video Switcher Service
 * Controls Roland switchers via TCP (Roland SMART TALLY / RCP protocol)
 * Supports: VR-1HD, VR-4HD, VR-6HD, VR-50HD MK II, V-02HD MK II, V-160HD, V-600UHD
 * Default port: 8023 (Roland RCP over TCP / telnet-style)
 * 
 * Roland RCP Protocol: ASCII text commands over TCP
 * Commands: "PGM input\r\n", "PST input\r\n", "CUT\r\n", "AUTO\r\n"
 */
class RolandService {
  constructor(ip = '192.168.1.100', port = 8023) {
    this.ip = ip;
    this.port = port;
    this.connected = false;
    this.lastError = '';
    this.modelName = 'Roland Switcher';
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
          this.lastError = `Connection timeout to Roland at ${this.ip}:${this.port}`;
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
          console.log(`[Roland] ✅ Connected to ${this.ip}:${this.port}`);
          
          // Query device version
          this._send('VER\r\n');
          // Query current state
          this._send('GPG\r\n'); // Get PGM
          this._send('GPS\r\n'); // Get PST (Preview)
          
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
      if (trimmed.startsWith('VER ')) {
        this.modelName = 'Roland ' + trimmed.substring(4).trim();
      } else if (trimmed.startsWith('GPG ')) {
        this._programInput = parseInt(trimmed.substring(4)) || null;
      } else if (trimmed.startsWith('GPS ')) {
        this._previewInput = parseInt(trimmed.substring(4)) || null;
      } else if (trimmed.startsWith('PGM ')) {
        this._programInput = parseInt(trimmed.substring(4)) || null;
      } else if (trimmed.startsWith('PST ')) {
        this._previewInput = parseInt(trimmed.substring(4)) || null;
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
      { id: 1, shortName: 'IN 1', longName: 'HDMI Input 1' },
      { id: 2, shortName: 'IN 2', longName: 'HDMI Input 2' },
      { id: 3, shortName: 'IN 3', longName: 'HDMI Input 3' },
      { id: 4, shortName: 'IN 4', longName: 'HDMI Input 4' },
      { id: 5, shortName: 'IN 5', longName: 'SDI Input 5' },
      { id: 6, shortName: 'IN 6', longName: 'SDI Input 6' },
      { id: 7, shortName: 'STILL', longName: 'Still Image' },
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
      this._send('GPG\r\n');
      this._send('GPS\r\n');
    }
    return { success: true, connected: this.connected, status: this.getStatusSync() };
  }

  // ═══ Production Controls ═══

  async setProgram(input) {
    if (!this.connected) throw new Error('Roland not connected');
    this._send(`PGM ${parseInt(input)}\r\n`);
    this._programInput = parseInt(input);
    return { success: true };
  }

  async setPreview(input) {
    if (!this.connected) throw new Error('Roland not connected');
    this._send(`PST ${parseInt(input)}\r\n`);
    this._previewInput = parseInt(input);
    return { success: true };
  }

  async cut() {
    if (!this.connected) throw new Error('Roland not connected');
    this._send('CUT\r\n');
    const tmp = this._programInput;
    this._programInput = this._previewInput;
    this._previewInput = tmp;
    return { success: true };
  }

  async auto() {
    if (!this.connected) throw new Error('Roland not connected');
    this._send('AUTO\r\n');
    return { success: true };
  }

  async fadeToBlack() {
    if (!this.connected) throw new Error('Roland not connected');
    this._send('FTB\r\n');
    return { success: true };
  }

  async setTransitionPosition(position) {
    if (!this.connected) throw new Error('Roland not connected');
    const val = Math.max(0, Math.min(255, Math.round(Number(position) * 255)));
    this._send(`TBAR ${val}\r\n`);
    return { success: true };
  }

  async setTransitionStyle(style) {
    if (!this.connected) throw new Error('Roland not connected');
    // 0 = MIX, 1 = WIPE, 2 = CUT
    this._send(`TRANS ${parseInt(style)}\r\n`);
    return { success: true };
  }

  async startRecording() { return { success: false, error: 'Recording not controllable via RCP' }; }
  async stopRecording() { return { success: false, error: 'Recording not controllable via RCP' }; }
  async startStreaming() {
    this._send('STREAM START\r\n');
    return { success: true };
  }
  async stopStreaming() {
    this._send('STREAM STOP\r\n');
    return { success: true };
  }
}

module.exports = RolandService;
