# Artefakt 14: Hosting & Deploy (Senify v1)

> Entschieden am 14.09.2026 in Ticket „Hosting & Deploy der Sites".
> Grundlagen: `artifacts/02` (statische Artefakte), `05` (Releases/Previews), `06` (Screenshot-Jobs), `12` (Portal), `13` (Checks), `research/20` (Docker-/Deploy-Muster).

## Entscheidungen (Wizard, 6/6)

1. **Plattform:** eigener **EU-VPS** (z. B. Hetzner) + Docker Compose + Caddy.
2. **Kunden-Sites:** **Vercel/Netlify** über einen Deploy-Adapter (statische Artefakte, austauschbar).
3. **Deployment je Release** (unveränderlich); Rollback = Re-Deploy des alten Artefakts.
4. **Previews:** geschützte Deployments + TTL-Cleanup.
5. **Domains:** Subdomain-Default + Custom-Domain per Hosting-API.
6. **Backups:** täglich DB + Assets → EU-Storage, dokumentierter Restore.

## Topologie

```
[Dein Rechner]              [EU-VPS (Hetzner)]                        [Vercel/Netlify]
Claude/Cursor/opencode      Docker Compose:                           Deployments + CDN
   │ stdio-MCP (04)          ├─ Caddy (TLS, Reverse Proxy)             ├─ Site-Deployments
   └────────────────────────▶├─ senify-api (Node)                     ├─ Preview-Deployments (geschützt)
                             ├─ senify-worker (Build, Screenshots)    └─ Custom Domains (API)
                             ├─ Postgres (Datenmodell 01)
                             ├─ Editor (statisch ausgeliefert)        [EU-Storage]
                             └─ Portal (statisch ausgeliefert)        └─ DB-Dumps + Assets (Backups)
```

## Deploy-Mechanik (Version ↔ Deployment)

- Release (05) → Build-Artefakt (02) → **Hosting-Adapter** deployt unveränderlich → `deploymentId` wird am Release gespeichert; `Site.activeDeploymentId` zeigt auf die Produktion.
- **Rollback** = neues Deployment des alten Release-Artefakts (append-only; `basisReleaseId`, 05).
- **Adapter-Interface** (framework-neutral): `deploy(artifact) → id` · `protect(id)` · `addDomain(host, id)` · `remove(id)`. Erste Implementierungen: Vercel + Netlify — Cloudflare später ohne Artefakt-Änderung (statische Dateien, kein Lock-in).

## Previews

- Eigene **geschützte** Deployments (Vercel: Deployment Protection; Netlify: Password-/Deploy-Previews) mit `tokenUrl` (05).
- TTL 30 Tage + Löschjob (05); Screenshot-/Video-Jobs (06) und Checks (13) laufen auf der Preview-URL.

## Domains & TLS

- Default je Site: `kunde.senify.xyz`-Subdomain; Custom-Domain per Hosting-API (CNAME-Anleitung im Portal); TLS automatisch.

## Betrieb & Backups

- Plattform-Update = Image-Redeploy (Instatic-Muster); Konfiguration als Compose + `.env`; Health-Checks.
- **Backups:** täglich Postgres-Dump + Assets → EU-Storage (Hetzner Storage Box / S3 EU); Restore-Test dokumentiert; Site-Artefakte aus Releases reproduzierbar.
- Monitoring v1 minimal (Logs, Health-Endpoints); Observability-Ausbau bleibt Fog.

## Hinweise & Risiken

- **Vercel/Netlify-Konditionen:** Vercel Hobby ist non-commercial — für Kunden-Sites Pro-Plan bzw. passendes Netlify-Tier einplanen.
- Deployment-History-Limits der Anbieter → Artefakte zusätzlich im eigenen EU-Storage spiegeln (für Rollback ohnehin nötig).
- Adapter austauschbar: Cloudflare-Pfad bleibt offen (Research 17, first-class für Astro).

## Anschlüsse

| Bereich | Ticket |
|---|---|
| Media/Assets-Storage auf EU-Backends | 15 |
| Screenshot-/Video-Jobs auf Preview-URLs | 06 |
| Checks in der Build-/Deploy-Pipeline | 13 |
| Portal-Deploy | 12 |

## Nachtrag 15.09.2026 (Technologie-Check → `research/30`)

- **Cloudflare hat The Astro Technology Company übernommen (16.01.2026)**; Framework bleibt MIT, Astro 7.3.x aktiv. Deploy bleibt adapterbasiert (statische Artefakte, kein Lock-in): **Cloudflare Pages als nächste Adapter-Priorität** (neben Vercel/Netlify); Vendor-Direction beobachten.
