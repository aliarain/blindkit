import { readFileSync } from 'node:fs';
export default {
  ...JSON.parse(readFileSync(new URL('../.prettierrc.json', import.meta.url), 'utf8')),
  plugins: ['prettier-plugin-astro'],
};
