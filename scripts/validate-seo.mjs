import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';

const siteUrl = (process.env.SITE_URL || 'https://blog.gntechlabs.me').replace(/\/$/, '');
const contentDir = 'src/content/blog';
const distDir = 'dist/blog';
const requiredMetaNames = ['description', 'twitter:card', 'twitter:title', 'twitter:description', 'twitter:image', 'twitter:image:alt'];
const requiredMetaProperties = [
  'og:title',
  'og:description',
  'og:type',
  'og:url',
  'og:image',
  'og:image:alt',
  'og:image:width',
  'og:image:height',
  'og:site_name',
  'og:locale',
  'article:published_time',
  'article:modified_time',
  'article:author'
];

let failed = false;

function fail(file, message) {
  console.error(`${file}: ${message}`);
  failed = true;
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function hasMeta(html, attr, key, expected) {
  const attrPattern = attr === 'name' ? 'name' : 'property';
  const keyPattern = escapeRegex(key);
  const expectedPattern = expected == null ? '[^"<>]+' : escapeRegex(expected);
  const direct = new RegExp(`<meta\\s+[^>]*${attrPattern}=["']${keyPattern}["'][^>]*content=["']${expectedPattern}["'][^>]*>`, 'i');
  const reverse = new RegExp(`<meta\\s+[^>]*content=["']${expectedPattern}["'][^>]*${attrPattern}=["']${keyPattern}["'][^>]*>`, 'i');
  return direct.test(html) || reverse.test(html);
}

function hasCanonical(html, expected) {
  const pattern = new RegExp(`<link\\s+[^>]*rel=["']canonical["'][^>]*href=["']${escapeRegex(expected)}["'][^>]*>`, 'i');
  const reverse = new RegExp(`<link\\s+[^>]*href=["']${escapeRegex(expected)}["'][^>]*rel=["']canonical["'][^>]*>`, 'i');
  return pattern.test(html) || reverse.test(html);
}

for (const name of fs.readdirSync(contentDir).filter((file) => /\.(md|mdx)$/.test(file))) {
  const sourcePath = path.join(contentDir, name);
  const parsed = matter.read(sourcePath);
  const data = parsed.data;
  if (data.draft) continue;

  const slug = name.replace(/\.(md|mdx)$/, '');
  const htmlPath = path.join(distDir, slug, 'index.html');
  if (!fs.existsSync(htmlPath)) {
    fail(sourcePath, `rendered HTML missing at ${htmlPath}; run npm run build before validate:seo`);
    continue;
  }

  const html = fs.readFileSync(htmlPath, 'utf8');
  const canonical = `${siteUrl}/blog/${slug}/`;
  const title = `${data.title} | GNTECH Engineering Notes`;
  const image = data.image?.src || '/og-default.png';
  const imageUrl = new URL(image, `${siteUrl}/`).toString();
  const imageAlt = data.image?.alt || 'GNTECH Engineering Notes social preview';

  if (!html.includes(`<title>${title}</title>`)) fail(sourcePath, `missing exact <title>${title}</title>`);
  if (!hasCanonical(html, canonical)) fail(sourcePath, `missing canonical URL ${canonical}`);
  if (!hasMeta(html, 'name', 'description', data.description)) fail(sourcePath, 'missing meta description from frontmatter');

  const expectedProperties = new Map([
    ['og:title', title],
    ['og:description', data.description],
    ['og:type', 'article'],
    ['og:url', canonical],
    ['og:image', imageUrl],
    ['og:image:alt', imageAlt],
    ['og:image:width', '1200'],
    ['og:image:height', '630'],
    ['og:site_name', 'GNTECH Engineering Notes'],
    ['og:locale', 'en_US'],
    ['article:author', data.author]
  ]);

  for (const property of requiredMetaProperties) {
    const expected = expectedProperties.get(property);
    if (!hasMeta(html, 'property', property, expected)) fail(sourcePath, `missing or incorrect ${property}`);
  }

  const expectedNames = new Map([
    ['twitter:card', 'summary_large_image'],
    ['twitter:title', title],
    ['twitter:description', data.description],
    ['twitter:image', imageUrl],
    ['twitter:image:alt', imageAlt]
  ]);

  for (const nameKey of requiredMetaNames) {
    const expected = expectedNames.get(nameKey);
    if (!hasMeta(html, 'name', nameKey, expected)) fail(sourcePath, `missing or incorrect ${nameKey}`);
  }

  for (const tag of data.tags || []) {
    if (!hasMeta(html, 'property', 'article:tag', tag)) fail(sourcePath, `missing article:tag for ${tag}`);
  }

  if (image.startsWith('/images/blog/')) {
    const imagePath = path.join('public', image);
    if (!fs.existsSync(imagePath)) fail(sourcePath, `social image file missing at ${imagePath}`);
  }
}

if (failed) process.exit(1);
console.log('SEO metadata validation passed.');
