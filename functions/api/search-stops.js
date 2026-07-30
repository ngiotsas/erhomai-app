import { searchStops, ensureSearchIndex, indexStatus } from '../_lib/searchIndex.js';

export async function onRequestGet(context) {
  const { searchParams } = new URL(context.request.url);
  const q = (searchParams.get('q') ?? '').trim();
  if (!q || q.length < 2) {
    return new Response(
      JSON.stringify({ stops: [], index: indexStatus() }),
      { headers: { 'Content-Type': 'application/json' } },
    );
  }
  await ensureSearchIndex(context.env);
  const stops = searchStops(q);
  return new Response(
    JSON.stringify({ stops, index: indexStatus() }),
    { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=300' } },
  );
}
