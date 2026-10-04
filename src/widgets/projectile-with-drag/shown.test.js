/**
 * 항력 포함 포물선 — **화면에 찍히는 숫자 문자열**을 독립 오라클과 대조한다.
 *
 * 이 파일이 막으려는 사고는 한 종류다: **화면의 글자가 참값과 다르다.**
 * 모델의 적분기가 엇나가도, 표시 단계가 자릿수를 바꿔도 곡선과 배지 색은 그럴듯하게 남는다.
 * 독자가 읽는 것은 카드·표·배너·캡션의 글자다.
 *
 * 검사 방식 (규칙 L-ORACLE):
 *   ⓐ 오라클은 model.js의 **어떤 계산 함수도 import하지 않는다.** 표시 함수 경로에도
 *      모델 결과를 넣지 않는다 — 넣는 값은 오라클의 참값이다(아래 ⓓ).
 *      model.js에서 읽는 것은 데이터뿐이다: 슬라이더 min/max/step/기본값, 로그 축의
 *      칸 범위(indexMin·indexMax·perDecade), 프리셋 값, 판정 문턱(1°·5°), 스윕 점 개수.
 *   ⓑ 항력 경로는 모델과 **다른 정식화**로 푼다. 모델은 시간 t로 RK4를 밟는다.
 *      오라클은 비행경로각 ψ를 독립변수로 쓴다. 이차 항력에서 수평 속도 u = v·cosψ는
 *      닫힌형이다(호도그래프):
 *          1/u² = 1/u₀² + (k/g)·(F(ψ₀) − F(ψ)),   F(ψ) = secψ·tanψ + ln(secψ + tanψ)
 *      변수를 w = asinh(tanψ)로 바꾸면 F = sinh w·cosh w + w이고, 나머지는 w에 대한
 *      매끄러운 1차원 적분이다:
 *          dt = u·cosh w / g · dw,  dx = u²·cosh w / g · dw,  dy = u²·sinh w·cosh w / g · dw
 *      정점은 w = 0(ψ = 0), 착지는 ∫ dy = 0인 w_L을 뉴턴(이등분 안전장치)으로 푼다.
 *      적분은 10점 가우스–르장드르(마디는 여기서 뉴턴으로 직접 구한다)를 적응 이분한다.
 *      90°는 수직 닫힌형, 0°는 정의상 0, 항력이 없으면(ρ·Cd = 0) 진공 닫힌형이다.
 *      최적각은 황금분할(1e-7 rad) 뒤 대칭 세 점 포물선 꼭짓점을 h, h/2, h/4로 구해
 *      리처드슨 외삽을 두 번 하고, 두 외삽값의 차이를 오차로 잡는다.
 *   ⓒ **오차 한계(명시).** 적분 하나의 한계 = Σ|GL(패널) − GL(두 반쪽)| (받아들인 패널마다;
 *      받아들인 값은 반쪽 합이라 실제 오차는 이보다 2²⁰배 가까이 작다) + 1e-14·Σ|피적분|.
 *      착지점 w_L의 한계 = (정점 높이 한계 + 하강 적분 한계 + 잔차)/|dy/dw|(w_L)이고,
 *      사거리·시간·착지 속력은 여기에 dx/dw·dt/dw·dV/dw를 곱해 더한다.
 *      최적각의 한계 = |외삽₁ − 외삽₂| + 사거리 한계가 꼭짓점 식으로 번지는 몫.
 *      닫힌형(진공·수직)은 1e-14 상대. 한계가 정직한지는 '오라클 자체'에서
 *      패널 폭 1/4·허용오차 1/100로 다시 풀어 그 차이가 한계 안에 드는 것으로 확인한다.
 *   ⓓ 피검 대상은 두 경로다.
 *      · 표시 함수 경로: widget.js가 export한 display_* 함수에 **오라클의 참값**으로 만든
 *        요약·스윕 객체를 넣는다. 자릿수·문구·분기(합쳐짐/구분 불가/일반, 판정 문턱,
 *        1 m 자릿수 전환, 단수·복수, 0 차이의 부호)를 본다. 6개 조작의 (양 끝, 기본값)
 *        전수 곱 3⁶ = 729상태 + 프리셋 + 반 칸 각도.
 *      · 마운트 경로: 위젯을 DOM 스텁에 **실제로 붙이고** 슬라이더를 옮겨 change를
 *        발화시키거나 프리셋 버튼을 눌러 화면 글자를 읽는다. 모델의 적분기까지 포함한
 *        전 사슬을 본다. 상태 하나에 모델이 궤적을 백 번 남짓 적분하므로(약 20 ms)
 *        격자를 줄였다: 각도 3 × 속력 3 × 공기 조합 16(기본값, 네 조작의 양 끝 하나씩,
 *        k 최대·최소 구석, 전부 최소·전부 최대, 형상 프리셋 셋) + 반 칸 각도 3.
 *        프리셋은 버튼 클릭으로, 양 끝은 URL로도 띄운다.
 *   ⓔ **경계 정책.** 참값이 오차 한계 안에서 반올림 경계(…5)나 분기 문턱(1 m 자릿수,
 *      0.05 m 구분 불가, 1°·5° 판정)에 걸리면 그 상태는 "경계, 판정 안 함"으로 세고
 *      비교하지 않는다. 경계 상태 수는 콘솔에 남기고, 상태의 1%를 넘으면 실패한다 —
 *      오라클 한계가 부풀어 전부 경계로 빠지면 검사가 아니기 때문이다.
 *   ⓕ 표기 자릿수와 문구 틀은 **이 파일의 명세**다 (위젯이 바꾸면 걸리는 것이 맞다):
 *        m 1자리(|값| < 1 m면 2자리, 반올림 전 값으로 고른다) · s 2자리 · m/s 1자리 ·
 *        각도 1자리 + "°" · 잃은 비율 정수 % · Cd 2자리 · ρ 3자리 · 질량 1 kg 미만 g 1자리,
 *        이상 kg 3자리 · 면적 유효 4자리 지수 표기 + 등가 구 지름 정수 mm ·
 *        차이 칸은 반올림해 0이면 부호 없이, 아니면 "−"(U+2212).
 *        로그 슬라이더 값은 유효 6자리. 궤적 그림 축 끝 = 진공 사거리×1.02(가로)·진공 정점×1.1(세로), 최소 1 m.
 *        경우 나누기: 공기항 0 / 0° / 90° / 사거리 차·정점 차 둘 다 0.05 m 미만 / 그 밖.
 *        스윕 캡션의 "worth about"은 1° 스윕 격자에서 가장 가까운 점(동률이면 작은 각).
 *        (2026-10-03, B6 2회차) 반올림해 0이 되는 시간 차·잃은 비율·최적각 이동은 숫자 0 대신
 *        "less than 0.01 s / 1% / 0.1 degrees". barely·안 갈리는 90° 캡션은 사거리·정점 차만 말한다.
 *        축 캡션의 "호의 모양" 문장은 0°·90°에서 뺀다. 질량 힌트는 시작 공기(Cd·지름·ρ)를 조건으로 적는다.
 *        (2026-10-03, B6 3회차) "호의 모양" 문장은 그 사이 각도에서도 그려진 진공 정점이 1 px 이상이고
 *        두 축의 px/m 비가 10% 이상 다를 때만 붙는다(그림 822×230 px — 스텁 폭 900에서 여백을 뺀 크기).
 *
 * 비교에서 빼는 것: 캔버스 눈금 라벨(fillText). 1-2-5 눈금 간격과 글자 폭으로 겹치는
 * 라벨을 버리는 **그림의 판단**이지 참값의 표기가 아니다. 축 끝값은 캡션에서 대조한다.
 */
import { describe, it, expect } from 'vitest';
import {
  PROJECTILE_GRAVITY_MS2,
  PROJECTILE_VACUUM_OPTIMUM_ANGLE_DEG,
  PROJECTILE_ANGLE_MIN_DEG,
  PROJECTILE_ANGLE_MAX_DEG,
  PROJECTILE_ANGLE_STEP_DEG,
  PROJECTILE_ANGLE_DEFAULT_DEG,
  PROJECTILE_SPEED_MIN_MS,
  PROJECTILE_SPEED_MAX_MS,
  PROJECTILE_SPEED_STEP_MS,
  PROJECTILE_SPEED_DEFAULT_MS,
  PROJECTILE_MASS_MIN_KG,
  PROJECTILE_MASS_MAX_KG,
  PROJECTILE_DRAG_MIN,
  PROJECTILE_DRAG_MAX,
  PROJECTILE_DRAG_STEP,
  PROJECTILE_DRAG_DEFAULT,
  PROJECTILE_DENSITY_MIN_KGM3,
  PROJECTILE_DENSITY_MAX_KGM3,
  PROJECTILE_DENSITY_STEP_KGM3,
  PROJECTILE_DENSITY_DEFAULT_KGM3,
  PROJECTILE_MASS_AXIS,
  PROJECTILE_AREA_AXIS,
  PROJECTILE_PRESETS,
  PROJECTILE_SWEEP_POINT_COUNT,
  PROJECTILE_VERDICT_EDGE_MIN_SHIFT_DEG,
  PROJECTILE_VERDICT_BREAK_MIN_SHIFT_DEG,
} from './model.js';
import {
  widget_mount,
  url_read_state,
  url_write_state,
  display_format_metres,
  display_format_seconds,
  display_format_speed,
  display_format_angle,
  display_format_mass,
  display_format_area,
  display_format_gap,
  display_describe_verdict,
  display_describe_path,
  display_describe_sweep,
} from './widget.js';
import { fixture_create_dom } from '../_shared/dom-stub.js';

// ── 오라클 상수 (모델과 따로 적는다) ─────────────────────────
/** 표준 중력가속도. 3차 CGPM(1901) 채택값. 모델 상수와 같은지는 '오라클 자체'에서 본다. */
const REFERENCE_GRAVITY_MS2 = 9.80665;
/** 항력식의 ½. k = ρ·Cd·A / (2m). */
const REFERENCE_DRAG_HALF = 0.5;
const REFERENCE_DEGREES_PER_RADIAN = 180 / Math.PI;
const REFERENCE_RIGHT_ANGLE_RAD = Math.PI / 2;

// ── 적분기 설정 ──────────────────────────────────────────────
/** 가우스–르장드르 점 수. 패널 하나가 19차 다항식까지 정확하다. */
const REFERENCE_GAUSS_ORDER = 10;
/** 르장드르 근 뉴턴 반복 상한과 수렴 문턱. */
const REFERENCE_GAUSS_NEWTON_MAX = 100;
const REFERENCE_GAUSS_NEWTON_TOLERANCE = 1e-16;
/** 기본 패널 폭(w 단위). 그 안에서 적응 이분이 경계층(정점 근처 급감속)을 잡는다. */
const REFERENCE_PANEL_WIDTH = 0.125;
const REFERENCE_PANEL_MIN_COUNT = 4;
/** 이분 문턱 = 이 배수 × 구간 전체의 Σ|피적분|. 사전 추정은 패널 수의 이 배수로. */
const REFERENCE_TOLERANCE_FACTOR = 1e-14;
const REFERENCE_SCALE_PANEL_MULTIPLE = 4;
/** 부동소수 합산의 바닥: 이 배수 × Σ|피적분|을 한계에 더한다. */
const REFERENCE_FLOOR_FACTOR = 1e-14;
const REFERENCE_ADAPT_DEPTH_MAX = 40;
/** 착지 뉴턴: 반복 상한, 잔차 문턱(정점 높이 대비). */
const REFERENCE_LANDING_ITERATIONS = 100;
const REFERENCE_LANDING_RESIDUAL = 1e-14;
/** 착지 속력 미분을 잡는 w 간격. */
const REFERENCE_SLOPE_STEP_W = 1e-6;
/** 닫힌형 한계(상대). 몇 번의 부동소수 연산뿐이라 넉넉하다. */
const REFERENCE_CLOSED_FORM_RELATIVE = 1e-14;
/** 어떤 값이든 이 상대 크기 아래로는 한계를 잡지 않는다(반올림 판정의 부동소수 여유). */
const REFERENCE_MIN_RELATIVE_BOUND = 1e-15;

/** 최적각: 황금분할 종료 폭(rad)과 포물선 반폭(rad). */
const REFERENCE_GOLDEN_TOLERANCE_RAD = 1e-7;
const REFERENCE_GOLDEN_INVERSE = (Math.sqrt(5) - 1) / 2;
const REFERENCE_VERTEX_HALF_WIDTH_RAD = 0.004;

/** 오라클을 다시 풀어 한계를 검증할 때의 촘촘한 설정. */
const REFERENCE_SETTINGS = {
  panelWidth: REFERENCE_PANEL_WIDTH,
  toleranceFactor: REFERENCE_TOLERANCE_FACTOR,
};
const REFERENCE_TIGHT_SETTINGS = {
  panelWidth: REFERENCE_PANEL_WIDTH / 4,
  toleranceFactor: REFERENCE_TOLERANCE_FACTOR / 100,
};

