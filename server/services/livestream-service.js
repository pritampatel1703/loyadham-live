const fetch = require('node-fetch');

/**
 * Livestream / Mevo Service
 * Controls Livestream Studio and Mevo cameras via HTTP REST API
 * Supports: Mevo Start, Mevo Core, Livestream Studio HD/4K
 * Default port: 9090 (Livestream Studio API)
 * 
 * Livestream Studio API: HTTP REST JSON commands
 * Format: POST http://<ip>:<port>/api/v1/<endpoint>
 */
class LivestreamService {
  constructor(ip = '192.168.1.100', port = 9090) {
    this.ip = ip;
    this.port = port;
    this.connected = false;
    this.lastError = '';
    this.modelName = 'Livestream Studio';
    this._programInput = null;
    this._previewInput = null;
    this._recording = false;
    this._streaming = false;
  }

  get baseUrl() {
    return `http://${this.ip}:${this.port}`;
  }

  async _apiCall(method, endpoint, body = null) {
    try {
      const opts = {
        method,
        timeout: 5000,
        headers: { 'Content-Type': 'application/json' }
      };
      if (body) opts.body = JSON.stringify(body);
      const resp = await fetch(`${this.baseUrl}/api/v1/${endpoint}`, opts);
      this.connected = true;
      if (!resp.ok) {
        const text = await resp.text();
        return { success: false, error: text || `Livestream returned ${resp.status}` };
      }
      const data = await resp.json().catch(() => ({}));
      this.lastError = '';
      return { success: true, data };
    } catch (err) {
      this.lastError = err.message;
      this.connected = false;
      return { success: false, error: err.message };
    }
  }

  async connect(timeoutMs = 5000) {
    if (this.connected) return { success: true, connected: true, model: this.modelName };
    return this.testConnection();
  }

  async disconnect() {
    this.connected = false;
    return { success: true };
  }

  async testConnection() {
    try {
      // Try the status endpoint
      const resp = await fetch(`${this.baseUrl}/api/v1/status`, { timeout: 4000 });
      if (resp.ok) {
        const data = await resp.json().catch(() => ({}));
        this.connected = true;
        this.lastError = '';
        this.modelName = `Livestream ${data.product || 'Studio'}`;
        return { success: true, connected: true, model: this.modelName };
      }
    } catch { /* ignore */ }

    try {
      // Fallback: try system info
      const resp = await fetch(`${this.baseUrl}/api/v1/system`, { timeout: 4000 });
      if (resp.ok || resp.status === 401) {
        this.connected = true;
        this.lastError = '';
        return { success: true, connected: true, model: this.modelName };
      }
    } catch (err) {
      this.connected = false;
      this.lastError = err.message;
      return { success: false, connected: false, error: err.message };
    }

    this.connected = false;
    this.lastError = 'Could not connect to Livestream device';
    return { success: false, connected: false, error: this.lastError };
  }

  getStatusSync() {
    const defaultInputs = [
      { id: 1, shortName: 'CAM 1', longName: 'Camera 1' },
      { id: 2, shortName: 'CAM 2', longName: 'Camera 2' },
      { id: 3, shortName: 'CAM 3', longName: 'Camera 3' },
      { id: 4, shortName: 'CAM 4', longName: 'Camera 4' },
      { id: 5, shortName: 'GFX', longName: 'Graphics' },
      { id: 6, shortName: 'MEDIA', longName: 'Media Player' },
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
      const r = await this._apiCall('GET', 'status');
      if (r.success && r.data) {
        if (r.data.pgm !== undefined) this._programInput = r.data.pgm;
        if (r.data.pvw !== undefined) this._previewInput = r.data.pvw;
        if (r.data.recording !== undefined) this._recording = r.data.recording;
        if (r.data.streaming !== undefined) this._streaming = r.data.streaming;
      }
    }
    return { success: true, connected: this.connected, status: this.getStatusSync() };
  }

  // ═══ Production Controls ═══

  async setProgram(input) {
    if (!this.connected) throw new Error('Livestream not connected');
    const r = await this._apiCall('POST', 'switcher/program', { input: parseInt(input) });
    if (r.success) this._programInput = parseInt(input);
    return r;
  }

  async setPreview(input) {
    if (!this.connected) throw new Error('Livestream not connected');
    const r = await this._apiCall('POST', 'switcher/preview', { input: parseInt(input) });
    if (r.success) this._previewInput = parseInt(input);
    return r;
  }

  async cut() {
    if (!this.connected) throw new Error('Livestream not connected');
    return this._apiCall('POST', 'switcher/cut');
  }

  async auto() {
    if (!this.connected) throw new Error('Livestream not connected');
    return this._apiCall('POST', 'switcher/transition');
  }

  async fadeToBlack() {
    if (!this.connected) throw new Error('Livestream not connected');
    return this._apiCall('POST', 'switcher/ftb');
  }

  async setTransitionPosition(position) {
    if (!this.connected) throw new Error('Livestream not connected');
    return this._apiCall('POST', 'switcher/tbar', { position: Number(position) });
  }

  async setTransitionStyle(style) {
    if (!this.connected) throw new Error('Livestream not connected');
    const styles = ['mix', 'dip', 'wipe', 'dve'];
    return this._apiCall('POST', 'switcher/transition-type', { type: styles[parseInt(style)] || 'mix' });
  }

  async startRecording() {
    const r = await this._apiCall('POST', 'recording/start');
    if (r.success) this._recording = true;
    return r;
  }

  async stopRecording() {
    const r = await this._apiCall('POST', 'recording/stop');
    if (r.success) this._recording = false;
    return r;
  }

  async startStreaming() {
    const r = await this._apiCall('POST', 'streaming/start');
    if (r.success) this._streaming = true;
    return r;
  }

  async stopStreaming() {
    const r = await this._apiCall('POST', 'streaming/stop');
    if (r.success) this._streaming = false;
    return r;
  }
}

module.exports = LivestreamService;
