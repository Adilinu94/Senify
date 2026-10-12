import { lookup } from "node:dns/promises";
import { request as httpRequest, type IncomingMessage } from "node:http";
import { request as httpsRequest } from "node:https";
import { isIP, type LookupFunction, type Server } from "node:net";
import { pipeline, Readable, Transform } from "node:stream";
import { createBrotliDecompress, createGunzip, createInflate } from "node:zlib";
import { SenifyError } from "./errors.ts";

// Outgoing requests to an address that a site, a reference or an agent supplied
// go to the public internet only. Otherwise a page on the open web can point
// the server at `http://127.0.0.1:<port>/…` (the dashboard proxy attaches the
// operator token to a request without an Origin) or at a cloud metadata
// endpoint, and the answer ends up in an imported page.
//
// Node-only: this module is a separate subpath (`@senify/core/net`) so the
// browser bundle, which imports the package root, never pulls it in.
//
// `SENIFY_ALLOW_PRIVATE_URLS=1` in the process environment is the operator's
// switch for importing from a local server. It lifts the address check, not
// the scheme check.

const MAX_REDIRECTS = 5;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const NULL_BODY_STATUSES = new Set([204, 205, 304]);

const refusal = (message: string): SenifyError =>
  new SenifyError("validation", message, {
    field: "url",
    suggestion:
      "Nur öffentliche http(s)-Adressen sind erlaubt. Für eine lokale Quelle startet der Betreiber das Programm mit SENIFY_ALLOW_PRIVATE_URLS=1.",
  });

/* ----------------------------------------------------------------- addresses */

function isPublicIpv4(address: string): boolean {
  const [a = 0, b = 0, c = 0] = address.split(".").map(Number);
  if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
  if (a === 100 && b >= 64 && b <= 127) return false; // shared address space
  if (a === 169 && b === 254) return false; // link-local, cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 168) return false;
  if (a === 192 && b === 0 && (c === 0 || c === 2)) return false;
  if (a === 192 && b === 88 && c === 99) return false;
  if (a === 198 && (b === 18 || b === 19)) return false; // benchmarking
  if (a === 198 && b === 51 && c === 100) return false;
  if (a === 203 && b === 0 && c === 113) return false;
  return true;
}

function ipv6Groups(address: string): number[] | undefined {
  let text = address.split("%", 1)[0] ?? "";
  const tail = /(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(text);
  if (tail !== null) {
    const [, a = "0", b = "0", c = "0", d = "0"] = tail;
    text = `${text.slice(0, tail.index)}${((+a << 8) | +b).toString(16)}:${((+c << 8) | +d).toString(16)}`;
  }
  const halves = text.split("::");
  if (halves.length > 2) return undefined;
  const head = halves[0] === "" ? [] : (halves[0] ?? "").split(":");
  const rest = halves[1] === undefined || halves[1] === "" ? [] : (halves[1] ?? "").split(":");
  const fill = 8 - head.length - rest.length;
  if (halves.length === 1 ? fill !== 0 : fill < 0) return undefined;
  const groups = [...head, ...Array<string>(halves.length === 2 ? fill : 0).fill("0"), ...rest].map(
    (group) => parseInt(group, 16),
  );
  return groups.length === 8 && groups.every((group) => Number.isInteger(group))
    ? groups
    : undefined;
}

function isPublicIpv6(address: string): boolean {
  const groups = ipv6Groups(address);
  if (groups === undefined) return false;
  const [g0 = 0, g1 = 0, g2 = 0, g3 = 0, g4 = 0, g5 = 0, g6 = 0, g7 = 0] = groups;
  const dotted = (high: number, low: number): string =>
    `${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`;
  // The address is only as public as the IPv4 it wraps.
  if (groups.slice(0, 5).every((group) => group === 0) && g5 === 0xffff) {
    return isPublicIpv4(dotted(g6, g7)); // ::ffff:a.b.c.d
  }
  if (g0 === 0x64 && g1 === 0xff9b && g2 === 0 && g3 === 0 && g4 === 0 && g5 === 0) {
    return isPublicIpv4(dotted(g6, g7)); // NAT64
  }
  if (groups.slice(0, 6).every((group) => group === 0)) {
    return isPublicIpv4(dotted(g6, g7)); // ::, ::1 and the deprecated ::a.b.c.d
  }
  if (g0 === 0x2002) return isPublicIpv4(dotted(g1, g2)); // 6to4
  if (g0 === 0x2001 && g1 === 0) return false; // Teredo hides an IPv4
  if ((g0 & 0xfe00) === 0xfc00) return false; // unique local
  if ((g0 & 0xffc0) === 0xfe80) return false; // link-local
  if ((g0 & 0xffc0) === 0xfec0) return false; // site-local, deprecated
  if ((g0 & 0xff00) === 0xff00) return false; // multicast
  if (g0 === 0x2001 && g1 === 0x0db8) return false; // documentation
  if (g0 === 0x0100 && g1 === 0 && g2 === 0 && g3 === 0) return false; // discard
  return true;
}

export function isPublicAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return isPublicIpv4(address);
  return family === 6 ? isPublicIpv6(address) : false;
}

