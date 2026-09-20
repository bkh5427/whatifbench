/**
 * 위젯 공통 — 캔버스 준비.
 *
 * 여기만 DOM을 만진다. 계산은 아무것도 하지 않는다.
 */

/** 고DPI 화면에서 백킹 스토어를 키우되 이 배수까지만. 없으면 3배 화면에서 메모리가 튄다. */
export const CANVAS_MAX_PIXEL_RATIO = 2;

/**
 * CSS 변수에서 색을 읽는다. 변수를 못 읽으면 하드코딩 폴백.
 * 폴백이 없으면 테마가 바뀌었을 때 그래프가 통째로 무색이 된다.
 */
export function canvas_read_css_color(rootEl, variableName, fallbackColor) {
  if (typeof getComputedStyle !== 'function' || !rootEl) return fallbackColor;
  const value = getComputedStyle(rootEl).getPropertyValue(variableName).trim();
  return value || fallbackColor;
}

/**
 * 캔버스의 백킹 스토어를 devicePixelRatio에 맞춰 잡고 컨텍스트를 CSS 픽셀 좌표로 되돌린다.
 * 반환값의 width/height는 **CSS 픽셀**이다 — 그리는 쪽은 픽셀비를 몰라도 된다.
 * 캔버스가 화면에 없어 폭이 0이면 null. 이때 호출자는 그리지 말고 돌아가야 한다.
 */
export function canvas_setup_context(canvasEl, cssHeight) {
  if (!canvasEl || typeof canvasEl.getContext !== 'function') return null;
  const context = canvasEl.getContext('2d');
  if (!context) return null;

  const cssWidth = canvasEl.clientWidth || canvasEl.parentElement?.clientWidth || 0;
  if (!(cssWidth > 0) || !(cssHeight > 0)) return null;

  const pixelRatio = Math.min(
    (typeof window !== 'undefined' && window.devicePixelRatio) || 1,
    CANVAS_MAX_PIXEL_RATIO,
  );
  canvasEl.width = Math.round(cssWidth * pixelRatio);
  canvasEl.height = Math.round(cssHeight * pixelRatio);
  canvasEl.style.height = `${cssHeight}px`;
  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  context.clearRect(0, 0, cssWidth, cssHeight);

  return { context, width: cssWidth, height: cssHeight, pixelRatio };
}

/** 아이콘 path가 그려진 좌표계의 한 변. 모든 도형이 이 안에 들어온다. */
export const CANVAS_ICON_VIEWBOX = 24;
/** 아이콘 선 굵기 (24 좌표계 기준). */
export const CANVAS_ICON_STROKE_WIDTH = 1.7;

/**
 * SVG path 문자열을 캔버스에 아이콘으로 그린다.
 * (centreX, centreY)를 중심으로 size×size 크기에 맞춰 넣는다.
 *
 * 아이콘을 글자 대신 쓰는 이유는 폭이다 — 라벨 하나가 50px을 먹는 자리에
 * 도형은 16px이면 된다. 그래서 붙어 있는 기준점들이 살아남는다.
 *
 * `Path2D`가 없는 환경(구형 브라우저, jsdom)에서는 조용히 아무것도 안 그린다 —
 * 아이콘이 없다고 위젯이 죽으면 안 된다. 이름은 표와 aria-label이 이미 들고 있다.
 */
export function canvas_draw_icon(context, icon, centreX, centreY, size) {
  if (!context || typeof Path2D !== 'function' || !icon || !icon.fill) return false;
  const scale = size / CANVAS_ICON_VIEWBOX;
  context.save();
  context.translate(centreX - size / 2, centreY - size / 2);
  context.scale(scale, scale);
  context.fill(new Path2D(icon.fill));
  if (icon.stroke) {
    // 선 굵기는 좌표계 안에서 정한다. 축소돼도 면과 선의 비율이 유지된다.
    context.strokeStyle = context.fillStyle;
    context.lineWidth = CANVAS_ICON_STROKE_WIDTH;
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.stroke(new Path2D(icon.stroke));
  }
  context.restore();
  return true;
}
