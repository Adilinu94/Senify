// Persistente Fluffy-Demo: nutzt die laufende `senify start`-Instanz (echte
// Postgres-Datenbank aus ~/.senify/config.json oder SENIFY_DATABASE_URL) und
// importiert die Projekt-/Seiten-XML nur beim ersten Lauf. Die Site- und
// Seiten-IDs bleiben über Neustarts erhalten.
//
// Aufruf:
//   start-senify.cmd        (einmalig bzw. nach einem Reboot)
//   pnpm demo:fluffy        (Site/Seite prüfen und ggf. importieren)
//   pnpm demo:fluffy --check
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { programTokenPath, readProgramToken } from "@senify/app";

type Site = { id: string; name: string; slug?: string };
type Page = { id: string; path: string };
type ImportAnswer = {
  job?: { status?: string };
  report?: { pageId?: string; counts?: unknown };
  error?: unknown;
};

const api = (process.env.SENIFY_API_URL ?? "http://127.0.0.1:4321").replace(/\/+$/, "");
const dashboard = (process.env.SENIFY_DASHBOARD_URL ?? "http://127.0.0.1:4322").replace(/\/+$/, "");
const siteName = process.env.SENIFY_DEMO_SITE ?? "Fluffy Rectangle";
const styleUrl = process.env.SENIFY_DEMO_STYLE_URL ?? "https://fluffy-rectangle-418998.framer.app/";
const tokenFile = process.env.SENIFY_PROGRAM_TOKEN_FILE ?? programTokenPath();
const projectFile = resolve(process.env.SENIFY_DEMO_PROJECT ?? ".scratch/fluffy-project-clean.xml");
const pageFile = resolve(process.env.SENIFY_DEMO_PAGE ?? ".scratch/fluffy-home-desktop.xml");
const checkOnly = process.argv.includes("--check");

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

const token = readProgramToken(tokenFile);
if (token === undefined) {
  fail(
    `Kein Programm-Token unter ${tokenFile}. Starte zuerst start-senify.cmd (persistente Postgres-Demo).`,
  );
}
if (!existsSync(projectFile) || !existsSync(pageFile)) {
  fail(
    `Demo-XML fehlt: ${projectFile} / ${pageFile}. Lege die Projekt- und Seiten-XML aus dem Unframer-MCP dort ab oder setze SENIFY_DEMO_PROJECT und SENIFY_DEMO_PAGE.`,
  );
}

const headers: Record<string, string> = {
  "Content-Type": "application/json",
  Authorization: `Bearer ${token.secret}`,
};

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${api}${path}`, {
      method,
      headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  } catch {
    fail(
      `Senify ist unter ${api} nicht erreichbar. Starte zuerst start-senify.cmd und prüfe die persistente Postgres-Datenbank.`,
    );
  }
  const text = await response.text();
  let data: unknown;
  try {
    data = text === "" ? undefined : JSON.parse(text);
  } catch {
    data = text;
  }
  if (!response.ok) {
    console.error(JSON.stringify(data, null, 2));
    fail(`API ${method} ${path} antwortete mit ${response.status}.`);
  }
  return data as T;
}

const sitesAnswer = await request<{ sites: Site[] }>("GET", "/api/sites");
if (checkOnly) {
  console.log(
    `Demo bereit: ${sitesAnswer.sites.length} Site(s), Token und Demo-XML vorhanden. API ${api}.`,
  );
  process.exit(0);
}

let site = sitesAnswer.sites.find((entry) => entry.name === siteName || entry.slug === "fluffy-rectangle");
if (site === undefined) {
  site = await request<Site>("POST", "/api/sites", { name: siteName });
  console.log(`Site angelegt: ${site.name} (${site.id})`);
} else {
  console.log(`Site gefunden: ${site.name} (${site.id})`);
}

const pagesAnswer = await request<{ pages: Page[] }>("GET", `/api/sites/${site.id}/pages`);
let page = pagesAnswer.pages.find((entry) => entry.path === "/");
if (page === undefined) {
  const importAnswer = await request<ImportAnswer>(
    "POST",
    `/api/sites/${site.id}/imports/framer`,
    {
      source: {
        project: {
          xml: readFileSync(projectFile, "utf8"),
          pageXml: readFileSync(pageFile, "utf8"),
          page: "/",
          usage: "private",
          styleUrl,
        },
      },
      pagePath: "/",
      mode: "fidelity",
      assets: "upload",
      fonts: "rewrite",
      write: true,
      createOnly: true,
      applyTheme: true,
      idempotencyKey: "demo-fluffy-home",
    },
  );
  const pageId = importAnswer.report?.pageId;
  if (pageId === undefined) {
    console.error(JSON.stringify(importAnswer, null, 2));
    fail("Der Import hat keine pageId geliefert.");
  }
  page = { id: pageId, path: "/" };
  console.log(`Seite importiert: ${page.id}`);
} else {
  console.log(`Seite gefunden: ${page.id}`);
}

console.log("");
console.log(`Demo-Site: ${site.name} (${site.id})`);
console.log(`Demo-Seite: ${page.id}`);
console.log(`Dashboard: ${dashboard}/#/projects/${site.id}/pages/${page.id}`);