// ── 오라클 표기 명세 ─────────────────────────────────────────
const MINUS = '−';
const REFERENCE_METRE_DIGITS = 1;
const REFERENCE_METRE_SMALL_DIGITS = 2;
const REFERENCE_METRE_SMALL_THRESHOLD = 1;
const REFERENCE_SECOND_DIGITS = 2;
const REFERENCE_SPEED_DIGITS = 1;
const REFERENCE_ANGLE_DIGITS = 1;
const REFERENCE_PERCENT_DIGITS = 0;
const REFERENCE_PERCENT_SCALE = 100;
const REFERENCE_DRAG_DIGITS = 2;
const REFERENCE_DENSITY_DIGITS = 3;
const REFERENCE_MASS_GRAM_DIGITS = 1;
const REFERENCE_MASS_KG_DIGITS = 3;
const REFERENCE_MASS_GRAM_CEILING_KG = 1;
const REFERENCE_GRAMS_PER_KG = 1000;
/** kg → g은 소수점을 세 칸 옮기는 것이다(십진 문자열 산술용). */
const REFERENCE_GRAM_SHIFT = String(REFERENCE_GRAMS_PER_KG).length - 1;
const REFERENCE_MM_PER_M = 1000;
const REFERENCE_AREA_SIGNIFICANT = 4;
const REFERENCE_LOG_SIGNIFICANT = 6;
const REFERENCE_SPAN_RIGHT_RATIO = 1.02;
const REFERENCE_SPAN_TOP_RATIO = 1.1;
const REFERENCE_SPAN_MIN_M = 1;
const REFERENCE_MERGE_LIMIT_M = 0.05;
const REFERENCE_MERGE_LIMIT_TEXT = '0.05';
/** 표시 해상도 문구(명세, 2026-10-03): 반올림해 0이 된 차이는 "이보다 작다"로 적는다. s 2자리 · % 정수 · 각도 1자리. */
const REFERENCE_SECOND_RESOLUTION_TEXT = '0.01';
const REFERENCE_PERCENT_RESOLUTION_TEXT = '1';
const REFERENCE_ANGLE_RESOLUTION_TEXT = '0.1';
const REFERENCE_SUPERSCRIPT = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
const REFERENCE_NAME_VACUUM = 'In a vacuum';
const REFERENCE_VERDICT_HEADLINE = {
  hold: 'In this model 45° is still the angle to beat.',
  edge: 'In this model the best angle has left 45°.',
  break: 'In this model 45° is not close to the best angle.',
};
const REFERENCE_TABLE_ROWS = [
  { key: 'range', name: 'Range', unit: 'm' },
  { key: 'apex', name: 'Highest point', unit: 'm' },
  { key: 'time', name: 'Time in the air', unit: 's' },
  { key: 'landing', name: 'Speed on landing', unit: 'm/s' },
];

/** 스텁 캔버스의 CSS 폭. 0이면 차트가 안 그려져 캡션이 축을 인용하지 않는다. */
const STUB_WIDTH_PX = 900;
/**
 * 궤적 그림의 크기(명세, 2026-10-03 B6 3회차) — 캔버스 높이 300 px, 여백 위 16·아래 54·왼쪽 60·오른쪽 18 px.
 * 그림 폭 = 스텁 폭 − 좌우 여백. "호의 모양" 문장의 판정이 이 크기와 축 끝으로 그려진 정점 높이·축척을 잰다.
 */
const REFERENCE_PATH_CANVAS_HEIGHT_PX = 300;
const REFERENCE_PATH_PAD_TOP_PX = 16;
const REFERENCE_PATH_PAD_BOTTOM_PX = 54;
const REFERENCE_PATH_PAD_LEFT_PX = 60;
const REFERENCE_PATH_PAD_RIGHT_PX = 18;
const REFERENCE_PATH_PLOT_WIDTH_PX = STUB_WIDTH_PX - REFERENCE_PATH_PAD_LEFT_PX - REFERENCE_PATH_PAD_RIGHT_PX;
const REFERENCE_PATH_PLOT_HEIGHT_PX = REFERENCE_PATH_CANVAS_HEIGHT_PX - REFERENCE_PATH_PAD_TOP_PX - REFERENCE_PATH_PAD_BOTTOM_PX;
/** "호의 모양" 문장(명세): 그려진 진공 정점이 1 px 미만이면 없다. 두 축의 px/m 비(큰 쪽/작은 쪽 − 1)가 0.1 미만이면 없다. */
const REFERENCE_ARC_MIN_HEIGHT_PX = 1;
const REFERENCE_SCALE_MISMATCH_MIN = 0.1;
const MISMATCH_SAMPLE_MAX = 8;
/** 경계로 빠져도 되는 상태의 상한(비율). 넘으면 오라클 한계가 부푼 것이다. */
const BOUNDARY_FRACTION_MAX = 0.01;
const LONG_TIMEOUT_MS = 120000;

// ── 가우스–르장드르 ─────────────────────────────────────────

/** P_n(x)와 P_{n−1}(x). 세 항 점화식. */
function reference_calculate_legendre(order, x) {
  let previous = 1;
  let current = x;
  for (let degree = 2; degree <= order; degree += 1) {
    const next = ((2 * degree - 1) * x * current - (degree - 1) * previous) / degree;
    previous = current;
    current = next;
  }
  return { current, previous };
}

/** [−1, 1]의 마디와 가중치. 근은 체비쇼프 근사에서 뉴턴으로 다듬는다. */
function reference_build_gauss_legendre(order) {
  const nodes = [];
  const weights = [];
  for (let index = 1; index <= order; index += 1) {
    let x = Math.cos((Math.PI * (index - 0.25)) / (order + 0.5));
    for (let step = 0; step < REFERENCE_GAUSS_NEWTON_MAX; step += 1) {
      const { current, previous } = reference_calculate_legendre(order, x);
      const slope = (order * (x * current - previous)) / (x * x - 1);
      const shift = current / slope;
      x -= shift;
      if (Math.abs(shift) < REFERENCE_GAUSS_NEWTON_TOLERANCE) break;
    }
    const { current, previous } = reference_calculate_legendre(order, x);
    const slope = (order * (x * current - previous)) / (x * x - 1);
    nodes.push(x);
    weights.push(2 / ((1 - x * x) * slope * slope));
  }
  return { nodes, weights };
}
const REFERENCE_GAUSS = reference_build_gauss_legendre(REFERENCE_GAUSS_ORDER);

// ── w 정식화 적분기 ──────────────────────────────────────────

/** 비행 하나의 상수. u₀ = v·cosθ, w₀ = asinh(tanθ). */
function reference_build_hodograph(thetaRad, speed, dragFactor) {
  const u0 = speed * Math.cos(thetaRad);
  const w0 = Math.asinh(Math.tan(thetaRad));
  return {
    inverseU0Squared: 1 / (u0 * u0),
    dragOverGravity: dragFactor / REFERENCE_GRAVITY_MS2,
    shapeAtLaunch: Math.sinh(w0) * Math.cosh(w0) + w0,
    w0,
  };
}

/** w 한 점의 u²·u·sinh·cosh. */
function reference_read_hodograph_point(hodograph, w) {
  const sinh = Math.sinh(w);
  const cosh = Math.cosh(w);
  const shape = sinh * cosh + w;
  const uSquared = 1 / (hodograph.inverseU0Squared + hodograph.dragOverGravity * (hodograph.shapeAtLaunch - shape));
  return { sinh, cosh, uSquared, u: Math.sqrt(uSquared) };
}

/** 패널 하나의 GL 적분 (t, x, y 동시에) + Σ|피적분|. */
function reference_calculate_panel(hodograph, low, high) {
  const middle = (low + high) / 2;
  const half = (high - low) / 2;
  let time = 0;
  let across = 0;
  let up = 0;
  let scale = 0;
  for (let index = 0; index < REFERENCE_GAUSS_ORDER; index += 1) {
    const point = reference_read_hodograph_point(hodograph, middle + half * REFERENCE_GAUSS.nodes[index]);
    const weight = (REFERENCE_GAUSS.weights[index] * half) / REFERENCE_GRAVITY_MS2;
    const dt = weight * point.u * point.cosh;
    const dx = weight * point.uSquared * point.cosh;
    const dy = dx * point.sinh;
    time += dt;
    across += dx;
    up += dy;
    scale += Math.abs(dt) + Math.abs(dx) + Math.abs(dy);
  }
  return { time, across, up, scale };
}

/** 적응 이분. 받아들인 패널은 반쪽 합을 쓰고, 통째와의 차이를 한계에 더한다. */
function reference_calculate_adaptive(hodograph, low, high, whole, depth, tolerance, sum) {
  const middle = (low + high) / 2;
  const left = reference_calculate_panel(hodograph, low, middle);
  const right = reference_calculate_panel(hodograph, middle, high);
  const gapTime = Math.abs(left.time + right.time - whole.time);
  const gapAcross = Math.abs(left.across + right.across - whole.across);
  const gapUp = Math.abs(left.up + right.up - whole.up);
  if (depth >= REFERENCE_ADAPT_DEPTH_MAX || Math.max(gapTime, gapAcross, gapUp) <= tolerance) {
    sum.time += left.time + right.time;
    sum.across += left.across + right.across;
    sum.up += left.up + right.up;
    sum.errorTime += gapTime;
    sum.errorAcross += gapAcross;
    sum.errorUp += gapUp;
    sum.scale += left.scale + right.scale;
    return;
  }
  reference_calculate_adaptive(hodograph, low, middle, left, depth + 1, tolerance, sum);
  reference_calculate_adaptive(hodograph, middle, high, right, depth + 1, tolerance, sum);
}

/** [low, high]의 ∫dt, ∫dx, ∫dy와 각각의 한계. */
function reference_calculate_integrals(hodograph, low, high, settings) {
  const panels = Math.max(REFERENCE_PANEL_MIN_COUNT, Math.ceil(Math.abs(high - low) / settings.panelWidth));
  const width = (high - low) / panels;
  let rough = 0;
  const roughWidth = (high - low) / (panels * REFERENCE_SCALE_PANEL_MULTIPLE);
  for (let index = 0; index < panels * REFERENCE_SCALE_PANEL_MULTIPLE; index += 1) {
    rough += reference_calculate_panel(hodograph, low + index * roughWidth, low + (index + 1) * roughWidth).scale;
  }
  const tolerance = settings.toleranceFactor * rough;
  const sum = { time: 0, across: 0, up: 0, errorTime: 0, errorAcross: 0, errorUp: 0, scale: 0 };
  for (let index = 0; index < panels; index += 1) {
    const panelLow = low + index * width;
    const panelHigh = low + (index + 1) * width;
    reference_calculate_adaptive(
      hodograph, panelLow, panelHigh, reference_calculate_panel(hodograph, panelLow, panelHigh), 0, tolerance, sum,
    );
  }
  const floor = REFERENCE_FLOOR_FACTOR * sum.scale;
  return {
    time: sum.time,
    across: sum.across,
    up: sum.up,
    errorTime: sum.errorTime + floor,
    errorAcross: sum.errorAcross + floor,
    errorUp: sum.errorUp + floor,
  };
}

/**
 * 0 < θ < 90°, k ≥ 0. 상승 [0, w₀], 하강 [w_L, 0]. 하강 적분이 정점 높이와 같아지는 w_L을 푼다.
 * 반환은 {v, e} — 값과 오차 한계.
 */
function reference_calculate_drag_flight(thetaRad, speed, dragFactor, settings = REFERENCE_SETTINGS) {
  const hodograph = reference_build_hodograph(thetaRad, speed, dragFactor);
  const ascent = reference_calculate_integrals(hodograph, 0, hodograph.w0, settings);
  const apex = ascent.up;
  const descent_read = (wLanding) => -reference_calculate_integrals(hodograph, wLanding, 0, settings).up;
  const slope_read = (wLanding) => {
    const point = reference_read_hodograph_point(hodograph, wLanding);
    return (-point.uSquared * point.sinh * point.cosh) / REFERENCE_GRAVITY_MS2;
  };

  // 괄호: 하강 적분은 w가 내려갈수록 커진다. 진공의 대칭점 −w₀에서 출발해 넘을 때까지 벌린다.
  let above = 0;
  let below = -hodograph.w0;
  while (descent_read(below) < apex) {
    above = below;
    below = below * 2 - 1;
  }
  let wLanding = below;
  for (let step = 0; step < REFERENCE_LANDING_ITERATIONS; step += 1) {
    const miss = descent_read(wLanding) - apex;
    if (Math.abs(miss) <= REFERENCE_LANDING_RESIDUAL * apex) break;
    if (miss > 0) below = wLanding;
    else above = wLanding;
    const next = wLanding + miss / slope_read(wLanding);
    wLanding = next > below && next < above ? next : (below + above) / 2;
  }

  const descent = reference_calculate_integrals(hodograph, wLanding, 0, settings);
  const residual = Math.abs(-descent.up - apex);
  const landingShift = (ascent.errorUp + descent.errorUp + residual) / slope_read(wLanding);
  const point = reference_read_hodograph_point(hodograph, wLanding);
  const above_point = reference_read_hodograph_point(hodograph, wLanding + REFERENCE_SLOPE_STEP_W);
  const below_point = reference_read_hodograph_point(hodograph, wLanding - REFERENCE_SLOPE_STEP_W);
  const speedSlope =
    Math.abs(above_point.u * above_point.cosh - below_point.u * below_point.cosh) / (2 * REFERENCE_SLOPE_STEP_W);
  const landingSpeed = point.u * point.cosh;
  return {
    range: {
      v: ascent.across + descent.across,
      e: ascent.errorAcross + descent.errorAcross + ((point.uSquared * point.cosh) / REFERENCE_GRAVITY_MS2) * landingShift,
    },
    apex: { v: apex, e: ascent.errorUp },
    time: {
      v: ascent.time + descent.time,
      e: ascent.errorTime + descent.errorTime + ((point.u * point.cosh) / REFERENCE_GRAVITY_MS2) * landingShift,
    },
    landing: { v: landingSpeed, e: speedSlope * landingShift + REFERENCE_CLOSED_FORM_RELATIVE * landingSpeed },
  };
}

