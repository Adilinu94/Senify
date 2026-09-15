export type EngineErrorDetail = {
  category: string;
  message: string;
  opIndex?: number;
  field?: string;
  suggestion?: string;
};

export class EngineApiError extends Error {
  readonly status: number;
  readonly detail: EngineErrorDetail;

  constructor(status: number, detail: EngineErrorDetail) {
    super(detail.message);
    this.name = "EngineApiError";
    this.status = status;
    this.detail = detail;
  }
}

export class EngineClient {
  readonly #apiUrl: string;
  readonly #token: string | undefined;
  #tokenName: string | undefined;

  constructor(config: { apiUrl: string; token?: string }) {
    this.#apiUrl = config.apiUrl;
    this.#token = config.token;
  }

  get apiUrl(): string {
    return this.#apiUrl;
  }

  async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    let response: Response;
    try {
      response = await fetch(`${this.#apiUrl}${path}`, {
        method,
        headers: {
          ...(this.#token === undefined
            ? {}
            : { authorization: `Bearer ${this.#token}` }),
          ...(body === undefined ? {} : { "content-type": "application/json" }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch (error) {
      throw new EngineApiError(0, {
        category: "not_found",
        message: `Senify engine at ${this.#apiUrl} is not reachable`,
        suggestion: error instanceof Error ? error.message : "Start the engine first.",
      });
    }
    const payload = (await response.json().catch(() => undefined)) as
      | { error?: EngineErrorDetail }
      | undefined;
    if (!response.ok) {
      throw new EngineApiError(
        response.status,
        payload?.error ?? {
          category: "internal",
          message: `Engine responded with ${response.status}`,
        },
      );
    }
    return payload as T;
  }

  // Raw bytes for the signed asset upload: the JSON helper would mangle the file.
  async uploadBytes<T>(
    method: string,
    path: string,
    body: Buffer,
    contentType: string,
  ): Promise<T> {
    let response: Response;
    try {
      response = await fetch(`${this.#apiUrl}${path}`, {
        method,
        headers: { "content-type": contentType },
        body,
      });
    } catch (error) {
      throw new EngineApiError(0, {
        category: "not_found",
        message: `Senify engine at ${this.#apiUrl} is not reachable`,
        suggestion: error instanceof Error ? error.message : "Start the engine first.",
      });
    }
    const payload = (await response.json().catch(() => undefined)) as
      | { error?: EngineErrorDetail }
      | undefined;
    if (!response.ok) {
      throw new EngineApiError(
        response.status,
        payload?.error ?? {
          category: "internal",
          message: `Engine responded with ${response.status}`,
        },
      );
    }
    return payload as T;
  }

  // Token identity is used for the mutation author and the audit client.
  async tokenName(): Promise<string> {
    if (this.#tokenName !== undefined) return this.#tokenName;
    const who = await this.request<{ name: string }>("GET", "/api/whoami");
    this.#tokenName = who.name;
    return who.name;
  }
}
