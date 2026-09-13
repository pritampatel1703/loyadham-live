const fetch = require('node-fetch');

/**
 * Panasonic Video Switcher / Controller Service
 * Controls Panasonic AV-HLC100, AV-HSW10, AW-RP150 via HTTP CGI
 * Default port: 80 (HTTP)
 * 
 * Panasonic CGI Protocol: HTTP GET requests with CGI parameters
 * Format: http://<ip>/cgi-bin/aw_ptz?cmd=<command>&res=1
 * For switchers: http://<ip>/cgi-bin/mixer_ctrl
 */
class PanasonicService {
  constructor(ip = '192.168.1.100', port = 80) {
    this.ip = ip;
    this.port = port;
    this.connected = false;
    this.lastError = '';
    this.modelName = 'Panasonic Switcher';
    this._programInput = null;
    this._previewInput = null;
    this._recording = false;
    this._streaming = false;
  }

  get baseUrl() {
    return this.port === 80 ? `http://${this.ip}` : `http://${this.ip}:${this.port}`;
  }

  async _cgiRequest(path, params = {}) {
    try {
      const query = new URLSearchParams(params);
      const url = `${this.baseUrl}${path}?${query.toString()}`;
      const resp = await fetch(url, { timeout: 5000 });
      this.connected = true;
      if (!resp.ok) {
        const text = await resp.text();
        return { success: false, error: text || `Panasonic returned ${resp.status}` };
      }
      const text = await resp.text();
      this.lastError = '';
      return { success: true, data: text };
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
      // Try the mixer control endpoint first (AV-HLC100, AV-HSW10)
      const resp = await fetch(`${this.baseUrl}/cgi-bin/mixer_ctrl?cmd=get_model&res=1`, { timeout: 4000 });
      if (resp.ok) {
        const text = await resp.text();
        this.connected = true;
        this.lastError = '';
        this.modelName = 'Panasonic ' + (text.trim() || 'Switcher');
        return { success: true, connected: true, model: this.modelName };
      }
    } catch { /* not a mixer, try PTZ controller */ }

    try {
      // Fallback: Try PTZ controller endpoint (AW-RP150)
      const resp = await fetch(`${this.baseUrl}/cgi-bin/aw_ptz?cmd=%23O&res=1`, { timeout: 4000 });
      if (resp.ok) {
        this.connected = true;
        this.lastError = '';
        this.modelName = 'Panasonic AW Controller';
        return { success: true, connected: true, model: this.modelName };
      }
    } catch { /* ignore */ }

    try {
      // Last fallback: just try to ping
      const resp = await fetch(`${this.baseUrl}/`, { timeout: 4000 });
      if (resp.ok || resp.status === 401 || resp.status === 403) {
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
    this.lastError = 'Could not connect to Panasonic device';
    return { success: false, connected: false, error: this.lastError };
  }

  getStatusSync() {
    const defaultInputs = [
      { id: 1, shortName: 'IN 1', longName: 'SDI Input 1' },
      { id: 2, shortName: 'IN 2', longName: 'SDI Input 2' },
      { id: 3, shortName: 'IN 3', longName: 'SDI Input 3' },
      { id: 4, shortName: 'IN 4', longName: 'SDI Input 4' },
      { id: 5, shortName: 'IN 5', longName: 'HDMI Input 5' },
      { id: 6, shortName: 'IN 6', longName: 'HDMI Input 6' },
      { id: 7, shortName: 'STILL', longName: 'Still Store' },
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
      // Try to query current PGM/PVW
      const r = await this._cgiRequest('/cgi-bin/mixer_ctrl', { cmd: 'get_status', res: '1' });
      if (r.success && r.data) {
        const pgm = r.data.match(/pgm=(\d+)/);
        const pvw = r.data.match(/pvw=(\d+)/);
        if (pgm) this._programInput = parseInt(pgm[1]);
        if (pvw) this._previewInput = parseInt(pvw[1]);
      }
    }
    return { success: true, connected: this.connected, status: this.getStatusSync() };
  }

  // ═══ Production Controls ═══

  async setProgram(input) {
    if (!this.connected) throw new Error('Panasonic not connected');
    const r = await this._cgiRequest('/cgi-bin/mixer_ctrl', { cmd: `pgm_select`, value: parseInt(input), res: '1' });
    if (r.success) this._programInput = parseInt(input);
    return r;
  }

  async setPreview(input) {
    if (!this.connected) throw new Error('Panasonic not connected');
    const r = await this._cgiRequest('/cgi-bin/mixer_ctrl', { cmd: `pvw_select`, value: parseInt(input), res: '1' });
    if (r.success) this._previewInput = parseInt(input);
    return r;
  }

  async cut() {
    if (!this.connected) throw new Error('Panasonic not connected');
    return this._cgiRequest('/cgi-bin/mixer_ctrl', { cmd: 'cut', res: '1' });
  }

  async auto() {
    if (!this.connected) throw new Error('Panasonic not connected');
    return this._cgiRequest('/cgi-bin/mixer_ctrl', { cmd: 'auto_take', res: '1' });
  }

  async fadeToBlack() {
    if (!this.connected) throw new Error('Panasonic not connected');
    return this._cgiRequest('/cgi-bin/mixer_ctrl', { cmd: 'ftb', res: '1' });
  }

  async setTransitionPosition(position) {
    if (!this.connected) throw new Error('Panasonic not connected');
    const val = Math.max(0, Math.min(100, Math.round(Number(position) * 100)));
    return this._cgiRequest('/cgi-bin/mixer_ctrl', { cmd: 'tbar', value: val, res: '1' });
  }

  async setTransitionStyle(style) {
    if (!this.connected) throw new Error('Panasonic not connected');
    const styles = ['mix', 'wipe', 'dve', 'cut'];
    return this._cgiRequest('/cgi-bin/mixer_ctrl', { cmd: 'trans_type', value: styles[parseInt(style)] || 'mix', res: '1' });
  }

  async startRecording() {
    const r = await this._cgiRequest('/cgi-bin/mixer_ctrl', { cmd: 'rec_start', res: '1' });
    if (r.success) this._recording = true;
    return r;
  }

  async stopRecording() {
    const r = await this._cgiRequest('/cgi-bin/mixer_ctrl', { cmd: 'rec_stop', res: '1' });
    if (r.success) this._recording = false;
    return r;
  }

  async startStreaming() {
    const r = await this._cgiRequest('/cgi-bin/mixer_ctrl', { cmd: 'stream_start', res: '1' });
    if (r.success) this._streaming = true;
    return r;
  }

  async stopStreaming() {
    const r = await this._cgiRequest('/cgi-bin/mixer_ctrl', { cmd: 'stream_stop', res: '1' });
    if (r.success) this._streaming = false;
    return r;
  }
}

module.exports = PanasonicService;
