/** sitemap.xml из списка собранных страниц. */

import { escape } from './template.js';

export function sitemap(pages, site) {
  const rows = pages
    .filter((p) => !p.noindex)
    .map((p) => {
      const loc = new URL(p.url, site.url).href;
      const parts = [`    <loc>${escape(loc)}</loc>`];
      if (p.lastmod) parts.push(`    <lastmod>${p.lastmod}</lastmod>`);
      parts.push(`    <priority>${p.priority ?? '0.7'}</priority>`);
      return `  <url>\n${parts.join('\n')}\n  </url>`;
    });

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${rows.join('\n')}
</urlset>
`;
}

export function robots(site) {
  return `User-agent: *
Allow: /
Disallow: /api/

# utm-метки не должны плодить дубли страниц в индексе
Clean-param: utm_source&utm_medium&utm_campaign&utm_content&utm_term&yclid&gclid

Sitemap: ${new URL('/sitemap.xml', site.url).href}
`;
}
