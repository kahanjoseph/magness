import assert from 'node:assert/strict';
import test from 'node:test';
import { createRateLimiter, handleContact, validateEnquiry, type ContactConfig } from '../src/server/contact.ts';
import { sendProjectEnquiry } from '../src/server/email.ts';

const enquiry = { name: 'Test Visitor', email: 'visitor@example.com', company: '', message: 'I would like to discuss a custom internal application.' };
const config: ContactConfig = { origin: 'https://magness.dev', email: { provider: 'resend', apiKey: 'test-only', from: 'MAGNESS <website@example.com>', to: 'inbox@example.com' } };
const request = (body: unknown = enquiry, headers: Record<string, string> = {}) => new Request('https://magness.dev/api/contact', {
  method: 'POST', headers: { Origin: config.origin, Accept: 'application/json', 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body),
});
const unrestricted = { allowRequest: () => true };

test('valid enquiries are normalized and delivered once', async () => {
  let sends = 0;
  const response = await handleContact(request({ ...enquiry, name: ' Test Visitor ' }), 'client', config, {
    ...unrestricted, send: async (value) => { sends++; assert.equal(value.name, 'Test Visitor'); },
  });
  assert.equal(response.status, 200);
  assert.equal(sends, 1);
  assert.equal(response.headers.get('cache-control'), 'no-store');
});

test('invalid input and header injection never reach delivery', async () => {
  const input = { ...enquiry, name: 'Name\r\nBcc: bad@example.com', email: 'invalid', message: 'short' };
  assert.deepEqual(Object.keys(validateEnquiry(input).errors).sort(), ['email', 'message', 'name']);
  const response = await handleContact(request(input), 'client', config, { ...unrestricted, send: async () => assert.fail('must not send') });
  assert.equal(response.status, 422);
});

test('untrusted origins are rejected before delivery', async () => {
  const response = await handleContact(request(enquiry, { Origin: 'https://elsewhere.example' }), 'client', config, { ...unrestricted, send: async () => assert.fail('must not send') });
  assert.equal(response.status, 403);
});

test('honeypot submissions are discarded', async () => {
  const response = await handleContact(request({ ...enquiry, website: 'spam' }), 'client', config, { ...unrestricted, send: async () => assert.fail('must not send') });
  assert.equal(response.status, 200);
});

test('missing configuration and provider failures never claim success', async () => {
  const unconfigured = await handleContact(request(), 'client', { ...config, email: {} }, unrestricted);
  assert.equal(unconfigured.status, 503);
  const rejected = await handleContact(request(), 'client', config, { ...unrestricted, send: async () => { throw new Error('provider unavailable'); } });
  assert.equal(rejected.status, 502);
  assert.doesNotMatch(await rejected.text(), /test-only|provider unavailable/);
});

test('body limits apply even without a content-length header', async () => {
  const response = await handleContact(request({ ...enquiry, message: 'x'.repeat(17000) }), 'client', config, unrestricted);
  assert.equal(response.status, 413);
});

test('malformed JSON and unsupported content types are rejected', async () => {
  const malformed = new Request('https://magness.dev/api/contact', { method: 'POST', headers: { Origin: config.origin, 'Content-Type': 'application/json' }, body: '{' });
  assert.equal((await handleContact(malformed, 'client', config, unrestricted)).status, 400);
  assert.equal((await handleContact(request(enquiry, { 'Content-Type': 'text/plain' }), 'client', config, unrestricted)).status, 415);
});

test('rate limiting expires and keeps clients independent', () => {
  let time = 100;
  const allow = createRateLimiter(2, 1000, () => time);
  assert.equal(allow('one'), true);
  assert.equal(allow('one'), true);
  assert.equal(allow('one'), false);
  assert.equal(allow('two'), true);
  time += 1001;
  assert.equal(allow('one'), true);
});

test('rate-limited responses advise when to retry', async () => {
  const response = await handleContact(request(), 'client', config, { allowRequest: () => false });
  assert.equal(response.status, 429);
  assert.equal(response.headers.get('retry-after'), '600');
});

test('native form submissions work without client JavaScript', async () => {
  const native = new Request('https://magness.dev/api/contact', { method: 'POST', headers: { Origin: config.origin, 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'text/html' }, body: new URLSearchParams(enquiry) });
  const response = await handleContact(native, 'client', config, { ...unrestricted, send: async () => {} });
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type') || '', /text\/html/);
  assert.match(await response.text(), /Thank you for getting in touch/);
});

test('Turnstile requires a valid token and matching hostname', async () => {
  const protectedConfig = { ...config, turnstileSecret: 'test-secret' };
  assert.equal((await handleContact(request(), 'client', protectedConfig, unrestricted)).status, 422);
  const response = await handleContact(request({ ...enquiry, 'cf-turnstile-response': 'test-token' }), 'client', protectedConfig, {
    ...unrestricted,
    fetcher: async () => Response.json({ success: true, hostname: 'wrong.example' }),
    send: async () => assert.fail('must not send'),
  });
  assert.equal(response.status, 422);
  let delivered = false;
  const valid = await handleContact(request({ ...enquiry, 'cf-turnstile-response': 'test-token' }), 'client', protectedConfig, {
    ...unrestricted,
    fetcher: async () => Response.json({ success: true, hostname: 'magness.dev' }),
    send: async () => { delivered = true; },
  });
  assert.equal(valid.status, 200);
  assert.equal(delivered, true);
});

test('Resend uses a verified sender, fixed recipient, and visitor reply-to', async () => {
  await sendProjectEnquiry(enquiry, config.email, async (url, init) => {
    assert.equal(url, 'https://api.resend.com/emails');
    const body = JSON.parse(String(init?.body));
    assert.equal(body.from, config.email.from);
    assert.deepEqual(body.to, [config.email.to]);
    assert.equal(body.reply_to, enquiry.email);
    assert.match(body.text, /custom internal application/);
    assert.equal(body.html, undefined);
    return Response.json({ id: 'test-message' });
  });
  await assert.rejects(sendProjectEnquiry(enquiry, config.email, async () => new Response('', { status: 429 })), /did not accept/);
});
