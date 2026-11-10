# MAGNESS Software Consulting

The first website build for **magness.dev**. Astro renders the marketing pages to static HTML; a Node endpoint handles project enquiries. React support is configured for future interactive islands, but the current homepage ships no React runtime.

## Develop

Use Node 24 or later and npm:

```sh
npm ci
npm run dev
```

On Windows PowerShell with script restrictions, use `npm.cmd` instead of `npm`.

```sh
npm run check
npm test
npm run build
npm start
```

The standalone Node build serves the generated pages and `/api/contact`. Production environment variables can be supplied by the host or an untracked `.env` file. `HOST` and `PORT` control the production listener. A static file server alone cannot handle the contact endpoint.

## Design and content

- `src/styles/global.css`: Harbor palette, semantic theme tokens, typography and shared layout styles.
- `src/pages/index.astro`: homepage sections and approved messaging.
- `src/data/services.ts`: three service descriptions and calls to action.
- `src/components/`: navigation, wordmark, footer and progressively enhanced contact form.
- `src/server/`: validation, spam protection and email delivery.

The first build follows the latest user-supplied Claude Harbor direction: off-white, navy and teal; Geist body type; an italic serif headline; service rows rather than nested cards. Fonts are self-hosted from Fontsource packages. Their licenses ship with those packages. No employer code or assets are included.

The CSS uses semantic tokens compatible with future shadcn components. React and shadcn components can be introduced when an interaction warrants them; simple content and form fields remain native HTML.

## Contact email

Copy `.env.example` to `.env` and configure:

- `RESEND_API_KEY`: a Resend sending key.
- `MAIL_FROM`: a sender on a verified domain.
- `CONTACT_TO`: the inbox receiving enquiries (Gmail is fine).
- `SITE_URL`: the production origin, initially `https://magness.dev`.

The form sends one notification to the configured inbox with the visitor as Reply-To. It does not send an automatic visitor confirmation. Without credentials, it returns an unavailable response and never claims a message was delivered. Tests use injected fake transports and do not send email.

Resend API details are isolated in `src/server/email.ts`. A future provider requires its own adapter before `EMAIL_PROVIDER` can select it; changing the key alone does not make arbitrary APIs compatible. Sender verification and DNS changes remain provider setup tasks.

Spam protection includes a honeypot, origin checks, bounded input, and a process-local limit of five attempts per client address per ten minutes. For public launch, configure both Turnstile keys in `.env.example`; rebuild after changing the public key. The secret stays on the server. The site sends no submission content to Turnstile.

Before deploying behind a reverse proxy, verify client-address forwarding against the Node adapter and configure trusted proxy behavior. Do not trust arbitrary forwarded headers. The in-memory limiter is for one server and resets on restart; use a shared or edge limiter for multiple instances. Configure request timeouts/body limits at the reverse proxy as well.

## Before public launch

- Confirm the final palette, founder identification, contact addresses and public copy.
- Verify the sending domain, configure credentials and test delivery to the real inbox.
- Configure Turnstile and check its behavior on the actual domain.
- Configure HTTPS and the public origin (including the reverse proxy).
- Review the privacy notice against the final email, anti-spam and analytics setup.
- Add approved case studies only when publication rights and wording are clear.
- Add a social sharing image and any final logo assets.

No analytics or chatbot is installed. Homepage, privacy and 404 pages are included. Dedicated Services, About and Our Work pages can follow the homepage review.
