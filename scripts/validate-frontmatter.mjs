import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';

const dir = 'src/content/blog';
const required = ['title', 'description', 'pubDate', 'author', 'tags', 'category', 'draft', 'validated_by', 'risk_level'];
const allowedRisk = new Set(['low', 'medium', 'high']);
const allowedImageLicenses = new Set([
  'CC BY 4.0',
  'CC BY-SA 4.0',
  'CC0 1.0',
  'Public Domain',
  'MIT',
  'Apache-2.0',
  'GNTECH original',
  'Own work',
  'Official media kit',
  'Official press kit',
  'Permission granted'
]);
const sourceUrlCache = new Map();
let failed = false;

async function isReachableSourceUrl(url) {
  if (sourceUrlCache.has(url)) return sourceUrlCache.get(url);

  const result = await (async () => {
    const headers = { 'User-Agent': 'GNTECH-blog-validator/1.0' };
    const timeout = AbortSignal.timeout(15000);

    try {
      const head = await fetch(url, { method: 'HEAD', headers, redirect: 'follow', signal: timeout });
      if (head.ok) return true;
      if (![403, 405, 429].includes(head.status)) return false;
    } catch {
      // Some sites block HEAD. Fall back to a small GET request below.
    }

    try {
      const get = await fetch(url, {
        method: 'GET',
        headers: { ...headers, Range: 'bytes=0-1023' },
        redirect: 'follow',
        signal: AbortSignal.timeout(15000)
      });
      return get.ok || get.status === 206;
    } catch {
      return false;
    }
  })();

  sourceUrlCache.set(url, result);
  return result;
}

for (const name of fs.readdirSync(dir).filter((f) => f.endsWith('.md') || f.endsWith('.mdx'))) {
  const file = path.join(dir, name);
  const parsed = matter.read(file);
  const data = parsed.data;
  for (const key of required) {
    if (!(key in data)) {
      console.error(`${file}: missing frontmatter key ${key}`);
      failed = true;
    }
  }
  if (data.author !== 'Gerlin Nolasco') {
    console.error(`${file}: author must be Gerlin Nolasco`);
    failed = true;
  }
  if (data.validated_by !== 'GPT-5.5') {
    console.error(`${file}: validated_by must be GPT-5.5`);
    failed = true;
  }
  if (!allowedRisk.has(data.risk_level)) {
    console.error(`${file}: risk_level must be low, medium, or high`);
    failed = true;
  }
  if (!Array.isArray(data.tags) || data.tags.length === 0) {
    console.error(`${file}: tags must be a non-empty YAML list`);
    failed = true;
  }
  if (!data.draft) {
    if (!data.image || typeof data.image !== 'object') {
      console.error(`${file}: published posts must include an image object with src, alt, and caption`);
      failed = true;
    } else {
      if (typeof data.image.src !== 'string' || !data.image.src.startsWith('/images/blog/') || !data.image.src.endsWith('.png')) {
        console.error(`${file}: image.src must be a PNG under /images/blog/`);
        failed = true;
      }
      if (typeof data.image.alt !== 'string' || data.image.alt.length < 20) {
        console.error(`${file}: image.alt must describe the reference image`);
        failed = true;
      }
      if (typeof data.image.caption !== 'string' || data.image.caption.length < 20) {
        console.error(`${file}: image.caption must explain what the reference image shows`);
        failed = true;
      }
      if (typeof data.image.credit !== 'string' || data.image.credit.length < 2) {
        console.error(`${file}: image.credit must identify the image source or creator`);
        failed = true;
      }
      if (typeof data.image.source !== 'string' || !data.image.source.startsWith('https://')) {
        console.error(`${file}: image.source must be an HTTPS source URL`);
        failed = true;
      } else if (!(await isReachableSourceUrl(data.image.source))) {
        console.error(`${file}: image.source must be reachable and return HTTP 2xx/206: ${data.image.source}`);
        failed = true;
      }
      if (typeof data.image.license !== 'string' || data.image.license.length < 2) {
        console.error(`${file}: image.license must identify the license or usage basis`);
        failed = true;
      } else if (!allowedImageLicenses.has(data.image.license)) {
        console.error(`${file}: image.license must be one of: ${[...allowedImageLicenses].join(', ')}`);
        failed = true;
      }
      const imagePath = path.join('public', data.image.src);
      if (!fs.existsSync(imagePath)) {
        console.error(`${file}: image file does not exist at ${imagePath}`);
        failed = true;
      }
    }
  }
  const requiredHeadings = [
    '# ', '## Overview', '## Why I Built/Tested This', '## Hardware/Software Used', '## Architecture', '## Installation', '## Full Configuration', '## Verification', '## Troubleshooting', '## Security Notes', '## Performance Notes', '## Lessons Learned', '## Future Improvements'
  ];
  for (const heading of requiredHeadings) {
    if (!parsed.content.includes(heading)) {
      console.error(`${file}: missing required heading ${heading}`);
      failed = true;
    }
  }
  if (parsed.content.includes('docker-compose')) {
    // Allow the apt package name docker-compose-plugin and the tag usage
    const lines = parsed.content.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.includes('docker-compose') && !trimmed.includes('docker-compose-plugin') && !trimmed.startsWith('- docker-compose') && !trimmed.startsWith('  - docker-compose')) {
        console.error(`${file}: use docker compose, not docker-compose`);
        failed = true;
        break;
      }
    }
  }
}

if (failed) process.exit(1);
console.log('Frontmatter and article structure validation passed.');
