const fetch = require('node-fetch');

/**
 * vMix HTTP API Service
 * Communicates with vMix via its Web API (HTTP GET requests)
 * Docs: https://www.vmix.com/help27/DeveloperAPI.html
 */
class VmixService {
  constructor(host = '127.0.0.1', port = 8088) {
    this.host = host;
    this.port = port;
    this.connected = false;
    this.lastError = '';
  }

  get baseUrl() {
    return `http://${this.host}:${this.port}/api`;
  }

  /**
   * Send a vMix API function call
   */
  async sendFunction(func, params = {}) {
    try {
      const query = new URLSearchParams({ Function: func, ...params });
      const url = `${this.baseUrl}?${query.toString()}`;
      const resp = await fetch(url, { timeout: 5000 });
      if (!resp.ok) throw new Error(`vMix returned ${resp.status}`);
      this.connected = true;
      this.lastError = '';
      return { success: true };
    } catch (err) {
      this.lastError = err.message;
      this.connected = false;
      return { success: false, error: err.message };
    }
  }

  /**
   * Test connection to vMix
   */
  async testConnection() {
    try {
      const resp = await fetch(this.baseUrl, { timeout: 5000 });
      if (!resp.ok) throw new Error(`vMix returned ${resp.status}`);
      const xml = await resp.text();
      this.connected = true;
      this.lastError = '';
      return { success: true, connected: true, xml };
    } catch (err) {
      this.connected = false;
      this.lastError = err.message;
      return { success: false, connected: false, error: err.message };
    }
  }

  /**
   * Get vMix status (XML → simplified JSON)
   */
  async getStatus() {
    try {
      const resp = await fetch(this.baseUrl, { timeout: 5000 });
      const xml = await resp.text();
      this.connected = true;
      // Parse basic info from XML (lightweight — no XML parser needed)
      const recording = xml.includes('<recording>True</recording>');
      const streaming = xml.includes('<streaming>True</streaming>');
      const version = (xml.match(/<version>(.*?)<\/version>/) || [])[1] || '';
      const edition = (xml.match(/<edition>(.*?)<\/edition>/) || [])[1] || '';
      // Parse inputs
      const inputMatches = [...xml.matchAll(/<input key="(.*?)" number="(\d+)" type="(.*?)" title="(.*?)".*?state="(.*?)".*?>/g)];
      const inputs = inputMatches.map(m => ({
        key: m[1], number: parseInt(m[2]), type: m[3], title: m[4], state: m[5]
      }));
      // Active preview/program
      const previewInput = (xml.match(/<preview>(\d+)<\/preview>/) || [])[1] || '0';
      const activeInput = (xml.match(/<active>(\d+)<\/active>/) || [])[1] || '0';

      return {
        success: true, connected: true,
        status: { version, edition, recording, streaming, inputs, previewInput: parseInt(previewInput), activeInput: parseInt(activeInput) }
      };
    } catch (err) {
      this.connected = false;
      this.lastError = err.message;
      return { success: false, error: err.message };
    }
  }

  // ═══ Input Management ═══
  async addInput(type, filePath) { return this.sendFunction('AddInput', { Value: `${type}|${filePath}` }); }
  async removeInput(input) { return this.sendFunction('RemoveInput', { Input: input }); }
  async renameInput(input, name) { return this.sendFunction('SetInputName', { Input: input, Value: name }); }

  // ═══ Production Controls ═══
  async cut() { return this.sendFunction('Cut'); }
  async fade(duration = 1000) { return this.sendFunction('Fade', { Duration: duration }); }
  async transition(num = 1) { return this.sendFunction(`Transition${num}`); }
  async setPreview(input) { return this.sendFunction('PreviewInput', { Input: input }); }
  async setProgram(input) { return this.sendFunction('ActiveInput', { Input: input }); }
  async quickPlay(input) { return this.sendFunction('QuickPlay', { Input: input }); }
  async overlayOn(num, input) { return this.sendFunction(`OverlayInput${num}In`, { Input: input }); }
  async overlayOff(num) { return this.sendFunction(`OverlayInput${num}Out`); }

  // ═══ Recording & Streaming ═══
  async startRecording() { return this.sendFunction('StartRecording'); }
  async stopRecording() { return this.sendFunction('StopRecording'); }
  async startStreaming() { return this.sendFunction('StartStreaming'); }
  async stopStreaming() { return this.sendFunction('StopStreaming'); }

  // ═══ Audio ═══
  async muteInput(input) { return this.sendFunction('AudioOff', { Input: input }); }
  async unmuteInput(input) { return this.sendFunction('AudioOn', { Input: input }); }
  async setVolume(input, volume) { return this.sendFunction('SetVolume', { Input: input, Value: volume }); }

  // ═══ Fullscreen ═══
  async fullscreen(input) { return this.sendFunction('FullscreenOn', { Input: input }); }
  async fullscreenOff() { return this.sendFunction('FullscreenOff'); }

  // ═══ Replay ═══
  async replayPlay() { return this.sendFunction('ReplayPlay'); }
  async replayPause() { return this.sendFunction('ReplayPause'); }
}

module.exports = VmixService;
