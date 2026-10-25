import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import routes from './routes.js';

const app = express();
app.use(cors());
app.use(express.json());
app.use('/api', routes);
app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Server error' });
});

await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/mini_sis');
app.listen(process.env.PORT || 5000, () => console.log('Mini SIS API running on port', process.env.PORT || 5000));
