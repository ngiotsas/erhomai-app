const SITEMAP = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml"
        xmlns:mobile="http://www.google.com/schemas/sitemap-mobile/1.0">
  <url>
    <loc>https://erhomai.gr/</loc>
    <lastmod>${new Date().toISOString().slice(0, 10)}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
    <xhtml:link rel="alternate" hreflang="el" href="https://erhomai.gr/" />
    <xhtml:link rel="alternate" hreflang="en" href="https://erhomai.gr/?lang=en" />
    <xhtml:link rel="alternate" hreflang="x-default" href="https://erhomai.gr/" />
  </url>
</urlset>`;

export async function onRequestGet() {
  return new Response(SITEMAP, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=86400',
    },
  });
}
