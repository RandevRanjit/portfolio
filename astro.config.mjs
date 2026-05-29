import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// Project page: served at /portfolio.
export default defineConfig({
  site: 'https://randevranjit.github.io',
  base: '/portfolio',
  integrations: [sitemap()],
  build: { format: 'directory' },
});
