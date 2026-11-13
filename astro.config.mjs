import { defineConfig } from 'astro/config';
import node from '@astrojs/node';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  site: 'https://magness.dev',
  output: 'static',
  adapter: node({ mode: 'standalone', bodySizeLimit: 16000 }),
  security: { allowedDomains: [{ hostname: 'magness.dev', protocol: 'https' }] },
  integrations: [react(), sitemap()],
  vite: { plugins: [tailwindcss()] },
});
