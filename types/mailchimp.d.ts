declare module "@mailchimp/mailchimp_transactional" {
  interface MessageRecipient {
    email: string;
    type: "to" | "cc" | "bcc";
  }

  interface Message {
    from_email: string;
    subject: string;
    html: string;
    text: string;
    to: MessageRecipient[];
  }

  interface SendMessageParams {
    message: Message;
  }

  interface MessagesApi {
    send(params: SendMessageParams): Promise<any>;
  }

  interface MailchimpClient {
    messages: MessagesApi;
  }

  function Mailchimp(apiKey: string): MailchimpClient;

  export = Mailchimp;
}