/* ------------------------------------------------------------------- targets */

type Pin = { address: string; family: number };

async function publicTarget(raw: string): Promise<{ url: URL; pin?: Pin }> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw refusal(`"${raw}" is not a valid URL`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw refusal(`Unsupported URL scheme "${url.protocol}"`);
  }
  if (url.username !== "" || url.password !== "") {
    throw refusal("URLs with credentials are not accepted");
  }
  if (process.env.SENIFY_ALLOW_PRIVATE_URLS === "1") return { url };

  const host = url.hostname.startsWith("[") ? url.hostname.slice(1, -1) : url.hostname;
  let addresses: string[];
  if (isIP(host) !== 0) {
    addresses = [host];
  } else {
    try {
      addresses = (await lookup(host, { all: true, verbatim: true })).map((entry) => entry.address);
    } catch {
      throw refusal(`Host "${host}" could not be resolved`);
    }
  }
  const first = addresses[0];
  if (first === undefined || !addresses.every(isPublicAddress)) {
    throw refusal(`"${host}" is not a public address`);
  }
  // The connection goes to the address that was just checked, so a second DNS
  // answer (rebinding) cannot lead it somewhere else.
  return { url, pin: { address: first, family: isIP(first) } };
}

export async function assertPublicHttpUrl(raw: string): Promise<URL> {
  return (await publicTarget(raw)).url;
}

/* --------------------------------------------------------------------- fetch */

function get(
  url: URL,
  pin: Pin | undefined,
  signal: AbortSignal | undefined,
  headers: Record<string, string> | undefined,
): Promise<IncomingMessage> {
  const send = url.protocol === "https:" ? httpsRequest : httpRequest;
  const pinned: LookupFunction | undefined =
    pin === undefined
      ? undefined
      : (_host, options, callback) => {
          if (options.all === true) callback(null, [{ address: pin.address, family: pin.family }]);
          else callback(null, pin.address, pin.family);
        };
  return new Promise((resolve, reject) => {
    const request = send(
      url,
      {
        method: "GET",
        headers: {
          "user-agent": "node",
          accept: "*/*",
          ...headers,
          "accept-encoding": "gzip, deflate, br",
        },
        ...(pinned === undefined ? {} : { lookup: pinned }),
        ...(signal === undefined ? {} : { signal }),
      },
      resolve,
    );
    request.on("error", reject);
    request.end();
  });
}

