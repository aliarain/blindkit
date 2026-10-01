import { navigation, docUrl, getDocument } from '../lib/docs';
import introduction from './docs/index.astro?raw';
import quickstart from './docs/quickstart.astro?raw';
export function GET() {
  const entries = navigation.map((item) => ({
    ...item,
    url: docUrl(item.slug),
    text:
      getDocument(item.slug)?.rawContent() ??
      (item.slug === 'quickstart' ? quickstart : introduction)
        .replace(/^---[\s\S]*?---/, '')
        .replace(/<[^>]+>/g, ' '),
  }));
  return new Response(JSON.stringify(entries), { headers: { 'Content-Type': 'application/json' } });
}
