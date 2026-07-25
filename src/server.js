import express from 'express';
import rateLimit from 'express-rate-limit';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApiRouter } from './api.js';
import { cacheStats } from './cache.js';
import { OasaError } from './oasaClient.js';

const PORT = Number.parseInt(process.env.PORT ?? '3000', 10);
if (!Number.isFinite(PORT) || PORT < 1 || PORT > 65535) {
  console.error(`Invalid PORT "${process.env.PORT ?? '3000'}"`);
  process.exit(1);
}

const app = express();
app.disable('x-powered-by');

const TRUST_PROXY = Number.parseInt(process.env.TRUST_PROXY ?? '0', 10);
if (Number.isFinite(TRUST_PROXY) && TRUST_PROXY > 0) {
  app.set('trust proxy', TRUST_PROXY);
}

app.use('/api', rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'rate_limited', message: 'Πολλά requests. Δοκίμασε ξανά σε λίγο.' },
}));

const __dirname = dirname(fileURLToPath(import.meta.url));
const distPath = join(__dirname, '..', 'app', 'dist');
const hasDist = existsSync(distPath);

if (hasDist) {
  app.use('/assets', express.static(join(distPath, 'assets'), {
    maxAge: '1y',
    immutable: true,
  }));
  app.use(express.static(distPath, {
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('index.html')) {
        res.setHeader('Cache-Control', 'no-cache');
      }
    },
  }));
}

app.use('/api', createApiRouter());

app.get('/health', (req, res) => {
  res.json({ status: 'ok', cache: cacheStats() });
});

app.use((req, res) => {
  if (req.path.startsWith('/api/') || req.path === '/api') {
    res.status(404).json({ error: 'not_found', message: 'Άγνωστο endpoint.' });
    return;
  }
  if (hasDist) {
    res.sendFile(join(distPath, 'index.html'));
  } else {
    res.status(404).json({ error: 'not_found', message: 'Άγνωστο endpoint.' });
  }
});

// Το Express 5 στέλνει εδώ και τα σφάλματα των async handlers.
app.use((error, req, res, next) => {
  if (error instanceof OasaError) {
    const upstreamStatus = error.status ? ` (HTTP ${error.status})` : '';
    console.error(`[oasa] ${error.action}${upstreamStatus}: ${error.message}`, error.cause ?? '');
    res.status(502).json({
      error: 'upstream_unavailable',
      message: 'Το σύστημα τηλεματικής του ΟΑΣΑ δεν απαντάει αυτή τη στιγμή.',
    });
    return;
  }

  console.error('[server]', error);
  res.status(500).json({ error: 'internal_error', message: 'Κάτι πήγε στραβά.' });
});

app.listen(PORT, () => {
  console.log(`Ο server ακούει στο http://localhost:${PORT}`);
}).on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`Η πόρτα ${PORT} χρησιμοποιείται ήδη. Δοκίμασε PORT=xxxx.`);
  } else {
    console.error('[server]', error);
  }
  process.exit(1);
});
