const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { helpers } = require('../db/database');
const { authenticate, requireRole } = require('../middleware/auth');
const router = express.Router();

router.get('/', authenticate, (req, res) => {
  const { status } = req.query;
  let events;
  if (status === 'scheduled') events = helpers.getScheduledEvents();
  else if (status === 'live') { const e = helpers.getActiveEvent(); events = e ? [e] : []; }
  else events = helpers.getAllEvents();
  events = events.map(e => ({ ...e, assignments: helpers.getEventAssignments(e.id), scene_preset: JSON.parse(e.scene_preset || '{}'), layout_config: JSON.parse(e.layout_config || '{}') }));
  res.json({ events });
});
router.get('/:id', authenticate, (req, res) => {
  const e = helpers.getEventById(req.params.id);
  if (!e) return res.status(404).json({ error: 'Not found' });
  e.assignments = helpers.getEventAssignments(e.id);
  e.scene_preset = JSON.parse(e.scene_preset || '{}');
  e.layout_config = JSON.parse(e.layout_config || '{}');
  res.json({ event: e });
});
router.post('/', authenticate, requireRole('production_admin'), (req, res) => {
  const { title, description, scheduled_start, scheduled_end, scene_preset, layout_config, production_template } = req.body;
  if (!title) return res.status(400).json({ error: 'Title required' });
  const id = uuidv4();
  helpers.createEvent(id, title, description||'', 'draft', scheduled_start||null, scheduled_end||null, JSON.stringify(scene_preset||{}), JSON.stringify(layout_config||{}), production_template||'', req.user.id);
  helpers.addLog(id, 'production', req.user.username, `Event "${title}" created`, '{}');
  res.status(201).json({ id, title });
});
router.put('/:id', authenticate, requireRole('production_admin'), (req, res) => {
  const ev = helpers.getEventById(req.params.id);
  if (!ev) return res.status(404).json({ error: 'Not found' });
  const { title, description, status, scheduled_start, scheduled_end, scene_preset, layout_config, production_template } = req.body;
  helpers.updateEvent(title||ev.title, description??ev.description, status||ev.status, scheduled_start||ev.scheduled_start, scheduled_end||ev.scheduled_end, JSON.stringify(scene_preset||JSON.parse(ev.scene_preset||'{}')), JSON.stringify(layout_config||JSON.parse(ev.layout_config||'{}')), production_template||ev.production_template, req.params.id);
  res.json({ success: true });
});
router.post('/:id/launch', authenticate, requireRole('production_admin'), (req, res) => { helpers.startEvent(req.params.id); helpers.addLog(req.params.id, 'production', req.user.username, 'Event launched LIVE', '{}'); res.json({ success: true }); });
router.post('/:id/end', authenticate, requireRole('production_admin'), (req, res) => { helpers.endEvent(req.params.id); helpers.addLog(req.params.id, 'production', req.user.username, 'Event ended', '{}'); res.json({ success: true }); });
router.delete('/:id', authenticate, requireRole('production_admin'), (req, res) => { helpers.deleteEvent(req.params.id); res.json({ success: true }); });
router.post('/:id/cameras', authenticate, requireRole('operator'), (req, res) => { const { device_id, role, position_label, sort_order } = req.body; helpers.assignCamera(req.params.id, device_id, role||'camera', position_label||'', sort_order||0); res.json({ success: true }); });
router.delete('/:id/cameras/:deviceId', authenticate, requireRole('operator'), (req, res) => { helpers.removeAssignment(req.params.id, req.params.deviceId); res.json({ success: true }); });
module.exports = router;
