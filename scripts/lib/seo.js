/**
 * Мета-теги и микроразметка.
 *
 * Всё, что должно попасть в индекс, собирается здесь и попадает в HTML
 * на этапе сборки. Клиентский рендер для этого не годится: Яндекс плохо
 * индексирует JS-контент, а Open Graph при шаринге не сработает вовсе.
 */

import { escape } from './template.js';

const abs = (site, path) => new URL(path, site.url).href;

/** Мета-блок для <head>. */
export function head(page, site) {
  const title = page.title;
  const desc = page.description;
  const url = abs(site, page.url);
  const image = abs(site, page.ogImage || site.seo.defaultOgImage);
  const type = page.ogType || 'website';

  const tags = [
    `<title>${escape(title)}</title>`,
    `<meta name="description" content="${escape(desc)}">`,
    `<link rel="canonical" href="${escape(url)}">`,

    `<meta property="og:type" content="${escape(type)}">`,
    `<meta property="og:site_name" content="${escape(site.name)}">`,
    `<meta property="og:locale" content="${escape(site.seo.locale)}">`,
    `<meta property="og:title" content="${escape(title)}">`,
    `<meta property="og:description" content="${escape(desc)}">`,
    `<meta property="og:url" content="${escape(url)}">`,
    `<meta property="og:image" content="${escape(image)}">`,
    `<meta property="og:image:width" content="1200">`,
    `<meta property="og:image:height" content="630">`,

    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:title" content="${escape(title)}">`,
    `<meta name="twitter:description" content="${escape(desc)}">`,
    `<meta name="twitter:image" content="${escape(image)}">`,
  ];

  if (page.noindex) tags.push('<meta name="robots" content="noindex, follow">');
  if (page.publishedAt) {
    tags.push(`<meta property="article:published_time" content="${escape(page.publishedAt)}">`);
  }

  return tags.join('\n  ');
}

/* ---------- JSON-LD ---------- */

const organization = (site) => ({
  '@type': 'Organization',
  '@id': `${site.url}/#organization`,
  name: site.name,
  legalName: site.legalName,
  url: site.url,
  description: site.description,
  email: site.contacts.email,
  telephone: site.contacts.phone,
  address: { '@type': 'PostalAddress', addressLocality: site.city, streetAddress: site.contacts.address },
  sameAs: site.socials.map((s) => s.url),
});

const website = (site) => ({
  '@type': 'WebSite',
  '@id': `${site.url}/#website`,
  url: site.url,
  name: site.name,
  inLanguage: 'ru-RU',
  publisher: { '@id': `${site.url}/#organization` },
});

const breadcrumbs = (page, site) => ({
  '@type': 'BreadcrumbList',
  itemListElement: page.breadcrumbs.map((c, i) => ({
    '@type': 'ListItem',
    position: i + 1,
    name: c.title,
    item: abs(site, c.url),
  })),
});

const faqPage = (items) => ({
  '@type': 'FAQPage',
  mainEntity: items.map((f) => ({
    '@type': 'Question',
    name: f.q,
    acceptedAnswer: { '@type': 'Answer', text: f.a },
  })),
});

const service = (s, site) => {
  const node = {
    '@type': 'Service',
    name: s.title,
    serviceType: s.title,
    description: s.summary,
    url: abs(site, `/services/${s.slug}/`),
    provider: { '@id': `${site.url}/#organization` },
    areaServed: site.city,
  };
  if (typeof s.priceFrom === 'number') {
    node.offers = {
      '@type': 'Offer',
      priceCurrency: 'RUB',
      price: s.priceFrom,
      // Цена в карточке — «от», поэтому именно minPrice, а не фиксированная
      priceSpecification: {
        '@type': 'PriceSpecification',
        minPrice: s.priceFrom,
        priceCurrency: 'RUB',
      },
    };
  }
  return node;
};

const creativeWork = (w, site) => ({
  '@type': 'CreativeWork',
  name: w.title,
  description: w.summary,
  url: abs(site, `/works/${w.slug}/`),
  dateCreated: String(w.year),
  creator: { '@id': `${site.url}/#organization` },
  locationCreated: w.location,
  keywords: (w.tags ?? []).join(', '),
});

const videoObject = (w, site) => ({
  '@type': 'VideoObject',
  name: w.title,
  description: w.summary,
  thumbnailUrl: abs(site, w.poster),
  uploadDate: `${w.year}-01-01`,
  duration: w.video.duration,
  contentUrl: abs(site, `/works/${w.slug}/`),
});

const article = (a, site) => ({
  '@type': 'Article',
  headline: a.title,
  description: a.excerpt,
  image: abs(site, a.cover),
  datePublished: a.date,
  dateModified: a.date,
  author: { '@id': `${site.url}/#organization` },
  publisher: { '@id': `${site.url}/#organization` },
  mainEntityOfPage: abs(site, `/journal/${a.slug}/`),
});

const localBusiness = (site) => ({
  '@type': 'LocalBusiness',
  '@id': `${site.url}/#localbusiness`,
  name: site.name,
  image: abs(site, site.seo.defaultOgImage),
  url: site.url,
  email: site.contacts.email,
  telephone: site.contacts.phone,
  address: { '@type': 'PostalAddress', addressLocality: site.city, streetAddress: site.contacts.address },
  openingHours: site.contacts.hours,
});

/** Собирает @graph из схем, объявленных страницей. */
export function jsonLd(page, site) {
  const graph = [organization(site), website(site)];

  if (page.breadcrumbs?.length > 1) graph.push(breadcrumbs(page, site));
  if (page.faq?.length) graph.push(faqPage(page.faq));
  if (page.service) graph.push(service(page.service, site));
  if (page.work) {
    graph.push(creativeWork(page.work, site));
    if (page.work.video?.duration) graph.push(videoObject(page.work, site));
  }
  if (page.article) graph.push(article(page.article, site));
  if (page.localBusiness) graph.push(localBusiness(site));

  const doc = { '@context': 'https://schema.org', '@graph': graph };
  // </script> внутри строки данных разорвал бы тег
  const json = JSON.stringify(doc).replace(/</g, '\\u003c');
  return `<script type="application/ld+json">${json}</script>`;
}
