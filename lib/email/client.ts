import Mailchimp from "@mailchimp/mailchimp_transactional";

// Validate that MAILCHIMP_API_KEY is set
if (!process.env.MAILCHIMP_API_KEY) {
  throw new Error(
    "MAILCHIMP_API_KEY environment variable is required. " +
    "Please set it in your .env.local file. " +
    "Get your API key from: https://mandrillapp.com/settings"
  );
}

// Initialize Mailchimp Transactional client
const mailchimpClient = Mailchimp(process.env.MAILCHIMP_API_KEY);

export { mailchimpClient };
