import { rebuildSearchIndex } from '../../_lib/searchIndex.js';

// Manual rebuild trigger. There are no cron triggers on Pages, so this route
// would otherwise let anyone kick off a full OASA crawl. Gate it behind a
// secret: set CRON_SECRET (wrangler pages secret put CRON_SECRET) and call
// with `Authorization: Bearer <secret>` or `?secret=<secret>`. Without a
// configured secret — or with a wrong one — the route pretends not to exist.
export async function onRequestGet(context) {
  const expected = context.env?.CRON_SECRET;
  const url = new URL(context.request.url);
  const auth = context.request.headers.get('Authorization') ?? '';
  const provided = auth.startsWith('Bearer ')
    ? auth.slice('Bearer '.length)
    : (url.searchParams.get('secret') ?? '');
  if (!expected || provided !== expected) {
    return new Response(
      JSON.stringify({ error: 'not_found', message: 'Άγνωστο endpoint.' }),
      { status: 404, headers: { 'Content-Type': 'application/json' } },
    );
  }

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
