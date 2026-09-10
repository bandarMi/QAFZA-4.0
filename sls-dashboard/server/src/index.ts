import express from 'express';
import cors from 'cors';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { api } from './routes/index.js';
import { db, DATA_DIR } from './db/index.js';
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

// First run — including a double-clicked portable build — should land on a
// working dashboard, not an empty one with instructions to run another command.
let members = (db.prepare('SELECT COUNT(*) c FROM members').get() as any).c;
if (members === 0) {
  console.log('  First run: loading the demo dataset…');
  const { seed } = await import('./db/seed.js');
  seed();
  members = (db.prepare('SELECT COUNT(*) c FROM members').get() as any).c;
  console.log(`  Loaded ${members.toLocaleString()} members of synthetic demo data.`);
}
try { evaluateRecognition(); runAnomalyDetection(); } catch (err) { console.warn('[startup] background pass failed:', err); }

/**
 * Bind PORT, stepping to the next free one if it is taken — a portable build is
 * launched by double-click, where "port already in use" is a dead end rather
 * than something the user can fix. The chosen port is written next to the
 * database so the launcher knows which URL to open.
 */
function listen(port: number, attemptsLeft = 10) {
  const server = app.listen(port);

  server.on('listening', () => {
    const url = `http://localhost:${port}`;
    try { fs.writeFileSync(path.join(DATA_DIR, '.port'), String(port)); } catch { /* read-only dir; the log still shows it */ }
    const key = secretStatus('ANTHROPIC_API_KEY');
    console.log(`\n  SLS Data Center — ${url}`);
    console.log(`  Database: ${members.toLocaleString()} members loaded`);
    console.log(aiReady()
      ? `  AI: ready (key from ${key.source}, ${key.masked})`
      : `  AI: OFF — add an Anthropic API key in Settings → AI, or run \`npm run set-key\`.`);
    console.log('');
  });

  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE' && attemptsLeft > 0) {
      console.log(`  Port ${port} is busy, trying ${port + 1}…`);
      listen(port + 1, attemptsLeft - 1);
      return;
    }
    console.error(`\n  Could not start the server: ${err.message}\n`);
    process.exit(1);
  });
}

listen(PORT);
