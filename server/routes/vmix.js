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
  const actions = {
    // Production
    cut: () => v.cut(), fade: () => v.fade(params?.duration), transition: () => v.transition(params?.number),
    setPreview: () => v.setPreview(params?.input), setProgram: () => v.setProgram(params?.input),
    quickPlay: () => v.quickPlay(params?.input),
    // Inputs
    addInput: () => v.addInput(params?.type||'Video', params?.path), removeInput: () => v.removeInput(params?.input),
    renameInput: () => v.renameInput(params?.input, params?.name),
    // Overlays
    overlayOn: () => v.overlayOn(params?.number||1, params?.input), overlayOff: () => v.overlayOff(params?.number||1),
    overlayToggle: () => v.overlayToggle(params?.number||1, params?.input), overlayZoom: () => v.overlayZoom(params?.number||1),
    // Fullscreen
    fullscreen: () => v.fullscreen(params?.input), fullscreenOff: () => v.fullscreenOff(),
    // Recording & Streaming
    startRecording: () => v.startRecording(), stopRecording: () => v.stopRecording(),
    startStreaming: () => v.startStreaming(), stopStreaming: () => v.stopStreaming(),
    startStream: () => v.startStream(params?.number), stopStream: () => v.stopStream(params?.number),
    snapshot: () => v.snapshot(params?.input), snapshotInput: () => v.snapshotInput(params?.input),
    // Audio
    mute: () => v.muteInput(params?.input), unmute: () => v.unmuteInput(params?.input),
    toggleAudio: () => v.toggleAudio(params?.input),
    setVolume: () => v.setVolume(params?.input, params?.volume),
    setBalance: () => v.setBalance(params?.input, params?.value),
    soloOn: () => v.soloOn(params?.input), soloOff: () => v.soloOff(params?.input), soloToggle: () => v.soloToggle(params?.input),
    audioAutoOn: () => v.audioAutoOn(params?.input), audioAutoOff: () => v.audioAutoOff(params?.input),
    audioBusOn: () => v.audioBusOn(params?.input, params?.bus), audioBusOff: () => v.audioBusOff(params?.input, params?.bus),
    masterAudioOn: () => v.masterAudioOn(), masterAudioOff: () => v.masterAudioOff(),
    setMasterVolume: () => v.setMasterVolume(params?.volume), setBusVolume: () => v.setBusVolume(params?.bus, params?.volume),
    // Playback
    play: () => v.playInput(params?.input), pause: () => v.pauseInput(params?.input),
    restart: () => v.restartInput(params?.input),
    loopOn: () => v.loopOn(params?.input), loopOff: () => v.loopOff(params?.input),
    setPosition: () => v.setPosition(params?.input, params?.value), setRate: () => v.setRate(params?.input, params?.rate),
    // FTB & T-Bar
    fadeToBlack: () => v.fadeToBlack(), setFader: () => v.setFader(params?.value),
    // Replay
    replayPlay: () => v.replayPlay(), replayPause: () => v.replayPause(),
    replayMoveLastEvent: () => v.replayMoveLastEvent(),
    replayFastForward: () => v.replayFastForward(params?.speed), replayFastBackward: () => v.replayFastBackward(params?.speed),
    replayJumpToNow: () => v.replayJumpToNow(), replayMarkIn: () => v.replayMarkIn(), replayMarkOut: () => v.replayMarkOut(),
    // Titles
    setTitle: () => v.setTitle(params?.input, params?.index, params?.value),
    selectTitlePreset: () => v.selectTitlePreset(params?.input, params?.index),
  };
  if (!actions[action]) return res.status(400).json({ error: `Unknown action: ${action}` });
  const result = await actions[action]();
  await helpers.addLog(null, 'vmix', req.user.username, `vMix: ${action}`, JSON.stringify(params||{}));
  res.json(result);
});

module.exports = router;
