import { createConnection, type Socket } from "node:net";
import { connect as connectTls } from "node:tls";
import { hostname } from "node:os";
import { SenifyError } from "@senify/core";
import type { SmtpTlsMode } from "./types.ts";

// Minimal SMTP client (artifacts/27 §5): send a single plain-text message over
// a fresh connection. Kept dependency-free and injectable: most suites pass
// their own MailSender, `mailer.test.ts` runs this client against a local SMTP
// server inside the test process (never a real one).

export type SmtpConfig = {
  host: string;
  port: number;
  tls: SmtpTlsMode;
  user: string;
  password: string;
  from: string;
};

// The subset of an outbox message the transport needs.
export type MailMessage = {
  recipient: string;
  subject: string;
  body: string;
};

export type MailSender = (
  config: SmtpConfig,
  message: MailMessage,
) => Promise<void>;

export type SmtpFailureReason =
  | "connection"
  | "tls"
  | "auth"
  | "recipient"
  | "protocol"
  | "unknown";

export class SmtpError extends SenifyError {
  readonly reason: SmtpFailureReason;

  constructor(
    reason: SmtpFailureReason,
    message: string,
    options: { suggestion?: string } = {},
  ) {
    super("validation", message, {
      field: "smtp",
      ...(options.suggestion === undefined ? {} : { suggestion: options.suggestion }),
    });
    this.name = "SmtpError";
    this.reason = reason;
  }
}

const CONNECT_TIMEOUT_MS = 15_000;
const CLIENT_NAME = hostname() || "senify.local";

function networkError(error: unknown, tls: boolean): SmtpError {
  const code =
    error && typeof error === "object" && "code" in error
      ? String((error as { code?: unknown }).code)
      : "";
  const message = error instanceof Error ? error.message : "Unbekannter Netzwerkfehler";
  if (tls && /CERT|TLS|SSL|HANDSHAKE/i.test(`${code} ${message}`)) {
    return new SmtpError("tls", `TLS-Verbindung fehlgeschlagen: ${message}`, {
      suggestion: "Zertifikat und Port prüfen (Port 465 für implizites TLS, 587 für STARTTLS).",
    });
  }
  return new SmtpError("connection", `Verbindung fehlgeschlagen: ${message}`, {
    suggestion: "Host, Port und Firewall prüfen.",
  });
}

// Per-socket leftover of a half-read reply; commands run strictly in sequence.
const replyBuffers = new WeakMap<Socket, string>();

function readReply(socket: Socket, timeoutMs = CONNECT_TIMEOUT_MS): Promise<string> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new SmtpError("connection", "SMTP-Server antwortet nicht"));
    }, timeoutMs);
    const cleanup = (): void => {
      clearTimeout(timer);
      socket.off("data", onData);
      socket.off("error", onError);
      socket.off("close", onClose);
    };
    const onError = (error: Error): void => {
      cleanup();
      reject(networkError(error, false));
    };
    // A server that hangs up mid-dialog (no error, just a closed connection)
    // must end the dialog right away instead of waiting for the timeout.
    const onClose = (): void => {
      cleanup();
      reject(
        new SmtpError("connection", "SMTP-Server hat die Verbindung geschlossen", {
          suggestion: "Serverprotokoll prüfen; Host, Port und TLS-Einstellung kontrollieren.",
        }),
      );
    };
    const onData = (chunk: Buffer): void => {
      const previous = replyBuffers.get(socket) ?? "";
      const combined = previous + chunk.toString("utf8");
      const lines = combined.split(/\r?\n/);
      const rest = lines.pop() ?? "";
      for (const line of lines) {
        const match = /^(\d{3}) (.*)$/.exec(line);
        if (match) {
          cleanup();
          replyBuffers.set(socket, rest);
          resolve(`${match[1]} ${match[2] ?? ""}`);
          return;
        }
      }
      replyBuffers.set(socket, combined);
    };
    socket.on("data", onData);
    socket.on("error", onError);
    socket.on("close", onClose);
  });
}

