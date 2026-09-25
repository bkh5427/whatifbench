// 사실 검사의 "전수 목록" — 배포 HTML(dist)에서 사람이 보거나 기계가 읽는 글자를
// **빠짐없이** 문장 단위로 뽑는다. 의존성 없이 돈다(게이트가 Cloudflare 빌드에서도 부른다).
//
// 왜 dist인가: 독자가 보는 것은 소스가 아니라 산출물이다. 컴포넌트·데이터·도해에서
// 흘러드는 글자까지 여기서 한 번에 잡힌다. 7차 검사까지 늦게 나온 결함의 다수가
// "소스만 읽어서" 놓친 것이었다(붙은 글자, 메타 설명, 도해 글자).
//
// 단위(unit) = 한 문장 또는 한 속성값. id는 페이지·종류·정규화한 글자의 해시라서
// 글자가 한 자라도 바뀌면 id가 바뀐다 → 장부(ledger)의 판정이 자동으로 무효가 된다.
import { createHash } from "node:crypto";

// ── 상수 ───────────────────────────────────────────────────
const VOID_TAGS = new Set(["area","base","br","col","embed","hr","img","input","link","meta","source","track","wbr"]);
const RAW_TAGS = new Set(["script","style"]);
/** 한 덩어리 글로 읽히는 요소. 이 안의 인라인 글자는 붙여서 읽는다(붙은 단어가 드러난다). */
const BLOCK_TAGS = new Set(["p","li","h1","h2","h3","h4","h5","h6","td","th","dt","dd","figcaption","caption","blockquote","summary","label","button","legend","output","title","div","section","article","aside","header","footer","nav","main","ul","ol","dl","table","thead","tbody","tr","figure","form","fieldset","details","body","html","small","address"]);
const HEADING_TAGS = new Set(["h1","h2","h3","h4","h5","h6"]);
const CHROME_TAGS = new Set(["header","footer","nav"]);
/** 사람이 읽거나 보조기술이 읽는 속성. */
const TEXT_ATTRS = ["alt","aria-label","aria-description","aria-valuetext","title","placeholder","aria-roledescription"];
/** 메타 중 검사 대상. 검색 결과·공유 카드에 그대로 나간다. */
const META_KEYS = new Set(["description","og:title","og:description","og:image:alt","twitter:title","twitter:description","twitter:image:alt","og:site_name","author"]);
const ID_LENGTH = 12;
/** 문장 끝으로 보지 않을 약어(마침표 뒤에 대문자가 와도 이어진 문장). */
const ABBREVIATIONS = ["p.","pp.","vol.","no.","e.g.","i.e.","etc.","vs.","dr.","mr.","mrs.","ms.","st.","fig.","ed.","eds.","al.","ca.","jr.","sr.","u.s.","approx.","b.","ph.d."];

// ── 파서 ───────────────────────────────────────────────────
function html_decode(text) {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&mdash;/g, "—").replace(/&ndash;/g, "–").replace(/&times;/g, "×")
    .replace(/&hellip;/g, "…").replace(/&minus;/g, "−");
}

