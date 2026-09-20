// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

import { fileURLToPath } from "node:url";

/**
 * 경로 별칭. 페이지가 `src/pages/<slug>.astro`에 있든
 * `src/pages/<slug>/index.astro`에 있든 **import 문자열이 같다.**
 * 별칭이 없으면 페이지를 폴더로 옮기는 순간 UNRESOLVED_IMPORT로 빌드가 죽는다.
 * `tsconfig.json`의 paths와 **같은 내용이어야 한다** — 저쪽은 에디터용, 이쪽은 빌드용.
 */
const ALIAS_ROOT = (p) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  vite: {
    resolve: {
      alias: {
        "@layouts": ALIAS_ROOT("./src/layouts"),
        "@components": ALIAS_ROOT("./src/components"),
        "@data": ALIAS_ROOT("./src/data"),
        "@widgets": ALIAS_ROOT("./src/widgets"),
        "@styles": ALIAS_ROOT("./src/styles"),
      },
    },
  },
  site: 'https://whatifbench.com',
  integrations: [sitemap()],
  trailingSlash: 'never',
});
