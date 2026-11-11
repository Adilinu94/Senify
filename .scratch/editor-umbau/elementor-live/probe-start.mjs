import { openEditor } from "./lib.mjs";
const { browser, page, shot } = await openEditor();
console.log("closed? " + page.isClosed() + " url " + page.url());
await shot("34-start");
await browser.close();
