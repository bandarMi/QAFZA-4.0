import express from 'express';
import cors from 'cors';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { api } from './routes/index.js';
import { db } from './db/index.js';
import { runAnomalyDetection } from './lib/alerts.js';
import { evaluateRecognition } from './lib/recognition.js';
import { aiReady } from './lib/ai.js';
import { secretStatus } from './lib/settings.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const PORT = Number(process.env.PORT) || 4317;

const app = express();
app.use(cors());
app.use(express.json({ limit: '64mb' }));   // CSV imports arrive as JSON rows
app.use('/api', api);
app.use('/assets', express.static(path.join(ROOT, 'assets')));

// The mobile check-in page: a QR scan from a phone camera lands here directly.
app.get('/checkin/:token', (_req, res) => {
  const dist = path.join(ROOT, 'web', 'dist', 'index.html');
  if (fs.existsSync(dist)) return res.sendFile(dist);
  res.redirect(`http://localhost:5317/checkin/${_req.params.token}`);
});

// Serve the built SPA when it exists (production `npm run build && npm start`).
const webDist = path.join(ROOT, 'web', 'dist');
if (fs.existsSync(webDist)) {
  app.use(express.static(webDist));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(webDist, 'index.html'));
  });
}

const members = (db.prepare('SELECT COUNT(*) c FROM members').get() as any).c;
if (members === 0) {
  console.warn('\n⚠  The database is empty. Run `npm run db:reset` to load the seed dataset.\n');
} else {
  try { evaluateRecognition(); runAnomalyDetection(); } catch (err) { console.warn('[startup] background pass failed:', err); }
}

app.listen(PORT, () => {
  const key = secretStatus('ANTHROPIC_API_KEY');
  console.log(`\n  SLS Data Center — API on http://localhost:${PORT}`);
  console.log(`  Database: ${members.toLocaleString()} members loaded`);
  console.log(aiReady()
    ? `  AI: ready (key from ${key.source}, ${key.masked})`
    : `  AI: OFF — add an Anthropic API key in Settings → AI, or run \`npm run set-key\`.`);
  console.log('');
});
