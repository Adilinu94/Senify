export type ApiRequest = {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  body?: unknown;
  headers?: Record<string, string>;
};

export type ApiResponse<T> = {
  status: number;
  body: T;
  headers: Record<string, string>;
};

export type ApiHarness = {
  origin: string;
  request<T>(request: ApiRequest): Promise<ApiResponse<T>>;
};

export function createApiHarness(
  origin: string,
  options: { token?: string } = {},
): ApiHarness {
  const base = origin.replace(/\/+$/, "");
  return {
    origin: base,
    async request<T>(request: ApiRequest): Promise<ApiResponse<T>> {
      const headers: Record<string, string> = { ...request.headers };
      if (request.body !== undefined) {
        headers["content-type"] = "application/json";
      }
      if (options.token !== undefined) {
        headers.authorization = `Bearer ${options.token}`;
      }
      const response = await fetch(`${base}${request.path}`, {
        method: request.method,
        headers,
        body: request.body === undefined ? undefined : JSON.stringify(request.body),
      });
      const body = (await response.json().catch(() => undefined)) as T;
      const responseHeaders: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        responseHeaders[key.toLowerCase()] = value;
      });
      return { status: response.status, body, headers: responseHeaders };
    },
  };
}