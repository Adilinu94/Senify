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
  const flat = (el, out) => {
    for (const c of el.children) {
      if (SKIP.indexOf(c.tagName) >= 0) continue;
      const d = getComputedStyle(c).display;
      if (d === "contents") flat(c, out); else if (d !== "none" && H(c) > 0) out.push(c);
    }
    return out;
  };
  const kidsOf = (el) => flat(el, []);
  const vis = (el) => [...el.querySelectorAll("img")].filter((i) => H(i) > 0).length;
  const rawOf = (b) => [...b.children].slice(0, 8).map((c) => { const cs = getComputedStyle(c); return label(c) + " display=" + cs.display + " pos=" + cs.position + " h=" + H(c); });
  let box = document.body;
  const path = [];
  for (let d = 0; d < 14; d++) {
    path.push(label(box));
    const kids = kidsOf(box);
    const big = kids.filter((c) => H(c) >= total * 0.9);
    if (big.length === 1) box = big[0]; else break;
  }
  const kids = kidsOf(box);
  const raw = rawOf(box);
  const boxTop = T(box);
  const sections = kids.map((c, i) => ({ i, label: label(c), text: snippet(c), top: T(c) - boxTop, h: H(c), imgs: vis(c) }));
  const sumH = sections.reduce((a, s) => a + s.h, 0);
  const imgs = [...document.images];
  const info = imgs.map((im) => {
    const r = im.getBoundingClientRect();
    return { src: (im.currentSrc || im.src || "").slice(-40), lazy: im.getAttribute("loading") || "", ok: im.complete && im.naturalWidth > 0, nw: im.naturalWidth, nh: im.naturalHeight, w: Math.round(r.width), h: Math.round(r.height) };
  });
  return JSON.stringify({
    total, raw, path: path.join(" > "), boxH: H(box), gap: H(box) - sumH, sections,
    imgSummary: { count: info.length, visible: info.filter((i) => i.h > 0).length, loaded: info.filter((i) => i.ok).length, broken: info.filter((i) => !i.ok).length, lazy: info.filter((i) => i.lazy === "lazy").length, zeroH: info.filter((i) => i.h === 0).length, sumH: info.reduce((a, i) => a + i.h, 0) },
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

// ---- Lauf 4: Abstieg in main, Bildcontainer-Kette, gleiche Ersatzbilder ----
const HELPERS = `
  const SKIP = ["SCRIPT", "STYLE", "LINK", "NOSCRIPT", "META"];
  const R = (el) => el.getBoundingClientRect();
  const H = (el) => Math.round(R(el).height);
  const label = (el) => {
    const id = el.id ? "#" + el.id : "";
    const cls = typeof el.className === "string" && el.className.trim() ? "." + el.className.trim().split(/\\s+/).slice(0, 2).join(".") : "";
    return (el.tagName.toLowerCase() + id + cls).slice(0, 40);
  };
  const snippet = (el) => (el.textContent || "").replace(/\\s+/g, " ").trim().slice(0, 22);
  const flat = (el, out) => {
    for (const c of el.children) {
      if (SKIP.indexOf(c.tagName) >= 0) continue;
      const d = getComputedStyle(c).display;
      if (d === "contents") flat(c, out); else if (d !== "none" && H(c) > 0) out.push(c);
    }
    return out;
  };`;

export const drillScript = (tall: number[] | null): string => `(() => {
  ${HELPERS}
  const main = document.querySelector("main");
  if (!main) return JSON.stringify({ err: "kein main" });
  const info = (c) => ({ label: label(c), text: snippet(c), h: H(c), kids: flat(c, []).length });
  const kidsEls = flat(main, []);
  const l1 = kidsEls.map(info);
  const tall = ${JSON.stringify(tall)} || l1.map((c, i) => ({ i, h: c.h })).sort((a, b) => b.h - a.h).slice(0, 3).map((x) => x.i);
  const l2 = {};
  for (const i of tall) if (kidsEls[i]) l2[i] = flat(kidsEls[i], []).map(info);
  return JSON.stringify({ mainH: H(main), l1, tall, l2 });
})()`;

export const CHAIN = `(() => {
  ${HELPERS}
  const picks = [...document.images].filter((i) => H(i) > 0 && Math.abs(Math.round(R(i).width) - 541) <= 2).slice(0, 2);
  return JSON.stringify(picks.map((im) => {
    const chain = [];
    let el = im;
    for (let d = 0; d < 5 && el && el !== document.body; d++) {
      const cs = getComputedStyle(el);
      const b = R(el);
      chain.push([label(el), cs.position, cs.display, Math.round(b.width) + "x" + Math.round(b.height), "ar=" + cs.aspectRatio, "minH=" + cs.minHeight, "pb=" + cs.paddingBottom, (el.getAttribute("style") || "").slice(0, 70)].join(" | "));
      el = el.parentElement;
    }
    return chain;
  }));
})()`;

export const replaceScript = (dataUri: string): string => `(async () => {
  const data = ${JSON.stringify(dataUri)};
  for (const im of document.images) {
    im.removeAttribute("width"); im.removeAttribute("height"); im.removeAttribute("srcset"); im.removeAttribute("sizes");
    im.setAttribute("loading", "eager");
    im.src = data;
  }
  const all = Promise.all([...document.images].map((i) => (i.complete ? 0 : new Promise((r) => { i.onload = i.onerror = r; }))));
  await Promise.race([all, new Promise((r) => setTimeout(r, 4000))]);
  await new Promise((r) => setTimeout(r, 600));
  return document.images.length;
})()`;
