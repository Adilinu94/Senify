import { SenifyError } from "@senify/core";

// The public address of a site: the origin visitors open it under. Only the
// origin is kept (scheme, host, optional port) because canonical, sitemap and
// og:url append the page path themselves. Empty input clears the address.
export function normalizeSiteBaseUrl(raw: string): string | null {
  const text = raw.trim();
  if (text === "") return null;
  const candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `https://${text}`;
  const refuse = (reason: string): SenifyError =>
    new SenifyError("validation", `"${text}" is not a usable site address: ${reason}`, {
      field: "baseUrl",
      suggestion:
        "Give the address visitors open the site under, e.g. https://www.kunde.de (https, host and optional port, no path).",
    });
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    throw refuse("it is not a valid address");
  }
  if (url.protocol !== "https:") throw refuse("only https is allowed");
  if (url.username !== "" || url.password !== "") {
    throw refuse("it must not carry credentials");
  }
  if (url.pathname !== "/" || url.search !== "" || url.hash !== "") {
    throw refuse("it must be the origin only, without path, query or fragment");
  }
  if (!url.hostname.includes(".")) {
    throw refuse("the host needs a domain, e.g. kunde.de");
  }
  return url.origin;
}