function html_parse_attrs(source) {
  const attrs = {};
  const re = /([^\s=\/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
  let m;
  while ((m = re.exec(source))) attrs[m[1].toLowerCase()] = html_decode(m[2] ?? m[3] ?? m[4] ?? "");
  return attrs;
}

/** 잘 짜인 Astro 산출물용 최소 파서. 트리 노드: {tag, attrs, children, parent} | {text}. */
export function html_parse(html) {
  const root = { tag: "#root", attrs: {}, children: [], parent: null };
  let node = root;
  const re = /<!--[\s\S]*?-->|<!doctype[^>]*>|<\/([a-zA-Z][\w:-]*)\s*>|<([a-zA-Z][\w:-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>|([^<]+|<)/gi;
  let m;
  while ((m = re.exec(html))) {
    if (m[1]) {
      const tag = m[1].toLowerCase();
      let up = node;
      while (up && up.tag !== tag) up = up.parent;
      if (up) node = up.parent;
    } else if (m[2]) {
      const tag = m[2].toLowerCase();
      const rawAttrs = m[3] ?? "";
      const el = { tag, attrs: html_parse_attrs(rawAttrs.replace(/\/\s*$/, "")), children: [], parent: node };
      node.children.push(el);
      if (RAW_TAGS.has(tag)) {
        const close = new RegExp(`</${tag}\\s*>`, "i");
        const rest = html.slice(re.lastIndex);
        const end = rest.search(close);
        el.raw = end < 0 ? rest : rest.slice(0, end);
        re.lastIndex += end < 0 ? rest.length : end + rest.slice(end).match(close)[0].length;
      } else if (!VOID_TAGS.has(tag) && !/\/\s*$/.test(rawAttrs)) {
        node = el;
      }
    } else if (m[4]) {
      node.children.push({ text: html_decode(m[4]), parent: node });
    }
  }
  return root;
}

// ── 글자 모으기 ─────────────────────────────────────────────
function text_normalise(text) {
  return text.replace(/[\s ]+/g, " ").trim();
}

/** 블록 안의 인라인 글자만 소스 그대로 이어 붙인다 — 공백이 없으면 붙은 채로 나온다. */
function node_inline_text(el) {
  let out = "";
  let prevTag = null;
  for (const child of el.children) {
    // 나란히 붙은 링크(메뉴·꼬리말)는 CSS로 떨어져 보인다. 목록에서는 " | "로 떼어 둔다(붙은 글자 판정은 runtime-scan이 한다).
    if (child.tag === "a" && prevTag === "a") out += " | ";
    if (child.text === undefined || child.text.trim()) prevTag = child.tag ?? null;
    if (child.text !== undefined) out += child.text;
    else if (RAW_TAGS.has(child.tag) || child.tag === "svg" || child.tag === "template") continue;
    else if (node_is_hidden(child)) out += `[숨김:${node_inline_text_plain(child)}]`;
    else if (child.tag === "br") out += " ";
    else if (BLOCK_TAGS.has(child.tag)) out += "\u0000";
    else if (/\bfrac-num\b/.test(child.attrs.class || "")) out += `(${node_inline_text(child)})/`;
    else if (/\bfrac-den\b/.test(child.attrs.class || "")) out += `(${node_inline_text(child)})`;
    else if (/\b(op)\b/.test(child.attrs.class || "")) out += ` ${node_inline_text(child)} `;
    else if (child.tag === "sub") out += `_${node_inline_text(child)}`;
    else if (child.tag === "sup") out += `^${node_inline_text(child)}`;
    else out += node_inline_text(child);
  }
  return out;
}

/** hidden/aria-hidden 요소. 독자에게 안 보이거나 안 읽힌다 — 판정이 달라지므로 표시해서 id에 넣는다. */
function node_is_hidden(el) {
  return el.attrs && (el.attrs.hidden !== undefined || el.attrs["aria-hidden"] === "true" || /display:\s*none|visibility:\s*hidden/.test(el.attrs.style || ""));
}

function node_inline_text_plain(el) {
  return el.text !== undefined ? el.text : el.children.map(node_inline_text_plain).join("");
}

/** 문장으로 자른다. 약어·소수점·쪽수에서는 자르지 않는다. */
export function text_split_sentences(text) {
  const clean = text_normalise(text);
  if (!clean) return [];
  const parts = [];
  let start = 0;
  const re = /([.!?…])(["”’)\]]*)\s+(?=["“‘(\[]?[A-Z0-9])/g;
  let m;
  while ((m = re.exec(clean))) {
    const end = m.index + m[1].length + m[2].length;
    const before = clean.slice(start, end);
    const lastWord = (before.match(/(\S+)$/) || [""])[0].toLowerCase();
    const token = lastWord.replace(/^[("“‘\[]+/, "");
    if (ABBREVIATIONS.includes(token) || /^[a-z]\.$/i.test(token) || /^([a-z]\.){2,}$/i.test(token)) continue;
    parts.push(before.trim());
    start = re.lastIndex;
  }
  parts.push(clean.slice(start).trim());
  return parts.filter(Boolean);
}

/**
 * id = 페이지·종류·위치(meta 키 등)·글자·**바로 앞 단위의 글자**의 해시.
 * 앞 문장을 넣는 이유: "It/So/That…"처럼 앞 문장에 기대는 문장이 많고(약 20%), 앞 문장이 바뀌거나
 * 지워지거나 순서가 바뀌면 뒤 문장의 참·거짓도 바뀔 수 있다. 그러면 뒤 문장도 다시 검사 대상이 된다.
 */
function unit_make_id(page, kind, where, text, prevText) {
  return createHash("sha1").update(`${page}\u0001${kind}\u0001${where}\u0001${text}\u0001${prevText}`).digest("hex").slice(0, ID_LENGTH);
}

function node_has_ancestor(el, tags) {
  for (let up = el.parent; up; up = up.parent) if (tags.has(up.tag)) return up.tag;
  return null;
}

function node_all_text(el) {
  if (el.text !== undefined) return el.text;
  if (RAW_TAGS.has(el.tag)) return "";
  return el.children.map(node_all_text).join(el.tag === "tspan" ? "" : "");
}

function jsonld_collect_strings(value, path, out) {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    out.push({ path, text: String(value) });
  } else if (Array.isArray(value)) value.forEach((v, i) => jsonld_collect_strings(v, `${path}[${i}]`, out));
  else if (value && typeof value === "object") for (const [k, v] of Object.entries(value)) if (k !== "@context") jsonld_collect_strings(v, `${path}.${k}`, out);
}

/**
 * 페이지 하나의 단위 목록.
 * @param {string} page  페이지 경로(예: "/monty-hall-n-doors")
 * @param {string} html  dist HTML
 * @returns {{units: object[], links: object[], figures: object[], landmarks: object[]}}
 */
export function units_extract(page, html) {
  const root = html_parse(html);
  const units = [];
  const links = [];
  const figures = [];
  /** 본문 안 위치 표지. "above/below the chart" 같은 지시어를 기계가 대조하는 데 쓴다. */
  const landmarks = [];
  const seen = new Map();
  const ids = new Set();
  let lastOwn = null;
  let lastCommon = null;
  let section = "(lead)";
  let block = "";
  let figureIndex = -1;

  function unit_push(kind, text, extra = {}) {
    const clean = text_normalise(text);
    if (!clean) return;
    const owner = extra.chrome ? "_common" : page;
    const prevText = owner === "_common" ? (lastCommon ?? "") : (lastOwn ?? "");
    const baseId = unit_make_id(owner, kind, extra.where ?? "", clean, prevText);
    if (owner === "_common") lastCommon = clean; else lastOwn = clean;
    const count = (seen.get(baseId) ?? 0) + 1;
    seen.set(baseId, count);
    const id = count === 1 ? baseId : `${baseId}-${count}`;
    delete extra.chrome;
    units.push({ id, page: owner, kind, section, block, text: clean, order: units.length, ...extra });
  }

  function visit(el) {
    if (el.text !== undefined) return;
    const tag = el.tag;
    if (tag === "script") {
      if ((el.attrs.type || "") === "application/ld+json") {
        try {
          const strings = [];
          jsonld_collect_strings(JSON.parse(el.raw), "$", strings);
          for (const s of strings) unit_push("jsonld", `${s.path.replace(/^\$\.?/, "")} = ${s.text}`, { where: s.path });
        } catch { unit_push("jsonld", "(JSON-LD를 읽지 못함)", { where: "$" }); }
      }
      return;
    }
    if (RAW_TAGS.has(tag)) return;
    const chrome = Boolean(node_has_ancestor(el, CHROME_TAGS) || CHROME_TAGS.has(tag));
    if (tag === "html" && el.attrs.lang) unit_push("head", `lang=${el.attrs.lang}`, { where: "html[lang]" });
    if (tag === "meta") {
      const key = el.attrs.name || el.attrs.property || el.attrs["http-equiv"] || (el.attrs.charset ? "charset" : "");
      if (key && META_KEYS.has(key)) unit_push("meta", el.attrs.content || "", { where: key });
      else if (key === "og:image" || key === "twitter:image") unit_push("og-image", el.attrs.content || "", { where: key });
      else if (key && key !== "viewport" && key !== "charset" && key !== "generator") unit_push("head", `${key}=${el.attrs.content ?? ""}`, { where: key });
      return;
    }
    if (tag === "link" && /\b(canonical|alternate|icon|manifest|prev|next)\b/.test(el.attrs.rel || "")) {
      unit_push("head", `${el.attrs.rel}=${el.attrs.href ?? ""}${el.attrs.hreflang ? ` hreflang=${el.attrs.hreflang}` : ""}`, { where: `link[${el.attrs.rel}]` });
      return;
    }
    if (tag === "title") { unit_push("meta", node_all_text(el), { where: "title" }); return; }
    if (HEADING_TAGS.has(tag)) {
      const text = text_normalise(node_inline_text(el));
      if (tag === "h2" && !chrome) { section = text; block = el.attrs["data-block"] || ""; }
      unit_push("heading", text, { where: tag, chrome });
    }
    if (tag === "figure") { figureIndex += 1; landmarks.push({ type: "figure", index: figureIndex, at: units.length, section }); }
    if (el.attrs["data-widget"] !== undefined) landmarks.push({ type: "widget", name: el.attrs["data-widget"], at: units.length, section });
    if (tag === "table") landmarks.push({ type: "table", at: units.length, section });
    if (/\bsources\b/.test(el.attrs.class || "")) landmarks.push({ type: "sources", at: units.length, section });
    if (tag === "h2") landmarks.push({ type: "h2", at: units.length, text: text_normalise(node_inline_text(el)), block: el.attrs["data-block"] || "" });
    for (const attr of TEXT_ATTRS) {
      if (el.attrs[attr]) unit_push("attr", el.attrs[attr], { where: `${tag}[${attr}]`, chrome, figure: node_has_ancestor(el, new Set(["figure"])) ? figureIndex : undefined });
    }
    if (tag === "a" && el.attrs.href !== undefined) {
      const linkText = text_normalise(node_all_text(el)) || el.attrs["aria-label"] || "(글자 없음)";
      links.push({ page, href: el.attrs.href, text: linkText, section, chrome });
      unit_push("link", `${linkText} → ${el.attrs.href}${el.attrs.target ? ` (target=${el.attrs.target})` : ""}${el.attrs.rel ? ` (rel=${el.attrs.rel})` : ""}`, { where: "a[href]", chrome });
    }
    if (tag === "img") unit_push("attr", el.attrs.alt === undefined ? "(alt 없음)" : `alt=${el.attrs.alt}`, { where: `img ${el.attrs.src ?? ""}`, chrome });
    if (el.attrs.id) ids.add(el.attrs.id);
    if (tag === "svg") {
      const texts = [];
      (function walk(n) {
        if (n.text !== undefined) return;
        if (n.tag === "text") { const t = text_normalise(node_all_text(n)); if (t) texts.push({ text: t, fill: n.attrs.fill || "", cls: n.attrs.class || "" }); return; }
        if (n.tag === "title" || n.tag === "desc") { const t = text_normalise(node_all_text(n)); if (t) unit_push("attr", t, { where: `svg>${n.tag}`, figure: figureIndex }); return; }
        n.children.forEach(walk);
      })(el);
      for (const t of texts) unit_push("svg-text", t.text, { where: "svg>text", figure: figureIndex, fill: t.fill, cls: t.cls });
      // 도형의 크기·위치·색. 막대 길이가 숫자와 안 맞거나 색이 바뀌어도 글자는 그대로라 목록에 안 잡히던 결함(E10/E16).
      const shapes = [];
      (function walkShapes(n) {
        if (n.text !== undefined || n.tag === "text") return;
        if (["rect", "circle", "ellipse", "line", "path", "polygon", "polyline"].includes(n.tag)) {
          const a = n.attrs;
          const geo = ["x", "y", "width", "height", "cx", "cy", "r", "x1", "y1", "x2", "y2", "points", "d"].filter((k) => a[k] !== undefined).map((k) => `${k}=${a[k].length > 60 ? `${a[k].slice(0, 60)}…` : a[k]}`).join(" ");
          const paint = ["fill", "stroke", "class", "stroke-dasharray", "opacity"].filter((k) => a[k] !== undefined).map((k) => `${k}=${a[k]}`).join(" ");
          shapes.push(`${n.tag}(${geo}${paint ? `; ${paint}` : ""})`);
        }
        n.children.forEach(walkShapes);
      })(el);
      const inFigure = node_has_ancestor(el, new Set(["figure"]));
      if (inFigure || shapes.length > 3) unit_push("figure-geom", `viewBox=${el.attrs.viewbox ?? el.attrs.viewBox ?? ""} · ${shapes.join(" · ")}`, { where: "svg", figure: inFigure ? figureIndex : undefined, chrome });
      figures.push({ page, figure: figureIndex, section, texts, shapes: shapes.length });
      return;
    }
    if (BLOCK_TAGS.has(tag) && !HEADING_TAGS.has(tag) && tag !== "title") {
      const inline = node_inline_text(el);
      for (const piece of inline.split("\u0000")) {
        for (const sentence of text_split_sentences(piece)) {
          unit_push(node_has_ancestor(el, new Set(["figure"])) || tag === "figcaption" ? "caption" : "text", sentence, { where: tag, chrome });
        }
      }
    }
    el.children.forEach(visit);
  }
  visit(root);
  // 페이지 짜임: 절 제목과 위젯·도해·표·출처 목록의 순서. 순서가 바뀌면(위젯을 아래로 옮김 등)
  // "the chart above" 같은 문장의 참·거짓이 바뀌므로 이 단위가 바뀌어 다시 검사된다.
  const layout = landmarks.map((l) => (l.type === "h2" ? `h2:${l.text}` : `${l.type}${l.index !== undefined ? `#${l.index}` : ""}${l.name ? `:${l.name}` : ""}`)).join(" | ");
  unit_push("layout", layout || "(표지 없음)", { where: "page" });
  return { units, links, figures, landmarks, ids: [...ids] };
}
