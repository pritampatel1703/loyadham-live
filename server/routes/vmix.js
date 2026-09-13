const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { helpers } = require('../db/database');
const { authenticate, requireRole } = require('../middleware/auth');
const VmixService = require('../services/vmix-service');
const router = express.Router();
const vmixInstances = new Map();

async function getVmix(id) {
  if (vmixInstances.has(id)) return vmixInstances.get(id);
  const c = await helpers.getVmixById(id);
  if (!c) return null;
  const inst = new VmixService(c.host, c.port);
  vmixInstances.set(id, inst);
  return inst;
}

router.get('/connections', authenticate, async (req, res) => res.json({ connections: await helpers.getAllVmixConnections() }));
router.post('/connections', authenticate, requireRole('production_admin'), async (req, res) => { const { name, host, port } = req.body; const id = uuidv4(); await helpers.createVmixConnection(id, name||'vMix', host||'127.0.0.1', port||8088); res.status(201).json({ id }); });
router.put('/connections/:id', authenticate, requireRole('production_admin'), async (req, res) => { const { name, host, port, auto_reconnect } = req.body; await helpers.updateVmixConnection(name, host, port, auto_reconnect?1:0, req.params.id); vmixInstances.delete(req.params.id); res.json({ success: true }); });
router.delete('/connections/:id', authenticate, requireRole('super_admin'), async (req, res) => { await helpers.deleteVmixConnection(req.params.id); vmixInstances.delete(req.params.id); res.json({ success: true }); });

router.post('/:id/test', authenticate, requireRole('operator'), async (req, res) => {
  const v = await getVmix(req.params.id);
  if (!v) return res.status(404).json({ error: 'Not found' });
  const r = await v.testConnection();
  await helpers.updateVmixStatus(r.connected?1:0, req.params.id);
  if (!r.connected) await helpers.updateVmixError(r.error||'', req.params.id);
  await helpers.addLog(null, 'vmix', req.user.username, r.connected ? 'vMix connected' : `vMix failed: ${r.error}`, '{}');
  res.json(r);
});

router.get('/:id/status', authenticate, async (req, res) => {
  const v = await getVmix(req.params.id);
  if (!v) return res.status(404).json({ error: 'Not found' });
  res.json(await v.getStatus());
});

