## Summary

Describe what this PR changes.

## Blog publishing checklist

For content PRs, confirm:

- [ ] Post is under `src/content/blog/`.
- [ ] Post uses the required article structure.
- [ ] Commands/configs were validated with GPT-5.5 before publishing.
- [ ] No fake benchmark or untested production claims are included.
- [ ] `npm run validate:all` passes.
- [ ] Telegram approval was requested and recorded before merge.

## Image sourcing checklist

For published posts, confirm:

- [ ] The post has an `image` object in frontmatter.
- [ ] The image is relevant to the article, not decorative filler.
- [ ] The image is original GNTECH work, official reusable vendor documentation/media, or open-license content.
- [ ] The source URL and license were verified before use.
- [ ] The article visibly credits the image source/license.
- [ ] Sensitive information was sanitized from screenshots.
- [ ] The image does not imply fake benchmark results, fake screenshots, or official endorsement.
- [ ] The rendered page uses the image for `og:image` and `twitter:image`.

Reference workflow: `docs/image-sourcing-workflow.md`
