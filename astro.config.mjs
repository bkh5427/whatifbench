// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://whatifbench.com',
  integrations: [sitemap()],
  trailingSlash: 'never',
});
