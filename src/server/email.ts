export interface ProjectEnquiry {
  name: string;
  email: string;
  company: string;
  message: string;
}

export interface EmailConfig {
  provider?: string;
  apiKey?: string;
  from?: string;
  to?: string;
}

export function isEmailConfigured(config: EmailConfig): boolean {
  return config.provider === 'resend' && Boolean(config.apiKey && config.from && config.to);
}

// Provider-specific code lives here. Forms and content do not depend on Resend.
export async function sendProjectEnquiry(
  enquiry: ProjectEnquiry,
  config: EmailConfig,
  fetcher: typeof fetch = fetch,
): Promise<void> {
  if (!isEmailConfigured(config)) throw new Error('Email delivery is not configured.');
  const response = await fetcher('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(10000),
    body: JSON.stringify({
      from: config.from,
      to: [config.to],
      reply_to: enquiry.email,
      subject: `MAGNESS project enquiry: ${enquiry.name}`,
      text: [
        `Name: ${enquiry.name}`,
        `Email: ${enquiry.email}`,
        `Company: ${enquiry.company || 'Not supplied'}`,
        '', 'Project description:', enquiry.message,
      ].join('\n'),
    }),
  });
  // Do not log the provider response: it can contain recipient details.
  if (!response.ok) throw new Error('Email provider did not accept the message.');
}
