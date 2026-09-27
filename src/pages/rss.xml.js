// RSS 피드 파일(/rss.xml). 빌드할 때 한 번 만들어지는 정적 파일이다.
// 내용과 규칙은 `src/data/feed.js`에 있다 — 여기는 파일로 내보내기만 한다.
import { feed_build_xml, FEED_CONTENT_TYPE } from "../data/feed.js";

export function GET({ site }) {
  return new Response(feed_build_xml({ siteUrl: site }), { headers: { "Content-Type": FEED_CONTENT_TYPE } });
}
