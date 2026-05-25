---
title: GNTECH Blog Operations Runbook
description: Initial operating runbook for the GNTECH technical blog publishing pipeline and validation gates.
pubDate: 2026-05-25
updatedDate: 2026-05-25
author: Gerlin Nolasco
tags:
  - blog-ops
  - automation
  - astro
category: Blog Operations
draft: false
validated_by: GPT-5.5
risk_level: low
---

# GNTECH Blog Operations Runbook

## Overview

This first entry documents the publishing rules for this technical blog. The site is designed to become a practical engineering knowledge base, not an AI-generated content farm.

## Why I Built/Tested This

The goal is to keep GNTECH technical notes searchable, reviewable, and safe to publish through pull requests and Telegram approval.

## Hardware/Software Used

- Astro
- Markdown and MDX
- Tailwind CSS
- Pagefind
- Shiki
- Astro RSS and Sitemap
- Giscus
- Cloudflare Pages
- GitHub Actions

## Architecture

Content is written as Markdown or MDX under `src/content/blog/`. Astro builds the static site, Pagefind indexes the generated output, and Cloudflare Pages serves the final site.

## Installation

Install dependencies with:

```bash
npm install
```

Run the local development server with:

```bash
npm run dev
```

## Full Configuration

The project configuration is stored in:

```text
astro.config.mjs
src/content/config.ts
.github/workflows/ci.yml
```

## Verification

Before a post is considered ready, run:

```bash
npm run validate:all
```

## Troubleshooting

If the build fails, fix the reported Astro, Markdown, spelling, frontmatter, or link errors before opening the pull request.

## Security Notes

Do not publish secrets, private keys, internal-only tokens, or unreviewed firewall exposure. Commands and configurations must be validated before publication.

## Performance Notes

The site is static and uses Pagefind for client-side search, so it should remain fast on Cloudflare Pages.

## Lessons Learned

The publishing workflow must favor correctness and review over volume.

## Future Improvements

Add production Cloudflare Pages settings, configure Giscus identifiers, and wire Telegram approval credentials after the GitHub repository exists.
