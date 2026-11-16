import { startSenify } from "./senify-lib.mts";

const s = await startSenify();
try {
  await s.tab.waitForTimeout(2500);
  await s.shot("20-senify-leer");
  const buttons = await s.tab.getByRole("button").evaluateAll((els) => els.map((e) => ((e.getAttribute("aria-label") || e.textContent || "").trim().slice(0, 30) + "|" + (e.getAttribute("data-action") || "")).trim()).filter((x) => x !== "|"));
  console.log("buttons: " + JSON.stringify(buttons.slice(0, 60)));
  const tabs = await s.tab.getByRole("tab").evaluateAll((els) => els.map((e) => (e.textContent || "").trim()));
  console.log("tabs: " + JSON.stringify(tabs));
} finally {
  await s.close();
}
