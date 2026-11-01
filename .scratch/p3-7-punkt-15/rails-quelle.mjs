import { chromium } from "playwright";
const browser = await chromium.launch();
for (const width of [900, 1440]) {
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  await page.goto("https://unifiersofjapan.framer.website/", { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(2000);
  const out = await page.evaluate(`(() => {
    const round = (value) => Math.round(value * 10) / 10;
    const all = [...document.querySelectorAll("div")];
    const wide = all.filter((element) => getComputedStyle(element).maxWidth === "1600px");
    const seen = new Set();
    return wide.map((element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      const parent = element.parentElement;
      const parentStyle = getComputedStyle(parent);
      const parentRect = parent.getBoundingClientRect();
      return {
        classes: element.className,
        name: element.getAttribute("data-framer-name"),
        rect: [rect.left, rect.top, rect.width, rect.height].map(round),
        display: style.display, flex: style.flex, width: style.width, maxWidth: style.maxWidth, padding: style.padding,
        parent: {
          classes: parent.className,
          rect: [parentRect.left, parentRect.top, parentRect.width, parentRect.height].map(round),
          display: parentStyle.display, justify: parentStyle.justifyContent, padding: parentStyle.padding,
          children: [...parent.children].map((child) => {
            const childStyle = getComputedStyle(child);
            const childRect = child.getBoundingClientRect();
            return {
              classes: child.className,
              rect: [childRect.left, childRect.top, childRect.width, childRect.height].map(round),
              display: childStyle.display, transform: childStyle.transform, width: childStyle.width,
            };
          }),
        },
      };
    });
  })()`);
  console.log(`\n### quelle @ ${width}`);
  console.log(JSON.stringify(out, null, 1).slice(0, 6000));
  await page.close();
}
await browser.close();
