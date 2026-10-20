// Die Routen des Bereichs api/settings, api/backups, api/tokens, api/mcp, api/events, api/whoami, api/notifications, api/newsletter, api/health. Die Tabelle des
// Dispatchers in `http.ts` nimmt sie unveraendert auf (ADR-0019).

import type { Route } from "./http-contract.ts";
import { SenifyError } from "@senify/core";
import {
  CreateTokenBodySchema,
  McpAuditBodySchema,
  parseExpires,
  redactArgs,
  type CreateTokenBody,
  type McpAuditBody,
} from "./auth.ts";
import {
  parseBody,
} from "./mutations/contract.ts";
import type {
  EngineSettingsPatch,
  ImageSettingsPatch,
  SmtpSettingsPatch,
} from "./store.ts";
import { backupStatus, createBackup, listBackups, restoreBackup } from "./backup.ts";
import { sendTestMail, smtpMailSender } from "./mailer.ts";
import {
  encryptImageApiKey,
  encryptSmtpPassword,
  referenceSettingsPatch,
  resolveSmtpConfig,
} from "./settings.ts";
import {
  TestMailBodySchema,
  UpdateSettingsBodySchema,
  type TestMailBody,
  type UpdateSettingsBody,
} from "./settings-contract.ts";
import {
  confirmNewsletter,
  tickNotifications,
  unsubscribeNewsletter,
} from "./forms.ts";
import {
  FormTickBodySchema,
  type FormTickBody,
} from "./forms-contract.ts";
import {
  settingsView,
  readJsonBody,
  wantsJson,
  requireParam,
} from "./http-route-support.ts";

