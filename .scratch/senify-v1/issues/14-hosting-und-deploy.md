# Hosting & Deploy der Sites

Type: grilling
Status: resolved
Blocked by: 02

Input: research/20-referenzprojekte.md
Input: artifacts/02-renderer.md
Input: artifacts/05-lifecycle.md
Input: artifacts/06-approval.md
Input: artifacts/12-portal.md
Input: artifacts/13-aeo-quality.md

## Question

Wo laufen die generierten Kunden-Sites: Static-Export auf bestehendes Hosting, eigene Deploy-Pipeline oder Plattform-Hosting? Wie entstehen Preview-URLs, wie Custom-Domains, wie wird Version ↔ Deployment verknüpft (Rollback = Re-Deploy)?

Ergebnis: Deploy-Architektur für v1.

## Answer

Hosting entschieden (6/6 Wizard). Artefakt: [artifacts/14-hosting.md](../artifacts/14-hosting.md).

- **Plattform:** eigener EU-VPS (Hetzner) + Docker Compose (Caddy, API, Worker, Postgres, Editor, Portal).
- **Kunden-Sites:** Deploy-Adapter auf **Vercel/Netlify** (statische Artefakte; rollback- & preview-fähig; austauschbar — Cloudflare-Pfad bleibt offen).
- **Deployment je Release:** unveränderlich, `deploymentId` am Release gespeichert; Rollback = Re-Deploy des alten Artefakts (append-only, 05).
- **Previews:** geschützte Deployments + TTL-Cleanup; Screenshot-/Video-Jobs (06) laufen auf der Preview-URL.
- **Domains:** Subdomain-Default + Custom per Hosting-API; TLS automatisch.
- **Backups:** täglich DB + Assets → EU-Storage, Restore dokumentiert; Hinweis auf Vercel-/Netlify-Konditionen für Kunden-Sites.

Inputs verdrahtet: 15.
