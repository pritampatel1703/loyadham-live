const jwt = require('jsonwebtoken');
const { helpers } = require('../db/database');

const JWT_SECRET = process.env.JWT_SECRET || 'pixelperfect-broadcast-secret-2026';
const JWT_EXPIRES = '24h';

// Role hierarchy (higher index = more permissions)
const ROLE_HIERARCHY = {
  viewer: 0,
  camera_operator: 1,
  operator: 2,
  production_admin: 3,
  super_admin: 4,
};

/**
 * Generate JWT token for a user
 */
function generateToken(user) {
  return jwt.sign(
    { id: user.id, username: user.username, role: user.role },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES }
  );
}

/**
 * Middleware: Verify JWT token
 */
function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

/**
 * Middleware factory: Require minimum role level
 */
function requireRole(minRole) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' });
    const userLevel = ROLE_HIERARCHY[req.user.role] ?? -1;
    const requiredLevel = ROLE_HIERARCHY[minRole] ?? 999;
    if (userLevel < requiredLevel) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
}

/**
 * Middleware: Optional auth (attach user if token present, but don't block)
 */
function optionalAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    try {
      const token = authHeader.split(' ')[1];
      req.user = jwt.verify(token, JWT_SECRET);
    } catch (_) {}
  }
  next();
}

module.exports = { generateToken, authenticate, requireRole, optionalAuth, JWT_SECRET, ROLE_HIERARCHY };
