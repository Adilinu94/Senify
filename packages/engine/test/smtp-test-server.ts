import { createServer, type Socket } from "node:net";

// A throwaway SMTP server for `mailer.test.ts`: it speaks just enough of the
// dialog (greeting, EHLO, AUTH PLAIN/LOGIN, MAIL, RCPT, DATA, QUIT) to drive
// the real client, records every line and answer and listens on localhost only,
// so no test ever reaches a real mail server.

export type FakeSmtpAuth = "PLAIN" | "LOGIN";

export type FakeSmtpOptions = {
  // Credentials the server accepts; anything else is answered with 535.
  user?: string;
  password?: string;
  // Mechanisms announced in the EHLO answer (default: both).
  auth?: FakeSmtpAuth[];
  // Point of the dialog at which the server hangs up, to test the abort paths.
  closeAfter?: "greeting" | "ehlo" | "data";
};

export type FakeSmtpServer = {
  host: string;
  port: number;
  // Lines the client sent, in order.
  lines: string[];
  // Lines the server answered with, in order.
  replies: string[];
  // Data of the message body (headers and payload, CRLF as sent).
  readonly message: string;
  // Number of refused AUTH attempts.
  readonly rejectedAuth: number;
  close(): Promise<void>;
};

const DEFAULT_USER = "mailer";
const DEFAULT_PASSWORD = "geheim-123";

export async function startFakeSmtp(
  options: FakeSmtpOptions = {},
): Promise<FakeSmtpServer> {
  const lines: string[] = [];
  const replies: string[] = [];
  const dataLines: string[] = [];
  const sockets = new Set<Socket>();
  const expectedUser = options.user ?? DEFAULT_USER;
  const expectedPassword = options.password ?? DEFAULT_PASSWORD;
  let rejectedAuth = 0;

  const server = createServer((socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
    socket.on("error", () => undefined);
    let buffer = "";
    let inData = false;
    let authStep: "none" | "user" | "password" = "none";
    let authUser = "";
    const answer = (line: string): void => {
      replies.push(line);
      socket.write(`${line}\r\n`);
    };
    const verdict = (user: string, password: string): void => {
      if (user === expectedUser && password === expectedPassword) {
        answer("235 2.7.0 Authentication successful");
        return;
      }
      rejectedAuth += 1;
      answer("535 5.7.8 Authentication credentials invalid");
    };

    if (options.closeAfter === "greeting") {
      socket.destroy();
      return;
    }
    answer("220 fake.smtp.test ESMTP senify-test");

    socket.on("data", (chunk) => {
      buffer += chunk.toString("utf8");
      for (;;) {
        const end = buffer.indexOf("\r\n");
        if (end < 0) break;
        const line = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        lines.push(line);

        if (inData) {
          if (line === ".") {
            inData = false;
            answer("250 2.0.0 Ok: queued as 1");
          } else {
            dataLines.push(line);
          }
          continue;
        }
        // The credentials of AUTH LOGIN arrive as two bare base64 lines.
        if (authStep === "user") {
          authStep = "password";
          authUser = Buffer.from(line, "base64").toString("utf8");
          answer("334 UGFzc3dvcmQ6");
          continue;
        }
        if (authStep === "password") {
          authStep = "none";
          verdict(authUser, Buffer.from(line, "base64").toString("utf8"));
          continue;
        }

        const [verb = "", argument = "", token = ""] = line.split(" ");
        const command = verb.toUpperCase();
        if (command === "EHLO" || command === "HELO") {
          if (options.closeAfter === "ehlo") {
            socket.destroy();
            return;
          }
          answer("250-fake.smtp.test greets you");
          answer(`250 AUTH ${(options.auth ?? ["PLAIN", "LOGIN"]).join(" ")}`);
          continue;
        }
        if (command === "AUTH") {
          if (argument.toUpperCase() === "LOGIN") {
            authStep = "user";
            answer("334 VXNlcm5hbWU6");
            continue;
          }
          // AUTH PLAIN carries both parts base64-encoded in the same line.
          const [, user = "", password = ""] = Buffer.from(token, "base64")
            .toString("utf8")
            .split("\0");
          verdict(user, password);
          continue;
        }
        if (command === "MAIL") {
          answer("250 2.1.0 Ok");
          continue;
        }
        if (command === "RCPT") {
          answer("250 2.1.5 Ok");
          continue;
        }
        if (command === "DATA") {
          if (options.closeAfter === "data") {
            socket.destroy();
            return;
          }
          inData = true;
          answer("354 End data with <CR><LF>.<CR><LF>");
          continue;
        }
        if (command === "RSET") {
          answer("250 2.0.0 Ok");
          continue;
        }
        if (command === "QUIT") {
          answer("221 2.0.0 Bye");
          socket.end();
          continue;
        }
        answer("502 5.5.2 Command not implemented");
      }
    });
  });

  await new Promise<void>((resolve, reject) => {
    const onError = (error: unknown): void => reject(error);
    server.once("error", onError);
    server.listen(0, "127.0.0.1", () => {
      server.removeListener("error", onError);
      resolve();
    });
  });
  const address = server.address();
  const port =
    typeof address === "object" && address !== null ? address.port : 0;

  return {
    host: "127.0.0.1",
    port,
    lines,
    replies,
    get message(): string {
      return dataLines.join("\r\n");
    },
    get rejectedAuth(): number {
      return rejectedAuth;
    },
    async close(): Promise<void> {
      for (const socket of sockets) socket.destroy();
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
      });
    },
  };
}
