export type ApiRequest = {
  method: "GET" | "POST" | "PATCH" | "DELETE";
  path: string;
  body?: unknown;
};

export type ApiResponse<T> = {
  status: number;
  body: T;
};

export type ApiHarness = {
  origin: string;
  request<T>(request: ApiRequest): Promise<ApiResponse<T>>;
};

export function createApiHarness(origin: string): ApiHarness {
  const base = origin.replace(/\/+$/, "");
  return {
    origin: base,
    async request<T>(request: ApiRequest): Promise<ApiResponse<T>> {
      const response = await fetch(`${base}${request.path}`, {
        method: request.method,
        headers:
          request.body === undefined
            ? undefined
            : { "content-type": "application/json" },
        body: request.body === undefined ? undefined : JSON.stringify(request.body),
      });
      const body = (await response.json().catch(() => undefined)) as T;
      return { status: response.status, body };
    },
  };
}