// SCRATCH, nie mergen: Code, der im Browser laeuft (als String an page.evaluate).
export const SNAP = `(() => {
  const SKIP = ["SCRIPT", "STYLE", "LINK", "NOSCRIPT", "META"];
  const H = (el) => Math.round(el.getBoundingClientRect().height);
  const T = (el) => Math.round(el.getBoundingClientRect().top + (window.scrollY || 0));
  const total = document.documentElement.scrollHeight;
  const label = (el) => {
    const id = el.id ? "#" + el.id : "";
    const cls = typeof el.className === "string" && el.className.trim() ? "." + el.className.trim().split(/\\s+/).slice(0, 2).join(".") : "";
    const fn = el.getAttribute("data-framer-name");
    return (el.tagName.toLowerCase() + id + cls + (fn ? "[" + fn + "]" : "")).slice(0, 46);
  };
  const snippet = (el) => (el.textContent || "").replace(/\\s+/g, " ").trim().slice(0, 30);
  const kidsOf = (el) => [...el.children].filter((c) => SKIP.indexOf(c.tagName) < 0 && H(c) > 0);
  let box = document.body;
  const path = [];
  for (let d = 0; d < 14; d++) {
    path.push(label(box));
    const kids = kidsOf(box);
    const big = kids.filter((c) => H(c) >= total * 0.9);
    if (big.length === 1) box = big[0]; else break;
  }
  const kids = kidsOf(box);
  const boxTop = T(box);
  const sections = kids.map((c, i) => ({ i, label: label(c), text: snippet(c), top: T(c) - boxTop, h: H(c), imgs: c.querySelectorAll("img").length }));
  const sumH = sections.reduce((a, s) => a + s.h, 0);
  const imgs = [...document.images];
  const info = imgs.map((im) => {
    const r = im.getBoundingClientRect();
    return { src: (im.currentSrc || im.src || "").slice(-40), lazy: im.getAttribute("loading") || "", ok: im.complete && im.naturalWidth > 0, nw: im.naturalWidth, nh: im.naturalHeight, w: Math.round(r.width), h: Math.round(r.height) };
  });
  return JSON.stringify({
    total, path: path.join(" > "), boxH: H(box), gap: H(box) - sumH, sections,
    imgSummary: { count: info.length, loaded: info.filter((i) => i.ok).length, broken: info.filter((i) => !i.ok).length, lazy: info.filter((i) => i.lazy === "lazy").length, zeroH: info.filter((i) => i.h === 0).length, sumH: info.reduce((a, i) => a + i.h, 0) },
    topImgs: [...info].sort((a, b) => b.h - a.h).slice(0, 6),
    media: { video: document.querySelectorAll("video").length, iframe: document.querySelectorAll("iframe").length, canvas: document.querySelectorAll("canvas").length, svg: document.querySelectorAll("svg").length },
  });
})()`;

export const SCROLL = `(async () => {
  const step = Math.max(300, window.innerHeight);
  for (let y = 0, n = 0; y < document.documentElement.scrollHeight && n < 400; y += step, n++) {
    window.scrollTo(0, y);
    await new Promise((r) => setTimeout(r, 120));
  }
  window.scrollTo(0, 0);
  return 1;
})()`;
