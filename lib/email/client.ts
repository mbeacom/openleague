import Mailchimp from "@mailchimp/mailchimp_transactional";
import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";
import { env, isProduction } from "@/lib/env";

/**
 * Provider-agnostic email seam. All application code (templates, actions,
 * cron jobs) sends through {@link sendEmail}; the transport (AWS SES,
 * Mailchimp Transactional, or a dev/test logger) is resolved from the
 * environment at send time, so the app boots without email credentials.
 */

export interface EmailRecipient {
  email: string;
  name?: string;
}

export interface EmailMessage {
  to: EmailRecipient[];
  subject: string;
  html: string;
  text?: string;
}

export type EmailProvider = "ses" | "mailchimp" | "log";

/**
 * Resolve the active provider: explicit EMAIL_PROVIDER wins; otherwise infer
 * from configured credentials (Mailchimp key for backwards compatibility,
 * then AWS region), falling back to the log provider.
 */
export function resolveEmailProvider(): EmailProvider {
  if (env.EMAIL_PROVIDER) return env.EMAIL_PROVIDER;
  if (env.MAILCHIMP_API_KEY) return "mailchimp";
  if (env.AWS_REGION) return "ses";
  return "log";
}

type MailchimpClient = ReturnType<typeof Mailchimp>;

let mailchimpClient: MailchimpClient | null = null;

function getMailchimpClient(): MailchimpClient {
  if (mailchimpClient) return mailchimpClient;
  if (!env.MAILCHIMP_API_KEY) {
    throw new Error("EMAIL_PROVIDER is 'mailchimp' but MAILCHIMP_API_KEY is not set");
  }
  mailchimpClient = Mailchimp(env.MAILCHIMP_API_KEY);
  return mailchimpClient;
}

let sesClient: SESv2Client | null = null;

function getSesClient(): SESv2Client {
  if (sesClient) return sesClient;
  // Region/credentials come from AWS_REGION and the default provider chain
  // (env credentials or Vercel OIDC); SESv2Client validates at send time.
  sesClient = new SESv2Client(env.AWS_REGION ? { region: env.AWS_REGION } : {});
  return sesClient;
}

/** RFC 5322 display-name formatting, with quotes stripped from the name. */
function formatSesAddress(recipient: EmailRecipient): string {
  if (!recipient.name) return recipient.email;
  return `"${recipient.name.replace(/["\r\n]/g, "")}" <${recipient.email}>`;
}

async function sendViaSes(message: EmailMessage): Promise<void> {
  const client = getSesClient();
  // One SES call per recipient: Mailchimp Transactional sends individual
  // copies by default (preserve_recipients: false), and a single SES call
  // with multiple ToAddresses would expose every address to every recipient.
  const results = await Promise.allSettled(
    message.to.map((recipient) =>
      client.send(
        new SendEmailCommand({
          FromEmailAddress: env.EMAIL_FROM,
          Destination: { ToAddresses: [formatSesAddress(recipient)] },
          Content: {
            Simple: {
              Subject: { Data: message.subject, Charset: "UTF-8" },
              Body: {
                Html: { Data: message.html, Charset: "UTF-8" },
                ...(message.text ? { Text: { Data: message.text, Charset: "UTF-8" } } : {}),
              },
            },
          },
        })
      )
    )
  );

  const failures = results.filter(
    (result): result is PromiseRejectedResult => result.status === "rejected"
  );
  if (failures.length > 0) {
    failures.forEach((failure) => console.error("SES send failed:", failure.reason));
    throw new Error(
      `SES failed to send to ${failures.length} of ${message.to.length} recipient(s)`
    );
  }
}

async function sendViaMailchimp(message: EmailMessage): Promise<void> {
  const mailchimp = getMailchimpClient();
  const response = await mailchimp.messages.send({
    message: {
      from_email: env.EMAIL_FROM,
      subject: message.subject,
      html: message.html,
      text: message.text ?? "",
      to: message.to.map((recipient) => ({
        email: recipient.email,
        ...(recipient.name ? { name: recipient.name } : {}),
        type: "to" as const,
      })),
    },
  });
  // The @mailchimp/mailchimp_transactional client NEVER rejects: its ApiClient
  // resolves the axios error object on transport/API failure (bad key, network,
  // Mandrill 5xx). A successful send resolves to an array of per-recipient
  // statuses; anything else is a failure we must surface, or account-lifecycle
  // mail (verification, reset) would silently vanish and lock users out.
  if (!Array.isArray(response)) {
    console.error("Mailchimp send failed (non-array response):", response);
    throw new Error("Mailchimp transport failure — email not sent");
  }
  response.forEach((result) => {
    if (result.status === "rejected" || result.status === "invalid") {
      console.error(
        `Mailchimp did not deliver to ${result.email}: ${result.status}` +
          ("reject_reason" in result && result.reject_reason
            ? ` (${result.reject_reason})`
            : "")
      );
    }
  });
}

function sendViaLog(message: EmailMessage): void {
  if (isProduction) {
    // Loud failure: email is not configured in production. Callers decide
    // whether the send is critical; boot is never blocked.
    throw new Error(
      "No email provider configured (set EMAIL_PROVIDER with matching credentials); message not sent"
    );
  }
  console.warn(
    `[email:log] would send "${message.subject}" to ${message.to
      .map((recipient) => recipient.email)
      .join(", ")}`
  );
}

/**
 * Send a transactional email through the configured provider. Throws on
 * transport failure; per-recipient soft bounces are logged, not thrown.
 */
export async function sendEmail(message: EmailMessage): Promise<void> {
  if (message.to.length === 0) return;
  const provider = resolveEmailProvider();
  switch (provider) {
    case "ses":
      return sendViaSes(message);
    case "mailchimp":
      return sendViaMailchimp(message);
    case "log":
      sendViaLog(message);
      return;
  }
}
