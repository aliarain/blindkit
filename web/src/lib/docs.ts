import type { MarkdownInstance } from 'astro';

export const navigation = [
  {
    slug: '',
    title: 'Introduction',
    group: 'Start here',
    summary: 'What Blindkit does, and where to begin.',
  },
  {
    slug: 'quickstart',
    title: 'Setup guide',
    group: 'Start here',
    summary: 'Install Blindkit and try a simple example.',
  },
  {
    slug: 'concepts',
    title: 'The basics',
    group: 'Using Blindkit',
    summary: 'Four names you’ll see in Blindkit, explained.',
  },
  {
    slug: 'config',
    title: 'Settings',
    group: 'Using Blindkit',
    summary: 'Connect an app, choose your rules, and set limits.',
  },
  {
    slug: 'mcp',
    title: 'How your AI uses tools',
    group: 'Using Blindkit',
    summary: 'How your AI finds actions, runs them, and asks for permission.',
  },
  {
    slug: 'security',
    title: 'Security',
    group: 'Learn more',
    summary: 'How Blindkit protects your keys, and what you still need to check.',
  },
  {
    slug: 'architecture',
    title: 'How it works',
    group: 'Learn more',
    summary: 'Follow a request from your AI to your app.',
  },
];
export const docUrl = (slug: string) => `/docs/${slug ? slug + '/' : ''}`;
export const markdown = import.meta.glob<MarkdownInstance<Record<string, unknown>>>(
  '../../../docs/{concepts,config,mcp,security,architecture}.md',
  { eager: true },
);
export function getDocument(slug: string) {
  return markdown[`../../../docs/${slug}.md`];
}

// Render the repository docs directly. Adapt repository-relative links for the website.
export async function documentHtml(slug: string) {
  return (await getDocument(slug).compiledContent())
    .replace(/<h1\b[^>]*>[\s\S]*?<\/h1>/, '')
    .replace(/<table>/g, '<table tabindex="0" aria-label="Scrollable reference table">')
    .replace(
      /href="(?:\.\/)?([a-z-]+)\.md(#[^"]*)?"/g,
      (_, name, hash = '') => `href="${docUrl(name)}${hash}"`,
    )
    .replace(/href="\.\.\/AGENTS\.md"/g, 'href="/reference/AGENTS.txt"');
}
