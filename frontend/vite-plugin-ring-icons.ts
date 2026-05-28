import type { Plugin } from 'vite';

/** Public HTTPS origin for absolute icon URLs (Firefox iOS metadata parser). */
function ringPublicOrigin(): string | undefined {
  const host = process.env.RING_REMOTE_HOST?.trim() || process.env.RING_FQDN?.trim();
  if (!host) return undefined;
  return host.startsWith('http') ? host.replace(/\/$/, '') : `https://${host}`;
}

const ICON_PATH =
  /^\/(?:apple-touch-icon(?:-[\w-]+)?\.png|apple-touch-icon-precomposed\.png|ring-share-256\.png|favicon\.png|pwa-\d+x\d+\.png|favicon\.ico|maskable-icon-\d+x\d+\.png)/;

/** Rewrite root-relative icon URLs to absolute when deploying behind a known public host. */
export function ringAbsoluteIconUrls(): Plugin {
  const origin = ringPublicOrigin();
  return {
    name: 'ring-absolute-icon-urls',
    transformIndexHtml: {
      order: 'post',
      handler(html) {
        if (!origin) return html;
        return html.replace(
          /(href|content)="(\/(?:apple-touch[^"]*|ring-share[^"]*|favicon[^"]*|pwa-[^"]*|maskable-icon[^"]*))"/g,
          (match, attr, path) => {
            if (!ICON_PATH.test(path.split('?')[0])) return match;
            return `${attr}="${origin}${path}"`;
          },
        );
      },
    },
  };
}
