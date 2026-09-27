/**
 * RSS 2.0 피드 — "이 사이트의 최신 글 목록"을 기계가 읽는 형식으로.
 * 읽는 쪽: 검색엔진(구글은 RSS를 사이트맵으로 받는다), 구독 앱(Feedly 등).
 *
 * 새 문장을 쓰지 않는다. 채널 설명은 홈 h1·부제(`site.js`), 글 항목은 카드의
 * 이름·요약(`_meta.js`의 name·blurb)을 그대로 싣는다 — 사이트에 이미 보이고
 * 사실 검사를 통과한 글자만 나간다. 사실 검사 목록(`scripts/audit/inventory.mjs`)이
 * 빌드된 `rss.xml`을 다시 읽어 항목마다 단위로 센다.
 *
 * 날짜(pubDate·lastBuildDate)는 **넣지 않는다.** RSS 2.0에서 선택 항목이고,
 * 발행일 정의가 아직 정해지지 않았다(Monty since 미확인 — 사이트맵 lastmod와 같은 보류).
 * 날짜 정의가 정해지면 사이트맵 lastmod와 함께 여기에 넣는다.
 */
import { CATEGORIES, tools_read_latest } from "./tools.js";
import { SITE_NAME, SITE_HEADLINE, SITE_SUBLINE, SITE_FEED_PATH } from "./site.js";

// ── 상수 ───────────────────────────────────────────────────
export const FEED_VERSION = "2.0";
export const FEED_LANGUAGE = "en";
export const FEED_CONTENT_TYPE = "application/rss+xml; charset=utf-8";
const FEED_ATOM_NS = "http://www.w3.org/2005/Atom";
/** XML에서 반드시 바꿔 써야 하는 글자. */
const FEED_XML_ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" };

/** 글자를 XML 본문·속성에 안전하게. */
export function feed_escape_text(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => FEED_XML_ESCAPES[ch]);
}

/** 도구 하나 → 피드 항목 값. 주소는 사이트 주소 + slug(끝 빗금 없음, trailingSlash: never). */
export function feed_read_item(tool, siteUrl) {
  const link = new URL(`/${tool.slug}`, siteUrl).href;
  const category = CATEGORIES.find((c) => c.key === tool.category)?.name ?? null;
  return { title: tool.name, link, description: tool.blurb, category };
}

/**
 * 피드 XML 전체.
 * @param {{siteUrl: string|URL, tools?: object[]}} options  tools를 주지 않으면 발행된 도구를 최신순으로
 */
export function feed_build_xml({ siteUrl, tools = tools_read_latest() }) {
  const home = new URL("/", siteUrl).href;
  const self = new URL(SITE_FEED_PATH, siteUrl).href;
  const items = tools
    .filter((tool) => tool.published)
    .map((tool) => feed_read_item(tool, siteUrl))
    .map((item) => [
      "    <item>",
      `      <title>${feed_escape_text(item.title)}</title>`,
      `      <link>${feed_escape_text(item.link)}</link>`,
      `      <guid isPermaLink="true">${feed_escape_text(item.link)}</guid>`,
      `      <description>${feed_escape_text(item.description)}</description>`,
      ...(item.category ? [`      <category>${feed_escape_text(item.category)}</category>`] : []),
      "    </item>",
    ].join("\n"));
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<rss version="${FEED_VERSION}" xmlns:atom="${FEED_ATOM_NS}">`,
    "  <channel>",
    `    <title>${feed_escape_text(SITE_NAME)}</title>`,
    `    <link>${feed_escape_text(home)}</link>`,
    `    <description>${feed_escape_text(`${SITE_HEADLINE} ${SITE_SUBLINE}`)}</description>`,
    `    <language>${FEED_LANGUAGE}</language>`,
    `    <atom:link href="${feed_escape_text(self)}" rel="self" type="application/rss+xml" />`,
    ...items,
    "  </channel>",
    "</rss>",
    "",
  ].join("\n");
}