/** 닫힌형 값 하나를 {v, e}로. */
const reference_create_closed = (value) => ({ v: value, e: REFERENCE_CLOSED_FORM_RELATIVE * Math.abs(value) });

/**
 * 수직 발사(90°), k > 0. 올라갈 때 v² = (g/k)·tan², 내려올 때 tanh — 전부 닫힌형.
 *   H = ln(1 + kv²/g)/(2k),  t↑ = atan(v√(k/g))/√(gk),  t↓ = acosh(√(1 + kv²/g))/√(gk),
 *   착지 속력 = v/√(1 + kv²/g).
 */
function reference_calculate_vertical_flight(speed, dragFactor) {
  const lift = (dragFactor * speed * speed) / REFERENCE_GRAVITY_MS2;
  const rate = Math.sqrt(REFERENCE_GRAVITY_MS2 * dragFactor);
  return {
    range: { v: 0, e: 0 },
    apex: reference_create_closed(Math.log1p(lift) / (2 * dragFactor)),
    time: reference_create_closed(
      (Math.atan(speed * Math.sqrt(dragFactor / REFERENCE_GRAVITY_MS2)) + Math.acosh(Math.sqrt(1 + lift))) / rate,
    ),
    landing: reference_create_closed(speed / Math.sqrt(1 + lift)),
  };
}

/** 반 도 단위 각의 sin·cos. 0°·90°는 정확한 0·1. */
function reference_read_sin_cos(halfDegrees) {
  const degrees = halfDegrees / 2;
  if (degrees === 0) return { sin: 0, cos: 1 };
  if (degrees === 90) return { sin: 1, cos: 0 };
  const radians = degrees / REFERENCE_DEGREES_PER_RADIAN;
  return { sin: Math.sin(radians), cos: Math.cos(radians) };
}

/** 진공 닫힌형. R = 2v²·sinθ·cosθ/g, H = (v·sinθ)²/(2g), T = 2v·sinθ/g, 착지 = v(정확). */
function reference_calculate_vacuum_flight(halfDegrees, speed) {
  const { sin, cos } = reference_read_sin_cos(halfDegrees);
  const rise = speed * sin;
  return {
    range: reference_create_closed((2 * speed * speed * sin * cos) / REFERENCE_GRAVITY_MS2),
    apex: reference_create_closed((rise * rise) / (2 * REFERENCE_GRAVITY_MS2)),
    time: reference_create_closed((2 * rise) / REFERENCE_GRAVITY_MS2),
    landing: { v: speed, e: 0 },
  };
}

/** 각도(반 도)·속력·k에서 항력 경로의 참값. k = 0이면 진공 닫힌형이다. */
function reference_calculate_flight(halfDegrees, speed, dragFactor) {
  if (dragFactor === 0 || halfDegrees === 0) return reference_calculate_vacuum_flight(halfDegrees, speed);
  if (halfDegrees === 180) return reference_calculate_vertical_flight(speed, dragFactor);
  return reference_calculate_drag_flight(halfDegrees / (2 * REFERENCE_DEGREES_PER_RADIAN), speed, dragFactor);
}

const FLIGHT_CACHE = new Map();
function reference_read_flight(halfDegrees, speed, dragFactor) {
  const key = `${halfDegrees}|${speed}|${dragFactor}`;
  if (!FLIGHT_CACHE.has(key)) FLIGHT_CACHE.set(key, reference_calculate_flight(halfDegrees, speed, dragFactor));
  return FLIGHT_CACHE.get(key);
}

/**
 * 최적각. 사거리를 [0, π/2]에서 황금분할로 좁히고, 대칭 세 점 포물선 꼭짓점
 * V(h) = c + h·(R₊ − R₋)/(2·(2R_c − R₊ − R₋))을 h, h/2, h/4에서 구해 리처드슨(h²)을 두 번.
 * 반환: 각도(도)와 그 한계, 그 각도의 사거리와 한계.
 */
function reference_calculate_optimum(speed, dragFactor) {
  if (dragFactor === 0) {
    return {
      angle: { v: PROJECTILE_VACUUM_OPTIMUM_ANGLE_DEG, e: 0 },
      range: reference_create_closed((speed * speed) / REFERENCE_GRAVITY_MS2),
    };
  }
  const range_at = (thetaRad) => reference_calculate_drag_flight(thetaRad, speed, dragFactor).range;
  let low = 0;
  let high = REFERENCE_RIGHT_ANGLE_RAD;
  let innerLow = high - REFERENCE_GOLDEN_INVERSE * (high - low);
  let innerHigh = low + REFERENCE_GOLDEN_INVERSE * (high - low);
  let valueLow = range_at(innerLow).v;
  let valueHigh = range_at(innerHigh).v;
  while (high - low > REFERENCE_GOLDEN_TOLERANCE_RAD) {
    if (valueLow > valueHigh) {
      high = innerHigh;
      innerHigh = innerLow;
      valueHigh = valueLow;
      innerLow = high - REFERENCE_GOLDEN_INVERSE * (high - low);
      valueLow = range_at(innerLow).v;
    } else {
      low = innerLow;
      innerLow = innerHigh;
      valueLow = valueHigh;
      innerHigh = low + REFERENCE_GOLDEN_INVERSE * (high - low);
      valueHigh = range_at(innerHigh).v;
    }
  }
  const centre = (low + high) / 2;
  const atCentre = range_at(centre);
  let rangeBound = atCentre.e;
  const vertex_read = (halfWidth) => {
    const plus = range_at(centre + halfWidth);
    const minus = range_at(centre - halfWidth);
    rangeBound = Math.max(rangeBound, plus.e, minus.e);
    const numerator = plus.v - minus.v;
    const curvature = 2 * atCentre.v - plus.v - minus.v;
    return {
      at: centre + (halfWidth * numerator) / (2 * curvature),
      noise:
        (halfWidth * 2 * rangeBound) / (2 * curvature) +
        (halfWidth * Math.abs(numerator) * 4 * rangeBound) / (2 * curvature * curvature),
      curvature: curvature / (halfWidth * halfWidth),
    };
  };
  const wide = vertex_read(REFERENCE_VERTEX_HALF_WIDTH_RAD);
  const middle = vertex_read(REFERENCE_VERTEX_HALF_WIDTH_RAD / 2);
  const narrow = vertex_read(REFERENCE_VERTEX_HALF_WIDTH_RAD / 4);
  const first = (4 * middle.at - wide.at) / 3;
  const second = (4 * narrow.at - middle.at) / 3;
  const angleBound =
    Math.abs(second - first) + (4 * middle.noise + wide.noise) / 3 + (4 * narrow.noise + middle.noise) / 3;
  const peak = range_at(second);
  return {
    angle: { v: second * REFERENCE_DEGREES_PER_RADIAN, e: angleBound * REFERENCE_DEGREES_PER_RADIAN },
    // 꼭짓점이 한계만큼 비켜 있으면 사거리는 ½·곡률·δ²만큼 낮다.
    range: { v: peak.v, e: peak.e + (Math.abs(narrow.curvature) * angleBound * angleBound) / 2 },
  };
}

const OPTIMUM_CACHE = new Map();
function reference_read_optimum(speed, dragFactor) {
  const key = `${speed}|${dragFactor}`;
  if (!OPTIMUM_CACHE.has(key)) OPTIMUM_CACHE.set(key, reference_calculate_optimum(speed, dragFactor));
  return OPTIMUM_CACHE.get(key);
}

// ── 십진 문자열 산술 (입력값 표기용) ──────────────────────────

