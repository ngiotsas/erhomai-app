import { fetchAllLines } from '../_lib/oasaClient.js';
import { cached } from '../_lib/cache.js';
import { normalizeLineText } from '../_lib/normalize.js';

const LINES_TTL_MS = 12 * 60 * 60 * 1000;

function matchesQuery(line, q) {
  const qNorm = normalizeLineText(q);
  if (normalizeLineText(line.lineId).includes(qNorm)) return true;
  if (normalizeLineText(line.lineName).includes(qNorm)) return true;
  if (line.lineNameEn && line.lineNameEn.toLowerCase().includes(q.toLowerCase())) return true;
  return false;
}

export async function onRequestGet(context) {
  return handleLines(context);
}

export async function onRequestPost(context) {
  return handleLines(context);
}

// The query is sent in the request body (POST) so search terms never end up in
// URLs/access logs. GET is kept for backward compatibility.
async function readQuery(context) {
  const { searchParams } = new URL(context.request.url);
  if (context.request.method === 'POST') {
    const body = await context.request.json().catch(() => ({}));
    return (body.q ?? '').toString().trim();
  }
  return (searchParams.get('q') ?? '').toString().trim();
}

async function handleLines(context) {
  try {
    const lines = await cached('lines:all', LINES_TTL_MS, () => fetchAllLines());
    const q = await readQuery(context);
    let filtered = lines;
    if (q) {
      filtered = lines.filter((l) => matchesQuery(l, q));
    }
    return new Response(
      JSON.stringify(filtered.slice(0, 50)),
      { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } },
    );
  } catch {
    return new Response(
      JSON.stringify({ error: 'oasa_unavailable', message: 'Δεν μπορέσαμε να επικοινωνήσουμε με το ΟΑΣΑ.' }),
      { status: 502, headers: { 'Content-Type': 'application/json' } },
    );
  }
}
