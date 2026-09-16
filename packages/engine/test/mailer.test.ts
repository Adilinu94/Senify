import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SmtpError, smtpMailSender, type SmtpConfig } from "@senify/engine";
import { bootEngine, type BootEnv } from "./helpers.ts";
import { startFakeSmtp } from "./smtp-test-server.ts";

// Self-signed fixture certificate for the TLS paths (valid for localhost and
// 127.0.0.1 until 2126); no real mail server is ever contacted.
const TLS_KEY = readFileSync(new URL("./fixtures/smtp/key.pem", import.meta.url), "utf8");
const TLS_CERT = readFileSync(new URL("./fixtures/smtp/cert.pem", import.meta.url), "utf8");

// Prüfstelle 1: the real SMTP client (`smtpMailSender`) against a local server
// that runs inside this test process. No MailSender is injected here, so the
// route `POST /api/settings/email/test` drives the actual dialog: greeting,
// EHLO, AUTH PLAIN/LOGIN, MAIL FROM, RCPT TO, DATA and QUIT. Nothing leaves
// the machine, no real mail is sent.

type TestMailResponse = {
  ok: boolean;
  to: string;
  reason?: string;
  message: string;
};

let env: BootEnv;

beforeAll(async () => {
  env = await bootEngine();
});

afterAll(async () => {
  await env.close();
});

async function saveEmail(input: {
  port: number;
  password: string;
}): Promise<void> {
  const saved = await env.api.request({
    method: "PUT",
    path: "/api/settings",
    body: {
      email: {
        host: "127.0.0.1",
        port: input.port,
        tls: "none",
        user: "mailer",
        password: input.password,
        from: "formular@kunde.de",
      },
    },
  });
  expect(saved.status).toBe(200);
}

async function sendTestMail(to = "ops@kunde.de"): Promise<TestMailResponse> {
  const response = await env.api.request<TestMailResponse>({
    method: "POST",
    path: "/api/settings/email/test",
    body: { to },
  });
  expect(response.status).toBe(200);
  return response.body;
}

// A port that was bound a moment ago and is free again: connecting to it fails
// immediately instead of waiting for the connect timeout.
async function closedPort(): Promise<number> {
  const server = await startFakeSmtp();
  const port = server.port;
  await server.close();
  return port;
}

describe("SMTP client against a local server", () => {
  it("runs greeting, EHLO, AUTH PLAIN, MAIL FROM, RCPT TO, DATA and QUIT", async () => {
    const server = await startFakeSmtp();
    await saveEmail({ port: server.port, password: "geheim-123" });

    const result = await sendTestMail();

    expect(result.ok).toBe(true);
    expect(result.to).toBe("ops@kunde.de");
    expect(server.replies[0]).toBe("220 fake.smtp.test ESMTP senify-test");
    expect(server.lines[0]?.startsWith("EHLO ")).toBe(true);

    const auth = server.lines.find((line) => line.startsWith("AUTH PLAIN "));
    expect(auth).toBeDefined();
    const token = auth?.slice("AUTH PLAIN ".length) ?? "";
    expect(Buffer.from(token, "base64").toString("utf8")).toBe(
      "\0mailer\0geheim-123",
    );
    expect(server.rejectedAuth).toBe(0);
    expect(server.lines).toContain("MAIL FROM:<formular@kunde.de>");
    expect(server.lines).toContain("RCPT TO:<ops@kunde.de>");
    expect(server.lines).toContain("DATA");
    expect(server.lines).toContain("QUIT");

    // The message the server received carries sender, recipient and payload.
    const [headers = "", body = ""] = server.message.split("\r\n\r\n");
    expect(headers).toContain("From: formular@kunde.de");
    expect(headers).toContain("To: ops@kunde.de");
    expect(headers).toContain("Subject: Senify Testmail");
    expect(headers).toContain("Content-Transfer-Encoding: base64");
    const decoded = Buffer.from(body.replace(/\s+/g, ""), "base64").toString(
      "utf8",
    );
    expect(decoded).toContain("Diese Testmail bestätigt die SMTP-Einstellungen.");
    expect(decoded).toContain("Absender: formular@kunde.de");

    await server.close();
  });

  it("walks AUTH LOGIN when the server only offers LOGIN", async () => {
    const server = await startFakeSmtp({ auth: ["LOGIN"] });
    await saveEmail({ port: server.port, password: "geheim-123" });

    const result = await sendTestMail("login@kunde.de");

    expect(result.ok).toBe(true);
    expect(server.lines).not.toContain("AUTH PLAIN ");
    const start = server.lines.indexOf("AUTH LOGIN");
    expect(start).toBeGreaterThan(-1);
    const [, user = "", password = ""] = server.lines.slice(start);
    expect(Buffer.from(user, "base64").toString("utf8")).toBe("mailer");
    expect(Buffer.from(password, "base64").toString("utf8")).toBe("geheim-123");
    expect(server.rejectedAuth).toBe(0);
    expect(server.lines).toContain("RCPT TO:<login@kunde.de>");
    expect(server.lines).toContain("QUIT");

    await server.close();
  });

  it("reports wrong credentials as reason auth and stops the dialog there", async () => {
    const server = await startFakeSmtp();
    await saveEmail({ port: server.port, password: "falsch" });

    const result = await sendTestMail();

    expect(result.ok).toBe(false);
    expect(result.reason).toBe("auth");
    expect(result.message).toContain("Authentifizierung fehlgeschlagen");
    expect(server.rejectedAuth).toBe(1);
    expect(server.lines.some((line) => line.startsWith("MAIL FROM"))).toBe(false);
    expect(server.lines).not.toContain("DATA");

    await server.close();
  });

  it("reports an unreachable port as reason connection", async () => {
    const port = await closedPort();
    await saveEmail({ port, password: "geheim-123" });

    const result = await sendTestMail();

    expect(result.ok).toBe(false);
    expect(result.reason).toBe("connection");
    expect(result.message).toContain("Verbindung fehlgeschlagen");
  });

  it("aborts cleanly when the server closes mid-dialog", async () => {
    for (const closeAfter of ["greeting", "ehlo", "data"] as const) {
      const server = await startFakeSmtp({ closeAfter });
      await saveEmail({ port: server.port, password: "geheim-123" });

      const started = Date.now();
      const result = await sendTestMail();
      const elapsed = Date.now() - started;

      expect(result.ok, closeAfter).toBe(false);
      expect(result.reason, closeAfter).toBe("connection");
      // The closed socket ends the dialog; the client does not sit out its
      // connect timeout.
      expect(elapsed, closeAfter).toBeLessThan(5_000);

      await server.close();
    }
  }, 20_000);
});