router.post('/:id/action', authenticate, requireRole('operator'), async (req, res) => {
  const v = await getVmix(req.params.id);
  if (!v) return res.status(404).json({ error: 'Not found' });
  const { action, params } = req.body;
  const p = params || {};
  const actions = {
    // ═══ RAW ═══
    raw: () => v.raw(p.functionName, p.rawParams || {}),
    // ═══ PRODUCTION / SWITCHING ═══
    cut: () => v.cut(), fade: () => v.fade(p.duration), zoom: () => v.zoom(p.duration),
    wipe: () => v.wipe(p.duration), slide: () => v.slide(p.duration), fly: () => v.fly(p.duration),
    crossZoom: () => v.crossZoom(p.duration), flyRotate: () => v.flyRotate(p.duration),
    cube: () => v.cube(p.duration), cubeZoom: () => v.cubeZoom(p.duration),
    verticalWipe: () => v.verticalWipe(p.duration), verticalSlide: () => v.verticalSlide(p.duration),
    merge: () => v.merge(p.duration), wipeReverse: () => v.wipeReverse(p.duration),
    slideReverse: () => v.slideReverse(p.duration),
    verticalWipeReverse: () => v.verticalWipeReverse(p.duration), verticalSlideReverse: () => v.verticalSlideReverse(p.duration),
    transition: () => v.transition(p.number), stinger: () => v.stinger(p.number),
    setPreview: () => v.setPreview(p.input), setProgram: () => v.setProgram(p.input),
    quickPlay: () => v.quickPlay(p.input),
    // ═══ INPUTS ═══
    addInput: () => v.addInput(p.type||'Video', p.path), removeInput: () => v.removeInput(p.input),
    renameInput: () => v.renameInput(p.input, p.name), moveInput: () => v.moveInput(p.input, p.value),
    setInputFile: () => v.setInputFile(p.input, p.value),
    // ═══ OVERLAYS ═══
    overlayOn: () => v.overlayOn(p.number||1, p.input), overlayOff: () => v.overlayOff(p.number||1),
    overlayToggle: () => v.overlayToggle(p.number||1, p.input), overlayZoom: () => v.overlayZoom(p.number||1),
    setOverlayPosition: () => v.setOverlayPosition(p.number||1, p.x, p.y),
    // ═══ FTB & FADER ═══
    fadeToBlack: () => v.fadeToBlack(), setFader: () => v.setFader(p.value),
    // ═══ FULLSCREEN ═══
    fullscreen: () => v.fullscreen(p.input), fullscreenOff: () => v.fullscreenOff(),
    // ═══ RECORD / STREAM / OUTPUT ═══
    startRecording: () => v.startRecording(), stopRecording: () => v.stopRecording(),
    startStreaming: () => v.startStreaming(), stopStreaming: () => v.stopStreaming(),
    startStream: () => v.startStream(p.number), stopStream: () => v.stopStream(p.number),
    startExternal: () => v.startExternal(), stopExternal: () => v.stopExternal(),
    startMultiCorder: () => v.startMultiCorder(), stopMultiCorder: () => v.stopMultiCorder(),
    snapshot: () => v.snapshot(p.input), snapshotInput: () => v.snapshotInput(p.input),
    // ═══ AUDIO — INPUT ═══
    mute: () => v.muteInput(p.input), unmute: () => v.unmuteInput(p.input),
    toggleAudio: () => v.toggleAudio(p.input),
    setVolume: () => v.setVolume(p.input, p.volume),
    setBalance: () => v.setBalance(p.input, p.value),
    soloOn: () => v.soloOn(p.input), soloOff: () => v.soloOff(p.input), soloToggle: () => v.soloToggle(p.input),
    audioAutoOn: () => v.audioAutoOn(p.input), audioAutoOff: () => v.audioAutoOff(p.input),
    audioPluginOn: () => v.audioPluginOn(p.input, p.pluginNum), audioPluginOff: () => v.audioPluginOff(p.input, p.pluginNum),
    audioPluginToggle: () => v.audioPluginToggle(p.input, p.pluginNum),
    audioChannelMatrixPreset: () => v.audioChannelMatrixPreset(p.input, p.preset),
    // ═══ AUDIO — BUS ═══
    audioBusOn: () => v.audioBusOn(p.input, p.bus), audioBusOff: () => v.audioBusOff(p.input, p.bus),
    audioBusToggle: () => v.audioBusToggle(p.input, p.bus),
    // ═══ AUDIO — MASTER/BUS VOLUME ═══
    masterAudioOn: () => v.masterAudioOn(), masterAudioOff: () => v.masterAudioOff(), masterAudioToggle: () => v.masterAudioToggle(),
    setMasterVolume: () => v.setMasterVolume(p.volume),
    busAudioOn: () => v.busAudioOn(p.bus), busAudioOff: () => v.busAudioOff(p.bus), busAudioToggle: () => v.busAudioToggle(p.bus),
    setBusVolume: () => v.setBusVolume(p.bus, p.volume),
    busSendToMaster: () => v.busSendToMaster(p.bus),
    busSendToMasterOn: () => v.busSendToMasterOn(p.bus), busSendToMasterOff: () => v.busSendToMasterOff(p.bus),
    // ═══ PLAYBACK ═══
    play: () => v.playInput(p.input), pause: () => v.pauseInput(p.input), playPause: () => v.playPause(p.input),
    restart: () => v.restartInput(p.input),
    loopOn: () => v.loopOn(p.input), loopOff: () => v.loopOff(p.input),
    setPosition: () => v.setPosition(p.input, p.value), setRate: () => v.setRate(p.input, p.rate),
    nextPicture: () => v.nextPicture(p.input), previousPicture: () => v.previousPicture(p.input),
    selectIndex: () => v.selectIndex(p.input, p.value),
    // ═══ REPLAY ═══
    replayPlay: () => v.replayPlay(), replayPause: () => v.replayPause(), replayPlayPause: () => v.replayPlayPause(),
    replayMoveLastEvent: () => v.replayMoveLastEvent(),
    replayFastForward: () => v.replayFastForward(p.speed), replayFastBackward: () => v.replayFastBackward(p.speed),
    replayJumpToNow: () => v.replayJumpToNow(), replayMarkIn: () => v.replayMarkIn(), replayMarkOut: () => v.replayMarkOut(),
    replayMarkInOut: () => v.replayMarkInOut(), replayLive: () => v.replayLive(),
    replayShowHide: () => v.replayShowHide(), replayChangeDirection: () => v.replayChangeDirection(),
    replayChangeSpeed: () => v.replayChangeSpeed(p.speed),
    replaySelectEvents: () => v.replaySelectEvents(p.value),
    // ═══ PTZ ═══
    ptzMoveUp: () => v.ptzMoveUp(p.input, p.speed), ptzMoveDown: () => v.ptzMoveDown(p.input, p.speed),
    ptzMoveLeft: () => v.ptzMoveLeft(p.input, p.speed), ptzMoveRight: () => v.ptzMoveRight(p.input, p.speed),
    ptzMoveStop: () => v.ptzMoveStop(p.input),
    ptzMoveUpLeft: () => v.ptzMoveUpLeft(p.input), ptzMoveUpRight: () => v.ptzMoveUpRight(p.input),
    ptzMoveDownLeft: () => v.ptzMoveDownLeft(p.input), ptzMoveDownRight: () => v.ptzMoveDownRight(p.input),
    ptzZoomIn: () => v.ptzZoomIn(p.input, p.speed), ptzZoomOut: () => v.ptzZoomOut(p.input, p.speed),
    ptzZoomStop: () => v.ptzZoomStop(p.input), ptzHome: () => v.ptzHome(p.input),
    ptzFocusAuto: () => v.ptzFocusAuto(p.input), ptzFocusNear: () => v.ptzFocusNear(p.input),
    ptzFocusFar: () => v.ptzFocusFar(p.input), ptzFocusStop: () => v.ptzFocusStop(p.input),
    ptzMoveToPreset: () => v.ptzMoveToPreset(p.input, p.preset), ptzSavePreset: () => v.ptzSavePreset(p.input, p.preset),
    // ═══ COLOR CORRECTION ═══
    setSaturation: () => v.setCCSaturation(p.input, p.value),
    setCCSaturation: () => v.setCCSaturation(p.input, p.value),
    setHue: () => v.setCCHue(p.input, p.value),
    setCCHue: () => v.setCCHue(p.input, p.value),
    setGamma: () => v.setCCGammaRGB(p.input, p.value),
    setCCGamma: () => v.setCCGammaRGB(p.input, p.value),
    setGain: () => v.setCCGainRGB(p.input, p.value),
    setCCGain: () => v.setCCGainRGB(p.input, p.value),
    setLift: () => v.setCCLiftRGB(p.input, p.value),
    setCCLift: () => v.setCCLiftRGB(p.input, p.value),
    setContrast: () => v.setCCGammaY(p.input, p.value),
    setBrightness: () => v.setCCGainY(p.input, p.value),
    colorCorrectionAuto: () => v.resetColorCorrection(p.input),
    colorCorrectionReset: () => v.resetColorCorrection(p.input),
    resetColorCorrection: () => v.resetColorCorrection(p.input),
    // ═══ POSITION / CROP ═══
    setPanX: () => v.setPanX(p.input, p.value), setPanY: () => v.setPanY(p.input, p.value),
    setZoom: () => v.setZoom(p.input, p.value),
    setCropX1: () => v.setCropX1(p.input, p.value), setCropY1: () => v.setCropY1(p.input, p.value),
    setCropX2: () => v.setCropX2(p.input, p.value), setCropY2: () => v.setCropY2(p.input, p.value),
    setAlpha: () => v.setAlpha(p.input, p.value),
    resetInput: () => v.resetPosition(p.input),
    resetPosition: () => v.resetPosition(p.input),
    // ═══ EFFECTS / CHROMA ═══
    setInputEffect: () => v.setInputEffect(p.input, p.value),
    inputEffectOn: () => v.inputEffectOn(p.input), inputEffectOff: () => v.inputEffectOff(p.input),
    // ═══ COUNTDOWN ═══
    startCountdown: () => v.startCountdown(p.input), stopCountdown: () => v.stopCountdown(p.input),
    pauseCountdown: () => v.pauseCountdown(p.input),
    setCountdown: () => v.setCountdown(p.input, p.value), changeCountdown: () => v.changeCountdown(p.input, p.value),
    // ═══ BROWSER ═══
    browserNavigate: () => v.browserNavigate(p.input, p.url), browserReload: () => v.browserReload(p.input),
    browserBack: () => v.browserBack(p.input), browserForward: () => v.browserForward(p.input),
    browserKeyboardEnabled: () => v.browserKeyboardEnabled(p.input), browserKeyboardDisabled: () => v.browserKeyboardDisabled(p.input),
    browserMouseEnabled: () => v.browserMouseEnabled(p.input), browserMouseDisabled: () => v.browserMouseDisabled(p.input),
    // ═══ NDI ═══
    ndiSelectSource: () => v.ndiSelectSource(p.input, p.sourceName),
    ndiStartRecording: () => v.ndiStartRecording(p.input), ndiStopRecording: () => v.ndiStopRecording(p.input),
    ndiCommand: () => v.ndiCommand(p.input, p.value),
    // ═══ TITLES / TEXT ═══
    setText: () => v.setText(p.input, p.index, p.value),
    setTextByName: () => v.setTextByName(p.input, p.name, p.value),
    selectTitlePreset: () => v.selectTitlePreset(p.input, p.value),
    nextTitlePreset: () => v.nextTitlePreset(p.input), previousTitlePreset: () => v.previousTitlePreset(p.input),
    setImage: () => v.setImage(p.input, p.index, p.value),
    // ═══ DATA SOURCES ═══
    dataSourceNextRow: () => v.dataSourceNextRow(p.input, p.value),
    dataSourcePreviousRow: () => v.dataSourcePreviousRow(p.input, p.value),
    dataSourceFirstRow: () => v.dataSourceFirstRow(p.input, p.value),
    dataSourceLastRow: () => v.dataSourceLastRow(p.input, p.value),
    dataSourceSelectRow: () => v.dataSourceSelectRow(p.input, p.value, p.row),
    dataSourceAutoNext: () => v.dataSourceAutoNext(p.input, p.value),
    dataSourceAutoNextOff: () => v.dataSourceAutoNextOff(p.input, p.value),
    // ═══ LAYERS ═══
    setLayer: () => v.setLayer(p.input, p.layer, p.source), layerOff: () => v.layerOff(p.input, p.layer),
    setMultiViewOverlay: () => v.setMultiViewOverlay(p.input),
    // ═══ SCRIPTING ═══
    scriptStart: () => v.scriptStart(p.name), scriptStop: () => v.scriptStop(p.name), scriptStopAll: () => v.scriptStopAll(),
    // ═══ DYNAMIC VALUES ═══
    setDynamicValue: () => v.setDynamicValue(p.number, p.value),
    // ═══ VIDEO DELAY ═══
    setVideoDelay: () => v.setVideoDelay(p.input, p.frames),
    // ═══ MISC ═══
    undo: () => v.undo(), activatorRefresh: () => v.activatorRefresh(), keyPress: () => v.keyPress(p.value),
  };
  if (!actions[action]) return res.status(400).json({ error: `Unknown action: ${action}` });
  const result = await actions[action]();
  await helpers.addLog(null, 'vmix', req.user.username, `vMix: ${action}`, JSON.stringify(p));
  res.json(result);
});

module.exports = router;
