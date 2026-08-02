import { searchStops, ensureSearchIndex, indexStatus } from '../_lib/searchIndex.js';

// The query is sent in the request body (POST) so search terms never end up in
// URLs/access logs. GET is kept for backward compatibility.
async function readQuery(context) {
  const { searchParams } = new URL(context.request.url);
  if (context.request.method === 'POST') {
    const body = await context.request.json().catch(() => ({}));
    return (body.q ?? '').toString().trim();
  }
  return (searchParams.get('q') ?? '').trim();
}

async function handleSearch(context) {
  const q = await readQuery(context);
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

export async function onRequestGet(context) {
  return handleSearch(context);
}

export async function onRequestPost(context) {
  return handleSearch(context);
}
