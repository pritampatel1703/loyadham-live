const fetch = require('node-fetch');

/**
 * vMix HTTP API Service — MAXIMUM LEVEL
 * Covers ALL vMix API functions available via HTTP
 * Docs: https://www.vmix.com/help27/ShortcutFunctionReference.html
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

  /** Generic: send ANY vMix API function */
  async sendFunction(func, params = {}) {
    try {
      const cleanParams = {};
      for (const [k, v] of Object.entries(params)) {
        if (v !== undefined && v !== null && v !== '') cleanParams[k] = v;
      }
      const query = new URLSearchParams({ Function: func, ...cleanParams });
      const url = `${this.baseUrl}?${query.toString()}`;
      const resp = await fetch(url, { timeout: 5000 });
      this.connected = true;
      if (!resp.ok) {
        const text = await resp.text();
        return { success: false, error: text || `vMix returned ${resp.status}` };
      }
      this.lastError = '';
      return { success: true };
    } catch (err) {
      this.lastError = err.message;
      this.connected = false;
      return { success: false, error: err.message };
    }
  }

  /** Raw function call — exposes ANY vMix function by name */
  async raw(functionName, params = {}) { return this.sendFunction(functionName, params); }

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

  async getStatus() {
    try {
      const resp = await fetch(this.baseUrl, { timeout: 5000 });
      const xml = await resp.text();
      this.connected = true;
      const recording = xml.includes('<recording>True</recording>');
      const streaming = xml.includes('<streaming>True</streaming>');
      const external = xml.includes('<external>True</external>');
      const multiCorder = xml.includes('<multicorder>True</multicorder>');
      const fullscreen = xml.includes('<fullscreen>True</fullscreen>');
      const fadeToBlack = xml.includes('<fadeToBlack>True</fadeToBlack>');
      const version = (xml.match(/<version>(.*?)<\/version>/) || [])[1] || '';
      const edition = (xml.match(/<edition>(.*?)<\/edition>/) || [])[1] || '';
      // Parse inputs with audio info
      const inputMatches = [...xml.matchAll(/<input key="(.*?)" number="(\d+)" type="(.*?)" title="(.*?)".*?state="(.*?)".*?(?:muted="(.*?)")?.*?(?:volume="(.*?)")?.*?(?:solo="(.*?)")?.*?(?:audiobusses="(.*?)")?.*?>/g)];
      const inputs = inputMatches.map(m => ({
        key: m[1], number: parseInt(m[2]), type: m[3], title: m[4], state: m[5],
        muted: m[6] === 'True', volume: m[7] ? parseInt(m[7]) : 100,
        solo: m[8] === 'True', audioBusses: m[9] || 'M'
      }));
      // Active preview/program
      const previewInput = parseInt((xml.match(/<preview>(\d+)<\/preview>/) || [])[1] || '0');
      const activeInput = parseInt((xml.match(/<active>(\d+)<\/active>/) || [])[1] || '0');
      // Overlays
      const overlayMatches = [...xml.matchAll(/<overlay number="(\d+)".*?>(.*?)<\/overlay>/g)];
      const overlayStates = {};
      overlayMatches.forEach(m => { overlayStates[parseInt(m[1])] = m[2].trim() !== ''; });

      return {
        success: true, connected: true,
        status: { version, edition, recording, streaming, external, multiCorder, fullscreen, fadeToBlack, inputs, previewInput, activeInput, overlayStates }
      };
    } catch (err) {
      this.connected = false;
      this.lastError = err.message;
      return { success: false, error: err.message };
    }
  }

  // ═══════════════════════════════════════════════
  //  INPUT MANAGEMENT
  // ═══════════════════════════════════════════════
  async addInput(type, filePath) { return this.sendFunction('AddInput', { Value: `${type}|${filePath}` }); }
  async removeInput(input) { return this.sendFunction('RemoveInput', { Input: input }); }
  async renameInput(input, name) { return this.sendFunction('SetInputName', { Input: input, Value: name }); }
  async moveInput(input, value) { return this.sendFunction('MoveInput', { Input: input, Value: value }); }
  async setInputFile(input, value) { return this.sendFunction('SetInputFile', { Input: input, Value: value }); }

  // ═══════════════════════════════════════════════
  //  PRODUCTION / SWITCHING
  // ═══════════════════════════════════════════════
  async cut() { return this.sendFunction('Cut'); }
  async fade(duration = 1000) { return this.sendFunction('Fade', { Duration: duration }); }
  async zoom(duration = 1000) { return this.sendFunction('Zoom', { Duration: duration }); }
  async wipe(duration = 1000) { return this.sendFunction('Wipe', { Duration: duration }); }
  async slide(duration = 1000) { return this.sendFunction('Slide', { Duration: duration }); }
  async fly(duration = 1000) { return this.sendFunction('Fly', { Duration: duration }); }
  async crossZoom(duration = 1000) { return this.sendFunction('CrossZoom', { Duration: duration }); }
  async flyRotate(duration = 1000) { return this.sendFunction('FlyRotate', { Duration: duration }); }
  async cube(duration = 1000) { return this.sendFunction('Cube', { Duration: duration }); }
  async cubeZoom(duration = 1000) { return this.sendFunction('CubeZoom', { Duration: duration }); }
  async verticalWipe(duration = 1000) { return this.sendFunction('VerticalWipe', { Duration: duration }); }
  async verticalSlide(duration = 1000) { return this.sendFunction('VerticalSlide', { Duration: duration }); }
  async merge(duration = 1000) { return this.sendFunction('Merge', { Duration: duration }); }
  async wipeReverse(duration = 1000) { return this.sendFunction('WipeReverse', { Duration: duration }); }
  async slideReverse(duration = 1000) { return this.sendFunction('SlideReverse', { Duration: duration }); }
  async verticalWipeReverse(duration = 1000) { return this.sendFunction('VerticalWipeReverse', { Duration: duration }); }
  async verticalSlideReverse(duration = 1000) { return this.sendFunction('VerticalSlideReverse', { Duration: duration }); }
  async transition(num = 1) { return this.sendFunction(`Transition${num}`); }
  async stinger(num = 1) { return this.sendFunction(`Stinger${num}`); }
  async setPreview(input) { return this.sendFunction('PreviewInput', { Input: input }); }
  async setProgram(input) { return this.sendFunction('ActiveInput', { Input: input }); }
  async quickPlay(input) { return this.sendFunction('QuickPlay', { Input: input }); }

  // ═══════════════════════════════════════════════
  //  OVERLAY CONTROLS (1-4)
  // ═══════════════════════════════════════════════
  async overlayOn(num, input) { return this.sendFunction(`OverlayInput${num}In`, { Input: input }); }
  async overlayOff(num) { return this.sendFunction(`OverlayInput${num}Out`); }
  async overlayToggle(num, input) { return this.sendFunction(`OverlayInput${num}`, { Input: input }); }
  async overlayZoom(num) { return this.sendFunction(`OverlayInput${num}Zoom`); }
  async setOverlayPosition(num, x, y) { return this.sendFunction(`SetOverlayInput${num}Position`, { Value: `${x},${y}` }); }

  // ═══════════════════════════════════════════════
  //  FADE TO BLACK / T-BAR
  // ═══════════════════════════════════════════════
  async fadeToBlack() { return this.sendFunction('FadeToBlack'); }
  async setFader(value) { return this.sendFunction('SetFader', { Value: value }); }

  // ═══════════════════════════════════════════════
  //  RECORDING & STREAMING
  // ═══════════════════════════════════════════════
  async startRecording() { return this.sendFunction('StartRecording'); }
  async stopRecording() { return this.sendFunction('StopRecording'); }
  async startStreaming() { return this.sendFunction('StartStreaming'); }
  async stopStreaming() { return this.sendFunction('StopStreaming'); }
  async startStream(num) { return this.sendFunction('StartStreaming', { Value: num }); }
  async stopStream(num) { return this.sendFunction('StopStreaming', { Value: num }); }
  async startExternal() { return this.sendFunction('StartExternal'); }
  async stopExternal() { return this.sendFunction('StopExternal'); }
  async startMultiCorder() { return this.sendFunction('StartMultiCorder'); }
  async stopMultiCorder() { return this.sendFunction('StopMultiCorder'); }
  async snapshot(input) { return this.sendFunction('Snapshot', input ? { Input: input } : {}); }
  async snapshotInput(input) { return this.sendFunction('SnapshotInput', { Input: input }); }

  // ═══════════════════════════════════════════════
  //  AUDIO — PER INPUT
  // ═══════════════════════════════════════════════
  async muteInput(input) { return this.sendFunction('AudioOff', { Input: input }); }
  async unmuteInput(input) { return this.sendFunction('AudioOn', { Input: input }); }
  async toggleAudio(input) { return this.sendFunction('Audio', { Input: input }); }
  async setVolume(input, volume) { return this.sendFunction('SetVolume', { Input: input, Value: volume }); }
  async setBalance(input, value) { return this.sendFunction('SetBalance', { Input: input, Value: value }); }
  async soloOn(input) { return this.sendFunction('SoloOn', { Input: input }); }
  async soloOff(input) { return this.sendFunction('SoloOff', { Input: input }); }
  async soloToggle(input) { return this.sendFunction('Solo', { Input: input }); }
  async audioAutoOn(input) { return this.sendFunction('AudioAutoOn', { Input: input }); }
  async audioAutoOff(input) { return this.sendFunction('AudioAutoOff', { Input: input }); }
  async audioPluginOn(input, num) { return this.sendFunction('AudioPluginOn', { Input: input, Value: num }); }
  async audioPluginOff(input, num) { return this.sendFunction('AudioPluginOff', { Input: input, Value: num }); }
  async audioPluginToggle(input, num) { return this.sendFunction('AudioPluginOnOff', { Input: input, Value: num }); }
  async audioPluginShow(input, num) { return this.sendFunction('AudioPluginShow', { Input: input, Value: num }); }
  async audioChannelMatrixPreset(input, preset) { return this.sendFunction('AudioChannelMatrixApplyPreset', { Input: input, Value: preset }); }

  // ═══════════════════════════════════════════════
  //  AUDIO — BUS ROUTING
  // ═══════════════════════════════════════════════
  async audioBusOn(input, bus) { return this.sendFunction('AudioBusOn', { Input: input, Value: bus }); }
  async audioBusOff(input, bus) { return this.sendFunction('AudioBusOff', { Input: input, Value: bus }); }
  async audioBusToggle(input, bus) { return this.sendFunction('AudioBus', { Input: input, Value: bus }); }

  // ═══════════════════════════════════════════════
  //  AUDIO — MASTER & BUS VOLUMES
  // ═══════════════════════════════════════════════
  async masterAudioOn() { return this.sendFunction('MasterAudioOn'); }
  async masterAudioOff() { return this.sendFunction('MasterAudioOff'); }
  async masterAudioToggle() { return this.sendFunction('MasterAudio'); }
  async setMasterVolume(volume) { return this.sendFunction('SetMasterVolume', { Value: volume }); }
  // Bus A-G
  async busAudioOn(bus) { return this.sendFunction(`Bus${bus}AudioOn`); }
  async busAudioOff(bus) { return this.sendFunction(`Bus${bus}AudioOff`); }
  async busAudioToggle(bus) { return this.sendFunction(`Bus${bus}Audio`); }
  async setBusVolume(bus, volume) { return this.sendFunction(`SetBus${bus}Volume`, { Value: volume }); }
  async busSendToMaster(bus) { return this.sendFunction('BusXSendToMaster', { Value: bus }); }
  async busSendToMasterOff(bus) { return this.sendFunction('BusXSendToMasterOff', { Value: bus }); }
  async busSendToMasterOn(bus) { return this.sendFunction('BusXSendToMasterOn', { Value: bus }); }

  // ═══════════════════════════════════════════════
  //  PLAYBACK CONTROLS
  // ═══════════════════════════════════════════════
  async playInput(input) { return this.sendFunction('Play', { Input: input }); }
  async pauseInput(input) { return this.sendFunction('Pause', { Input: input }); }
  async playPause(input) { return this.sendFunction('PlayPause', { Input: input }); }
  async restartInput(input) { return this.sendFunction('Restart', { Input: input }); }
  async loopOn(input) { return this.sendFunction('LoopOn', { Input: input }); }
  async loopOff(input) { return this.sendFunction('LoopOff', { Input: input }); }
  async setPosition(input, ms) { return this.sendFunction('SetPosition', { Input: input, Value: ms }); }
  async setRate(input, rate) { return this.sendFunction('SetRate', { Input: input, Value: rate }); }
  async nextPicture(input) { return this.sendFunction('NextPicture', { Input: input }); }
  async previousPicture(input) { return this.sendFunction('PreviousPicture', { Input: input }); }
  async selectIndex(input, index) { return this.sendFunction('SelectIndex', { Input: input, Value: index }); }

  // ═══════════════════════════════════════════════
  //  FULLSCREEN
  // ═══════════════════════════════════════════════
  async fullscreen(input) { return this.sendFunction('FullscreenOn', { Input: input }); }
  async fullscreenOff() { return this.sendFunction('FullscreenOff'); }

  // ═══════════════════════════════════════════════
  //  REPLAY
  // ═══════════════════════════════════════════════
  async replayPlay() { return this.sendFunction('ReplayPlay'); }
  async replayPause() { return this.sendFunction('ReplayPause'); }
  async replayPlayPause() { return this.sendFunction('ReplayPlayPause'); }
  async replayMoveLastEvent() { return this.sendFunction('ReplayMoveLastEvent'); }
  async replayFastForward(speed) { return this.sendFunction('ReplayFastForward', { Value: speed }); }
  async replayFastBackward(speed) { return this.sendFunction('ReplayFastBackward', { Value: speed }); }
  async replayJumpToNow() { return this.sendFunction('ReplayJumpToNow'); }
  async replayMarkIn() { return this.sendFunction('ReplayMarkIn'); }
  async replayMarkOut() { return this.sendFunction('ReplayMarkOut'); }
  async replayMarkInOut() { return this.sendFunction('ReplayMarkInOut'); }
  async replayLive() { return this.sendFunction('ReplayLive'); }
  async replayShowHide() { return this.sendFunction('ReplayShowHide'); }
  async replayChangeDirection() { return this.sendFunction('ReplayChangeDirection'); }
  async replayChangeSpeed(speed) { return this.sendFunction('ReplayChangeSpeed', { Value: speed }); }
  async replayACamera() { return this.sendFunction('ReplayACamera1'); }
  async replayBCamera() { return this.sendFunction('ReplayBCamera1'); }
  async replaySelectEvents(num) { return this.sendFunction('ReplaySelectEvents', { Value: num }); }

  // ═══════════════════════════════════════════════
  //  PTZ CAMERA CONTROLS
  // ═══════════════════════════════════════════════
  async ptzMoveUp(input, speed) { return this.sendFunction('PTZMoveUp', { Input: input, Value: speed || 1 }); }
  async ptzMoveDown(input, speed) { return this.sendFunction('PTZMoveDown', { Input: input, Value: speed || 1 }); }
  async ptzMoveLeft(input, speed) { return this.sendFunction('PTZMoveLeft', { Input: input, Value: speed || 1 }); }
  async ptzMoveRight(input, speed) { return this.sendFunction('PTZMoveRight', { Input: input, Value: speed || 1 }); }
  async ptzMoveStop(input) { return this.sendFunction('PTZMoveStop', { Input: input }); }
  async ptzMoveUpLeft(input) { return this.sendFunction('PTZMoveUpLeft', { Input: input }); }
  async ptzMoveUpRight(input) { return this.sendFunction('PTZMoveUpRight', { Input: input }); }
  async ptzMoveDownLeft(input) { return this.sendFunction('PTZMoveDownLeft', { Input: input }); }
  async ptzMoveDownRight(input) { return this.sendFunction('PTZMoveDownRight', { Input: input }); }
  async ptzZoomIn(input, speed) { return this.sendFunction('PTZZoomIn', { Input: input, Value: speed || 1 }); }
  async ptzZoomOut(input, speed) { return this.sendFunction('PTZZoomOut', { Input: input, Value: speed || 1 }); }
  async ptzZoomStop(input) { return this.sendFunction('PTZZoomStop', { Input: input }); }
  async ptzHome(input) { return this.sendFunction('PTZHome', { Input: input }); }
  async ptzFocusAuto(input) { return this.sendFunction('PTZFocusAuto', { Input: input }); }
  async ptzFocusNear(input) { return this.sendFunction('PTZFocusNear', { Input: input }); }
  async ptzFocusFar(input) { return this.sendFunction('PTZFocusFar', { Input: input }); }
  async ptzFocusStop(input) { return this.sendFunction('PTZFocusStop', { Input: input }); }
  async ptzMoveToPreset(input, preset) { return this.sendFunction('PTZMoveToVirtualInputPosition', { Input: input, Value: preset }); }
  async ptzSavePreset(input, preset) { return this.sendFunction('PTZSaveVirtualInputPosition', { Input: input, Value: preset }); }

  // ═══════════════════════════════════════════════
  //  COLOR CORRECTION (Real vMix Shortcut Functions)
  // ═══════════════════════════════════════════════
  async setCCSaturation(input, value) { return this.sendFunction('SetCCSaturation', { Input: input, Value: value }); }
  async setCCHue(input, value) { return this.sendFunction('SetCCHue', { Input: input, Value: value }); }
  async setCCLiftRGB(input, value) { return this.sendFunction('SetCCLiftRGB', { Input: input, Value: value }); }
  async setCCLiftY(input, value) { return this.sendFunction('SetCCLiftY', { Input: input, Value: value }); }
  async setCCGammaRGB(input, value) { return this.sendFunction('SetCCGammaRGB', { Input: input, Value: value }); }
  async setCCGammaY(input, value) { return this.sendFunction('SetCCGammaY', { Input: input, Value: value }); }
  async setCCGainRGB(input, value) { return this.sendFunction('SetCCGainRGB', { Input: input, Value: value }); }
  async setCCGainY(input, value) { return this.sendFunction('SetCCGainY', { Input: input, Value: value }); }
  async setAlpha(input, value) { return this.sendFunction('SetAlpha', { Input: input, Value: value }); }
  async resetColorCorrection(input) {
    await this.sendFunction('SetCCSaturation', { Input: input, Value: 1 });
    await this.sendFunction('SetCCHue', { Input: input, Value: 0 });
    await this.sendFunction('SetCCGainRGB', { Input: input, Value: 0 });
    await this.sendFunction('SetCCGammaRGB', { Input: input, Value: 0 });
    return this.sendFunction('SetCCLiftRGB', { Input: input, Value: 0 });
  }
  // Backwards compatibility aliases
  async setSaturation(input, value) { return this.setCCSaturation(input, value); }
  async setHue(input, value) { return this.setCCHue(input, value); }
  async setGamma(input, value) { return this.setCCGammaRGB(input, value); }
  async setGain(input, value) { return this.setCCGainRGB(input, value); }
  async setLift(input, value) { return this.setCCLiftRGB(input, value); }
  async setContrast(input, value) { return this.setCCGammaY(input, value); }
  async setBrightness(input, value) { return this.setCCGainY(input, value); }
  async colorCorrectionAuto(input) { return this.resetColorCorrection(input); }
  async colorCorrectionReset(input) { return this.resetColorCorrection(input); }

  // ═══════════════════════════════════════════════
  //  POSITION / CROP / ZOOM
  // ═══════════════════════════════════════════════
  async setPanX(input, value) { return this.sendFunction('SetPanX', { Input: input, Value: value }); }
  async setPanY(input, value) { return this.sendFunction('SetPanY', { Input: input, Value: value }); }
  async setZoom(input, value) { return this.sendFunction('SetZoom', { Input: input, Value: value }); }
  async setCropX1(input, value) { return this.sendFunction('SetCropX1', { Input: input, Value: value }); }
  async setCropY1(input, value) { return this.sendFunction('SetCropY1', { Input: input, Value: value }); }
  async setCropX2(input, value) { return this.sendFunction('SetCropX2', { Input: input, Value: value }); }
  async setCropY2(input, value) { return this.sendFunction('SetCropY2', { Input: input, Value: value }); }
  async resetPosition(input) {
    await this.sendFunction('SetPanX', { Input: input, Value: 0 });
    await this.sendFunction('SetPanY', { Input: input, Value: 0 });
    await this.sendFunction('SetZoom', { Input: input, Value: 1 });
    await this.sendFunction('SetCropX1', { Input: input, Value: 0 });
    await this.sendFunction('SetCropY1', { Input: input, Value: 0 });
    await this.sendFunction('SetCropX2', { Input: input, Value: 1 });
    return this.sendFunction('SetCropY2', { Input: input, Value: 1 });
  }
  async resetInput(input) { return this.resetPosition(input); }

  // ═══════════════════════════════════════════════
  //  CHROMA KEY / VIRTUAL SET
  // ═══════════════════════════════════════════════
  async setInputEffect(input, value) { return this.sendFunction('SetInputEffect', { Input: input, Value: value }); }
  async inputEffectOn(input) { return this.sendFunction('InputEffectOn', { Input: input }); }
  async inputEffectOff(input) { return this.sendFunction('InputEffectOff', { Input: input }); }

  // ═══════════════════════════════════════════════
  //  COUNTDOWN TIMER
  // ═══════════════════════════════════════════════
  async startCountdown(input) { return this.sendFunction('StartCountdown', { Input: input }); }
  async stopCountdown(input) { return this.sendFunction('StopCountdown', { Input: input }); }
  async pauseCountdown(input) { return this.sendFunction('PauseCountdown', { Input: input }); }
  async setCountdown(input, value) { return this.sendFunction('SetCountdown', { Input: input, Value: value }); }
  async changeCountdown(input, value) { return this.sendFunction('ChangeCountdown', { Input: input, Value: value }); }

  // ═══════════════════════════════════════════════
  //  BROWSER INPUT
  // ═══════════════════════════════════════════════
  async browserNavigate(input, url) { return this.sendFunction('BrowserNavigate', { Input: input, Value: url }); }
  async browserReload(input) { return this.sendFunction('BrowserReload', { Input: input }); }
  async browserBack(input) { return this.sendFunction('BrowserBack', { Input: input }); }
  async browserForward(input) { return this.sendFunction('BrowserForward', { Input: input }); }
  async browserKeyboardEnabled(input) { return this.sendFunction('BrowserKeyboardEnabled', { Input: input }); }
  async browserKeyboardDisabled(input) { return this.sendFunction('BrowserKeyboardDisabled', { Input: input }); }
  async browserMouseEnabled(input) { return this.sendFunction('BrowserMouseEnabled', { Input: input }); }
  async browserMouseDisabled(input) { return this.sendFunction('BrowserMouseDisabled', { Input: input }); }

  // ═══════════════════════════════════════════════
  //  NDI
  // ═══════════════════════════════════════════════
  async ndiSelectSource(input, sourceName) { return this.sendFunction('NDISelectSourceByName', { Input: input, Value: sourceName }); }
  async ndiStartRecording(input) { return this.sendFunction('NDIStartRecording', { Input: input }); }
  async ndiStopRecording(input) { return this.sendFunction('NDIStopRecording', { Input: input }); }
  async ndiCommand(input, value) { return this.sendFunction('NDICommand', { Input: input, Value: value }); }

  // ═══════════════════════════════════════════════
  //  TITLES / TEXT
  // ═══════════════════════════════════════════════
  async setText(input, index, value) { return this.sendFunction('SetText', { Input: input, SelectedIndex: index, Value: value }); }
  async setTextByName(input, name, value) { return this.sendFunction('SetText', { Input: input, SelectedName: name, Value: value }); }
  async selectTitlePreset(input, index) { return this.sendFunction('SelectTitlePreset', { Input: input, Value: index }); }
  async nextTitlePreset(input) { return this.sendFunction('NextTitlePreset', { Input: input }); }
  async previousTitlePreset(input) { return this.sendFunction('PreviousTitlePreset', { Input: input }); }
  async setImage(input, index, value) { return this.sendFunction('SetImage', { Input: input, SelectedIndex: index, Value: value }); }

  // ═══════════════════════════════════════════════
  //  DATA SOURCES
  // ═══════════════════════════════════════════════
  async dataSourceNextRow(input, value) { return this.sendFunction('DataSourceNextRow', { Input: input, Value: value }); }
  async dataSourcePreviousRow(input, value) { return this.sendFunction('DataSourcePreviousRow', { Input: input, Value: value }); }
  async dataSourceFirstRow(input, value) { return this.sendFunction('DataSourceFirstRow', { Input: input, Value: value }); }
  async dataSourceLastRow(input, value) { return this.sendFunction('DataSourceLastRow', { Input: input, Value: value }); }
  async dataSourceSelectRow(input, value, row) { return this.sendFunction('DataSourceSelectRow', { Input: input, Value: `${value},${row}` }); }
  async dataSourceAutoNext(input, value) { return this.sendFunction('DataSourceAutoNextOn', { Input: input, Value: value }); }
  async dataSourceAutoNextOff(input, value) { return this.sendFunction('DataSourceAutoNextOff', { Input: input, Value: value }); }

  // ═══════════════════════════════════════════════
  //  LAYER CONTROLS (1-10)
  // ═══════════════════════════════════════════════
  async setLayer(input, layer, source) { return this.sendFunction(`SetLayer${layer}`, { Input: input, Value: source }); }
  async layerOff(input, layer) { return this.sendFunction(`SetLayer${layer}Off`, { Input: input }); }
  async setMultiViewOverlay(input) { return this.sendFunction('SetMultiViewOverlay', { Input: input }); }

  // ═══════════════════════════════════════════════
  //  SCRIPTING
  // ═══════════════════════════════════════════════
  async scriptStart(name) { return this.sendFunction('ScriptStart', { Value: name }); }
  async scriptStop(name) { return this.sendFunction('ScriptStop', { Value: name }); }
  async scriptStopAll() { return this.sendFunction('ScriptStopAll'); }

  // ═══════════════════════════════════════════════
  //  DYNAMIC VALUES
  // ═══════════════════════════════════════════════
  async setDynamicValue(num, value) { return this.sendFunction(`SetDynamicValue${num}`, { Value: value }); }

  // ═══════════════════════════════════════════════
  //  VIDEO DELAY
  // ═══════════════════════════════════════════════
  async setVideoDelay(input, frames) { return this.sendFunction('VideoDelay', { Input: input, Value: frames }); }

  // ═══════════════════════════════════════════════
  //  MISC
  // ═══════════════════════════════════════════════
  async undo() { return this.sendFunction('Undo'); }
  async activatorRefresh() { return this.sendFunction('ActivatorRefresh'); }
  async keyPress(key) { return this.sendFunction('KeyPress', { Value: key }); }
}

module.exports = VmixService;
