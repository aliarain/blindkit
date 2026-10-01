import { defineConfig } from 'astro/config';

const productionUrl =
  process.env.VERCEL_ENV === 'production' ? process.env.VERCEL_PROJECT_PRODUCTION_URL : undefined;
const site =
  process.env.VERCEL_ENV === 'preview'
    ? undefined
    : (process.env.SITE_URL ?? (productionUrl ? `https://${productionUrl}` : undefined));
if (site && !/^https:\/\/[^/]+\/?$/.test(site)) {
  throw new Error('SITE_URL must be an HTTPS origin, for example https://your-site.vercel.app');
}

export default defineConfig({
  site,
  output: 'static',
  trailingSlash: 'always',
  devToolbar: { enabled: false },
  markdown: { shikiConfig: { theme: 'github-light-high-contrast' } },
  vite: { build: { assetsInlineLimit: 0 } },
});
