/**
 * 위젯 배치 — 조작부와 결과를 한 화면에 함께 보이게 한다.
 *
 * 위젯은 지금까지 조작부·결과·표를 한 줄로 세로로 쌓았다. 그러면 슬라이더를 움직일 때
 * 바뀌는 숫자가 화면 밖에 있다(2026-09-26 점검: 여섯 편 모두 위젯 높이가 화면 2~5장,
 * 조작부 대부분에서 결과가 같은 화면에 없음).
 *
 * 이 함수는 위젯이 만든 자식 요소를 **순서를 바꾸지 않고** 세 무리로 나눠 감싼다.
 *   ① 조작부  — `.widget-controls`, `.widget-presets`
 *   ② 결과    — 그 밖의 요소 중 첫 표(`.widget-table-scroll`)보다 앞에 있는 것
 *   ③ 자세히  — 첫 표와 그 뒤의 요소 전부
 * 넓은 화면(CSS)에서는 ①을 왼쪽, ②를 오른쪽에 두고 ②를 화면에 붙인다(sticky).
 * 좁은 화면에서는 ②의 판정 문장(`.verdict`)을 맨 위에 붙이고 나머지는 원래 순서다.
 *
 * 무리 안의 순서는 그대로다 — 위젯 문구의 "above/below"가 가리키는 대상이 바뀌지 않는다.
 * 위젯은 DOM을 다 붙인 직후, 첫 그리기 전에 이 함수를 부른다(캔버스 폭이 새 칸 폭으로 잡힌다).
 */

// ── 클래스 이름 ────────────────────────────────────────────
export const LAYOUT_CLASS_SPLIT = 'widget-split';
export const LAYOUT_CLASS_CONTROLS = 'widget-split-controls';
export const LAYOUT_CLASS_RESULTS = 'widget-split-results';
export const LAYOUT_CLASS_DETAILS = 'widget-split-details';

/** 조작부로 옮기는 요소. */
const LAYOUT_CONTROL_SELECTOR = '.widget-controls, .widget-presets';
/** 여기부터는 자세히 칸 — 긴 표는 옆 칸에 붙여 둘 수 없다. */
const LAYOUT_DETAILS_START_SELECTOR = '.widget-table-scroll';
/** 제자리(위젯 맨 위)에 남기는 요소 — 화면 읽기용 제목, noscript. */
const LAYOUT_KEEP_SELECTOR = 'noscript, .sr-only';
/** 결과 칸을 화면에 붙이는 표시 클래스. 결과가 화면 높이에 들어갈 때만 붙인다 —
 *  화면보다 긴 칸을 붙이면 아래쪽이 끝까지 가려진다. */
export const LAYOUT_CLASS_STICKY = 'is-sticky';
/** 결과 칸 위아래에 남기는 여백(px) — 스티키 머리말 높이 포함. global.css --widget-sticky-top(5.25rem)과 맞춘다. */
const LAYOUT_STICKY_TOP_REM = 5.25;
const LAYOUT_REM_PX = 16;
const LAYOUT_STICKY_BOTTOM_GAP_PX = 16;
const LAYOUT_STICKY_RESERVE_PX = LAYOUT_STICKY_TOP_REM * LAYOUT_REM_PX + LAYOUT_STICKY_BOTTOM_GAP_PX;

/**
 * @param {HTMLElement} rootEl  위젯 루트(`.widget`)
 * @returns {{split: HTMLElement, controls: HTMLElement, results: HTMLElement, details: HTMLElement} | null}
 *   조작부나 결과가 하나도 없으면 아무것도 바꾸지 않고 null.
 */
export function layout_split(rootEl) {
  if (!rootEl || typeof document === 'undefined') return null;
  const children = [...rootEl.children];
  const detailsIndex = children.findIndex((el) => el.matches?.(LAYOUT_DETAILS_START_SELECTOR));
  const head = detailsIndex === -1 ? children : children.slice(0, detailsIndex);
  const tail = detailsIndex === -1 ? [] : children.slice(detailsIndex);

  const kept = head.filter((el) => el.matches?.(LAYOUT_KEEP_SELECTOR));
  const controls = head.filter((el) => !kept.includes(el) && el.matches?.(LAYOUT_CONTROL_SELECTOR));
  const results = head.filter((el) => !kept.includes(el) && !controls.includes(el));
  if (controls.length === 0 || results.length === 0) return null;

  const split = document.createElement('div');
  split.className = LAYOUT_CLASS_SPLIT;
  const controlsBox = document.createElement('div');
  controlsBox.className = LAYOUT_CLASS_CONTROLS;
  const resultsBox = document.createElement('div');
  resultsBox.className = LAYOUT_CLASS_RESULTS;
  const detailsBox = document.createElement('div');
  detailsBox.className = LAYOUT_CLASS_DETAILS;

  controlsBox.append(...controls);
  resultsBox.append(...results);
  // DOM 순서는 조작부 → 결과(키보드·화면 읽기 순서). 보이는 자리는 CSS가 정한다.
  split.append(controlsBox, resultsBox);
  detailsBox.append(...tail);

  rootEl.append(split);
  if (tail.length > 0) rootEl.append(detailsBox);
  layout_watch_sticky(resultsBox);
  return { split, controls: controlsBox, results: resultsBox, details: detailsBox };
}

/**
 * 결과 칸을 화면에 붙인다. 높이가 바뀔 때마다 다시 본다.
 * - 화면에 들어가면 머리말 밑(CSS --widget-sticky-top)에 붙인다.
 * - 화면보다 길면 **아래끝**을 화면 바닥에 붙인다(top을 음수로) — 조작부를 내려 읽는 동안
 *   결과 칸도 같이 내려가다가 마지막 카드가 보이는 자리에서 멈춘다. 위끝에 붙이면 아래쪽이 끝까지 가려진다.
 * @returns {boolean} 결과 칸 전체가 화면에 들어가는가
 */
export function layout_check_sticky(resultsBox, viewportHeight) {
  const height = resultsBox.offsetHeight;
  const fits = height > 0 && height <= viewportHeight - LAYOUT_STICKY_RESERVE_PX;
  resultsBox.classList.toggle(LAYOUT_CLASS_STICKY, height > 0);
  if (resultsBox.style) resultsBox.style.top = fits ? '' : `${viewportHeight - height - LAYOUT_STICKY_BOTTOM_GAP_PX}px`;
  return fits;
}

function layout_watch_sticky(resultsBox) {
  if (typeof window === 'undefined') return;
  const check = () => layout_check_sticky(resultsBox, window.innerHeight);
  if (typeof window.ResizeObserver === 'function') new window.ResizeObserver(check).observe(resultsBox);
  window.addEventListener?.('resize', check);
  check();
}
