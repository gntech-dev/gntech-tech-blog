import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';

const dir = 'src/content/blog';
const required = ['title', 'description', 'pubDate', 'author', 'tags', 'category', 'draft', 'validated_by', 'risk_level'];
const allowedRisk = new Set(['low', 'medium', 'high']);
let failed = false;

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
    console.error(`${file}: use docker compose, not docker-compose`);
    failed = true;
  }
}

if (failed) process.exit(1);
console.log('Frontmatter and article structure validation passed.');
