import jwt from 'jsonwebtoken';
import { User } from './models.js';
const secret = () => process.env.JWT_SECRET || 'dev-secret-change-me';

export const sign = (u) => jwt.sign({ id: String(u._id), role: u.role, name: u.name }, secret(), { expiresIn: '8h' });

// Role-based access control: auth('admin','instructor') allows only those roles; auth() allows any logged-in user.
// The user is re-read from the database on every request, so a deactivated account or a changed role takes effect immediately.
export const auth = (...roles) => async (req, res, next) => {
  try {
    const token = (req.headers.authorization || '').replace('Bearer ', '');
    const payload = jwt.verify(token, secret());
    const user = await User.findById(payload.id).select('name role active').lean();
    if (!user || user.active === false) return res.status(401).json({ error: 'Account is not active' });
    if (roles.length && !roles.includes(user.role)) return res.status(403).json({ error: 'Forbidden for your role' });
    req.user = { id: String(user._id), role: user.role, name: user.name };
    next();
  } catch {
    res.status(401).json({ error: 'Not authenticated' });
  }
};

// Simple API-key protection for system-to-system integration (e.g. an LMS).
export const lmsKey = (req, res, next) =>
  req.headers['x-api-key'] === (process.env.LMS_API_KEY || 'lms-demo-key')
    ? next()
    : res.status(401).json({ error: 'Invalid API key' });
