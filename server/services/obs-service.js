/**
 * OBS Studio WebSocket v5 Service
 * Controls OBS via obs-websocket-js (WebSocket protocol)
 * Supports: OBS Studio 28+ with WebSocket plugin
 * Default port: 4455 (OBS WebSocket v5)
 */
let OBSWebSocket;
try { OBSWebSocket = require('obs-websocket-js').default || require('obs-websocket-js'); } catch { OBSWebSocket = null; }

class ObsService {
  constructor(ip = '127.0.0.1', port = 4455, password = '') {
    this.ip = ip;
    this.port = port;
    this.password = password;
    this.connected = false;
    this.lastError = '';
    this.modelName = 'OBS Studio';
    this.obs = OBSWebSocket ? new OBSWebSocket() : null;
    this._state = {};
  }

  async connect(timeoutMs = 5000) {
    if (!this.obs) {
      this.lastError = 'obs-websocket-js package not installed. Run: npm install obs-websocket-js';
      return { success: false, connected: false, error: this.lastError };
    }
    if (this.connected) return { success: true, connected: true, model: this.modelName };

    try {
      const url = `ws://${this.ip}:${this.port}`;
      const connectOpts = this.password ? { rpcVersion: 1 } : undefined;
      
      const connectPromise = this.password
        ? this.obs.connect(url, this.password, connectOpts)
        : this.obs.connect(url, undefined, connectOpts);
      
      const timer = new Promise((_, reject) => setTimeout(() => reject(new Error(`Timeout connecting to OBS at ${this.ip}:${this.port}`)), timeoutMs));
      await Promise.race([connectPromise, timer]);

      this.connected = true;
      this.lastError = '';

      // Get version info
      try {
        const ver = await this.obs.call('GetVersion');
        this.modelName = `OBS Studio ${ver.obsVersion || ''}`.trim();
      } catch { /* ignore */ }

      // Setup event listeners
      this.obs.on('ConnectionClosed', () => { this.connected = false; });
      this.obs.on('ConnectionError', (err) => { this.lastError = err?.message || 'Connection error'; this.connected = false; });

      return { success: true, connected: true, model: this.modelName };
    } catch (err) {
      this.connected = false;
      this.lastError = err.message || 'Failed to connect to OBS';
      return { success: false, connected: false, error: this.lastError };
    }
  }

  async disconnect() {
    try {
      if (this.obs) await this.obs.disconnect();
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

  async getStatus() {
    if (!this.connected || !this.obs) {
      return {
        success: false, connected: false,
        status: this._emptyStatus()
      };
    }

    try {
      const [scenes, streamStatus, recordStatus, currentPgm, currentPvw] = await Promise.all([
        this.obs.call('GetSceneList').catch(() => ({ scenes: [], currentProgramSceneName: '', currentPreviewSceneName: '' })),
        this.obs.call('GetStreamStatus').catch(() => ({ outputActive: false })),
        this.obs.call('GetRecordStatus').catch(() => ({ outputActive: false })),
        this.obs.call('GetCurrentProgramScene').catch(() => ({ currentProgramSceneName: '' })),
        this.obs.call('GetCurrentPreviewScene').catch(() => ({ currentPreviewSceneName: '' })),
      ]);

      const sceneList = (scenes.scenes || []).map((s, i) => ({
        id: i + 1,
        shortName: (s.sceneName || '').substring(0, 6),
        longName: s.sceneName || `Scene ${i + 1}`,
      }));

      this._state = {
        connected: true,
        model: this.modelName,
        ip: this.ip,
        inputs: sceneList,
        programInput: sceneList.find(s => s.longName === (currentPgm.currentProgramSceneName || scenes.currentProgramSceneName))?.id || null,
        previewInput: sceneList.find(s => s.longName === (currentPvw.currentPreviewSceneName || scenes.currentPreviewSceneName))?.id || null,
        inTransition: false,
        transitionPosition: 0,
        transitionStyle: 0,
        fadeToBlack: false,
        streaming: streamStatus.outputActive || false,
        recording: recordStatus.outputActive || false,
        downstreamKeyer: false,
        macros: [],
        lastError: '',
        _sceneNames: sceneList,
      };

      return { success: true, connected: true, status: this._state };
    } catch (err) {
      return { success: false, connected: this.connected, error: err.message };
    }
  }

  getStatusSync() {
    return this._state || this._emptyStatus();
  }

  _emptyStatus() {
    return {
      connected: false, model: this.modelName, ip: this.ip,
      inputs: [], programInput: null, previewInput: null,
      inTransition: false, transitionPosition: 0, transitionStyle: 0,
      fadeToBlack: false, streaming: false, recording: false,
      downstreamKeyer: false, macros: [], lastError: this.lastError
    };
  }

  _getSceneName(inputId) {
    const scene = (this._state?._sceneNames || []).find(s => s.id === parseInt(inputId));
    return scene?.longName || `Scene ${inputId}`;
  }

  // ═══ Production Controls ═══

  async setProgram(input) {
    if (!this.connected) throw new Error('OBS not connected');
    return this.obs.call('SetCurrentProgramScene', { sceneName: this._getSceneName(input) });
  }

  async setPreview(input) {
    if (!this.connected) throw new Error('OBS not connected');
    return this.obs.call('SetCurrentPreviewScene', { sceneName: this._getSceneName(input) });
  }

  async cut() {
    if (!this.connected) throw new Error('OBS not connected');
    // In Studio Mode, set preview -> program instantly
    try {
      const pvw = await this.obs.call('GetCurrentPreviewScene');
      if (pvw.currentPreviewSceneName) {
        await this.obs.call('SetCurrentProgramScene', { sceneName: pvw.currentPreviewSceneName });
      }
    } catch {
      // Not in studio mode — just trigger transition
      await this.obs.call('TriggerStudioModeTransition').catch(() => {});
    }
  }

  async auto() {
    if (!this.connected) throw new Error('OBS not connected');
    return this.obs.call('TriggerStudioModeTransition');
  }

  async fadeToBlack() {
    if (!this.connected) throw new Error('OBS not connected');
    return this.obs.call('ToggleVirtualCam').catch(() => {});
  }

  async setTransitionPosition(position) {
    // OBS doesn't have a T-bar concept natively, but we can set transition duration
    return { success: true };
  }

  async setTransitionStyle(style) {
    // style: 0 = Cut, 1 = Fade, 2 = Swipe, etc.
    const transitions = ['Cut', 'Fade', 'Swipe_', 'Slide'];
    const name = transitions[style] || 'Fade';
    try {
      await this.obs.call('SetCurrentSceneTransition', { transitionName: name });
    } catch { /* transition may not exist */ }
    return { success: true };
  }

  async startRecording() {
    if (!this.connected) throw new Error('OBS not connected');
    return this.obs.call('StartRecord');
  }

  async stopRecording() {
    if (!this.connected) throw new Error('OBS not connected');
    return this.obs.call('StopRecord');
  }

  async startStreaming() {
    if (!this.connected) throw new Error('OBS not connected');
    return this.obs.call('StartStream');
  }

  async stopStreaming() {
    if (!this.connected) throw new Error('OBS not connected');
    return this.obs.call('StopStream');
  }
}

module.exports = ObsService;