// The TLS paths run the real client against a real TLS socket with the test
// fixture certificate; `ca` is the client's trust anchor, so the test never
// weakens certificate validation.
describe("TLS paths of the SMTP client", () => {
  function config(input: { port: number; tls: "starttls" | "tls"; ca?: string }): SmtpConfig {
    return {
      host: "127.0.0.1",
      port: input.port,
      tls: input.tls,
      user: "mailer",
      password: "geheim-123",
      from: "formular@kunde.de",
      ...(input.ca === undefined ? {} : { ca: input.ca }),
    };
  }

  async function send(configInput: SmtpConfig): Promise<unknown> {
    try {
      await smtpMailSender(configInput, {
        recipient: "ops@kunde.de",
        subject: "Senify Testmail",
        body: "TLS-Pfad",
      });
      return null;
    } catch (error) {
      return error;
    }
  }

  it("upgrades via STARTTLS and finishes the dialog on the encrypted socket", async () => {
    const server = await startFakeSmtp({
      starttls: { key: TLS_KEY, cert: TLS_CERT },
    });

    const failure = await send(config({ port: server.port, tls: "starttls", ca: TLS_CERT }));

    expect(failure).toBeNull();
    expect(server.tlsUpgrades).toBe(1);
    // STARTTLS arrived in a continuation line of the EHLO answer; the client
    // only offers the upgrade when it reads the whole multi-line reply.
    expect(server.replies).toContain("250-STARTTLS");
    // Everything after the upgrade ran over TLS: the second EHLO, AUTH, the
    // envelope and the message.
    const after = server.lines.slice(server.starttlsAt);
    expect(after.filter((line) => line.startsWith("EHLO "))).toHaveLength(1);
    expect(after.some((line) => line.startsWith("AUTH PLAIN "))).toBe(true);
    expect(after).toContain("MAIL FROM:<formular@kunde.de>");
    expect(after).toContain("RCPT TO:<ops@kunde.de>");
    expect(after).toContain("DATA");
    expect(server.rejectedAuth).toBe(0);
    const [, body = ""] = server.message.split("\r\n\r\n");
    expect(Buffer.from(body.replace(/\s+/g, ""), "base64").toString("utf8")).toContain(
      "TLS-Pfad",
    );

    await server.close();
  });

  it("rejects a certificate that is not trusted (no CA configured)", async () => {
    const server = await startFakeSmtp({
      starttls: { key: TLS_KEY, cert: TLS_CERT },
    });

    const failure = await send(config({ port: server.port, tls: "starttls" }));

    expect(failure).toBeInstanceOf(SmtpError);
    expect((failure as SmtpError).reason).toBe("tls");
    expect(server.lines.some((line) => line.startsWith("AUTH"))).toBe(false);

    await server.close();
  });

  it("connects with implicit TLS (port-465 style) when its CA is configured", async () => {
    const server = await startFakeSmtp({
      implicitTls: { key: TLS_KEY, cert: TLS_CERT },
    });

    const failure = await send(config({ port: server.port, tls: "tls", ca: TLS_CERT }));

    expect(failure).toBeNull();
    expect(server.lines.some((line) => line.startsWith("AUTH PLAIN "))).toBe(true);
    expect(server.lines).toContain("DATA");

    await server.close();
  });

  it("reports a server without STARTTLS as reason tls and sends no STARTTLS", async () => {
    const server = await startFakeSmtp();

    const failure = await send(config({ port: server.port, tls: "starttls", ca: TLS_CERT }));

    expect(failure).toBeInstanceOf(SmtpError);
    expect((failure as SmtpError).reason).toBe("tls");
    expect((failure as SmtpError).message).toContain("STARTTLS");
    // The client refuses before sending the command.
    expect(server.lines).not.toContain("STARTTLS");

    await server.close();
  });
});
