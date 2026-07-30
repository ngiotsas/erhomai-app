import { fetchAllLines } from '../_lib/oasaClient.js';
import { cached } from '../_lib/cache.js';

const LINES_TTL_MS = 12 * 60 * 60 * 1000;

export async function onRequestGet(context) {
  try {
    const lines = await cached('lines:all', LINES_TTL_MS, () => fetchAllLines());
    const { searchParams } = new URL(context.request.url);
    const q = (searchParams.get('q') ?? '').toString().toLowerCase().trim();
    let filtered = lines;
    if (q) {
      filtered = lines.filter(
        (l) => l.lineId.toLowerCase().includes(q) || l.lineName.toLowerCase().includes(q),
      );
    }
    return new Response(
      JSON.stringify(filtered.slice(0, 50)),
      { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=300' } },
    );
  } catch {
    return new Response(
      JSON.stringify({ error: 'oasa_unavailable', message: 'Δεν μπορέσαμε να επικοινωνήσουμε με το ΟΑΣΑ.' }),
      { status: 502, headers: { 'Content-Type': 'application/json' } },
    );
  }
}
