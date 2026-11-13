import type { APIRoute } from 'astro';
import { token } from '../styles/tokens';

// Generated at build time so the icon follows the palette tokens.
export const GET: APIRoute = () => new Response(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="12" fill="${token('--primary')}"/><path d="M14 46V18h7l11 17 11-17h7v28h-7V30L32 46 21 30v16z" fill="${token('--brand-bright')}"/></svg>`,
  { headers: { 'Content-Type': 'image/svg+xml' } },
);
