const express = require('express');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { helpers } = require('../db/database');
const { generateToken, authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();

router.post('/login', (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Username and password required' });
    const user = helpers.getUserByUsername(username);
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });
    if (!bcrypt.compareSync(password, user.password_hash)) return res.status(401).json({ error: 'Invalid credentials' });
    helpers.updateLastLogin(user.id);
    res.json({ token: generateToken(user), user: { id: user.id, username: user.username, display_name: user.display_name, role: user.role, avatar: user.avatar } });
  } catch (err) { console.error('[AUTH]', err); res.status(500).json({ error: 'Login failed' }); }
});

router.post('/register', authenticate, requireRole('super_admin'), (req, res) => {
  try {
    const { username, password, display_name, role } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Username and password required' });
    if (helpers.getUserByUsername(username)) return res.status(409).json({ error: 'Username already exists' });
    const id = uuidv4();
    helpers.createUser(id, username, bcrypt.hashSync(password, 10), display_name || username, role || 'viewer');
    res.status(201).json({ id, username, display_name: display_name || username, role: role || 'viewer' });
  } catch (err) { console.error('[AUTH]', err); res.status(500).json({ error: 'Registration failed' }); }
});

router.get('/me', authenticate, (req, res) => {
  const user = helpers.getUserById(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({ user });
});

router.get('/users', authenticate, requireRole('production_admin'), (req, res) => {
  res.json({ users: helpers.getAllUsers() });
});

router.put('/users/:id/role', authenticate, requireRole('super_admin'), (req, res) => {
  const { role } = req.body;
  if (!role) return res.status(400).json({ error: 'Role required' });
  helpers.updateUserRole(role, req.params.id);
  res.json({ success: true });
});

router.delete('/users/:id', authenticate, requireRole('super_admin'), (req, res) => {
  if (req.params.id === req.user.id) return res.status(400).json({ error: 'Cannot delete yourself' });
  helpers.deleteUser(req.params.id);
  res.json({ success: true });
});

module.exports = router;
