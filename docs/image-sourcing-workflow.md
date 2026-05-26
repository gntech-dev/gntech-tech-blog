# Image sourcing workflow

Use this workflow for every published blog post that needs a reference image, diagram, screenshot, or social preview image.

## Goal

Every published post must have a useful image that is legally safe to reuse, relevant to the article, and properly attributed in frontmatter. Do not scrape random web images without a clear reuse license or permission.

## Preferred source order

1. Original GNTECH screenshots or photos
   - Best option when the article is based on our own lab work.
   - Sanitize hostnames, IP addresses, email addresses, tokens, keys, customer data, serial numbers, and private dashboards.
   - Use screenshots only when they prove or explain a real step in the article.

2. Official vendor documentation assets with an explicit reusable license
   - Example: Cloudflare Docs assets are licensed under CC BY 4.0 at the time this workflow was created.
   - Link to the original asset or documentation repository in `image.source`.
   - Include the license in `image.license`.

3. Official press/media kits
   - Use only if the media kit explicitly permits editorial or descriptive use.
   - Keep brand marks unmodified unless the license allows edits.

4. Open-license image libraries
   - Acceptable sources include Wikimedia Commons or similar repositories when the file page shows a clear license.
   - Prefer CC BY, CC BY-SA, CC0, public domain, MIT, Apache-2.0, or vendor documentation licenses.
   - Record the exact file page as `image.source`, not just a search results page.

5. Generated diagrams
   - Use only when no suitable source image exists or when the post needs a custom architecture diagram.
   - Label the image honestly as a GNTECH-generated reference diagram.
   - Do not imply it is an official vendor diagram.

## Not allowed

Do not use:

- Random images from Google Images, blogs, forums, Reddit, Medium, or social media without explicit license terms.
- Vendor diagrams copied from docs pages where the license is unclear.
- Screenshots that expose secrets, public IPs that should not be public, usernames, emails, customer data, serial numbers, API keys, access tokens, private URLs, or internal topology details.
- AI-generated images that look like real screenshots, benchmark results, dashboards, or product UI.
- Fake benchmark charts or generated screenshots that imply tests were run when they were not.

## Required frontmatter

Every published post must include this image object:

```yaml
image:
  src: /images/blog/example-reference.png
  alt: "Descriptive alt text explaining the image for screen readers."
  caption: "Short caption explaining why this image is relevant to the post."
  credit: "Source or creator name"
  source: https://example.com/original-image-or-file-page
  license: "License or usage basis"
```

Rules enforced by validation:

- `src` must point to a PNG under `/images/blog/`.
- The image file must exist under `public/images/blog/`.
- `alt`, `caption`, `credit`, `source`, and `license` are required for published posts.
- Draft posts are exempt while they are being prepared.

## File naming

Use clear, stable filenames:

```text
public/images/blog/<post-slug>-<short-source-or-purpose>.png
```

Examples:

```text
public/images/blog/cloudflare-access-docs-standard-flow.png
public/images/blog/proxmox-zfs-own-screenshot-pool-overview.png
public/images/blog/mikrotik-vlan-generated-topology.png
```

## Download and conversion process

1. Save the original source URL and license before downloading.
2. Download the image from the original source, not from a cached preview or CDN thumbnail when possible.
3. Convert to PNG if needed.
4. Resize or crop only for readability; do not distort diagrams or product UI.
5. Store the final image under `public/images/blog/`.
6. Add the frontmatter image object.
7. Run validation:

```bash
npm run validate:all
```

## Review checklist

Before opening or merging a post PR, confirm:

- The image directly supports the article content.
- The source page clearly permits reuse or the image is original GNTECH work.
- Attribution is visible in the article caption.
- `image.source` points to the original file/page.
- The image renders in the article header.
- The homepage/blog index thumbnail renders correctly.
- `og:image` and `twitter:image` use the post image.
- Sensitive information is sanitized.
- The image does not imply untested benchmarks, fake production results, or official endorsement.

## When no safe image exists

Use a GNTECH-generated reference diagram instead of unsafe scraping. The caption and credit should make that clear:

```yaml
image:
  src: /images/blog/example-generated-reference.png
  alt: "Reference diagram showing the architecture described in the article."
  caption: "GNTECH-generated reference diagram showing the article architecture."
  credit: "GNTECH"
  source: https://github.com/gntech-dev/gntech-tech-blog
  license: "Original GNTECH diagram"
```