function statusOf(reply: string): number {
  return Number.parseInt(reply.slice(0, 3), 10);
}

function replyError(command: string, reply: string): SmtpError {
  const status = statusOf(reply);
  const detail = `${status} ${reply.slice(4)}`;
  if (status === 535 || status === 534 || status === 530) {
    return new SmtpError("auth", `Authentifizierung fehlgeschlagen: ${detail}`, {
      suggestion: "Benutzer und Passwort prüfen.",
    });
  }
  if (command.startsWith("RCPT")) {
    return new SmtpError("recipient", `Empfänger abgelehnt: ${detail}`, {
      suggestion: "Adresse prüfen; manche Server verlangen einen verbundenen Absender.",
    });
  }
  return new SmtpError("protocol", `SMTP-Ablauf gestört (${command}): ${detail}`);
}

async function expectAccept(
  socket: Socket,
  command: string,
  accepted: readonly number[],
  timeoutMs: number,
): Promise<string> {
  const reply = await readReply(socket, timeoutMs);
  if (!accepted.includes(statusOf(reply))) throw replyError(command, reply);
  return reply;
}

async function command(
  socket: Socket,
  line: string,
  accepted: readonly number[],
  timeoutMs: number,
): Promise<string> {
  socket.write(`${line}\r\n`);
  return expectAccept(socket, line.split(" ")[0] ?? line, accepted, timeoutMs);
}

function openSocket(
  config: SmtpConfig,
  timeoutMs: number,
): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      clearTimeout(timer);
      socket.destroy();
      reject(
        new SmtpError(
          "connection",
          `Keine Verbindung zu ${config.host}:${config.port}`,
          { suggestion: "Host und Port prüfen." },
        ),
      );
    }, timeoutMs);
    const onReady = (): void => {
      clearTimeout(timer);
      // The connect failure handler is done once the socket is up; later
      // errors belong to the read/write step that is running then.
      socket.off("error", onError);
      resolve(socket);
    };
    const onError = (error: Error): void => {
      clearTimeout(timer);
      socket.destroy();
      reject(networkError(error, config.tls !== "none"));
    };
    const socket: Socket =
      config.tls === "tls"
        ? connectTls(
            { host: config.host, port: config.port, servername: config.host },
            onReady,
          )
        : createConnection({ host: config.host, port: config.port }, onReady);
    socket.once("error", onError);
  });
}

function upgradeToTls(
  socket: Socket,
  host: string,
  timeoutMs: number,
): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      clearTimeout(timer);
      reject(new SmtpError("tls", "TLS-Handshake nach STARTTLS fehlgeschlagen"));
    }, timeoutMs);
    const upgraded = connectTls({ socket, servername: host }, () => {
      clearTimeout(timer);
      resolve(upgraded);
    });
    upgraded.once("error", (error: Error) => {
      clearTimeout(timer);
      reject(networkError(error, true));
    });
  });
}

function encodeSubject(subject: string): string {
  return /^[\x20-\x7e]*$/.test(subject)
    ? subject
    : `=?UTF-8?B?${Buffer.from(subject, "utf8").toString("base64")}?=`;
}

