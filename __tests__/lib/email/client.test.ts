import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const state = vi.hoisted(() => ({
  env: {
    EMAIL_PROVIDER: undefined as string | undefined,
    MAILCHIMP_API_KEY: undefined as string | undefined,
    AWS_REGION: undefined as string | undefined,
    EMAIL_FROM: "noreply@openl.app",
  },
  isProduction: false,
  sesSend: vi.fn(),
  mailchimpSend: vi.fn(),
}));

vi.mock("@/lib/env", () => ({
  get env() {
    return state.env;
  },
  get isProduction() {
    return state.isProduction;
  },
}));

vi.mock("@aws-sdk/client-sesv2", () => {
  class SendEmailCommand {
    constructor(public input: unknown) {}
  }
  class SESv2Client {
    send = (command: InstanceType<typeof SendEmailCommand>) => state.sesSend(command.input);
  }
  return { SESv2Client, SendEmailCommand };
});

vi.mock("@mailchimp/mailchimp_transactional", () => ({
  default: () => ({ messages: { send: state.mailchimpSend } }),
}));

async function loadClient() {
  vi.resetModules();
  return import("@/lib/email/client");
}

beforeEach(() => {
  state.env = {
    EMAIL_PROVIDER: undefined,
    MAILCHIMP_API_KEY: undefined,
    AWS_REGION: undefined,
    EMAIL_FROM: "noreply@openl.app",
  };
  state.isProduction = false;
  state.sesSend.mockReset().mockResolvedValue({ MessageId: "id" });
  state.mailchimpSend.mockReset().mockResolvedValue([{ email: "a@b.c", status: "sent" }]);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("resolveEmailProvider", () => {
  it("uses an explicit EMAIL_PROVIDER over inference", async () => {
    state.env.EMAIL_PROVIDER = "ses";
    state.env.MAILCHIMP_API_KEY = "mc-key";
    const { resolveEmailProvider } = await loadClient();
    expect(resolveEmailProvider()).toBe("ses");
  });

  it("infers mailchimp from MAILCHIMP_API_KEY", async () => {
    state.env.MAILCHIMP_API_KEY = "mc-key";
    const { resolveEmailProvider } = await loadClient();
    expect(resolveEmailProvider()).toBe("mailchimp");
  });

  it("infers ses from AWS_REGION when no Mailchimp key is set", async () => {
    state.env.AWS_REGION = "us-east-1";
    const { resolveEmailProvider } = await loadClient();
    expect(resolveEmailProvider()).toBe("ses");
  });

  it("falls back to log when nothing is configured", async () => {
    const { resolveEmailProvider } = await loadClient();
    expect(resolveEmailProvider()).toBe("log");
  });
});

describe("sendEmail via SES", () => {
  beforeEach(() => {
    state.env.EMAIL_PROVIDER = "ses";
    state.env.AWS_REGION = "us-east-1";
  });

  it("sends one SES call per recipient so addresses are never shared", async () => {
    const { sendEmail } = await loadClient();
    await sendEmail({
      to: [{ email: "one@example.com" }, { email: "two@example.com", name: "Two" }],
      subject: "Hello",
      html: "<p>Hi</p>",
      text: "Hi",
    });

    expect(state.sesSend).toHaveBeenCalledTimes(2);
    const inputs = state.sesSend.mock.calls.map(([input]) => input);
    expect(inputs[0].Destination.ToAddresses).toEqual(["one@example.com"]);
    expect(inputs[1].Destination.ToAddresses).toEqual(['"Two" <two@example.com>']);
    inputs.forEach((input) => {
      expect(input.FromEmailAddress).toBe("noreply@openl.app");
      expect(input.Content.Simple.Subject.Data).toBe("Hello");
      expect(input.Content.Simple.Body.Html.Data).toBe("<p>Hi</p>");
      expect(input.Content.Simple.Body.Text.Data).toBe("Hi");
    });
  });

  it("omits the text body when not provided", async () => {
    const { sendEmail } = await loadClient();
    await sendEmail({ to: [{ email: "one@example.com" }], subject: "S", html: "<p>H</p>" });
    expect(state.sesSend.mock.calls[0][0].Content.Simple.Body.Text).toBeUndefined();
  });

  it("throws when any recipient send fails", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    state.sesSend
      .mockResolvedValueOnce({ MessageId: "ok" })
      .mockRejectedValueOnce(new Error("throttled"));
    const { sendEmail } = await loadClient();
    await expect(
      sendEmail({
        to: [{ email: "one@example.com" }, { email: "two@example.com" }],
        subject: "S",
        html: "<p>H</p>",
      })
    ).rejects.toThrow("SES failed to send to 1 of 2 recipient(s)");
    expect(consoleError).toHaveBeenCalled();
  });

  it("does nothing for an empty recipient list", async () => {
    const { sendEmail } = await loadClient();
    await sendEmail({ to: [], subject: "S", html: "<p>H</p>" });
    expect(state.sesSend).not.toHaveBeenCalled();
  });
});

describe("sendEmail via Mailchimp", () => {
  beforeEach(() => {
    state.env.EMAIL_PROVIDER = "mailchimp";
    state.env.MAILCHIMP_API_KEY = "mc-key";
  });

  it("translates the message to the Mailchimp shape", async () => {
    const { sendEmail } = await loadClient();
    await sendEmail({
      to: [{ email: "one@example.com" }, { email: "two@example.com", name: "Two" }],
      subject: "Hello",
      html: "<p>Hi</p>",
      text: "Hi",
    });

    expect(state.mailchimpSend).toHaveBeenCalledWith({
      message: {
        from_email: "noreply@openl.app",
        subject: "Hello",
        html: "<p>Hi</p>",
        text: "Hi",
        to: [
          { email: "one@example.com", type: "to" },
          { email: "two@example.com", name: "Two", type: "to" },
        ],
      },
    });
  });

  it("logs per-recipient rejections without throwing", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    state.mailchimpSend.mockResolvedValue([
      { email: "one@example.com", status: "sent" },
      { email: "two@example.com", status: "rejected", reject_reason: "hard-bounce" },
    ]);
    const { sendEmail } = await loadClient();
    await expect(
      sendEmail({
        to: [{ email: "one@example.com" }, { email: "two@example.com" }],
        subject: "S",
        html: "<p>H</p>",
      })
    ).resolves.toBeUndefined();
    expect(consoleError).toHaveBeenCalledWith(
      expect.stringContaining("two@example.com: rejected (hard-bounce)")
    );
  });

  it("throws a clear error when selected without an API key", async () => {
    state.env.MAILCHIMP_API_KEY = undefined;
    const { sendEmail } = await loadClient();
    await expect(
      sendEmail({ to: [{ email: "one@example.com" }], subject: "S", html: "<p>H</p>" })
    ).rejects.toThrow("MAILCHIMP_API_KEY is not set");
  });

  it("throws on a non-array (transport-failure) response instead of silently succeeding", async () => {
    // The Mailchimp client resolves an axios error object on transport failure
    // rather than rejecting; a non-array response must be treated as a failure.
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    state.mailchimpSend.mockResolvedValue({ isAxiosError: true, message: "bad key" });
    const { sendEmail } = await loadClient();
    await expect(
      sendEmail({ to: [{ email: "one@example.com" }], subject: "S", html: "<p>H</p>" })
    ).rejects.toThrow("Mailchimp transport failure");
    expect(consoleError).toHaveBeenCalled();
  });
});

describe("sendEmail via log provider", () => {
  it("logs instead of sending outside production", async () => {
    const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { sendEmail } = await loadClient();
    await sendEmail({ to: [{ email: "one@example.com" }], subject: "S", html: "<p>H</p>" });
    expect(consoleWarn).toHaveBeenCalledWith(expect.stringContaining("one@example.com"));
    expect(state.sesSend).not.toHaveBeenCalled();
    expect(state.mailchimpSend).not.toHaveBeenCalled();
  });

  it("throws loudly in production when no provider is configured", async () => {
    state.isProduction = true;
    const { sendEmail } = await loadClient();
    await expect(
      sendEmail({ to: [{ email: "one@example.com" }], subject: "S", html: "<p>H</p>" })
    ).rejects.toThrow("No email provider configured");
  });
});
