import Mailchimp from "@mailchimp/mailchimp_transactional";
import { env } from "@/lib/env";

type MailchimpClient = ReturnType<typeof Mailchimp>;

let mailchimpClient: MailchimpClient | null = null;

/**
 * Get the Mailchimp Transactional client instance
 * Lazily initializes the client on first use to avoid build-time errors
 */
function getMailchimpClient(): MailchimpClient {
  // Return existing client if already initialized
  if (mailchimpClient) {
    return mailchimpClient;
  }

  // Initialize and cache the client (env.MAILCHIMP_API_KEY is already validated)
  mailchimpClient = Mailchimp(env.MAILCHIMP_API_KEY);
  return mailchimpClient;
}

export { getMailchimpClient };
