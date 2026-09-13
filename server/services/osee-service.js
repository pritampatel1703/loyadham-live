const net = require('net');

/**
 * OSEE GoStream Service
 * Controls OSEE GoStream Deck Pro / Duo via TCP protocol
 * Supports: GoStream Deck Pro, GoStream Deck Duo, GoStream Deck Mini
 * Default port: 9920 (OSEE TCP control - similar to ATEM protocol)
 * 
 * OSEE Protocol: Binary TCP protocol with structured command frames
 * Similar to Blackmagic ATEM protocol in concept but with OSEE-specific commands
 */
class OseeService {
  constructor(ip = '192.168.1.100', port = 9920) {
    this.ip = ip;
    this.port = port;
    this.connected = false;
    this.lastError = '';
    this.modelName = 'OSEE GoStream';
    this.socket = null;
    this._programInput = null;
    this._previewInput = null;
    this._recording = false;
    this._streaming = false;
    this._responseBuffer = Buffer.alloc(0);
  }

  _buildFrame(cmdId, data = []) {
    // OSEE frame: [Header(2)] [Length(2)] [CmdID(2)] [Data...] [Checksum(1)]
    const payload = Buffer.from([...data]);
    const length = 2 + payload.length; // cmdId(2) + data
    const frame = Buffer.alloc(2 + 2 + 2 + payload.length + 1);
    frame.writeUInt16BE(0xA55A, 0); // Header magic
    frame.writeUInt16BE(length, 2);
    frame.writeUInt16BE(cmdId, 4);
    payload.copy(frame, 6);
    
    // Checksum: XOR of all bytes after header
    let chk = 0;
    for (let i = 2; i < frame.length - 1; i++) chk ^= frame[i];
    frame[frame.length - 1] = chk;
    
    return frame;
  }

  async connect(timeoutMs = 5000) {
    if (this.connected && this.socket) return { success: true, connected: true, model: this.modelName };

    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        if (!this.connected) {
          this.lastError = `Connection timeout to OSEE at ${this.ip}:${this.port}`;
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
          console.log(`[OSEE] ✅ Connected to ${this.ip}:${this.port}`);
          
          // Query device info
          this._send(this._buildFrame(0x0001)); // Device info query
          // Query current state
          this._send(this._buildFrame(0x0100)); // PGM/PVW query
          
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

  _send(buffer) {
    if (this.socket && this.connected) {
      try { this.socket.write(buffer); } catch { /* ignore */ }
    }
  }

  _handleResponse(buf) {
    this._responseBuffer = Buffer.concat([this._responseBuffer, buf]);
    
    // Parse frames from buffer
    while (this._responseBuffer.length >= 7) {
      // Check for valid header
      if (this._responseBuffer.readUInt16BE(0) !== 0xA55A) {
        // Skip until we find a valid header
        const idx = this._responseBuffer.indexOf(Buffer.from([0xA5, 0x5A]), 1);
        if (idx === -1) { this._responseBuffer = Buffer.alloc(0); return; }
        this._responseBuffer = this._responseBuffer.slice(idx);
        continue;
      }

      const frameLen = this._responseBuffer.readUInt16BE(2);
      const totalLen = 2 + 2 + frameLen + 1; // header + length + data + checksum

      if (this._responseBuffer.length < totalLen) return; // Wait for more data

      const cmdId = this._responseBuffer.readUInt16BE(4);
      const dataStart = 6;
      const dataEnd = totalLen - 1;

      // Process command responses
      if (cmdId === 0x0001 && dataEnd > dataStart) {
        // Device info response
        const nameBytes = this._responseBuffer.slice(dataStart, dataEnd);
        const name = nameBytes.toString('ascii').replace(/\0/g, '').trim();
        if (name) this.modelName = 'OSEE ' + name;
      } else if (cmdId === 0x0100) {
        // PGM/PVW status
        if (dataEnd - dataStart >= 2) {
          this._programInput = this._responseBuffer[dataStart];
          this._previewInput = this._responseBuffer[dataStart + 1];
        }
      } else if (cmdId === 0x0200) {
        // Recording/streaming status
        if (dataEnd - dataStart >= 2) {
          this._recording = this._responseBuffer[dataStart] === 1;
          this._streaming = this._responseBuffer[dataStart + 1] === 1;
        }
      }

      // Move to next frame
      this._responseBuffer = this._responseBuffer.slice(totalLen);
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
      { id: 5, shortName: 'AUX', longName: 'Auxiliary' },
      { id: 6, shortName: 'STILL', longName: 'Still Store' },
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
      streaming: this._streaming,
      recording: this._recording,
      downstreamKeyer: false,
      macros: [],
      lastError: this.lastError
    };
  }

  async getStatus() {
    if (this.connected) {
      this._send(this._buildFrame(0x0100)); // Query PGM/PVW
      this._send(this._buildFrame(0x0200)); // Query recording/streaming
    }
    return { success: true, connected: this.connected, status: this.getStatusSync() };
  }

  // ═══ Production Controls ═══

  async setProgram(input) {
    if (!this.connected) throw new Error('OSEE not connected');
    this._send(this._buildFrame(0x0101, [parseInt(input)]));
    this._programInput = parseInt(input);
    return { success: true };
  }

  async setPreview(input) {
    if (!this.connected) throw new Error('OSEE not connected');
    this._send(this._buildFrame(0x0102, [parseInt(input)]));
    this._previewInput = parseInt(input);
    return { success: true };
  }

  async cut() {
    if (!this.connected) throw new Error('OSEE not connected');
    this._send(this._buildFrame(0x0110));
    const tmp = this._programInput;
    this._programInput = this._previewInput;
    this._previewInput = tmp;
    return { success: true };
  }

  async auto() {
    if (!this.connected) throw new Error('OSEE not connected');
    this._send(this._buildFrame(0x0111));
    return { success: true };
  }

  async fadeToBlack() {
    if (!this.connected) throw new Error('OSEE not connected');
    this._send(this._buildFrame(0x0112));
    return { success: true };
  }

  async setTransitionPosition(position) {
    if (!this.connected) throw new Error('OSEE not connected');
    const val = Math.max(0, Math.min(10000, Math.round(Number(position) * 10000)));
    const hi = (val >> 8) & 0xFF;
    const lo = val & 0xFF;
    this._send(this._buildFrame(0x0113, [hi, lo]));
    return { success: true };
  }

  async setTransitionStyle(style) {
    if (!this.connected) throw new Error('OSEE not connected');
    this._send(this._buildFrame(0x0114, [parseInt(style)]));
    return { success: true };
  }

  async startRecording() {
    if (!this.connected) throw new Error('OSEE not connected');
    this._send(this._buildFrame(0x0201, [0x01]));
    this._recording = true;
    return { success: true };
  }

  async stopRecording() {
    if (!this.connected) throw new Error('OSEE not connected');
    this._send(this._buildFrame(0x0201, [0x00]));
    this._recording = false;
    return { success: true };
  }

  async startStreaming() {
    if (!this.connected) throw new Error('OSEE not connected');
    this._send(this._buildFrame(0x0202, [0x01]));
    this._streaming = true;
    return { success: true };
  }

  async stopStreaming() {
    if (!this.connected) throw new Error('OSEE not connected');
    this._send(this._buildFrame(0x0202, [0x00]));
    this._streaming = false;
    return { success: true };
  }
}

module.exports = OseeService;
