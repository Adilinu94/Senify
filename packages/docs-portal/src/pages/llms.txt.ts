import type { APIRoute } from "astro";
import { llmsTxt } from "../index.ts";
import { portalPages } from "../portal.ts";

export const GET: APIRoute = () =>
  new Response(llmsTxt(portalPages()), {
    headers: { "content-type": "text/plain; charset=utf-8" },
  });