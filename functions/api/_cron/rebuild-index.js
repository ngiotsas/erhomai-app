import { rebuildSearchIndex } from '../../_lib/searchIndex.js';

export async function onRequestGet(context) {
  try {
    const size = await rebuildSearchIndex(context.env);
    return new Response(
      JSON.stringify({ ok: true, stops: size }),
      { headers: { 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ ok: false, error: err.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }
}
