import type { APIRoute } from 'astro';
import { getSecret } from 'astro:env/server';
import { isIP } from 'node:net';
import { handleContact } from '../../server/contact';
import { token } from '../../styles/tokens';

const theme = { background: token('--background'), foreground: token('--foreground'), accent: token('--accent') };

export const prerender = false;

export const POST: APIRoute = ({ request, clientAddress }) => {
  if (getSecret('CONTACT_FORM_ENABLED') !== 'true') {
    return new Response('Contact form temporarily unavailable', { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
  // Only enable this behind the Cloudflare tunnel with the origin bound to loopback.
  const trustCloudflare = getSecret('TRUST_CLOUDFLARE_IP') === 'true';
  const cloudflareIP = request.headers.get('cf-connecting-ip')?.trim();
  if (!import.meta.env.DEV && (!trustCloudflare || !cloudflareIP || !isIP(cloudflareIP))) {
    return new Response('Contact form temporarily unavailable', { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
  return handleContact(request, trustCloudflare && cloudflareIP && isIP(cloudflareIP) ? cloudflareIP : clientAddress, {
    origin: import.meta.env.DEV ? new URL(request.url).origin : (getSecret('SITE_URL') || 'https://magness.dev'),
    email: {
      provider: getSecret('EMAIL_PROVIDER') || 'resend',
      apiKey: getSecret('RESEND_API_KEY'),
      from: getSecret('MAIL_FROM'),
      to: getSecret('CONTACT_TO'),
    },
    turnstileSecret: getSecret('TURNSTILE_SECRET_KEY'),
    theme,
  });
};

export const ALL: APIRoute = () => new Response('Method not allowed', {
  status: 405, headers: { Allow: 'POST', 'Cache-Control': 'no-store' },
});