function toResponse(incoming: IncomingMessage, maxBytes: number | undefined): Response {
  const status = incoming.statusCode ?? 502;
  const headers = new Headers();
  for (const [name, value] of Object.entries(incoming.headers)) {
    if (Array.isArray(value)) for (const item of value) headers.append(name, item);
    else if (value !== undefined) headers.set(name, value);
  }
  if (NULL_BODY_STATUSES.has(status)) {
    incoming.resume();
    return new Response(null, { status, headers });
  }
  const tooLarge = (): SenifyError =>
    new SenifyError("validation", `Response is larger than ${maxBytes ?? 0} bytes`, {
      field: "url",
      suggestion: "Die Quelle liefert eine unerwartet große Datei.",
    });
  if (maxBytes !== undefined && Number(headers.get("content-length")) > maxBytes) {
    incoming.destroy();
    throw tooLarge();
  }
  const encoding = (headers.get("content-encoding") ?? "").toLowerCase();
  const decoder =
    encoding === "gzip" || encoding === "x-gzip"
      ? createGunzip()
      : encoding === "deflate"
        ? createInflate()
        : encoding === "br"
          ? createBrotliDecompress()
          : undefined;
  let seen = 0;
  const limit =
    maxBytes === undefined
      ? undefined
      : new Transform({
          transform(chunk: Buffer, _encoding, done) {
            seen += chunk.length;
            if (seen > maxBytes) done(tooLarge());
            else done(null, chunk);
          },
        });
  // The body is measured after decoding, so a small compressed bomb counts too.
  const stages = [incoming, ...(decoder === undefined ? [] : [decoder]), ...(limit === undefined ? [] : [limit])];
  const body = stages.length === 1 ? incoming : (pipeline(stages, () => undefined) as unknown as Readable);
  if (decoder !== undefined) headers.delete("content-encoding");
  headers.delete("content-length");
  return new Response(Readable.toWeb(body) as ReadableStream<Uint8Array>, { status, headers });
}

export type FetchPublicOptions = {
  signal?: AbortSignal;
  // Upper bound of the (decoded) body; a larger one fails instead of filling memory.
  maxBytes?: number;
  // Request headers (e.g. a user agent). Content coding stays under this module's control.
  headers?: Record<string, string>;
};

// GET with the address check on every hop: a redirect to a private target is
// refused like a direct request to it.
export async function fetchPublic(
  raw: string,
  options: FetchPublicOptions = {},
): Promise<Response> {
  let current = raw;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const { url, pin } = await publicTarget(current);
    const incoming = await get(url, pin, options.signal, options.headers);
    const location = incoming.headers.location;
    if (location !== undefined && REDIRECT_STATUSES.has(incoming.statusCode ?? 0)) {
      incoming.resume();
      try {
        current = new URL(location, url).toString();
      } catch {
        throw refusal(`Redirect target "${location}" is not a valid URL`);
      }
      continue;
    }
    return toResponse(incoming, options.maxBytes);
  }
  throw refusal(`Too many redirects (more than ${MAX_REDIRECTS})`);
}

// Ports that fetch and Chromium refuse to connect to (WHATWG Fetch "bad port").
// Windows hands out ephemeral ports from 1024 when the dynamic range is widened,
// so `listen(0)` can land on one and the server is unreachable for its own clients.
const FETCH_BLOCKED_PORTS = new Set([
  1, 7, 9, 11, 13, 15, 17, 19, 20, 21, 22, 23, 25, 37, 42, 43, 53, 69, 77, 79, 87, 95,
  101, 102, 103, 104, 109, 110, 111, 113, 115, 117, 119, 123, 135, 137, 139, 143, 161,
  179, 389, 427, 465, 512, 513, 514, 515, 526, 530, 531, 532, 540, 548, 554, 556, 563,
  587, 601, 636, 989, 990, 993, 995, 1719, 1720, 1723, 2049, 3659, 4045, 4190, 5060,
  5061, 6000, 6566, 6665, 6666, 6667, 6668, 6669, 6679, 6697, 10080,
]);

export function isFetchBlockedPort(port: number): boolean {
  return FETCH_BLOCKED_PORTS.has(port);
}

// Bind `server`; for port 0 re-bind until the OS picks a port fetch can reach.
export async function listenReachable(
  server: Server,
  port: number,
  host: string,
): Promise<number> {
  for (;;) {
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(port, host, () => {
        server.removeListener("error", reject);
        resolve();
      });
    });
    const address = server.address();
    const bound = typeof address === "object" && address !== null ? address.port : port;
    if (port !== 0 || !isFetchBlockedPort(bound)) return bound;
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}
