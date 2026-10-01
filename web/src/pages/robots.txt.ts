export function GET({ site }: { site?: URL }) {
  return new Response(
    site
      ? `User-agent: *\nAllow: /\nSitemap: ${new URL('/sitemap.xml', site)}\n`
      : 'User-agent: *\nDisallow: /\n',
  );
}
