const fetch = require('node-fetch');

/**
 * NewTek / Vizrt TriCaster Service
 * Controls TriCaster switchers via HTTP REST (DataLink API)
 * Supports: TriCaster Mini, TC1, TC2, TC2 Elite, TriCaster 2 Elite
 * Default port: 80 (HTTP) - uses /v1/dictionary endpoint
 * 
 * TriCaster DataLink: HTTP shortcut commands
 * Format: http://<ip>/v1/shortcut?name=<shortcut_name>
 */
class TricasterService {
  constructor(ip = '192.168.1.100', port = 80) {
    this.ip = ip;
    this.port = port;
    this.connected = false;
    this.lastError = '';
    this.modelName = 'NewTek TriCaster';
    this._programInput = null;
    this._previewInput = null;
    this._recording = false;
    this._streaming = false;
  }

  get baseUrl() {
    return this.port === 80 ? `http://${this.ip}` : `http://${this.ip}:${this.port}`;
  }

  async _shortcut(name) {
    try {
      const resp = await fetch(`${this.baseUrl}/v1/shortcut?name=${encodeURIComponent(name)}`, { timeout: 5000 });
      this.connected = true;
      if (!resp.ok) {
        const text = await resp.text();
        return { success: false, error: text || `TriCaster returned ${resp.status}` };
      }
      this.lastError = '';
      return { success: true };
    } catch (err) {
      this.lastError = err.message;
      this.connected = false;
      return { success: false, error: err.message };
    }
  }

  async _getValue(path) {
    try {
      const resp = await fetch(`${this.baseUrl}/v1/dictionary?key=${encodeURIComponent(path)}`, { timeout: 5000 });
      this.connected = true;
      if (!resp.ok) return null;
      const data = await resp.json();
      return data.value || data;
    } catch {
      return null;
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
      // TriCaster responds to /v1/version for device info
      const resp = await fetch(`${this.baseUrl}/v1/version`, { timeout: 4000 });
      if (!resp.ok) throw new Error(`TriCaster returned ${resp.status}`);
      const data = await resp.json().catch(() => ({}));
      this.connected = true;
      this.lastError = '';
      this.modelName = `NewTek ${data.product_name || 'TriCaster'}`;
      return { success: true, connected: true, model: this.modelName };
    } catch (err) {
      // Fallback: try a shortcut call to see if it responds
      try {
        const resp2 = await fetch(`${this.baseUrl}/v1/shortcut?name=`, { timeout: 4000 });
        if (resp2.status < 500) {
          this.connected = true;
          this.lastError = '';
          return { success: true, connected: true, model: this.modelName };
        }
      } catch { /* ignore */ }
      
      this.connected = false;
      this.lastError = err.message;
      return { success: false, connected: false, error: err.message };
    }
  }

  getStatusSync() {
    const defaultInputs = [
      { id: 1, shortName: 'IN 1', longName: 'Input 1 (Camera)' },
      { id: 2, shortName: 'IN 2', longName: 'Input 2 (Camera)' },
      { id: 3, shortName: 'IN 3', longName: 'Input 3' },
      { id: 4, shortName: 'IN 4', longName: 'Input 4' },
      { id: 5, shortName: 'DDR1', longName: 'DDR 1 (Media)' },
      { id: 6, shortName: 'DDR2', longName: 'DDR 2 (Media)' },
      { id: 7, shortName: 'GFX1', longName: 'Graphics 1' },
      { id: 8, shortName: 'GFX2', longName: 'Graphics 2' },
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
    return { success: true, connected: this.connected, status: this.getStatusSync() };
  }

  // ═══ Production Controls ═══
  // TriCaster shortcut names: main_row1_a, main_row1_b, etc.

  async setProgram(input) {
    if (!this.connected) throw new Error('TriCaster not connected');
    // TriCaster shortcut: main_row<input>_a (A row = Program)
    const shortcutMap = {
      1: 'main_row1_a', 2: 'main_row2_a', 3: 'main_row3_a', 4: 'main_row4_a',
      5: 'main_row5_a', 6: 'main_row6_a', 7: 'main_row7_a', 8: 'main_row8_a',
      0: 'main_row0_a',
    };
    const sc = shortcutMap[parseInt(input)] || `main_row${parseInt(input)}_a`;
    const r = await this._shortcut(sc);
    if (r.success) this._programInput = parseInt(input);
    return r;
  }

  async setPreview(input) {
    if (!this.connected) throw new Error('TriCaster not connected');
    // TriCaster shortcut: main_row<input>_b (B row = Preview)
    const shortcutMap = {
      1: 'main_row1_b', 2: 'main_row2_b', 3: 'main_row3_b', 4: 'main_row4_b',
      5: 'main_row5_b', 6: 'main_row6_b', 7: 'main_row7_b', 8: 'main_row8_b',
      0: 'main_row0_b',
    };
    const sc = shortcutMap[parseInt(input)] || `main_row${parseInt(input)}_b`;
    const r = await this._shortcut(sc);
    if (r.success) this._previewInput = parseInt(input);
    return r;
  }

  async cut() {
    if (!this.connected) throw new Error('TriCaster not connected');
    return this._shortcut('main_cut');
  }

  async auto() {
    if (!this.connected) throw new Error('TriCaster not connected');
    return this._shortcut('main_auto');
  }

  async fadeToBlack() {
    if (!this.connected) throw new Error('TriCaster not connected');
    return this._shortcut('main_ftb');
  }

  async setTransitionPosition(position) {
    if (!this.connected) throw new Error('TriCaster not connected');
    // TriCaster uses main_tbar with 0-255 range
    const val = Math.max(0, Math.min(255, Math.round(Number(position) * 255)));
    return this._shortcut(`main_tbar_position&value=${val}`);
  }

  async setTransitionStyle(style) {
    if (!this.connected) throw new Error('TriCaster not connected');
    const styles = ['main_trans_mix', 'main_trans_dip', 'main_trans_wipe', 'main_trans_dve'];
    return this._shortcut(styles[parseInt(style)] || 'main_trans_mix');
  }

  async startRecording() {
    const r = await this._shortcut('record_toggle');
    if (r.success) this._recording = true;
    return r;
  }

  async stopRecording() {
    const r = await this._shortcut('record_toggle');
    if (r.success) this._recording = false;
    return r;
  }

  async startStreaming() {
    const r = await this._shortcut('streaming_start');
    if (r.success) this._streaming = true;
    return r;
  }

  async stopStreaming() {
    const r = await this._shortcut('streaming_stop');
    if (r.success) this._streaming = false;
    return r;
  }
}

module.exports = TricasterService;
