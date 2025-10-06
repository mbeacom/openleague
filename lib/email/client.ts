import Mailchimp from "@mailchimp/mailchimp_transactional";

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

  // Validate that MAILCHIMP_API_KEY is set
  if (!process.env.MAILCHIMP_API_KEY) {
    throw new Error(
      "MAILCHIMP_API_KEY environment variable is required. " +
      "Please set it in your .env.local file. " +
      "Get your API key from: https://mandrillapp.com/settings"
    );
  }

  // Initialize and cache the client
  mailchimpClient = Mailchimp(process.env.MAILCHIMP_API_KEY);
  return mailchimpClient;
}

export { getMailchimpClient };
