// RSS 피드 규칙을 기계로 지킨다.
import { describe, expect, it } from "vitest";
import { feed_build_xml, feed_escape_text } from "./feed.js";
import { TOOLS, tools_read_latest } from "./tools.js";
import { SITE_FEED_PATH } from "./site.js";

const SITE_URL = "https://whatifbench.com";
const xml = feed_build_xml({ siteUrl: SITE_URL });
const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((m) => m[1]);
const links = items.map((b) => b.match(/<link>([^<]*)<\/link>/)[1]);

describe("RSS 피드", () => {
  it("발행된 도구만, 최신순으로 싣는다", () => {
    expect(links).toEqual(tools_read_latest().map((t) => `${SITE_URL}/${t.slug}`));
    for (const tool of TOOLS.filter((t) => !t.published)) expect(xml).not.toContain(`/${tool.slug}<`);
  });

  it("항목 제목·설명은 카드의 name·blurb 그대로다(새 문장 없음)", () => {
    tools_read_latest().forEach((tool, i) => {
      expect(items[i]).toContain(`<title>${feed_escape_text(tool.name)}</title>`);
      expect(items[i]).toContain(`<description>${feed_escape_text(tool.blurb)}</description>`);
    });
  });

  it("주소는 끝 빗금 없이(trailingSlash: never), guid도 같은 주소", () => {
    for (const b of items) {
      const link = b.match(/<link>([^<]*)<\/link>/)[1];
      expect(link.endsWith("/")).toBe(false);
      expect(b).toContain(`<guid isPermaLink="true">${link}</guid>`);
    }
  });

  it("자기 주소(atom:link self)가 SITE_FEED_PATH를 가리킨다", () => {
    expect(xml).toContain(`<atom:link href="${SITE_URL}${SITE_FEED_PATH}" rel="self"`);
  });

  it("날짜 요소는 넣지 않는다(발행일 정의 보류)", () => {
    expect(xml).not.toMatch(/<pubDate>|<lastBuildDate>/);
  });

  it("XML 특수 글자를 바꿔 쓴다", () => {
    expect(feed_escape_text(`Simpson's <a> & "b"`)).toBe("Simpson&apos;s &lt;a&gt; &amp; &quot;b&quot;");
    expect(xml.replace(/&(amp|lt|gt|quot|apos);/g, "")).not.toMatch(/&/);
  });
});
