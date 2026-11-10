import { isEmailConfigured, sendProjectEnquiry, type EmailConfig, type ProjectEnquiry } from './email.ts';

type Field = keyof ProjectEnquiry;
type Errors = Partial<Record<Field, string>>;
export interface ContactConfig {
  origin: string;
  email: EmailConfig;
  turnstileSecret?: string;
}
interface Dependencies {
  send?: typeof sendProjectEnquiry;
  fetcher?: typeof fetch;
  allowRequest?: (client: string) => boolean;
}

const MAX_BYTES = 16000;
const SUCCESS = 'Thank you—your project details have been sent. I’ll be in touch.';
const UNAVAILABLE = 'The contact form is temporarily unavailable. Please try again later.';

export function validateEnquiry(input: Record<string, unknown>): { enquiry: ProjectEnquiry; errors: Errors } {
  const value = (key: Field) => typeof input[key] === 'string' ? input[key].trim() : '';
  const enquiry = { name: value('name'), email: value('email'), company: value('company'), message: value('message') };
  const errors: Errors = {};
  if (!enquiry.name || enquiry.name.length > 100 || /[\r\n\x00]/.test(enquiry.name)) errors.name = 'Enter your name (up to 100 characters).';
  if (enquiry.email.length > 254 || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(enquiry.email) || /[\x00-\x1f\x7f]/.test(enquiry.email)) errors.email = 'Enter a valid email address.';
  if (enquiry.company.length > 120 || /[\r\n\x00]/.test(enquiry.company)) errors.company = 'Use up to 120 characters for your company name.';
  if (enquiry.message.length < 10 || enquiry.message.length > 5000 || /\x00/.test(enquiry.message)) errors.message = 'Please describe your project in 10–5,000 characters.';
  return { enquiry, errors };
}

// Bounded, process-local protection for a single Node server. Use an edge limiter
// or a shared store if the site is deployed across multiple instances.
export function createRateLimiter(limit = 5, windowMs = 10 * 60 * 1000, now = Date.now) {
  const clients = new Map<string, { count: number; expires: number }>();
  return (client: string) => {
    const time = now();
    for (const [key, entry] of clients) if (entry.expires <= time) clients.delete(key);
    const entry = clients.get(client);
    if (entry) { if (entry.count >= limit) return false; entry.count++; return true; }
    if (clients.size >= 10000) return false;
    clients.set(client, { count: 1, expires: time + windowMs });
    return true;
  };
}
const allowRequest = createRateLimiter();

async function readBody(request: Request): Promise<string> {
  if (Number(request.headers.get('content-length')) > MAX_BYTES) throw new Error('too-large');
  const reader = request.body?.getReader();
  if (!reader) return '';
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES) { await reader.cancel(); throw new Error('too-large'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return new TextDecoder().decode(bytes);
}

function reply(request: Request, status: number, message: string, errors?: Errors): Response {
  const headers = new Headers({ 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  if (status === 429) headers.set('Retry-After', '600');
  if (request.headers.get('accept')?.includes('application/json')) {
    headers.set('Content-Type', 'application/json');
    return new Response(JSON.stringify({ message, ...(errors && { errors }) }), { status, headers });
  }
  // Native HTML form fallback. Only fixed application messages appear here.
  headers.set('Content-Type', 'text/html; charset=utf-8');
  const details = errors ? `<ul>${Object.values(errors).map((error) => `<li>${error}</li>`).join('')}</ul>` : '';
  return new Response(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>Project enquiry — MAGNESS</title><style>body{font:18px/1.6 system-ui;background:#f3f4f1;color:#0f1b2d;max-width:42rem;margin:10vh auto;padding:2rem}a{color:#1a6b64}h1{line-height:1.2}</style><main><h1>${status === 200 ? 'Thank you for getting in touch.' : 'Your message hasn’t been sent.'}</h1><p>${message}</p>${details}<a href="/#contact">Return to MAGNESS</a></main></html>`, { status, headers });
}

export async function handleContact(request: Request, client: string, config: ContactConfig, dependencies: Dependencies = {}): Promise<Response> {
  if (request.headers.get('origin') !== config.origin) return reply(request, 403, 'Please submit your enquiry from the MAGNESS website.');
  if (!(dependencies.allowRequest ?? allowRequest)(client)) return reply(request, 429, 'Too many attempts. Please wait ten minutes and try again.');
  const type = request.headers.get('content-type')?.split(';')[0].trim();
  if (type !== 'application/json' && type !== 'application/x-www-form-urlencoded') return reply(request, 415, 'This submission format is not supported.');
  let input: Record<string, unknown>;
  try {
    const body = await readBody(request);
    const parsed = type === 'application/json' ? JSON.parse(body) : Object.fromEntries(new URLSearchParams(body));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('invalid');
    input = parsed;
  } catch (error) {
    return reply(request, error instanceof Error && error.message === 'too-large' ? 413 : 400, 'The submission could not be read. Please check the form and try again.');
  }
  if (input.website) return reply(request, 200, SUCCESS);
  const { enquiry, errors } = validateEnquiry(input);
  if (Object.keys(errors).length) return reply(request, 422, 'Please check the highlighted fields.', errors);
  if (!isEmailConfigured(config.email)) return reply(request, 503, UNAVAILABLE);
  const fetcher = dependencies.fetcher ?? fetch;
  if (config.turnstileSecret) {
    const token = input['cf-turnstile-response'];
    if (typeof token !== 'string' || !token || token.length > 2048) return reply(request, 422, 'Please complete the spam protection and try again.');
    try {
      const verification = await fetcher('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
        method: 'POST', body: new URLSearchParams({ secret: config.turnstileSecret, response: token }), signal: AbortSignal.timeout(5000),
      });
      const result = await verification.json() as { success?: boolean; hostname?: string };
      if (!verification.ok || !result.success || result.hostname !== new URL(config.origin).hostname) return reply(request, 422, 'Spam protection could not be verified. Please try again.');
    } catch { return reply(request, 503, UNAVAILABLE); }
  }
  try {
    await (dependencies.send ?? sendProjectEnquiry)(enquiry, config.email, fetcher);
    return reply(request, 200, SUCCESS);
  } catch { return reply(request, 502, 'Your message could not be sent right now. Please try again later.'); }
}
