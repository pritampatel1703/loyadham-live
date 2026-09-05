const { Atem, Enums } = require('atem-connection');

/**
 * Blackmagic ATEM Video Switcher Service
 * Communicates natively over UDP (Port 9910) using atem-connection
 * Supports: ATEM Mini, Mini Pro, Mini Extreme, ATEM SDI, Television Studio, Constellation
 */
class AtemService {
  constructor(ip = '192.168.1.50', io = null) {
    this.ip = ip;
    this.io = io;
    this.atem = new Atem();
    this.connected = false;
    this.lastError = '';
    this.modelName = '';

    this._setupListeners();
  }

  setSocketIO(io) {
    this.io = io;
  }

  _setupListeners() {
    this.atem.on('connected', () => {
      this.connected = true;
      this.lastError = '';
      this.modelName = this.atem.state?.info?.productIdentifier || 
        (this.atem.state?.info?.model !== undefined ? Enums.Model[this.atem.state.info.model] : '') || 
        'ATEM Switcher';
      
      console.log(`[ATEM] ✅ Connected to Blackmagic ${this.modelName} at ${this.ip}`);

      if (this.io) {
        this.io.of('/production').emit('atem:connected', { ip: this.ip, model: this.modelName });
        this.io.of('/production').emit('atem:state', this.getStatusSync());
      }
    });

    this.atem.on('disconnected', () => {
      this.connected = false;
      console.warn(`[ATEM] ⚠️ Disconnected from ${this.ip}`);
      if (this.io) {
        this.io.of('/production').emit('atem:disconnected', { ip: this.ip });
      }
    });

    this.atem.on('error', (err) => {
      this.lastError = typeof err === 'string' ? err : (err?.message || 'ATEM communication error');
      console.error(`[ATEM Error] ${this.lastError}`);
    });

    this.atem.on('stateChanged', (state, pathToChange) => {
      if (!this.connected) return;

      const paths = Array.isArray(pathToChange) ? pathToChange : [pathToChange];

      // Broadcast changes to production dashboard
      if (this.io) {
        const status = this.getStatusSync();
        this.io.of('/production').emit('atem:state', status);

        // Check if video mix effects (Program / Preview) changed
        const meChanged = paths.some(p => String(p).includes('video.mixEffects'));
        if (meChanged) {
          const me = state.video?.mixEffects?.[0];
          const pgmInput = me?.programInput ?? null;
          const pvwInput = me?.previewInput ?? null;
          const inTransition = me?.transitionPosition?.inTransition ?? false;
          const ftb = me?.fadeToBlack?.isFullyBlack ?? false;

          this.io.of('/production').emit('atem:tally', {
            pgmInput,
            pvwInput,
            inTransition,
            fadeToBlack: ftb
          });
        }
      }
    });
  }

  /**
   * Connect to ATEM switcher with a timeout promise
   */
  async connect(timeoutMs = 4000) {
    if (this.connected) {
      return { success: true, connected: true, model: this.modelName };
    }

    try {
      this.lastError = '';
      this.atem.connect(this.ip);

      return new Promise((resolve) => {
        const timer = setTimeout(() => {
          if (!this.connected) {
            this.lastError = `Connection timeout to ${this.ip}:9910. Verify ATEM is powered and on network.`;
            resolve({ success: false, connected: false, error: this.lastError });
          }
        }, timeoutMs);

        const onConnect = () => {
          clearTimeout(timer);
          this.atem.removeListener('connected', onConnect);
          resolve({
            success: true,
            connected: true,
            model: this.modelName
          });
        };

        this.atem.once('connected', onConnect);
      });
    } catch (err) {
      this.connected = false;
      this.lastError = err.message;
      return { success: false, connected: false, error: err.message };
    }
  }

