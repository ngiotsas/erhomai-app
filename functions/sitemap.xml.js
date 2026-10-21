// Bump when the page content (SEO copy, structured data) actually changes;
// a per-request timestamp would tell crawlers the page changed on every
// fetch, which is noise, not signal.
const LAST_MODIFIED = '2026-10-21';

function generateSitemap() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml"
        xmlns:mobile="http://www.google.com/schemas/sitemap-mobile/1.0">
  <url>
    <loc>https://erhomai.gr/</loc>
    <lastmod>${LAST_MODIFIED}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
    <xhtml:link rel="alternate" hreflang="el" href="https://erhomai.gr/" />
    <xhtml:link rel="alternate" hreflang="en" href="https://erhomai.gr/?lang=en" />
    <xhtml:link rel="alternate" hreflang="x-default" href="https://erhomai.gr/" />
  </url>
</urlset>`;
}

export async function onRequestGet() {
  return new Response(generateSitemap(), {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=86400',
    },
  });
}