export const opsRoutes: Route[] = [
  {
    method: "GET",
    segments: ["api", "health"],
    public: true,
    maintenanceExempt: true,
    handler: async (context) => ({
      status: 200,
      body: {
        ok: true,
        version: "0.1.0",
        maintenance: context.maintenance.active,
      },
    }),
  },

  {
    // Live events (ticket 05): the SSE channel the program and the editor
    // follow. `?site=` narrows the stream; an unknown site is a 404 instead of
    // a silent empty stream.
    method: "GET",
    segments: ["api", "events"],
    scope: "read",
    handler: async (context, _params, _req, url) => {
      const siteId = url.searchParams.get("site") ?? "";
      if (siteId !== "") await context.store.getSite(siteId);
      return {
        status: 200,
        stream: {
          contentType: "text/event-stream; charset=utf-8",
          open: (res) => context.events.openStream(res, siteId),
        },
      };
    },
  },

  {
    method: "POST",
    segments: ["api", "tokens"],
    operatorOnly: true,
    scope: "write",
    handler: async (context, _params, req) => {
      const body = (await readJsonBody(req)) ?? {};
      const input = parseBody<CreateTokenBody>(
        CreateTokenBodySchema,
        body,
        "token",
      );
      const created = await context.store.createToken({
        name: input.name,
        kind: input.kind,
        scopes: input.scopes ?? ["read", "write"],
        expiresAt: parseExpires(input.expires),
      });
      return {
        status: 201,
        body: {
          token: created.token,
          secret: created.secret,
          hint: "Store the secret now — it is shown only once.",
        },
      };
    },
  },

  {
    method: "GET",
    segments: ["api", "tokens"],
    operatorOnly: true,
    scope: "read",
    handler: async (context) => ({
      status: 200,
      body: { tokens: await context.store.listTokens() },
    }),
  },

  {
    method: "DELETE",
    segments: ["api", "tokens", ":tokenId"],
    operatorOnly: true,
    scope: "publish",
    handler: async (context, params) => {
      const tokenId = params.tokenId;
      if (!tokenId) {
        throw new SenifyError("validation", "Missing token id", {
          field: "tokenId",
        });
      }
      await context.store.revokeToken(tokenId);
      return { status: 204 };
    },
  },

  {
    method: "GET",
    segments: ["api", "whoami"],
    scope: "read",
    handler: async (context, _params, _req, _url, auth) => {
      if (!auth) throw new SenifyError("auth", "Missing bearer token");
      const token = await context.store.getToken(auth.tokenId);
      return {
        status: 200,
        body: {
          name: token.name,
          kind: token.kind,
          scopes: token.scopes,
          prefix: token.prefix,
          createdAt: token.createdAt,
          expiresAt: token.expiresAt,
          lastUsedAt: token.lastUsedAt,
        },
      };
    },
  },

  {
    method: "POST",
    segments: ["api", "mcp", "audit"],
    scope: "read",
    handler: async (context, _params, req, _url, auth) => {
      const body = (await readJsonBody(req)) ?? {};
      const input = parseBody<McpAuditBody>(
        McpAuditBodySchema,
        body,
        "mcp audit entry",
      );
      const entry = await context.store.appendMcpAudit({
        tokenId: auth?.tokenId ?? null,
        client: input.client ?? auth?.tokenName ?? "unknown",
        tool: input.tool,
        args: redactArgs(input.args),
        result: input.result,
        entity: input.entity ?? null,
        durationMs: Math.round(input.durationMs ?? 0),
      });
      return { status: 201, body: entry };
    },
  },

  {
    method: "GET",
    segments: ["api", "mcp", "audit"],
    scope: "read",
    handler: async (context, _params, _req, url) => {
      const rawLimit = url.searchParams.get("limit");
      const limit = rawLimit === null ? 50 : Number.parseInt(rawLimit, 10);
      if (!Number.isInteger(limit)) {
        throw new SenifyError("validation", "Audit limit must be an integer", {
          field: "limit",
        });
      }
      return {
        status: 200,
        body: { entries: await context.store.listMcpAudit(limit) },
      };
    },
  },

  {
    method: "GET",
    segments: ["api", "newsletter", "confirm"],
    public: true,
    handler: async (context, _params, req, url) => {
      const token = url.searchParams.get("token") ?? "";
      const result = await confirmNewsletter(context.store, { token });
      if (!wantsJson(req) && result.redirectUrl !== null) {
        return { status: 303, redirect: result.redirectUrl };
      }
      return { status: 200, body: result };
    },
  },

  {
    method: "GET",
    segments: ["api", "newsletter", "unsubscribe"],
    public: true,
    handler: async (context, _params, req, url) => {
      const token = url.searchParams.get("token") ?? "";
      const result = await unsubscribeNewsletter(context.store, { token });
      if (!wantsJson(req) && result.redirectUrl !== null) {
        return { status: 303, redirect: result.redirectUrl };
      }
      return { status: 200, body: result };
    },
  },

  {
    // Job tick for the notification outbox (retry/backoff, §5.4).
    method: "POST",
    segments: ["api", "notifications", "tick"],
    scope: "write",
    handler: async (context, _params, req) => {
      const body = (await readJsonBody(req)) ?? {};
      const input = parseBody<FormTickBody>(
        FormTickBodySchema,
        body,
        "notification tick",
      );
      return {
        status: 200,
        body: await tickNotifications({
          store: context.store,
          ...(input.limit === undefined ? {} : { limit: input.limit }),
        }),
      };
    },
  },

  // ------------------------------------------------------- settings (T12)
  {
    method: "GET",
    segments: ["api", "settings"],
    scope: "read",
    handler: async (context) => ({ status: 200, body: await settingsView(context) }),
  },

  {
    method: "PUT",
    segments: ["api", "settings"],
    scope: "write",
    handler: async (context, _params, req) => {
      const body = (await readJsonBody(req)) ?? {};
      const input = parseBody<UpdateSettingsBody>(
        UpdateSettingsBodySchema,
        body,
        "settings",
      );
      if (input.email !== undefined) {
        const patch: SmtpSettingsPatch = {};
        if (input.email.host !== undefined) patch.host = input.email.host;
        if (input.email.port !== undefined) patch.port = input.email.port;
        if (input.email.tls !== undefined) patch.tls = input.email.tls;
        if (input.email.user !== undefined) patch.user = input.email.user;
        if (input.email.from !== undefined) patch.from = input.email.from;
        // A new password is encrypted; null clears it; omitting keeps it.
        if (typeof input.email.password === "string" && input.email.password !== "") {
          patch.passwordEncrypted = await encryptSmtpPassword(
            context.store,
            input.email.password,
          );
        } else if (input.email.password === null) {
          patch.passwordEncrypted = null;
        }
        await context.store.updateSmtpSettings(patch);
      }
      if (input.defaults !== undefined) {
        const patch: EngineSettingsPatch = {};
        if (input.defaults.defaultProfile !== undefined) {
          patch.defaultProfile = input.defaults.defaultProfile;
        }
        if (input.defaults.defaultLayout !== undefined) {
          patch.defaultLayout = input.defaults.defaultLayout;
        }
        if (input.defaults.autostart !== undefined) {
          patch.autostart = input.defaults.autostart;
        }
        await context.store.updateEngineSettings(patch);
      }
      if (input.backup?.targetDir !== undefined) {
        await context.store.updateEngineSettings({
          backupDir: input.backup.targetDir,
        });
      }
      // House DNA and the brief preferences of the reference library (T14).
      // Both branches merge into the stored settings: a branch that is left out
      // keeps its value.
      if (input.referenceDna !== undefined || input.referencePreferences !== undefined) {
        const current = await context.store.getReferenceSettings();
        await context.store.updateReferenceSettings(
          referenceSettingsPatch({
            ...(input.referenceDna === undefined
              ? {}
              : {
                  referenceDna: {
                    name: input.referenceDna.name ?? current.dna.name,
                    description: input.referenceDna.description ?? current.dna.description,
                    constants: input.referenceDna.constants ?? current.dna.constants,
                    never: input.referenceDna.never ?? current.dna.never,
                  },
                }),
            ...(input.referencePreferences === undefined
              ? {}
              : { referencePreferences: input.referencePreferences }),
          }),
        );
      }
      // Image generation (S1): a branch that is left out keeps its value.
      if (input.image !== undefined) {
        const patch: ImageSettingsPatch = {};
        if (input.image.provider !== undefined) patch.provider = input.image.provider;
        if (input.image.fallbackProvider !== undefined) {
          patch.fallbackProvider = input.image.fallbackProvider;
        }
        if (input.image.cooldownMinutes !== undefined) {
          patch.cooldownMinutes = input.image.cooldownMinutes;
        }
        if (input.image.cliPath !== undefined) patch.cliPath = input.image.cliPath.trim();
        if (input.image.baseUrl !== undefined) patch.baseUrl = input.image.baseUrl.trim();
        if (input.image.diffusionModel !== undefined) {
          patch.diffusionModel = input.image.diffusionModel.trim();
        }
        if (input.image.textEncoder !== undefined) {
          patch.textEncoder = input.image.textEncoder.trim();
        }
        if (input.image.vae !== undefined) patch.vae = input.image.vae.trim();
        if (input.image.defaultSteps !== undefined) {
          patch.defaultSteps = input.image.defaultSteps;
        }
        if (input.image.maxPixels !== undefined) patch.maxPixels = input.image.maxPixels;
        if (input.image.timeoutMinutes !== undefined) {
          patch.timeoutMinutes = input.image.timeoutMinutes;
        }
        // Custom endpoint (third path). A new API key is encrypted; null
        // clears it; omitting keeps the stored one.
        if (input.image.customBaseUrl !== undefined) {
          patch.customBaseUrl = input.image.customBaseUrl.trim();
        }
        if (input.image.customModel !== undefined) {
          patch.customModel = input.image.customModel.trim();
        }
        if (input.image.customFormat !== undefined) {
          patch.customFormat = input.image.customFormat;
        }
        if (
          typeof input.image.customApiKey === "string" &&
          input.image.customApiKey !== ""
        ) {
          patch.customApiKeyEncrypted = await encryptImageApiKey(
            context.store,
            input.image.customApiKey,
          );
        } else if (input.image.customApiKey === null) {
          patch.customApiKeyEncrypted = null;
        }
        await context.store.updateImageSettings(patch);
      }
      return { status: 200, body: await settingsView(context) };
    },
  },

  {
    // Sends a single test mail with the stored transport; the result is
    // structured so the UI can name the failure (auth/connection/tls).
    method: "POST",
    segments: ["api", "settings", "email", "test"],
    scope: "write",
    handler: async (context, _params, req) => {
      const body = (await readJsonBody(req)) ?? {};
      const input = parseBody<TestMailBody>(
        TestMailBodySchema,
        body,
        "test mail",
      );
      const config = await resolveSmtpConfig(context.store);
      if (config === undefined) {
        return {
          status: 200,
          body: {
            ok: false,
            to: input.to,
            reason: "unconfigured",
            message:
              "Keine SMTP-Einstellungen hinterlegt — Host und Absenderadresse zuerst speichern.",
          },
        };
      }
      return {
        status: 200,
        body: await sendTestMail({
          config,
          to: input.to,
          send: context.mailSender ?? smtpMailSender,
        }),
      };
    },
  },

  {
    method: "GET",
    segments: ["api", "backups"],
    scope: "read",
    handler: async (context) => {
      const status = await backupStatus({
        store: context.store,
        dataDir: context.dataDir,
      });
      return {
        status: 200,
        body: { status, backups: await listBackups(status.targetDir) },
      };
    },
  },

  {
    method: "POST",
    segments: ["api", "backups"],
    scope: "write",
    handler: async (context) => {
      const run = await createBackup({
        store: context.store,
        dataDir: context.dataDir,
      });
      return { status: 201, body: { backup: run.summary, manifest: run.manifest } };
    },
  },

  {
    // Playing a backup back overwrites tables and the data directory, so the
    // body has to confirm explicitly; the state before the write is copied
    // into a fresh backup and named in the answer.
    method: "POST",
    segments: ["api", "backups", ":name", "restore"],
    scope: "write",
    destructive: true,
    maintenanceExempt: true,
    handler: async (context, params, req) => {
      const body = (await readJsonBody(req)) ?? {};
      if ((body as { confirm?: unknown }).confirm !== true) {
        throw new SenifyError(
          "validation",
          "Wiederherstellung erfordert confirm: true im Körper",
          {
            field: "confirm",
            suggestion:
              "Erst nach ausdrücklicher Bestätigung senden; die Sicherung ersetzt den aktuellen Stand.",
          },
        );
      }
      const name = requireParam(params, "name");
      // The maintenance gate drains running requests and locks out new ones
      // for the time the tables and the data directory are swapped.
      return {
        status: 200,
        body: await context.maintenance.runExclusive(() =>
          restoreBackup({
            store: context.store,
            dataDir: context.dataDir,
            name,
          }),
        ),
      };
    },
  },
];
