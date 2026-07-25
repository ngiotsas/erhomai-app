import express from 'express';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApiRouter } from './api.js';
import { cacheStats } from './cache.js';
import { OasaError } from './oasaClient.js';

const PORT = Number.parseInt(process.env.PORT ?? '3000', 10);

const app = express();
app.disable('x-powered-by');

const __dirname = dirname(fileURLToPath(import.meta.url));
const distPath = join(__dirname, '..', 'app', 'dist');

if (existsSync(distPath)) {
  app.use(express.static(distPath));
}

app.use('/api', createApiRouter());

app.get('/health', (req, res) => {
  res.json({ status: 'ok', cache: cacheStats() });
});

app.use((req, res) => {
  if (req.path.startsWith('/api/')) {
    res.status(404).json({ error: 'not_found', message: 'Άγνωστο endpoint.' });
    return;
  }
  if (existsSync(distPath)) {
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
});
