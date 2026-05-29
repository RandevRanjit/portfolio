import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// User site: served at the domain root, so no `base`.
export default defineConfig({
  site: 'https://randevranjit.github.io',
  integrations: [sitemap()],
  build: { format: 'directory' },
});