/** 십진 문자열 → {digits: BigInt, scale}: 값 = digits × 10^−scale. */
function reference_read_decimal(text) {
  const found = String(text).match(/^(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/i);
  if (!found) throw new Error(`십진 표기가 아니다: ${text}`);
  const fraction = found[2] ?? '';
  let scale = fraction.length - Number(found[3] ?? 0);
  let digits = BigInt(found[1] + fraction);
  if (scale < 0) {
    digits *= 10n ** BigInt(-scale);
    scale = 0;
  }
  return { digits, scale };
}

/** 정수 q를 소수 places자리 고정 문자열로. */
function reference_format_scaled(scaled, places) {
  const body = scaled.toString().padStart(places + 1, '0');
  return places === 0 ? body : `${body.slice(0, body.length - places)}.${body.slice(body.length - places)}`;
}

/** 십진 값 × 10^shift를 소수 places자리로 반올림(0.5는 올림). 동률이면 tie. */
function reference_round_decimal(decimal, shift, places) {
  const scale = decimal.scale - shift;
  if (scale <= places) {
    return { text: reference_format_scaled(decimal.digits * 10n ** BigInt(places - scale), places), tie: false };
  }
  const divisor = 10n ** BigInt(scale - places);
  const quotient = decimal.digits / divisor;
  const rest = (decimal.digits % divisor) * 2n;
  return {
    text: reference_format_scaled(rest >= divisor ? quotient + 1n : quotient, places),
    tie: rest === divisor,
  };
}

/** 양수 십진 값을 유효 n자리로: {mantissaText(꼬리 0 없음), exponent, tie}. */
function reference_round_significant(decimal, significant) {
  const length = decimal.digits.toString().length;
  const exponent = length - 1 - decimal.scale;
  const shift = significant - 1 - exponent; // 값 × 10^shift를 정수로 반올림
  const rounded = reference_round_decimal(decimal, shift, 0);
  let mantissa = BigInt(rounded.text);
  let finalExponent = exponent;
  if (mantissa === 10n ** BigInt(significant)) {
    mantissa /= 10n;
    finalExponent += 1;
  }
  const body = mantissa.toString();
  const text = `${body[0]}${body.length > 1 ? `.${body.slice(1)}` : ''}`.replace(/\.?0+$/, '');
  return { mantissaText: text, exponent: finalExponent, tie: rounded.tie };
}

/** 정수 지수 → "10⁻³". */
const reference_format_exponent = (exponent) =>
  `10${String(exponent)
    .split('')
    .map((digit) => REFERENCE_SUPERSCRIPT[digit])
    .join('')}`;

// ── 로그 슬라이더 (슬라이더의 정의: 기본값 × 10^(칸/perDecade), 양 끝 클립, 유효 6자리) ──

function reference_calculate_log_slider(axis, index) {
  const raw = axis.defaultValue * Math.pow(10, index / axis.perDecade);
  if (raw <= axis.minValue) return { value: axis.minValue, text: String(axis.minValue) };
  if (raw >= axis.maxValue) return { value: axis.maxValue, text: String(axis.maxValue) };
  const exponent = Math.floor(Math.log10(raw));
  const scaled = raw / Math.pow(10, exponent - (REFERENCE_LOG_SIGNIFICANT - 1));
  if (Math.abs(scaled - Math.floor(scaled) - 0.5) < 1e-6) throw new Error(`로그 눈금 ${index}가 6자리 동률 근처다`);
  let mantissa = Math.round(scaled);
  let place = exponent - (REFERENCE_LOG_SIGNIFICANT - 1);
  if (mantissa >= 10 ** REFERENCE_LOG_SIGNIFICANT) {
    mantissa /= 10;
    place += 1;
  }
  const digits = BigInt(mantissa);
  const text =
    place >= 0
      ? (digits * 10n ** BigInt(place)).toString()
      : reference_format_scaled(digits, -place).replace(/\.?0+$/, '');
  return { value: Number(text), text };
}

/** 프리셋 값 → 칸 번호(가장 가까운 칸). */
const reference_calculate_log_index = (axis, value) =>
  Math.round(Math.log10(value / axis.defaultValue) * axis.perDecade);

// ── 오라클: 반올림과 표기 ────────────────────────────────────

/**
 * {v, e}를 소수 places자리로. 참값이 한계 안에서 …5 경계에 닿으면 edges에 칸 이름을 남긴다.
 * 부호는 `toFixed`처럼 반올림 전 값에서 (−0.04 → "-0.0").
 */
function reference_format_fixed(context, field, value, places) {
  const bound = Math.max(value.e, REFERENCE_MIN_RELATIVE_BOUND * Math.abs(value.v));
  const size = Math.abs(value.v);
  const scaled = size * 10 ** places;
  const distance = Math.abs(scaled - Math.floor(scaled) - 0.5) / 10 ** places;
  if (distance <= bound) context.edges.push(field);
  if (value.v < 0 && value.v + bound >= 0) context.edges.push(`${field}:부호`);
  const text = reference_format_scaled(BigInt(Math.round(scaled)), places);
  return { text: `${value.v < 0 ? '-' : ''}${text}`, zero: Math.round(scaled) === 0 };
}

/** 미터. 1 m 미만은 2자리 — 자릿수는 반올림 전 값으로 고른다. */
function reference_format_metres(context, field, value) {
  if (value.e > 0 && Math.abs(Math.abs(value.v) - REFERENCE_METRE_SMALL_THRESHOLD) <= value.e) {
    context.edges.push(`${field}:자릿수`);
  }
  const places = Math.abs(value.v) < REFERENCE_METRE_SMALL_THRESHOLD ? REFERENCE_METRE_SMALL_DIGITS : REFERENCE_METRE_DIGITS;
  return reference_format_fixed(context, field, value, places).text;
}
const reference_format_seconds = (context, field, value) =>
  reference_format_fixed(context, field, value, REFERENCE_SECOND_DIGITS).text;
const reference_format_speed = (context, field, value) =>
  reference_format_fixed(context, field, value, REFERENCE_SPEED_DIGITS).text;
const reference_format_angle = (context, field, value) =>
  `${reference_format_fixed(context, field, value, REFERENCE_ANGLE_DIGITS).text}°`;

/**
 * 차이 칸: 반올림해 0이면 부호 없이, 아니면 "−". 이 격자의 차이(진공 − 항력)는 언제나 0 이상이다.
 * format_value(field, value)는 context를 이미 묶은 표기 함수다.
 */
function reference_format_gap(field, gap, format_value) {
  if (gap.v < -gap.e) throw new Error(`격자 밖: ${field}에서 항력 쪽이 진공보다 크다`);
  const size = { v: Math.abs(gap.v), e: gap.e };
  const text = format_value(field, size);
  const zero = reference_format_fixed({ edges: [] }, field, size, text.split('.')[1]?.length ?? 0).zero;
  return zero ? text : `${MINUS}${text}`;
}

/** 분기 문턱 비교 (값 < 문턱). 한계 안이면 경계. */
function reference_check_below(context, field, value, threshold) {
  if (value.e > 0 && Math.abs(value.v - threshold) <= value.e) context.edges.push(`${field}:문턱`);
  return value.v < threshold;
}

// ── 입력 상태 ────────────────────────────────────────────────
/**
 * 상태는 정수로 들고 다닌다: 각도 반 도, 속력 m/s, 질량·면적 칸 번호, Cd 백분, ρ 천분.
 * 실수로 들고 다니면 "0.47"과 0.47000000000000003이 섞인다.
 */
function reference_build_inputs(state) {
  const mass = reference_calculate_log_slider(PROJECTILE_MASS_AXIS, state.massIndex);
  const area = reference_calculate_log_slider(PROJECTILE_AREA_AXIS, state.areaIndex);
  const dragCoefficient = state.dragHundredths / 100;
  const density = state.densityThousandths / 1000;
  const dragFactor = (REFERENCE_DRAG_HALF * density * dragCoefficient * area.value) / mass.value;
  return {
    angleText: reference_format_scaled(BigInt(state.halfDegrees * 5), 1),
    angleDeg: state.halfDegrees / 2,
    speed: state.speed,
    mass,
    area,
    dragCoefficient,
    dragText: reference_format_scaled(BigInt(state.dragHundredths), REFERENCE_DRAG_DIGITS),
    density,
    densityText: reference_format_scaled(BigInt(state.densityThousandths), REFERENCE_DENSITY_DIGITS),
    hasDrag: state.dragHundredths !== 0 && state.densityThousandths !== 0,
    dragFactor,
  };
}

/** 질량: 1 kg 미만 g 1자리, 이상 kg 3자리. 십진 문자열에서 바로 반올림한다. */
function reference_format_mass(context, field, massText, massValue) {
  const decimal = reference_read_decimal(massText);
  const rounded =
    massValue < REFERENCE_MASS_GRAM_CEILING_KG
      ? reference_round_decimal(decimal, REFERENCE_GRAM_SHIFT, REFERENCE_MASS_GRAM_DIGITS)
      : reference_round_decimal(decimal, 0, REFERENCE_MASS_KG_DIGITS);
  if (rounded.tie) context.edges.push(field);
  return `${rounded.text} ${massValue < REFERENCE_MASS_GRAM_CEILING_KG ? 'g' : 'kg'}`;
}

/** 면적: 유효 4자리 지수 표기 + 같은 넓이 원의 지름(정수 mm). */
function reference_format_area(context, field, areaText, areaValue) {
  const rounded = reference_round_significant(reference_read_decimal(areaText), REFERENCE_AREA_SIGNIFICANT);
  if (rounded.tie) context.edges.push(field);
  const diameterMm = Math.sqrt((4 * areaValue) / Math.PI) * REFERENCE_MM_PER_M;
  const diameter = reference_format_fixed(context, `${field}:지름`, reference_create_closed(diameterMm), 0).text;
  return `${rounded.mantissaText} × ${reference_format_exponent(rounded.exponent)} m² (d = ${diameter} mm sphere)`;
}

// ── 오라클: 한 상태의 화면 ───────────────────────────────────

/** 1° 스윕 격자에서 현재 각도에 가장 가까운 점(동률이면 작은 각). 반 도 단위로 돌려준다. */
function reference_pick_sweep_point(halfDegrees) {
  const gapHalf = ((PROJECTILE_ANGLE_MAX_DEG - PROJECTILE_ANGLE_MIN_DEG) * 2) / (PROJECTILE_SWEEP_POINT_COUNT - 1);
  let best = PROJECTILE_ANGLE_MIN_DEG * 2;
  for (let index = 0; index < PROJECTILE_SWEEP_POINT_COUNT; index += 1) {
    const candidate = PROJECTILE_ANGLE_MIN_DEG * 2 + gapHalf * index;
    if (Math.abs(candidate - halfDegrees) < Math.abs(best - halfDegrees)) best = candidate;
  }
  return best;
}

/** 진공 스윕 곡선의 최댓값(격자 위). 그림의 세로축 끝이 여기서 나온다. */
function reference_calculate_sweep_vacuum_peak(speed) {
  const gapHalf = ((PROJECTILE_ANGLE_MAX_DEG - PROJECTILE_ANGLE_MIN_DEG) * 2) / (PROJECTILE_SWEEP_POINT_COUNT - 1);
  let best = { v: 0, e: 0 };
  for (let index = 0; index < PROJECTILE_SWEEP_POINT_COUNT; index += 1) {
    const range = reference_calculate_vacuum_flight(PROJECTILE_ANGLE_MIN_DEG * 2 + gapHalf * index, speed).range;
    if (range.v > best.v) best = range;
  }
  return best;
}

/** 축 끝: max(값들)×비율, 최소 1 m. */
function reference_calculate_span(values, ratio) {
  const highest = values.reduce((best, value) => (value.v > best.v ? value : best), { v: 0, e: 0 });
  const scaled = { v: highest.v * ratio, e: highest.e * ratio };
  if (scaled.v > REFERENCE_SPAN_MIN_M) return scaled;
  // 최소 폭으로 눌렸으면 정확히 1 m다. 한계 안에서 1 m에 닿을 때만 그 한계를 남긴다(경계).
  return { v: REFERENCE_SPAN_MIN_M, e: scaled.v + scaled.e < REFERENCE_SPAN_MIN_M ? 0 : scaled.e };
}

const reference_subtract = (left, right) => ({ v: left.v - right.v, e: left.e + right.e });

/**
 * "호의 모양" 판정(명세, 2026-10-03 B6 3회차). 0°·90°가 아닐 때만 부른다.
 * 그려진 정점 높이 = 진공 정점 × (그림 높이 / 세로 축 끝), 축척 차 = 큰 px/m ÷ 작은 px/m − 1.
 * 한계는 상대오차의 합으로 번진다. 한계 안에서 문턱에 닿으면 경계로 남긴다.
 */
function reference_check_shape_distorted(context, apex, spanX, spanY) {
  const relative = (value) => (value.v > 0 ? value.e / value.v : 0);
  const pxPerMetreX = REFERENCE_PATH_PLOT_WIDTH_PX / spanX.v;
  const pxPerMetreY = REFERENCE_PATH_PLOT_HEIGHT_PX / spanY.v;
  const apexPx = { v: apex.v * pxPerMetreY, e: apex.v * pxPerMetreY * (relative(apex) + relative(spanY)) };
  if (reference_check_below(context, 'path.shape.apexPx', apexPx, REFERENCE_ARC_MIN_HEIGHT_PX)) return false;
  const ratio = Math.max(pxPerMetreX, pxPerMetreY) / Math.min(pxPerMetreX, pxPerMetreY);
  const mismatch = { v: ratio - 1, e: ratio * (relative(spanX) + relative(spanY)) };
  return !reference_check_below(context, 'path.shape.scale', mismatch, REFERENCE_SCALE_MISMATCH_MIN);
}

/**
 * 한 상태의 참값 묶음과 화면 문자열 전부. 칸 이름의 첫 마디가 분류다.
 * edges가 비어 있지 않으면 그 상태는 "경계, 판정 안 함"이다.
 */
function reference_describe_screen(state) {
  const input = reference_build_inputs(state);
  const context = { edges: [] };
  const dragFactor = input.hasDrag ? input.dragFactor : 0;
  const drag = reference_read_flight(state.halfDegrees, input.speed, dragFactor);
  const vacuum = reference_calculate_vacuum_flight(state.halfDegrees, input.speed);
  const optimum = reference_read_optimum(input.speed, dragFactor);
  const vacuumPeak = reference_calculate_vacuum_flight(PROJECTILE_VACUUM_OPTIMUM_ANGLE_DEG * 2, input.speed).range;
  const sweepHalf = reference_pick_sweep_point(state.halfDegrees);
  const sweepRange = reference_read_flight(sweepHalf, input.speed, dragFactor).range;
  const rangeLost = reference_subtract(vacuum.range, drag.range);
  const timeSaved = reference_subtract(vacuum.time, drag.time);

  const m = (field, value) => reference_format_metres(context, field, value);
  const s = (field, value) => reference_format_seconds(context, field, value);
  const sp = (field, value) => reference_format_speed(context, field, value);
  const deg = (field, value) => reference_format_angle(context, field, value);

  // 판정: |45 − θ*| ≥ 5 → break, ≥ 1 → edge
  const shift = { v: PROJECTILE_VACUUM_OPTIMUM_ANGLE_DEG - optimum.angle.v, e: optimum.angle.e };
  const shiftSize = { v: Math.abs(shift.v), e: shift.e };
  const verdict = !reference_check_below(context, 'verdict.break', shiftSize, PROJECTILE_VERDICT_BREAK_MIN_SHIFT_DEG)
    ? 'break'
    : !reference_check_below(context, 'verdict.edge', shiftSize, PROJECTILE_VERDICT_EDGE_MIN_SHIFT_DEG)
      ? 'edge'
      : 'hold';
  const apexLost = reference_subtract(vacuum.apex, drag.apex);
  // 경우 나누기(명세): 공기항 0 → merged, 0° → flat, 90° → vertical,
  // 사거리 차와 정점 높이 차가 둘 다 0.05 m 미만 → barely, 그 밖 → apart.
  const atFlat = state.halfDegrees <= PROJECTILE_ANGLE_MIN_DEG * 2;
  const atVertical = state.halfDegrees >= PROJECTILE_ANGLE_MAX_DEG * 2;
  const rangeBelow = reference_check_below(context, 'branch.merge.range', rangeLost, REFERENCE_MERGE_LIMIT_M);
  const apexBelow = reference_check_below(context, 'branch.merge.apex', apexLost, REFERENCE_MERGE_LIMIT_M);
  const pathsClose = rangeBelow && apexBelow;
  const launchCase = !input.hasDrag ? 'merged' : atFlat ? 'flat' : atVertical ? 'vertical' : pathsClose ? 'barely' : 'apart';
  const optimumText = deg('optimum.angle', optimum.angle);
  const optimumRangeText = m('optimum.range', optimum.range);

  const headline = !input.hasDrag
    ? 'With no air in the model, both paths are the same path.'
    : `${REFERENCE_VERDICT_HEADLINE[verdict]} It puts the longest shot at ${optimumText}.`;
  let detail;
  if (!input.hasDrag) {
    detail =
      `The drag coefficient is ${input.dragText} and the air density is ${input.densityText} kg/m³, so the integrator ` +
      `is solving the vacuum problem: it peaks at ${optimumText} and returns ${optimumRangeText} m, against ` +
      `${m('vacuum.peak', vacuumPeak)} m from the closed form v₀²sin2θ/g. ` +
      `Those two numbers come from separate code — a step-by-step integrator and a one-line formula that share ` +
      `only the input check, the degree-to-radian conversion and the value of g — and they agree.`;
  } else if (launchCase === 'flat') {
    detail =
      `At 0° the launch never leaves the ground, so the model gives ${m('drag.range', drag.range)} m with the air ` +
      `and ${m('vacuum.range', vacuum.range)} m without it: at this angle the range cannot show the drag, however ` +
      `strong it is.`;
  } else if (launchCase === 'vertical') {
    detail =
      `At 90° the launch goes straight up and comes straight down, so the model gives ` +
      `${m('drag.range', drag.range)} m with the air and ${m('vacuum.range', vacuum.range)} m without it: at this ` +
      `angle the range cannot show the drag. The table below shows what the air does to the height, the time in ` +
      `the air and the landing speed.`;
  } else if (launchCase === 'barely') {
    detail =
      `At the angle set above the model gives ${m('drag.range', drag.range)} m, against ` +
      `${m('vacuum.range', vacuum.range)} m with the air taken out — a gap of ${m('verdict.gap', rangeLost)} m at ` +
      `this launch. The drag term has not dropped to zero here; it is just too small at this angle and speed to ` +
      `move the range by much.`;
  } else {
    const lostFraction = {
      v: (1 - drag.range.v / vacuum.range.v) * REFERENCE_PERCENT_SCALE,
      e:
        REFERENCE_PERCENT_SCALE *
        (drag.range.e / vacuum.range.v + (drag.range.v * vacuum.range.e) / (vacuum.range.v * vacuum.range.v)),
    };
    const shiftText = reference_format_fixed(context, 'verdict.shift', shift, REFERENCE_ANGLE_DIGITS);
    const unit = shiftText.text.replace('-', '') === '1.0' ? 'degree' : 'degrees';
    // 반올림해 0이면 숫자 0을 적지 않고 표시 해상도보다 작다고 적는다(명세, 2026-10-03).
    const shiftWords = shiftText.zero ? `less than ${REFERENCE_ANGLE_RESOLUTION_TEXT} degrees` : `${shiftText.text} ${unit}`;
    const percent = reference_format_fixed(context, 'verdict.percent', lostFraction, REFERENCE_PERCENT_DIGITS);
    const percentWords = percent.zero ? `less than ${REFERENCE_PERCENT_RESOLUTION_TEXT}%` : `${percent.text}%`;
    detail =
      `At the angle set above the model gives ${m('drag.range', drag.range)} m, against ` +
      `${m('vacuum.range', vacuum.range)} m for the same launch with the air taken out — ` +
      `${percentWords} of the distance gone. The peak has moved ${shiftWords} off the vacuum answer of 45°, and ` +
      `the model puts ${optimumRangeText} m there.`;
  }

  // 궤적 축은 진공 경로에 맞춘다(명세, 2026-10-03) — 질량·Cd·면적·밀도는 축을 움직이지 않는다.
  const pathSpanX = reference_calculate_span([vacuum.range], REFERENCE_SPAN_RIGHT_RATIO);
  const pathSpanY = reference_calculate_span([vacuum.apex], REFERENCE_SPAN_TOP_RATIO);
  const sweepSpanY = reference_calculate_span([reference_calculate_sweep_vacuum_peak(input.speed)], REFERENCE_SPAN_TOP_RATIO);
  // 착지 시간 차: 반올림해 0.00이면 "0.00 s sooner" 대신 해상도 문장(명세, 2026-10-03).
  const timeShown = reference_format_fixed(context, 'path.sooner', timeSaved, REFERENCE_SECOND_DIGITS);
  const timeBelow = `the two landing times differ by less than ${REFERENCE_SECOND_RESOLUTION_TEXT} s.`;
  const pathGap = !input.hasDrag
    ? `The two paths sit on top of each other here: the drag coefficient and air density multiply to zero, ` +
      `so the integrated path and the closed-form vacuum path cannot be told apart.`
    : launchCase === 'flat'
      ? 'At 0° neither path leaves the ground, so there is nothing to draw apart.'
      : launchCase === 'vertical' && !pathsClose
        ? `At 90° both paths run up and down the same vertical line: the solid one tops out ` +
          `${m('path.apexLost', apexLost)} m lower` +
          (timeShown.zero ? `; ${timeBelow}` : ` and lands ${timeShown.text} s sooner.`)
        : launchCase === 'barely' || launchCase === 'vertical'
          ? // 이 분기가 잰 두 차이만 말한다 — 화면 구분·경로 전체 거리는 주장하지 않는다(명세, 2026-10-03).
            `The model still has an air term at this launch, but here it moves the range and the highest point by ` +
            `less than ${REFERENCE_MERGE_LIMIT_TEXT} m each.`
          : `The model lands the solid path ${m('path.lost', rangeLost)} m short of the dashed one` +
            (timeShown.zero ? `; ${timeBelow}` : ` and ${timeShown.text} s sooner.`);
  // 0°(호 없음)·90°(세로 선분)에서는 "호의 모양" 문장이 없다(명세, 2026-10-03).
  // B6 3회차(명세, 2026-10-03): 그 사이 각도에서도 그려진 것으로 판정한다 — 진공 정점이 그림에서 1 px 미만
  // (수평 선분)이거나 두 축의 px/m 비가 10% 미만으로 다르면(문장이 거짓) 없다. 각도 판정이 먼저다.
  const pathHasArc = !atFlat && !atVertical && reference_check_shape_distorted(context, vacuum.apex, pathSpanX, pathSpanY);
  const pathAxes =
    `The axes run to ${m('path.spanX', pathSpanX)} m across and ${m('path.spanY', pathSpanY)} m up. They are ` +
    `fitted to the airless path, so only the angle and speed sliders rescale them — read them before comparing ` +
    `two settings.` +
    (pathHasArc ? ` They are not to the same scale as each other, so the arc on screen is not its true shape.` : '');
  const angleShown = `${input.angleText}°`;
  const sweepNote =
    `Every point on the solid curve is one full integration at that angle, everything else held. ` +
    `The model puts its highest point at ${optimumText} — the vertical line — where the range is ` +
    `${optimumRangeText} m. The dashed vacuum curve is symmetric about ${PROJECTILE_VACUUM_OPTIMUM_ANGLE_DEG}.0°, ` +
    `where it reaches ${m('vacuum.peak', vacuumPeak)} m. The dot marks the angle set on the slider, ` +
    `${angleShown}, worth about ${m('sweep.current', sweepRange)} m. The vertical axis runs to ` +
    `${m('sweep.spanY', sweepSpanY)} m.`;

  const formatters = { range: m, apex: m, time: s, landing: sp };
  const shown = {};
  // 손잡이
  shown['slider.angle-output'] = angleShown;
  shown['slider.angle-valuetext'] = `${input.angleText} degrees`;
  shown['slider.speed-output'] = `${input.speed} m/s`;
  shown['slider.speed-valuetext'] = `${input.speed} metres per second`;
  shown['slider.mass-output'] = reference_format_mass(context, 'slider.mass', input.mass.text, input.mass.value);
  shown['slider.mass-valuetext'] = shown['slider.mass-output'];
  shown['slider.drag-output'] = input.dragText;
  shown['slider.area-output'] = reference_format_area(context, 'slider.area', input.area.text, input.area.value);
  shown['slider.area-valuetext'] = shown['slider.area-output'];
  shown['slider.density-output'] = `${input.densityText} kg/m³`;
  shown['slider.density-valuetext'] = `${input.densityText} kilograms per cubic metre`;
  // 카드
  for (const row of REFERENCE_TABLE_ROWS) {
    const format_value = formatters[row.key];
    shown[`card.${row.key}`] = format_value(`drag.${row.key}`, drag[row.key]);
    shown[`card.${row.key}-unit`] =
      `${row.unit} · ${REFERENCE_NAME_VACUUM} ${format_value(`vacuum.${row.key}`, vacuum[row.key])} ${row.unit}`;
  }
  // 배너
  shown['verdict.state'] = verdict;
  shown['verdict.headline'] = headline;
  shown['verdict.detail'] = detail;
  // 캡션 (캔버스 aria-label은 캡션과 같은 글이다)
  shown['path.note'] = `${pathGap} ${pathAxes}`;
  shown['path.label'] = shown['path.note'];
  shown['sweep.note'] = sweepNote;
  shown['sweep.label'] = sweepNote;
  // 표
  for (const row of REFERENCE_TABLE_ROWS) {
    const format_value = formatters[row.key];
    const gap = reference_subtract(vacuum[row.key], drag[row.key]);
    shown[`table.${row.key}`] = [
      row.name,
      `${format_value(`drag.${row.key}`, drag[row.key])} ${row.unit}`,
      `${format_value(`vacuum.${row.key}`, vacuum[row.key])} ${row.unit}`,
      `${reference_format_gap(`gap.${row.key}`, gap, format_value)} ${row.unit}`,
    ].join(' | ');
  }
  return {
    shown,
    edges: context.edges,
    truth: { input, drag, vacuum, optimum, vacuumPeak, sweepHalf, sweepRange, rangeLost, pathSpanX, pathSpanY, sweepSpanY },
  };
}

/** 조작부 아래의 고정 글자: Cd 눈금 줄, 질량·밀도 설명의 숫자. */
function reference_describe_static() {
  const fixed = (value, places) => reference_format_scaled(BigInt(Math.round(value * 10 ** places)), places);
  const grams = Math.round(PROJECTILE_MASS_MIN_KG * REFERENCE_GRAMS_PER_KG);
  // 시작 단면적의 등가 구 지름(정수 mm) — 면적 표기와 같은 공식.
  const diameterMm = Math.sqrt((4 * PROJECTILE_AREA_AXIS.defaultValue) / Math.PI) * REFERENCE_MM_PER_M;
  const diameterText = reference_format_fixed({ edges: [] }, 'static.diameter', reference_create_closed(diameterMm), 0).text;
  return {
    'static.scale': [
      `${fixed(PROJECTILE_DRAG_MIN, REFERENCE_DRAG_DIGITS)} — no air`,
      fixed(PROJECTILE_DRAG_DEFAULT, REFERENCE_DRAG_DIGITS),
      fixed(PROJECTILE_DRAG_MAX, REFERENCE_DRAG_DIGITS),
    ].join(' | '),
    // 질량 힌트의 둘째 문장 전체(명세, 2026-10-03): 조건을 시작 공기로 못박는다. 그 조건의 참은 widget.test.js ③이 본다.
    'static.hint-mass':
      `With the drag coefficient at ${fixed(PROJECTILE_DRAG_DEFAULT, REFERENCE_DRAG_DIGITS)}, the cross-section at ` +
      `d = ${diameterText} mm and the air density at ${fixed(PROJECTILE_DENSITY_DEFAULT_KGM3, REFERENCE_DENSITY_DIGITS)} ` +
      `kg/m³, sliding from ${grams} g to ${PROJECTILE_MASS_MAX_KG} kg moves the optimal angle in the lower chart ` +
      `back toward ${PROJECTILE_VACUUM_OPTIMUM_ANGLE_DEG}° at every launch speed; with a smaller air term it can ` +
      `already read ${PROJECTILE_VACUUM_OPTIMUM_ANGLE_DEG}.0° at ${grams} g and stay there.`,
    'static.hint-density': fixed(PROJECTILE_DENSITY_DEFAULT_KGM3, REFERENCE_DENSITY_DIGITS),
  };
}

// ── 격자 ─────────────────────────────────────────────────────

const to_half = (degrees) => Math.round(degrees * 2);
const to_hundredths = (value) => Math.round(value * 100);
const to_thousandths = (value) => Math.round(value * 1000);

const ANGLE_ENDS = [PROJECTILE_ANGLE_MIN_DEG, PROJECTILE_ANGLE_DEFAULT_DEG, PROJECTILE_ANGLE_MAX_DEG].map(to_half);
const SPEED_ENDS = [PROJECTILE_SPEED_MIN_MS, PROJECTILE_SPEED_DEFAULT_MS, PROJECTILE_SPEED_MAX_MS];
const MASS_ENDS = [PROJECTILE_MASS_AXIS.indexMin, 0, PROJECTILE_MASS_AXIS.indexMax];
const DRAG_ENDS = [PROJECTILE_DRAG_MIN, PROJECTILE_DRAG_DEFAULT, PROJECTILE_DRAG_MAX].map(to_hundredths);
const AREA_ENDS = [PROJECTILE_AREA_AXIS.indexMin, 0, PROJECTILE_AREA_AXIS.indexMax];
const DENSITY_ENDS = [PROJECTILE_DENSITY_MIN_KGM3, PROJECTILE_DENSITY_DEFAULT_KGM3, PROJECTILE_DENSITY_MAX_KGM3].map(
  to_thousandths,
);
/** 반 칸 각도: 0° 바로 위, 스윕 격자 사이의 동률(40.5° → 40°), 90° 바로 아래. */
const HALF_STEP_ANGLES = [
  PROJECTILE_ANGLE_MIN_DEG + PROJECTILE_ANGLE_STEP_DEG,
  PROJECTILE_ANGLE_DEFAULT_DEG + PROJECTILE_ANGLE_STEP_DEG,
  PROJECTILE_ANGLE_MAX_DEG - PROJECTILE_ANGLE_STEP_DEG,
].map(to_half);

const DEFAULT_AIR = { massIndex: 0, dragHundredths: DRAG_ENDS[1], areaIndex: 0, densityThousandths: DENSITY_ENDS[1] };

/** 프리셋이 심는 공기 값. vacuum은 Cd만 바꾼다(질량·면적은 base에서 그대로). */
function fixture_build_preset_air(preset, base) {
  return {
    massIndex: preset.massKg === undefined ? base.massIndex : reference_calculate_log_index(PROJECTILE_MASS_AXIS, preset.massKg),
    areaIndex: preset.areaM2 === undefined ? base.areaIndex : reference_calculate_log_index(PROJECTILE_AREA_AXIS, preset.areaM2),
    dragHundredths: to_hundredths(preset.dragCoefficient),
    densityThousandths: base.densityThousandths,
  };
}

/** 표시 함수 경로: 6개 조작 (양 끝, 기본값)의 전수 곱. */
function* fixture_walk_full() {
  for (const halfDegrees of ANGLE_ENDS) {
    for (const speed of SPEED_ENDS) {
      for (const massIndex of MASS_ENDS) {
        for (const dragHundredths of DRAG_ENDS) {
          for (const areaIndex of AREA_ENDS) {
            for (const densityThousandths of DENSITY_ENDS) {
              yield { halfDegrees, speed, massIndex, dragHundredths, areaIndex, densityThousandths };
            }
          }
        }
      }
    }
  }
}

/** 프리셋 × 각도 양 끝·기본값 × 속력 양 끝·기본값 (밀도 기본값). */
function* fixture_walk_presets() {
  for (const preset of PROJECTILE_PRESETS) {
    for (const halfDegrees of ANGLE_ENDS) {
      for (const speed of SPEED_ENDS) {
        yield { halfDegrees, speed, ...fixture_build_preset_air(preset, DEFAULT_AIR), preset: preset.key };
      }
    }
  }
}

function* fixture_walk_half_steps() {
  for (const halfDegrees of HALF_STEP_ANGLES) {
    yield { halfDegrees, speed: PROJECTILE_SPEED_DEFAULT_MS, ...DEFAULT_AIR };
  }
}

/**
 * "호의 모양" 판정의 세 갈래를 밟는 상태(B6 3회차, 2026-10-03). 스텁 그림 822×230 px에서:
 *   1°·5 m/s(항력 있음)·1°·6 m/s(Cd 0) — 진공 정점이 1 px 미만(수평 선분) → 문장 없음
 *   46°·40 m/s·46°·80 m/s — 두 축의 px/m 비가 1% 안 → 문장 없음
 *   1°·40 m/s — 정점 1 px 이상, 축척 차 큼 → 문장 있음
 */
const SHAPE_STATES = [
  { halfDegrees: to_half(1), speed: PROJECTILE_SPEED_MIN_MS, ...DEFAULT_AIR, shape: false },
  { halfDegrees: to_half(1), speed: PROJECTILE_SPEED_MIN_MS + PROJECTILE_SPEED_STEP_MS, ...DEFAULT_AIR, dragHundredths: DRAG_ENDS[0], shape: false },
  { halfDegrees: to_half(46), speed: PROJECTILE_SPEED_DEFAULT_MS, ...DEFAULT_AIR, shape: false },
  { halfDegrees: to_half(46), speed: PROJECTILE_SPEED_MAX_MS, ...DEFAULT_AIR, shape: false },
  { halfDegrees: to_half(1), speed: PROJECTILE_SPEED_DEFAULT_MS, ...DEFAULT_AIR, shape: true },
];
const SHAPE_SENTENCE = 'They are not to the same scale as each other, so the arc on screen is not its true shape.';

/** 마운트 경로의 공기 조합 (머리말 ⓓ). */
const MOUNT_AIRS = (() => {
  const [massMin, , massMax] = MASS_ENDS;
  const [dragMin, , dragMax] = DRAG_ENDS;
  const [areaMin, , areaMax] = AREA_ENDS;
  const [densityMin, , densityMax] = DENSITY_ENDS;
  const airs = [
    DEFAULT_AIR,
    { ...DEFAULT_AIR, massIndex: massMin },
    { ...DEFAULT_AIR, massIndex: massMax },
    { ...DEFAULT_AIR, dragHundredths: dragMin },
    { ...DEFAULT_AIR, dragHundredths: dragMax },
    { ...DEFAULT_AIR, areaIndex: areaMin },
    { ...DEFAULT_AIR, areaIndex: areaMax },
    { ...DEFAULT_AIR, densityThousandths: densityMin },
    { ...DEFAULT_AIR, densityThousandths: densityMax },
    // k 최대: 가볍고 넓고 거칠고 짙다. k 최소(0이 아닌): 무겁고 좁고 Cd·ρ 기본값.
    { massIndex: massMin, dragHundredths: dragMax, areaIndex: areaMax, densityThousandths: densityMax },
    { massIndex: massMax, dragHundredths: DRAG_ENDS[1], areaIndex: areaMin, densityThousandths: DENSITY_ENDS[1] },
    { massIndex: massMin, dragHundredths: dragMin, areaIndex: areaMin, densityThousandths: densityMin },
    { massIndex: massMax, dragHundredths: dragMax, areaIndex: areaMax, densityThousandths: densityMax },
  ];
  for (const preset of PROJECTILE_PRESETS) {
    if (preset.massKg === undefined) continue; // vacuum은 Cd 최소 조합과 같다 (버튼 경로는 따로 누른다)
    const air = fixture_build_preset_air(preset, DEFAULT_AIR);
    if (!airs.some((other) => JSON.stringify(other) === JSON.stringify(air))) airs.push(air);
  }
  return airs;
})();

function* fixture_walk_mount() {
  for (const air of MOUNT_AIRS) {
    for (const halfDegrees of ANGLE_ENDS) {
      for (const speed of SPEED_ENDS) yield { halfDegrees, speed, ...air };
    }
  }
  yield* fixture_walk_half_steps();
}

// ── 피검 1: 표시 함수 경로 (참값을 넣는다) ───────────────────

/** 오라클 참값으로 위젯이 받는 모양의 요약·스윕 객체를 만든다. */
function fixture_build_display_inputs(truth) {
  const { input, drag, vacuum, optimum, vacuumPeak, sweepHalf, sweepRange } = truth;
  const pick = (flight) => ({
    rangeMetres: flight.range.v,
    apexHeightMetres: flight.apex.v,
    flightSeconds: flight.time.v,
    landingSpeedMs: flight.landing.v,
  });
  const summary = {
    params: {
      angleDeg: input.angleDeg,
      speedMs: input.speed,
      massKg: input.mass.value,
      dragCoefficient: input.dragCoefficient,
      areaM2: input.area.value,
      densityKgM3: input.density,
    },
    drag: { ...pick(drag), hasDrag: input.hasDrag },
    vacuum: pick(vacuum),
    rangeRatio: vacuum.range.v > 0 ? drag.range.v / vacuum.range.v : 1,
    rangeLostMetres: vacuum.range.v - drag.range.v,
    apexLostMetres: vacuum.apex.v - drag.apex.v,
  };
  // 캡션이 읽는 것은 현재 각도에 가장 가까운 점 하나다. 그 둘레의 격자점 둘을 오름차순으로 넣는다.
  const neighbours = [...new Set([Math.floor(input.angleDeg), Math.ceil(input.angleDeg)])].map((angleDeg) => ({
    angleDeg,
    dragRangeMetres:
      angleDeg * 2 === sweepHalf
        ? sweepRange.v
        : reference_read_flight(angleDeg * 2, input.speed, input.hasDrag ? input.dragFactor : 0).range.v,
  }));
  const sweep = {
    points: neighbours,
    optimum: { angleDeg: optimum.angle.v, rangeMetres: optimum.range.v },
    vacuumOptimum: { angleDeg: PROJECTILE_VACUUM_OPTIMUM_ANGLE_DEG, rangeMetres: vacuumPeak.v },
  };
  return { summary, sweep };
}

/** export된 display_* 함수들이 참값에서 내는 문자열. 칸 이름은 오라클과 같다. */
function fixture_read_display(truth) {
  const { summary, sweep } = fixture_build_display_inputs(truth);
  const formatters = {
    range: display_format_metres,
    apex: display_format_metres,
    time: display_format_seconds,
    landing: display_format_speed,
  };
  const keys = { range: 'rangeMetres', apex: 'apexHeightMetres', time: 'flightSeconds', landing: 'landingSpeedMs' };
  const shown = {};
  shown['slider.angle-output'] = display_format_angle(summary.params.angleDeg);
  shown['slider.mass-output'] = display_format_mass(summary.params.massKg);
  shown['slider.area-output'] = display_format_area(summary.params.areaM2);
  for (const row of REFERENCE_TABLE_ROWS) {
    const format_value = formatters[row.key];
    const withDrag = summary.drag[keys[row.key]];
    const without = summary.vacuum[keys[row.key]];
    shown[`card.${row.key}`] = format_value(withDrag);
    shown[`table.${row.key}`] = [
      row.name,
      `${format_value(withDrag)} ${row.unit}`,
      `${format_value(without)} ${row.unit}`,
      `${display_format_gap(without - withDrag, format_value)} ${row.unit}`,
    ].join(' | ');
  }
  const spoken = display_describe_verdict(summary, sweep);
  shown['verdict.state'] = spoken.verdict;
  shown['verdict.headline'] = spoken.headline;
  shown['verdict.detail'] = spoken.detail;
  shown['path.note'] = display_describe_path(summary, {
    spanX: truth.pathSpanX.v,
    spanY: truth.pathSpanY.v,
    plotWidth: REFERENCE_PATH_PLOT_WIDTH_PX,
    plotHeight: REFERENCE_PATH_PLOT_HEIGHT_PX,
  });
  shown['sweep.note'] = display_describe_sweep(sweep, summary.params.angleDeg, { spanY: truth.sweepSpanY.v });
  return shown;
}
const DISPLAY_FIELD_COUNT = 3 + REFERENCE_TABLE_ROWS.length * 2 + 3 + 2;

// ── 피검 2: 마운트한 화면 ────────────────────────────────────

const SLIDER_IDS = {
  angle: 'projectile-angle',
  speed: 'projectile-speed',
  mass: 'projectile-mass',
  drag: 'projectile-drag',
  area: 'projectile-area',
  density: 'projectile-density',
};

/** 붙은 위젯의 원소를 한 번만 훑는다(스텁의 querySelectorAll은 매번 트리 전체를 돈다). */
function fixture_scan_elements(root) {
  const out = [];
  const stack = [...root.children].reverse();
  while (stack.length) {
    const element = stack.pop();
    out.push(element);
    for (let index = element.children.length - 1; index >= 0; index -= 1) stack.push(element.children[index]);
  }
  return out;
}
const fixture_check_class = (element, name) => String(element.className).split(/\s+/).includes(name);

/** URL 쿼리로 상태를 싣고 붙인다. 갱신마다 살아 남는 원소는 여기서 한 번만 찾아 둔다. */
function fixture_mount_widget(search = '') {
  const dom = fixture_create_dom({ search, width: STUB_WIDTH_PX });
  dom.install();
  const widget_reset = widget_mount(dom.root);
  const all = fixture_scan_elements(dom.root);
  const by_class = (name) => all.filter((el) => fixture_check_class(el, name));
  const input_of = (id) => all.find((el) => el.tagName === 'input' && el.getAttribute('id') === id);
  const output_of = (id) => all.find((el) => el.tagName === 'output' && el.getAttribute('for') === id);
  const hint_of = (id) => all.find((el) => el.getAttribute('id') === `${id}-hint`);
  const verdict = by_class('verdict')[0];
  const [pathNote, sweepNote] = by_class('legend-note');
  const [pathCanvas, sweepCanvas] = all.filter((el) => el.tagName === 'canvas');
  const scale = by_class('widget-hint').find((el) => el.getAttribute('id') === null);
  return {
    dom,
    widget_reset,
    inputs: Object.fromEntries(Object.entries(SLIDER_IDS).map(([name, id]) => [name, input_of(id)])),
    outputs: Object.fromEntries(Object.entries(SLIDER_IDS).map(([name, id]) => [name, output_of(id)])),
    hints: { mass: hint_of(SLIDER_IDS.mass), density: hint_of(SLIDER_IDS.density) },
    readouts: by_class('readout').map((box) => ({ value: box.children[1].children[0], unit: box.children[1].children[1] })),
    verdict,
    headline: verdict.children[0],
    detail: verdict.children[2],
    pathNote,
    sweepNote,
    pathCanvas,
    sweepCanvas,
    scale,
    tbody: all.find((el) => el.tagName === 'tbody'),
    buttons: Object.fromEntries(
      all.filter((el) => el.tagName === 'button').map((button) => [button.getAttribute('data-preset'), button]),
    ),
  };
}

/** 슬라이더 여섯 개를 옮기고 change를 한 번 발화시킨다 — 위젯은 조작부 전체를 다시 읽는다. */
function fixture_update_sliders(mounted, state) {
  mounted.inputs.angle.value = String(state.halfDegrees / 2);
  mounted.inputs.speed.value = String(state.speed);
  mounted.inputs.mass.value = String(state.massIndex);
  mounted.inputs.drag.value = String(state.dragHundredths / 100);
  mounted.inputs.area.value = String(state.areaIndex);
  mounted.inputs.density.value = String(state.densityThousandths / 1000);
  return mounted.dom.listeners_run_event(mounted.inputs.angle, 'change');
}

/** 지금 화면의 글자를 오라클과 같은 칸 이름으로 읽는다. */
function fixture_read_screen(mounted) {
  const shown = {};
  for (const name of Object.keys(SLIDER_IDS)) {
    shown[`slider.${name}-output`] = mounted.outputs[name].textContent;
    if (name !== 'drag') shown[`slider.${name}-valuetext`] = mounted.inputs[name].getAttribute('aria-valuetext');
  }
  REFERENCE_TABLE_ROWS.forEach((row, index) => {
    shown[`card.${row.key}`] = mounted.readouts[index]?.value.textContent;
    shown[`card.${row.key}-unit`] = mounted.readouts[index]?.unit.textContent;
  });
  shown['verdict.state'] = mounted.verdict.dataset.state;
  shown['verdict.headline'] = mounted.headline.textContent;
  shown['verdict.detail'] = mounted.detail.textContent;
  shown['path.note'] = mounted.pathNote.textContent;
  shown['path.label'] = mounted.pathCanvas.getAttribute('aria-label');
  shown['sweep.note'] = mounted.sweepNote.textContent;
  shown['sweep.label'] = mounted.sweepCanvas.getAttribute('aria-label');
  mounted.tbody.children.forEach((row, index) => {
    const key = REFERENCE_TABLE_ROWS[index]?.key ?? `extra-${index}`;
    shown[`table.${key}`] = row.children.map((cell) => cell.textContent).join(' | ');
  });
  return shown;
}
const SCREEN_FIELD_COUNT = 11 + REFERENCE_TABLE_ROWS.length * 2 + 3 + 4 + REFERENCE_TABLE_ROWS.length;

/** 설명 줄과 Cd 눈금 줄의 숫자. 문장 전체가 아니라 숫자가 든 마디만 읽는다. */
function fixture_read_static(mounted) {
  return {
    'static.scale': mounted.scale.children.map((mark) => mark.textContent).join(' | '),
    'static.hint-mass': mounted.hints.mass.textContent.match(/With the drag coefficient at .*$/)?.[0] ?? '(없음)',
    'static.hint-density': mounted.hints.density.textContent.match(/(\S+) kg\/m³ is the sea-level/)?.[1] ?? '(없음)',
  };
}

// ── 대조 ─────────────────────────────────────────────────────

const test_label_state = (state) => {
  const input = reference_build_inputs(state);
  return (
    `θ=${input.angleText} v0=${state.speed} m=${input.mass.text} Cd=${input.dragText} A=${input.area.text} ` +
    `ρ=${input.densityText}${state.preset ? ` [${state.preset}]` : ''}`
  );
};

/** 한 상태를 대조한다. 경계 상태는 세기만 하고 판정하지 않는다. */
function test_compare_state(state, read_got, tally) {
  const want = reference_describe_screen(state);
  tally.count += 1;
  if (want.edges.length > 0) {
    tally.boundary.push({ 상태: test_label_state(state), 칸: [...new Set(want.edges)] });
    return;
  }
  const got = read_got(want.truth);
  for (const field of Object.keys(got)) {
    tally.compared += 1;
    if (got[field] !== want.shown[field]) {
      tally.mismatches.push({ 상태: test_label_state(state), 칸: field, 화면: got[field], 정확: want.shown[field] });
    }
  }
}

const test_create_tally = () => ({ count: 0, compared: 0, fired: 0, mismatches: [], boundary: [] });

function test_summarize(tally) {
  return { 불일치: tally.mismatches.length, 처음: tally.mismatches.slice(0, MISMATCH_SAMPLE_MAX) };
}
const CLEAN = { 불일치: 0, 처음: [] };

/** 경계 상태 수를 남긴다(보고용). 비율이 상한을 넘으면 오라클 한계가 부푼 것이다. */
function test_report_boundary(label, tally) {
  const states = new Set(tally.mismatches.map((item) => item.상태)).size;
  console.info(
    `[L-ORACLE projectile] ${label}: ${tally.count}상태, 경계(판정 안 함) ${tally.boundary.length}, ` +
      `불일치 칸 ${tally.mismatches.length}(상태 ${states})` +
      (tally.boundary.length ? ` — 경계 ${JSON.stringify(tally.boundary.slice(0, MISMATCH_SAMPLE_MAX))}` : ''),
  );
  expect(tally.boundary.length).toBeLessThanOrEqual(Math.floor(tally.count * BOUNDARY_FRACTION_MAX));
}

function test_run_display(states) {
  const tally = test_create_tally();
  for (const state of states) test_compare_state(state, fixture_read_display, tally);
  return tally;
}

/** 마운트한 위젯 하나로 상태 목록을 돈다. */
function test_run_mounted(states) {
  const tally = test_create_tally();
  const mounted = fixture_mount_widget('');
  try {
    for (const state of states) {
      tally.fired += fixture_update_sliders(mounted, state);
      test_compare_state(state, () => fixture_read_screen(mounted), tally);
    }
    mounted.widget_reset();
  } finally {
    mounted.dom.restore();
  }
  return tally;
}

// ── 오라클 자체 ──────────────────────────────────────────────

describe('오라클 자체 (위젯과 무관한 앵커)', () => {
  it(
    'GL 10점이 19차 다항식을 정확히 적분하고, g는 모델의 채택값과 같은 수를 가리킨다',
    () => {
      const integral = REFERENCE_GAUSS.nodes.reduce(
        (sum, node, index) => sum + REFERENCE_GAUSS.weights[index] * (node ** 18 + node ** 19 + 1),
        0,
      );
      expect(Math.abs(integral - (2 / 19 + 2))).toBeLessThan(1e-14);
      expect(REFERENCE_GAUSS.weights.reduce((sum, weight) => sum + weight, 0)).toBeCloseTo(2, 14);
      expect(REFERENCE_GRAVITY_MS2).toBe(PROJECTILE_GRAVITY_MS2);
    },
    LONG_TIMEOUT_MS,
  );

  it(
    'k = 0이면 w 적분기가 진공 닫힌형과 같고, 차이가 명시한 한계 안이다',
    () => {
      for (const [degrees, speed] of [[0.5, 5], [30, 40], [45, 80], [60, 17], [89.5, 80]]) {
        const integrated = reference_calculate_drag_flight(degrees / REFERENCE_DEGREES_PER_RADIAN, speed, 0);
        const closed = reference_calculate_vacuum_flight(to_half(degrees), speed);
        for (const key of ['range', 'apex', 'time', 'landing']) {
          const gap = Math.abs(integrated[key].v - closed[key].v);
          expect(gap, `${degrees}° ${speed} m/s ${key}`).toBeLessThanOrEqual(integrated[key].e + closed[key].e);
          expect(gap / Math.max(1, closed[key].v)).toBeLessThan(1e-11);
        }
      }
    },
    LONG_TIMEOUT_MS,
  );

  it(
    '90° 바로 아래의 w 적분이 수직 닫힌형으로 수렴한다 (두 식이 서로를 확인한다)',
    () => {
      const nearlyVertical = (90 - 1e-6) / REFERENCE_DEGREES_PER_RADIAN;
      for (const [speed, dragFactor] of [[5, 0.01], [40, 0.3], [80, 18]]) {
        const integrated = reference_calculate_drag_flight(nearlyVertical, speed, dragFactor);
        const vertical = reference_calculate_vertical_flight(speed, dragFactor);
        for (const key of ['apex', 'time', 'landing']) {
          expect(Math.abs(integrated[key].v - vertical[key].v) / vertical[key].v, `${speed} ${dragFactor} ${key}`).toBeLessThan(1e-6);
        }
        expect(integrated.range.v).toBeLessThan(1e-6);
      }
    },
    LONG_TIMEOUT_MS,
  );

  it(
    '오차 한계가 정직하다: 패널 폭 1/4·허용오차 1/100로 다시 풀어도 차이가 한계 안이다',
    () => {
      // 격자의 k 양 끝(최소·기본·최대 구석)과 각도 양 끝 근처.
      const cases = [
        [40, 40, reference_build_inputs({ halfDegrees: 80, speed: 40, ...DEFAULT_AIR }).dragFactor],
        [89.5, 80, reference_build_inputs({ halfDegrees: 179, speed: 80, ...MOUNT_AIRS[9] }).dragFactor],
        [40, 80, reference_build_inputs({ halfDegrees: 80, speed: 80, ...MOUNT_AIRS[9] }).dragFactor],
        [0.5, 5, reference_build_inputs({ halfDegrees: 1, speed: 5, ...MOUNT_AIRS[10] }).dragFactor],
        [17, 80, 0.3],
      ];
      for (const [degrees, speed, dragFactor] of cases) {
        const theta = degrees / REFERENCE_DEGREES_PER_RADIAN;
        const normal = reference_calculate_drag_flight(theta, speed, dragFactor);
        const tight = reference_calculate_drag_flight(theta, speed, dragFactor, REFERENCE_TIGHT_SETTINGS);
        for (const key of ['range', 'apex', 'time', 'landing']) {
          expect(Math.abs(normal[key].v - tight[key].v), `${degrees}° ${speed} k=${dragFactor} ${key}`).toBeLessThanOrEqual(
            normal[key].e,
          );
          // 한계가 표시 자릿수(0.005)보다 한참 작아야 경계 판정이 의미 있다.
          expect(normal[key].e).toBeLessThan(1e-9);
        }
      }
    },
    LONG_TIMEOUT_MS,
  );

  it(
    '최적각: 진공은 정확히 45°, 항력이 커질수록 낮아지고, 한계가 표시 자릿수보다 한참 작다',
    () => {
      expect(reference_read_optimum(40, 0).angle).toEqual({ v: 45, e: 0 });
      let previous = 45;
      for (const dragFactor of [1e-5, 1e-3, 1e-2, 0.3, 18]) {
        const optimum = reference_read_optimum(40, dragFactor);
        expect(optimum.angle.v).toBeLessThan(previous);
        expect(optimum.angle.e).toBeLessThan(1e-6);
        // 꼭짓점 양옆으로 한계의 백 배를 비켜도 사거리가 더 길지 않다.
        const aside = optimum.angle.e * 100 + 1e-4;
        for (const offset of [-aside, aside]) {
          const other = reference_calculate_drag_flight((optimum.angle.v + offset) / REFERENCE_DEGREES_PER_RADIAN, 40, dragFactor);
          expect(other.range.v).toBeLessThanOrEqual(optimum.range.v + optimum.range.e + other.range.e);
        }
        previous = optimum.angle.v;
      }
    },
    LONG_TIMEOUT_MS,
  );

  it(
    '표기 규칙: 0.5는 올림, 1 m 문턱은 반올림 전 값, 차이 0은 부호 없음, 경계는 경계로 잡힌다',
    () => {
      const context = { edges: [] };
      const metres = (field, value) => reference_format_metres(context, field, value);
      expect(metres('a', { v: 0.996, e: 0 })).toBe('1.00');
      expect(metres('b', { v: 12.34, e: 0 })).toBe('12.3');
      expect(reference_format_gap('c', { v: 0.004, e: 0 }, metres)).toBe('0.00');
      expect(reference_format_gap('d', { v: 2.5, e: 0 }, metres)).toBe(`${MINUS}2.5`);
      expect(reference_format_fixed(context, 'e', { v: -0.04, e: 0 }, 1).text).toBe('-0.0');
      expect(context.edges).toEqual([]);
      reference_format_metres(context, 'tie', { v: 12.35, e: 1e-9 });
      reference_format_metres(context, 'one', { v: 1 - 1e-12, e: 1e-9 });
      expect(context.edges).toEqual(['tie', 'one:자릿수']);
    },
    LONG_TIMEOUT_MS,
  );

  it(
    '입력 표기: 로그 눈금 값, 질량·면적 문자열, 프리셋이 눈금 위에 있다',
    () => {
      expect(reference_calculate_log_slider(PROJECTILE_MASS_AXIS, MASS_ENDS[0]).text).toBe(String(PROJECTILE_MASS_MIN_KG));
      expect(reference_calculate_log_slider(PROJECTILE_MASS_AXIS, MASS_ENDS[2]).text).toBe(String(PROJECTILE_MASS_MAX_KG));
      const context = { edges: [] };
      expect(reference_format_mass(context, 'm', '0.0577255', 0.0577255)).toBe('57.7 g');
      expect(reference_format_mass(context, 'm', '3.97071', 3.97071)).toBe('3.971 kg');
      expect(reference_format_area(context, 'a', '0.004185', 0.004185)).toBe('4.185 × 10⁻³ m² (d = 73 mm sphere)');
      expect(reference_format_area(context, 'a', '0.0001', 0.0001)).toBe('1 × 10⁻⁴ m² (d = 11 mm sphere)');
      expect(context.edges).toEqual([]);
      for (const preset of PROJECTILE_PRESETS) {
        if (preset.massKg === undefined) continue;
        const mass = reference_calculate_log_slider(
          PROJECTILE_MASS_AXIS, reference_calculate_log_index(PROJECTILE_MASS_AXIS, preset.massKg),
        );
        const area = reference_calculate_log_slider(
          PROJECTILE_AREA_AXIS, reference_calculate_log_index(PROJECTILE_AREA_AXIS, preset.areaM2),
        );
        expect([mass.value, area.value], preset.key).toEqual([preset.massKg, preset.areaM2]);
      }
      // 격자가 슬라이더 step 위에 있다.
      for (const value of DRAG_ENDS) expect(value % to_hundredths(PROJECTILE_DRAG_STEP)).toBe(0);
      for (const value of DENSITY_ENDS) expect(value % to_thousandths(PROJECTILE_DENSITY_STEP_KGM3)).toBe(0);
    },
    LONG_TIMEOUT_MS,
  );
});

// ── 표시 함수 경로 ───────────────────────────────────────────

const FULL_STATE_COUNT = 3 ** 6;

describe('표시 함수 — 6개 조작의 (양 끝, 기본값) 전수 곱 + 프리셋 + 반 칸 각도', () => {
  it(
    `display_* 함수에 참값을 넣은 문자열이 오라클과 글자 하나까지 같다 (${FULL_STATE_COUNT}상태 + 프리셋)`,
    () => {
      const states = [...fixture_walk_full(), ...fixture_walk_presets(), ...fixture_walk_half_steps()];
      const tally = test_run_display(states);
      test_report_boundary('표시 함수', tally);
      expect(tally.count).toBe(
        FULL_STATE_COUNT + PROJECTILE_PRESETS.length * ANGLE_ENDS.length * SPEED_ENDS.length + HALF_STEP_ANGLES.length,
      );
      expect(tally.compared).toBe((tally.count - tally.boundary.length) * DISPLAY_FIELD_COUNT);
      expect(test_summarize(tally)).toEqual(CLEAN);
    },
    LONG_TIMEOUT_MS,
  );
});

describe('"호의 모양" 문장 — 그려진 정점 높이·축척으로 판정한다 (B6 3회차, 2026-10-03)', () => {
  it(
    '오라클 명세가 세 갈래를 실제로 가르고, 표시 함수·마운트 화면이 글자 하나까지 같다',
    () => {
      // 먼저 오라클 자신이 기대한 갈래를 내는지 본다 — 상태가 갈래를 밟지 못하면 아래 대조는 빈 검사다.
      for (const state of SHAPE_STATES) {
        const want = reference_describe_screen(state);
        expect(want.edges, test_label_state(state)).toEqual([]);
        expect(want.shown['path.note'].includes(SHAPE_SENTENCE), test_label_state(state)).toBe(state.shape);
      }
      const display = test_run_display(SHAPE_STATES);
      const mounted = test_run_mounted(SHAPE_STATES);
      expect(display.count).toBe(SHAPE_STATES.length);
      expect(mounted.fired).toBe(SHAPE_STATES.length);
      expect(test_summarize(display)).toEqual(CLEAN);
      expect(test_summarize(mounted)).toEqual(CLEAN);
    },
    LONG_TIMEOUT_MS,
  );
});

// ── 마운트 경로 ──────────────────────────────────────────────

describe('마운트한 화면 — 슬라이더를 실제로 옮겨 읽는다 (모델 적분기 포함)', () => {
  it(
    `각도 3 × 속력 3 × 공기 조합 ${MOUNT_AIRS.length} + 반 칸 각도: 화면 글자가 오라클과 같다`,
    () => {
      const tally = test_run_mounted(fixture_walk_mount());
      test_report_boundary('마운트', tally);
      expect(tally.count).toBe(MOUNT_AIRS.length * ANGLE_ENDS.length * SPEED_ENDS.length + HALF_STEP_ANGLES.length);
      // 격자가 정말 돌았는가 — change 리스너가 불리지 않았으면 읽기는 첫 화면의 재탕이다.
      expect(tally.fired).toBe(tally.count);
      expect(tally.compared).toBe((tally.count - tally.boundary.length) * SCREEN_FIELD_COUNT);
      expect(test_summarize(tally)).toEqual(CLEAN);
    },
    LONG_TIMEOUT_MS,
  );

  it(
    '프리셋 버튼을 눌러 바뀐 화면이 오라클과 같다 (프리셋 5 × 각도 3 × 속력 3)',
    () => {
      const tally = test_create_tally();
      const mounted = fixture_mount_widget('');
      // 버튼이 실제로 무언가를 옮기도록 질량·면적·Cd를 반대쪽 끝에 두고 누른다.
      const away = { massIndex: MASS_ENDS[0], areaIndex: AREA_ENDS[2], dragHundredths: DRAG_ENDS[2] };
      try {
        for (const preset of PROJECTILE_PRESETS) {
          for (const halfDegrees of ANGLE_ENDS) {
            for (const speed of SPEED_ENDS) {
              const base = { halfDegrees, speed, densityThousandths: DENSITY_ENDS[1], ...away };
              tally.fired += fixture_update_sliders(mounted, base);
              tally.fired += mounted.dom.listeners_run_event(mounted.buttons[preset.key], 'click');
              const state = { halfDegrees, speed, ...fixture_build_preset_air(preset, base), preset: preset.key };
              test_compare_state(state, () => fixture_read_screen(mounted), tally);
            }
          }
        }
        mounted.widget_reset();
      } finally {
        mounted.dom.restore();
      }
      test_report_boundary('프리셋 클릭', tally);
      expect(tally.count).toBe(PROJECTILE_PRESETS.length * ANGLE_ENDS.length * SPEED_ENDS.length);
      expect(tally.fired).toBe(tally.count * 2);
      expect(test_summarize(tally)).toEqual(CLEAN);
    },
    LONG_TIMEOUT_MS,
  );

  it(
    '기본값·양 끝은 URL에서 곧장 떠도 오라클과 같고, 고정 글자(Cd 눈금·설명의 숫자)도 맞다',
    () => {
      const cases = [
        { halfDegrees: ANGLE_ENDS[1], speed: SPEED_ENDS[1], ...DEFAULT_AIR, search: '' },
        { halfDegrees: ANGLE_ENDS[0], speed: SPEED_ENDS[0], massIndex: MASS_ENDS[0], dragHundredths: DRAG_ENDS[0], areaIndex: AREA_ENDS[0], densityThousandths: DENSITY_ENDS[0] },
        { halfDegrees: ANGLE_ENDS[2], speed: SPEED_ENDS[2], massIndex: MASS_ENDS[2], dragHundredths: DRAG_ENDS[2], areaIndex: AREA_ENDS[2], densityThousandths: DENSITY_ENDS[2] },
        { halfDegrees: HALF_STEP_ANGLES[1], speed: SPEED_ENDS[2], ...MOUNT_AIRS[12] },
      ];
      const tally = test_create_tally();
      const staticWant = reference_describe_static();
      const staticGot = [];
      for (const state of cases) {
        const input = reference_build_inputs(state);
        const search =
          state.search ??
          `?th=${input.angleText}&v0=${state.speed}&m=${input.mass.text}&cd=${input.dragText}` +
            `&a=${input.area.text}&rho=${input.densityText}`;
        const mounted = fixture_mount_widget(search);
        try {
          test_compare_state(state, () => fixture_read_screen(mounted), tally);
          staticGot.push(fixture_read_static(mounted));
          mounted.widget_reset();
        } finally {
          mounted.dom.restore();
        }
      }
      // 고정 글자를 먼저 본다 — 아래 대조가 실패해도 이 검사가 건너뛰어지지 않게.
      for (const got of staticGot) expect(got).toEqual(staticWant);
      test_report_boundary('URL', tally);
      expect(tally.count).toBe(cases.length);
      expect(test_summarize(tally)).toEqual(CLEAN);
    },
    LONG_TIMEOUT_MS,
  );
});

// ── URL 왕복 (2026-10-03 추가) ───────────────────────────────
/**
 * 슬라이더의 **모든 눈금**에서: 위젯이 URL에 쓴 값을 다시 읽으면 같은 값이 나와야 한다.
 * 2026-10-03에 이 파일의 URL 대조가 잡았다 — 질량 최대 칸이 m=5를 쓰고 다시 읽으면 4.999 kg,
 * 면적 최대 칸이 a=0.2를 쓰고 다시 읽으면 0.198 m²였다. 공유한 링크가 다른 화면을 낸다.
 * 눈금 값은 오라클이 정한다(로그 축은 reference_calculate_log_slider).
 */
function fixture_build_ticks() {
  const linear = (min, max, step, places) => {
    const out = [];
    const count = Math.round((max - min) / step);
    for (let index = 0; index <= count; index += 1) out.push(Number((min + index * step).toFixed(places)));
    return out;
  };
  const log = (axis) => {
    const out = [];
    for (let index = axis.indexMin; index <= axis.indexMax; index += 1) out.push(reference_calculate_log_slider(axis, index).value);
    return out;
  };
  return {
    angleDeg: linear(PROJECTILE_ANGLE_MIN_DEG, PROJECTILE_ANGLE_MAX_DEG, PROJECTILE_ANGLE_STEP_DEG, 1),
    speedMs: linear(PROJECTILE_SPEED_MIN_MS, PROJECTILE_SPEED_MAX_MS, PROJECTILE_SPEED_STEP_MS, 0),
    massKg: log(PROJECTILE_MASS_AXIS),
    dragCoefficient: linear(PROJECTILE_DRAG_MIN, PROJECTILE_DRAG_MAX, PROJECTILE_DRAG_STEP, REFERENCE_DRAG_DIGITS),
    areaM2: log(PROJECTILE_AREA_AXIS),
    densityKgM3: linear(
      PROJECTILE_DENSITY_MIN_KGM3, PROJECTILE_DENSITY_MAX_KGM3, PROJECTILE_DENSITY_STEP_KGM3, REFERENCE_DENSITY_DIGITS,
    ),
  };
}

describe('URL 왕복 — 쓴 값을 다시 읽으면 같은 눈금이다 (2026-10-03)', () => {
  it(
    '여섯 슬라이더의 모든 눈금에서 url_write_state → url_read_state가 값을 바꾸지 않는다',
    () => {
      const defaults = reference_build_inputs({ halfDegrees: ANGLE_ENDS[1], speed: SPEED_ENDS[1], ...DEFAULT_AIR });
      const base = {
        angleDeg: defaults.angleDeg,
        speedMs: defaults.speed,
        massKg: defaults.mass.value,
        dragCoefficient: defaults.dragCoefficient,
        areaM2: defaults.area.value,
        densityKgM3: defaults.density,
      };
      const ticks = fixture_build_ticks();
      const dom = fixture_create_dom({ width: STUB_WIDTH_PX });
      dom.install();
      const drifted = [];
      let count = 0;
      try {
        for (const [key, values] of Object.entries(ticks)) {
          for (const value of values) {
            const params = { ...base, [key]: value };
            url_write_state(params);
            const written = dom.urlsWritten.at(-1);
            const back = url_read_state(written.slice(written.indexOf('?')));
            count += 1;
            if (back[key] !== value) drifted.push({ 칸: key, 쓴값: value, 읽은값: back[key], url: written });
          }
        }
      } finally {
        dom.restore();
      }
      expect(count).toBe(Object.values(ticks).reduce((sum, values) => sum + values.length, 0));
      expect(ticks.massKg.length).toBe(PROJECTILE_MASS_AXIS.indexMax - PROJECTILE_MASS_AXIS.indexMin + 1);
      expect(ticks.areaM2.length).toBe(PROJECTILE_AREA_AXIS.indexMax - PROJECTILE_AREA_AXIS.indexMin + 1);
      expect(drifted.slice(0, MISMATCH_SAMPLE_MAX)).toEqual([]);
    },
    LONG_TIMEOUT_MS,
  );

  it(
    '로그 축 양 끝과 그 안쪽 칸은 URL로 다시 띄워도 손잡이가 같은 칸에 앉고 같은 글자를 찍는다',
    () => {
      const cases = [];
      for (const [name, axis, key] of [['mass', PROJECTILE_MASS_AXIS, 'massIndex'], ['area', PROJECTILE_AREA_AXIS, 'areaIndex']]) {
        for (const index of [axis.indexMin, axis.indexMin + 1, axis.indexMax - 1, axis.indexMax]) {
          cases.push({ name, index, state: { halfDegrees: ANGLE_ENDS[1], speed: SPEED_ENDS[1], ...DEFAULT_AIR, [key]: index } });
        }
      }
      const wrong = [];
      for (const { name, index, state } of cases) {
        const input = reference_build_inputs(state);
        const search =
          `?th=${input.angleText}&v0=${state.speed}&m=${input.mass.text}&cd=${input.dragText}` +
          `&a=${input.area.text}&rho=${input.densityText}`;
        const mounted = fixture_mount_widget(search);
        try {
          const want = reference_describe_screen(state).shown[`slider.${name}-output`];
          const got = { 칸번호: mounted.inputs[name].value, 글자: mounted.outputs[name].textContent };
          if (got.칸번호 !== String(index) || got.글자 !== want) wrong.push({ search, 기대: { 칸번호: String(index), 글자: want }, 화면: got });
          mounted.widget_reset();
        } finally {
          mounted.dom.restore();
        }
      }
      expect(cases.length).toBe(8);
      expect(wrong).toEqual([]);
    },
    LONG_TIMEOUT_MS,
  );
});