  /**
   * Disconnect
   */
  async disconnect() {
    try {
      await this.atem.disconnect();
      this.connected = false;
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  /**
   * Test connection
   */
  async testConnection() {
    if (this.connected) {
      return { success: true, connected: true, model: this.modelName };
    }
    return this.connect(3500);
  }

  /**
   * Get synchronous state snapshot formatted for UI
   */
  getStatusSync() {
    const s = this.atem.state;
    if (!s) {
      return {
        connected: false,
        model: this.modelName || 'Disconnected',
        ip: this.ip,
        inputs: [],
        programInput: null,
        previewInput: null,
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

    // MixEffect 0 (M/E 1)
    const me = s.video?.mixEffects?.[0];
    const pgmInput = me?.programInput ?? null;
    const pvwInput = me?.previewInput ?? null;
    const inTrans = me?.transitionPosition?.inTransition ?? false;
    const transPos = me?.transitionPosition?.handlePosition ? (me.transitionPosition.handlePosition / 10000) : 0;
    const transStyle = me?.transitionProperties?.nextStyle ?? 0;
    const ftb = me?.fadeToBlack?.isFullyBlack ?? false;

    // Inputs (filter out internal test signals unless useful, or return external sources + black/bars)
    const inputsMap = s.inputs || {};
    const inputsList = Object.entries(inputsMap).map(([idStr, inp]) => ({
      id: parseInt(idStr),
      shortName: inp.shortName || `CAM ${idStr}`,
      longName: inp.longName || `Input ${idStr}`,
      isExternal: inp.isExternal ?? true,
      portType: inp.portType
    })).filter(inp => inp.id <= 20 || [0, 1000, 2001, 3010, 3020].includes(inp.id)); // standard inputs + black/bars/color

    // Recording & Streaming
    const isStreaming = s.streaming?.status?.state === 2; // 2 = streaming active
    const isRecording = s.recording?.status?.state === 2; // 2 = recording active

    // Downstream Keyer 1
    const dsk = s.video?.downstreamKeyers?.[0]?.onAir ?? false;

    // Macros
    const macroList = (s.macro?.macroProperties || [])
      .map((m, idx) => ({ index: idx, name: m?.name || `Macro ${idx + 1}`, isUsed: m?.isUsed ?? false }))
      .filter(m => m.isUsed);

    return {
      connected: this.connected,
      model: this.modelName || s.info?.productIdentifier || 'ATEM Switcher',
      ip: this.ip,
      inputs: inputsList,
      programInput: pgmInput,
      previewInput: pvwInput,
      inTransition: inTrans,
      transitionPosition: transPos,
      transitionStyle: transStyle,
      fadeToBlack: ftb,
      streaming: isStreaming,
      recording: isRecording,
      downstreamKeyer: dsk,
      macros: macroList,
      lastError: this.lastError
    };
  }

  async getStatus() {
    return { success: true, connected: this.connected, status: this.getStatusSync() };
  }

  // ═══ Production Switcher Controls ═══

  async setProgram(input, me = 0) {
    if (!this.connected) throw new Error('ATEM not connected');
    return this.atem.changeProgramInput(parseInt(input), me);
  }

  async setPreview(input, me = 0) {
    if (!this.connected) throw new Error('ATEM not connected');
    return this.atem.changePreviewInput(parseInt(input), me);
  }

  async cut(me = 0) {
    if (!this.connected) throw new Error('ATEM not connected');
    return this.atem.cut(me);
  }

  async auto(me = 0) {
    if (!this.connected) throw new Error('ATEM not connected');
    return this.atem.autoTransition(me);
  }

  async fadeToBlack(me = 0) {
    if (!this.connected) throw new Error('ATEM not connected');
    return this.atem.fadeToBlack(me);
  }

  async setTransitionPosition(position, me = 0) {
    if (!this.connected) throw new Error('ATEM not connected');
    // Position is 0.0 to 1.0 -> ATEM expects 0 to 10000
    const val = Math.max(0, Math.min(10000, Math.round(Number(position) * 10000)));
    return this.atem.setTransitionPosition(val, me);
  }

  async setTransitionStyle(style, me = 0) {
    if (!this.connected) throw new Error('ATEM not connected');
    // style: 0 = MIX, 1 = DIP, 2 = WIPE, 3 = DVE, 4 = STINGER
    return this.atem.setTransitionStyle({ nextStyle: parseInt(style) }, me);
  }

  async setDownstreamKey(onAir, keyer = 0) {
    if (!this.connected) throw new Error('ATEM not connected');
    return this.atem.setDownstreamKeyOnAir(Boolean(onAir), keyer);
  }

  async startStreaming() {
    if (!this.connected) throw new Error('ATEM not connected');
    return this.atem.startStreaming();
  }

  async stopStreaming() {
    if (!this.connected) throw new Error('ATEM not connected');
    return this.atem.stopStreaming();
  }

  async startRecording() {
    if (!this.connected) throw new Error('ATEM not connected');
    return this.atem.startRecording();
  }

  async stopRecording() {
    if (!this.connected) throw new Error('ATEM not connected');
    return this.atem.stopRecording();
  }

  async runMacro(macroIndex) {
    if (!this.connected) throw new Error('ATEM not connected');
    return this.atem.macroRun(parseInt(macroIndex));
  }

  async stopMacro() {
    if (!this.connected) throw new Error('ATEM not connected');
    return this.atem.macroStop();
  }
}

module.exports = AtemService;
