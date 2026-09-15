import type { APIRoute } from "astro";
import { pageMarkdown, sortPages, type DocsPage } from "../index.ts";
import { portalPages } from "../portal.ts";

export function getStaticPaths() {
  return sortPages(portalPages()).map((page) => ({
    params: { path: page.path.replace(/^\//, "") },
    props: { page },
  }));
}

// The markdown twin of every page: `/<pfad>.md` serves exactly the text the
// agent exports use.
export const GET: APIRoute = ({ props }) => {
  const page = props.page as DocsPage;
  return new Response(pageMarkdown(page), {
    headers: { "content-type": "text/markdown; charset=utf-8" },
  });
};