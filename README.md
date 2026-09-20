# whatifbench.com

Astro 정적 사이트. 개인 운영.

```bash
npm install          # prepare가 git 훅 경로를 .githooks로 맞춘다
npm run dev          # localhost:4321
npm test             # Vitest
npm run build        # dist/
npm run check:full   # 빌드 + 푸시 게이트
```

규약은 `CLAUDE.md`. main 푸시 = Cloudflare Pages 자동 배포.
`git push`는 `.githooks/pre-push`가 게이트를 돌려 검수 안 된 페이지를 막는다.
