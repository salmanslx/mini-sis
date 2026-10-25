import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import routes from './routes.js';

// In production the demo secrets must not be used: anyone could forge logins or call the LMS API.
const production = process.env.NODE_ENV === 'production' || process.env.RENDER;
if (production) {
  const missing = ['JWT_SECRET', 'LMS_API_KEY', 'MONGO_URI'].filter((k) => !process.env[k]);
  if (missing.length) throw new Error(`Missing environment variables: ${missing.join(', ')}`);
}

const app = express();
// CLIENT_URL = the address of the deployed web app (comma-separate several). Without it, any origin is allowed (development).
const origins = (process.env.CLIENT_URL || '').split(',').map((s) => s.trim().replace(/\/$/, '')).filter(Boolean);
app.use(cors({ origin: origins.length ? origins : true }));
app.use(express.json());
app.use('/api', routes);
app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Server error' });
});

await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/mini_sis');
app.listen(process.env.PORT || 5000, () => console.log('Mini SIS API running on port', process.env.PORT || 5000));