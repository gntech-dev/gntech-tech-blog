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

## Telegram approval callbacks

The GitHub Action sends approval messages with inline buttons. The buttons need the Cloudflare Pages Function at `/api/telegram-approval` plus a Telegram webhook.

Required Cloudflare Pages production environment variables:

```text
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
TELEGRAM_WEBHOOK_SECRET=
GITHUB_TOKEN=
```

`GITHUB_TOKEN` must be a GitHub token that can comment on pull requests in this repo. The callback does not auto-merge; it records approve, reject, or request-changes decisions as PR comments and sends Telegram feedback.

After the Pages Function is deployed, configure the bot webhook from a trusted shell:

```bash
TELEGRAM_BOT_TOKEN=... TELEGRAM_WEBHOOK_SECRET=... npm run approval:webhook:set -- https://blog.gntechlabs.me/api/telegram-approval
```

## Giscus comments

Comments use GitHub Discussions through Giscus.

Default repo settings are baked into `src/components/GiscusComments.astro` for Cloudflare Pages:

```text
PUBLIC_GISCUS_REPO=gntech-dev/gntech-tech-blog
PUBLIC_GISCUS_REPO_ID=R_kgDOSnmBXA
PUBLIC_GISCUS_CATEGORY=General
PUBLIC_GISCUS_CATEGORY_ID=DIC_kwDOSnmBXM4C906T
```

Required one-time GitHub step: install the [Giscus GitHub App](https://github.com/apps/giscus) for `gntech-dev/gntech-tech-blog` if comments show a repository/category access error.

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
