import { captureBrowser } from "../packages/framer-import/src/capture-browser.ts";
const res = await captureBrowser({ url: "https://chocolate-attributes-385353.framer.app/price", pagePath: "/price", settleMs: 800 });
for (const [d, m] of Object.entries(res.deviceMarkup ?? {})) {
  console.log(d, "len", m?.length, "Meridian", (m?.match(/Meridian Starter/g) ?? []).length, "Astra Starter", (m?.match(/Astra Starter/g) ?? []).length);
}
process.exit(0);