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

GitHub Actions runs the type check, tests, and production build on pushes and pull requests. This workflow does not deploy the site; deployment requires a configured Node hosting destination.

## Design and content

- `src/styles/global.css`: Harbor palette, semantic theme tokens, typography and shared layout styles.
- `src/pages/index.astro`: homepage sections and approved messaging.
- `src/data/services.ts`: three service descriptions and calls to action.
- `src/components/`: navigation, wordmark, footer and progressively enhanced contact form.
- `src/server/`: validation, spam protection and email delivery.

The first build follows the latest user-supplied Claude Harbor direction: warm off-white, navy and brass; the brand colors live only in the `:root` block of `global.css` (`src/styles/tokens.ts` exposes them to the favicon, theme color, palette studio and contact reply page); Geist body type; an italic serif headline; service rows rather than nested cards. Fonts are self-hosted from Fontsource packages. Their licenses ship with those packages. No employer code or assets are included.

The CSS uses semantic tokens compatible with future shadcn components. React and shadcn components can be introduced when an interaction warrants them; simple content and form fields remain native HTML.

## Contact email

Copy `.env.example` to `.env` and configure:

- `RESEND_API_KEY`: a Resend sending key.
- `MAIL_FROM`: a sender on a verified domain.
- `CONTACT_TO`: the inbox receiving enquiries (Gmail is fine).
- `SITE_URL`: the production origin, initially `https://magness.dev`.

The form sends one notification to the configured inbox with the visitor as Reply-To. It does not send an automatic visitor confirmation. Without credentials, it returns an unavailable response and never claims a message was delivered. Tests use injected fake transports and do not send email.

Resend API details are isolated in `src/server/email.ts`. A future provider requires its own adapter before `EMAIL_PROVIDER` can select it; changing the key alone does not make arbitrary APIs compatible. Sender verification and DNS changes remain provider setup tasks.

Spam protection includes a honeypot, origin checks, bounded input, required server-side Turnstile verification, and a process-local limit of five attempts per client address per ten minutes. Configure both Turnstile keys before enabling the form. The public site key and `PUBLIC_CONTACT_FORM_ENABLED` flag are embedded at build time; rebuild after changing them. `CONTACT_FORM_ENABLED` is a separate runtime flag, and the secret stays on the server. Missing email or Turnstile credentials fail closed. The site sends the Turnstile token, not the enquiry content, to the validation API.

Production accepts `CF-Connecting-IP` only when `TRUST_CLOUDFLARE_IP=true`. Set that flag only after binding the Node listener to `127.0.0.1` and routing requests exclusively through the Cloudflare tunnel; otherwise clients could spoof the header. Missing or invalid Cloudflare client addresses fail closed in production. The in-memory limiter is for one server and resets on restart; use a shared or edge limiter for multiple instances. The Node adapter limits request bodies to 16,000 bytes.

## Before public launch

- Confirm the final palette, founder identification, contact addresses and public copy.
- Verify the sending domain, configure credentials and test delivery to the real inbox.
- Configure Turnstile and check its behavior on the actual domain.
- Configure HTTPS and the public origin (including the reverse proxy).
- Review the privacy notice against the final email, anti-spam and analytics setup.
- Add approved case studies only when publication rights and wording are clear.
- Add a social sharing image and any final logo assets.

No analytics or chatbot is installed. Homepage, privacy and 404 pages are included. Dedicated Services, About and Our Work pages can follow the homepage review.
