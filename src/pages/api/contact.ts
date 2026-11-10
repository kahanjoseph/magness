import type { APIRoute } from 'astro';
import { getSecret } from 'astro:env/server';
import { handleContact } from '../../server/contact';

export const prerender = false;

export const POST: APIRoute = ({ request, clientAddress }) => handleContact(request, clientAddress, {
  origin: import.meta.env.DEV ? new URL(request.url).origin : (getSecret('SITE_URL') || 'https://magness.dev'),
  email: {
    provider: getSecret('EMAIL_PROVIDER') || 'resend',
    apiKey: getSecret('RESEND_API_KEY'),
    from: getSecret('MAIL_FROM'),
    to: getSecret('CONTACT_TO'),
  },
  turnstileSecret: getSecret('TURNSTILE_SECRET_KEY'),
});

export const ALL: APIRoute = () => new Response('Method not allowed', {
  status: 405, headers: { Allow: 'POST', 'Cache-Control': 'no-store' },
});
