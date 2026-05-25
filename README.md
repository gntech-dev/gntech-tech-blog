# GNTECH Engineering Notes

Astro static technical blog for practical GNTECH infrastructure and automation notes.

## Stack

- Astro
- Markdown/MDX content collections
- Tailwind CSS
- Pagefind search
- Shiki code highlighting
- Astro RSS and Sitemap
- Giscus comments
- Cloudflare Pages and Cloudflare Web Analytics
- GitHub Actions validation
- Telegram approval before publishing

## Local setup

```bash
npm install
npm run dev
```

## Validation before PR

```bash
npm run validate:all
```

## Publishing guardrail

Do not merge or publish directly. Each post needs a pull request, GPT-5.5 technical validation, successful local/GitHub checks, and Telegram approval.

## Content location

Posts live in:

```text
src/content/blog/
```

## Required post frontmatter

```yaml
---
title:
description:
pubDate:
updatedDate:
author: Gerlin Nolasco
tags:
category:
draft: false
validated_by: GPT-5.5
risk_level:
---
```