function buildMessage(config: SmtpConfig, message: MailMessage): string {
  const body = Buffer.from(message.body, "utf8")
    .toString("base64")
    .replace(/(.{76})/g, "$1\r\n");
  const headers = [
    `From: ${config.from}`,
    `To: ${message.recipient}`,
    `Subject: ${encodeSubject(message.subject)}`,
    `Date: ${new Date().toUTCString()}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=utf-8",
    "Content-Transfer-Encoding: base64",
  ];
  return `${headers.join("\r\n")}\r\n\r\n${body}\r\n`;
}

async function authenticate(
  socket: Socket,
  config: SmtpConfig,
  ehlo: string,
  timeoutMs: number,
): Promise<void> {
  const mechanisms = ehlo.toUpperCase();
  if (mechanisms.includes("PLAIN")) {
    const token = Buffer.from(`\0${config.user}\0${config.password}`, "utf8").toString(
      "base64",
    );
    await command(socket, `AUTH PLAIN ${token}`, [235], timeoutMs);
    return;
  }
  if (mechanisms.includes("LOGIN")) {
    await command(socket, "AUTH LOGIN", [334], timeoutMs);
    socket.write(`${Buffer.from(config.user, "utf8").toString("base64")}\r\n`);
    await expectAccept(socket, "AUTH LOGIN", [334], timeoutMs);
    socket.write(`${Buffer.from(config.password, "utf8").toString("base64")}\r\n`);
    await expectAccept(socket, "AUTH LOGIN", [235], timeoutMs);
    return;
  }
  throw new SmtpError(
    "auth",
    "SMTP-Server bietet kein unterstütztes Auth-Verfahren (PLAIN/LOGIN)",
    { suggestion: "Verschlüsselte Verbindung mit Benutzer/Passwort prüfen." },
  );
}

async function smtpSend(config: SmtpConfig, message: MailMessage): Promise<void> {
  let socket = await openSocket(config, CONNECT_TIMEOUT_MS);
  try {
    await expectAccept(socket, "greeting", [220], CONNECT_TIMEOUT_MS);
    let ehlo = await command(socket, `EHLO ${CLIENT_NAME}`, [250], CONNECT_TIMEOUT_MS);
    if (config.tls === "starttls") {
      if (!/STARTTLS/i.test(ehlo)) {
        throw new SmtpError("tls", "SMTP-Server unterstützt kein STARTTLS", {
          suggestion: "Verschlüsselung auf none stellen oder implizites TLS (Port 465) wählen.",
        });
      }
      await command(socket, "STARTTLS", [220], CONNECT_TIMEOUT_MS);
      socket = await upgradeToTls(socket, config.host, CONNECT_TIMEOUT_MS);
      ehlo = await command(socket, `EHLO ${CLIENT_NAME}`, [250], CONNECT_TIMEOUT_MS);
    }
    if (config.user !== "") {
      await authenticate(socket, config, ehlo, CONNECT_TIMEOUT_MS);
    }
    await command(socket, `MAIL FROM:<${config.from}>`, [250], CONNECT_TIMEOUT_MS);
    await command(socket, `RCPT TO:<${message.recipient}>`, [250, 251], CONNECT_TIMEOUT_MS);
    await command(socket, "DATA", [354], CONNECT_TIMEOUT_MS);
    socket.write(`${buildMessage(config, message)}\r\n.\r\n`);
    await expectAccept(socket, "DATA", [250], CONNECT_TIMEOUT_MS);
    await command(socket, "QUIT", [221], CONNECT_TIMEOUT_MS).catch(() => undefined);
  } finally {
    socket.end();
    socket.destroy();
  }
}

// The default sender is the real SMTP client; the engine injects another one
// in most tests, so no run ever mails a real server (mailer.test.ts points the
// client at a local server in the test process).
export const smtpMailSender: MailSender = (config, message) =>
  smtpSend(config, message);

export type TestMailFailureReason = SmtpFailureReason | "unconfigured";

export type TestMailResult =
  | { ok: true; to: string; message: string }
  | { ok: false; to: string; reason: TestMailFailureReason; message: string };

export async function sendTestMail(input: {
  config: SmtpConfig;
  to: string;
  send?: MailSender;
  now?: number;
}): Promise<TestMailResult> {
  const send = input.send ?? smtpMailSender;
  try {
    await send(input.config, {
      recipient: input.to,
      subject: "Senify Testmail",
      body: [
        "Diese Testmail bestätigt die SMTP-Einstellungen.",
        "",
        `Zeitpunkt: ${new Date(input.now ?? Date.now()).toISOString()}`,
        `Absender: ${input.config.from}`,
      ].join("\n"),
    });
    return {
      ok: true,
      to: input.to,
      message: "Testmail wurde an den SMTP-Server übergeben.",
    };
  } catch (error) {
    const reason = error instanceof SmtpError ? error.reason : "unknown";
    const message = error instanceof Error ? error.message : "Unbekannter Fehler";
    return { ok: false, to: input.to, reason, message };
  }
}
