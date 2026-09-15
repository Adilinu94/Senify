import type { APIRoute } from "astro";
import { llmsFullTxt } from "../index.ts";
import { portalPages } from "../portal.ts";

export const GET: APIRoute = () =>
  new Response(llmsFullTxt(portalPages()), {
    headers: { "content-type": "text/plain; charset=utf-8" },
  });