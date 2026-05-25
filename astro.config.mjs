import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import tailwind from '@astrojs/tailwind';

const site = process.env.SITE_URL || 'https://blog.gntechlabs.me';

export default defineConfig({
  site,
  integrations: [
    mdx(),
    tailwind({ applyBaseStyles: false }),
    sitemap(),
  ],
  markdown: {
    shikiConfig: {
      theme: 'github-dark',
      wrap: true,
    },
  },
  vite: {
    define: {
      __BUILD_DATE__: JSON.stringify(new Date().toISOString()),
    },
  },
});
