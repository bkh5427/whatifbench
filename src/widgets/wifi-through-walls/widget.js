/**
 * Wi-Fi through walls — 위젯 (DOM·이벤트·렌더)
 *
 * 계산은 전부 model.js가 한다. 이 파일은 그리기와 입력만 담당한다.
 * 상태는 URL 쿼리스트링에만 싣는다 (localStorage 금지).
 *
 * 화면의 논점은 하나다: **벽을 늘릴 때 두 대역 사이의 간격이 어떻게 움직이는가.**
 * 그래서 그 숫자를 접힘선 위 배지에 두고, 곡선은 그 아래에 둔다.
 */
import {
  WIFI_MATERIALS,
  WIFI_MATERIAL_KEYS,
  WIFI_BANDS,
  WIFI_BAND_24,
  WIFI_BAND_5,
  WIFI_BAND_6,
  WIFI_DISTANCE_LADDER,
  WIFI_AXIS_DISTANCES,
  WIFI_DISTANCE_MIN_M,
  WIFI_DISTANCE_MAX_M,
  WIFI_DISTANCE_DEFAULT_M,
  WIFI_WALL_COUNT_MIN,
  WIFI_WALL_COUNT_MAX,
  WIFI_WALL_COUNT_STEP,
  WIFI_WALL_COUNT_DEFAULT,
  WIFI_EIRP_MIN_DBM,
  WIFI_EIRP_MAX_DBM,
  WIFI_EIRP_STEP_DBM,
  WIFI_EIRP_DEFAULT_DBM,
  WIFI_SENSITIVITY_MIN_DBM,
  WIFI_SENSITIVITY_MAX_DBM,
  WIFI_SENSITIVITY_STEP_DBM,
  WIFI_SENSITIVITY_DEFAULT_DBM,
  model_clamp_distance,
  model_clamp_wall_count,
  model_clamp_material,
  model_clamp_thickness,
  model_clamp_eirp,
  model_clamp_sensitivity,
  model_pick_distance_index,
  model_read_distance,
  model_calculate_result,
  model_calculate_curves,
  model_calculate_band_gap_verdict,
} from './model.js';

import { num_calculate_decimal_digits, num_format_plural } from '../_shared/numbers.js';
import { ticks_calculate_step, ticks_build_linear, ticks_drop_crowded } from '../_shared/ticks.js';
import {
  logscale_calculate_position,
  LOGSCALE_BELOW,
  LOGSCALE_ABOVE,
} from '../_shared/logscale.js';
import { units_format_length } from '../_shared/units.js';
import { canvas_read_css_color, canvas_setup_context } from '../_shared/canvas.js';
import { urlstate_read_numbers, urlstate_write } from '../_shared/urlstate.js';
import {
  control_build_slider,
  control_build_readout,
  control_build_button_group,
  control_build_table,
  control_build_table_row,
} from '../_shared/controls.js';

// ── DOM 훅 ─────────────────────────────────────────────────
const ROOT_SELECTOR = '[data-widget="wifi-through-walls"]';

// ── URL 쿼리 키 ────────────────────────────────────────────
const URL_KEY_DISTANCE = 'd';
const URL_KEY_WALLS = 'n';
const URL_KEY_THICKNESS = 't';
const URL_KEY_MATERIAL = 'm';
const URL_KEY_EIRP = 'eirp';
const URL_KEY_SENSITIVITY = 'sens';
const URL_KEY_BAND6 = 'b6';
const BAND6_DEFAULT_ON = 1;

// ── 표시 자릿수 ────────────────────────────────────────────
/** 전력·여유는 슬라이더 한 칸이 1 dB를 움직인다. 한 자리면 충분하다. */
const DB_DIGITS = 1;
/**
 * 밴드 격차는 석고보드 한 장에 0.08 dB만 움직인다.
 * 한 자리로 찍으면 벽을 여덟 장 세워도 화면의 숫자가 바뀌지 않는다 — 두 자리로 찍는다.
 */
const GAP_DIGITS = 2;
const TABLE_DIGITS = 2;
/** 거리 표기의 유효숫자. 486.6 m와 108.6 m가 같은 정밀도로 읽혀야 한다. */
const LENGTH_SIGNIFICANT = 4;
const RECOMPUTE_DELAY_MS = 110;
/** 음수 부호. ASCII 하이픈과 섞으면 같은 화면에 두 글자가 나온다. */
const MINUS = '−';

/**
 * 체크박스 히트 타깃 최소 크기(CSS px). WCAG 2.5.8 최소 24×24.
 * `global.css`의 `.widget-row input[type="checkbox"]`가 1.15rem(=18.4px, 루트 16px 기준)로
 * 그리는데, 그 규칙은 이 위젯 파일 밖(공용)이라 여기서 고칠 수 없다 — 이 요소에만
 * 인라인으로 덮어써 픽셀 단위로 못박는다(rem이면 루트 폰트가 줄 때 다시 24 밑으로 내려간다).
 */

// ── 그래프 치수 ────────────────────────────────────────────
const CHART_HEIGHT_PX = 330;
const CHART_PAD_TOP = 14;
const CHART_PAD_RIGHT = 16;
const CHART_PAD_BOTTOM = 54;
const CHART_PAD_LEFT = 62;
const CHART_AXIS_TITLE_GAP = 16;
const CHART_LABEL_FONT = '12px "IBM Plex Sans", system-ui, sans-serif';
const CHART_LABEL_GAP = 8;
const CHART_LABEL_MIN_GAP_PX = 10;
const CHART_CURVE_WIDTH = 2;
/** 5 GHz·6 GHz 곡선 굵기. 범례 견본(global.css .legend-mean-2 4px · .legend-tail-2 3px)과 같게 둔다. */
const CHART_CURVE_WIDTH_BAND5 = 4;
const CHART_CURVE_WIDTH_BAND6 = 3;
const CHART_BAND6_DASH = [5, 4];
const CHART_SENSITIVITY_DASH = [8, 5];
const CHART_CURSOR_DASH = [2, 3];
const CHART_GRID_WIDTH = 1;
/** 세로축 위아래 여유(dB). 곡선이 축선에 붙지 않게 한다. */
const CHART_PAD_DB = 4;
/** 축 스팬이 0이 될 때 최소 표시 폭(dB). 없으면 좌표가 NaN이 되어 아무것도 안 그려진다. */
const CHART_MIN_SPAN_DB = 10;
/** 유한한 점이 하나도 없을 때의 세로축 폴백(dBm). 다른 축 수치와 같이 여기 모아 둔다. */
const CHART_FALLBACK_LOW_DBM = -100;
const CHART_FALLBACK_HIGH_DBM = -40;
/**
 * 두 곡선의 세로 간격이 이보다 좁으면 **축을 더 조이지 않고 "구분 불가"라고 적는다.**
 * 더 확대하면 다른 곡선이 창 밖으로 나가고, 아무 말도 안 하면 독자가 차이를 오독한다.
 */
const CHART_TOUCHING_GAP_PX = 3;
/** 축 제목이 줄바꿈될 때 한 줄의 세로 높이(px). 글자 크기를 줄이지 않고 대신 줄을 늘린다. */
const CHART_TITLE_LINE_HEIGHT_PX = 14;
/**
 * 가로축이 0.5~50 m로 고정돼 있어(로그 눈금 라벨과 직선성을 지키려고), 어떤 설정에서는
 * 도달거리가 그 밖으로 난다. **조용히 잘라내지 않는다** — 화살표 + 숫자로 "축 밖"을 명시한다.
 */
const CHART_REACH_ARROW_SIZE_PX = 5;
/** 도달거리 표시가 여러 대역에서 겹칠 때 세로로 쌓는 간격(px). */
const CHART_REACH_LABEL_STEP_PX = 13;
/** 캔버스 글자 둘레 후광(바탕색 테두리)의 선 굵기(px). 글자 획 밖으로 이 굵기의 절반만 덮는다. */
const CHART_LABEL_HALO_PX = 3;
/** 벽당 격차가 반올림해 0.00일 때 배지가 쓰는 한계값. 표시 자릿수(GAP_DIGITS=2)의 한 칸이다. */
const GAP_NEGLIGIBLE_TEXT = '0.01';

// ── 색 토큰 ────────────────────────────────────────────────
const COLOR_VAR_BAND_24 = '--series-1';
const COLOR_VAR_BAND_HIGH = '--series-2';
const COLOR_VAR_GRID = '--rule';
const COLOR_VAR_TEXT = '--graphite-soft';
const COLOR_VAR_AXIS = '--graphite';
/** 위젯 판은 투명(global.css .widget)이라 캔버스 뒤에 실제로 보이는 색은 페이지 바탕 --paper다. */
const COLOR_VAR_PAPER = '--paper';
const COLOR_FALLBACK_BAND_24 = '#1f4e79';
const COLOR_FALLBACK_BAND_HIGH = '#c2570a';
const COLOR_FALLBACK_GRID = '#d6d8d1';
const COLOR_FALLBACK_TEXT = '#5f666b';
const COLOR_FALLBACK_AXIS = '#2b2f33';
const COLOR_FALLBACK_PAPER = '#f2f2f3';

// ── 문구 ───────────────────────────────────────────────────
const CHART_TITLE_X = 'Distance from the router, metres (log scale)';
const CHART_TITLE_Y = 'Signal at the device, dBm (linear)';
const SENSITIVITY_RULE_LABEL = 'threshold';

/**
 * 범례 문구. **6 GHz를 끄면 그 줄도 빠진다** — 그리지 않은 곡선의 선 종류를 설명하면
 * 독자가 화면에 없는 것을 찾는다.
 */
export function display_describe_legend(showBand6) {
  return (
    'Blue solid = 2.4 GHz. Orange solid = 5 GHz. ' +
    (showBand6 ? 'Orange dashed = 6 GHz. ' : '') +
    'Dark dashed = the threshold you set. The faint vertical line is where the distance slider sits.'
  );
}

/**
 * 0~8을 영어 단어로. "2 11 mm glass panes"는 숫자 두 개가 붙어 읽히지 않는다 —
 * "two 11 mm glass panes"로 적으면 어디까지가 개수인지가 눈에 보인다.
 */
const COUNT_WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight'];

export function display_format_count_word(count) {
  return COUNT_WORDS[count] ?? String(count);
}

/** 문턱 견본의 불투명도. 캔버스 문턱선(--graphite, 불투명)과 같게. */
const LEGEND_THRESHOLD_OPACITY = '1';

/** 범례 네 칸. 색 견본은 CSS가, 뜻은 여기의 글이 맡는다. 라벨은 짧게 — 360px에서 접혀야 한다. */
const CHART_LEGEND_KEYS = [
  { swatch: 'legend-mean-1', label: '2.4 GHz', bandKey: WIFI_BAND_24 },
  { swatch: 'legend-mean-2', label: '5 GHz', bandKey: WIFI_BAND_5 },
  { swatch: 'legend-tail-2', label: '6 GHz', bandKey: WIFI_BAND_6 },
  // 공용 .legend-reference는 흐리게(opacity 0.55) 그린다 — 이 위젯의 문턱선은 진한 선이라 견본만 불투명으로 되돌린다.
  { swatch: 'legend-reference', label: 'Threshold', bandKey: null, opacity: LEGEND_THRESHOLD_OPACITY },
];

const TABLE_HEADINGS = ['Band', 'Free-space loss', 'One wall', 'All walls', 'Total path loss'];
const TABLE_CAPTION = 'Where the path loss goes, band by band';

/**
 * 프리셋. **버튼 라벨만 읽고도 무엇이 로드되는지 알 수 있어야 한다.**
 * 송신 전력과 감도는 건드리지 않는다 — 프리셋이 바꾸는 것은 '집'이지 '장비'가 아니다.
 */
export const WIFI_PRESETS = [
  {
    key: 'open',
    label: 'Same room, no walls',
    state: { distanceM: 5, wallCount: 0, materialKey: 'plasterboard', thicknessMm: 12.5 },
  },
  {
    key: 'stud',
    label: 'Next room, plasterboard',
    state: { distanceM: 8, wallCount: 1, materialKey: 'plasterboard', thicknessMm: 12.5 },
  },
  {
    key: 'concrete',
    label: 'Through one concrete wall',
    state: { distanceM: 10, wallCount: 1, materialKey: 'concrete', thicknessMm: 100 },
  },
  {
    key: 'brick',
    label: 'Two rooms away, brick',
    state: { distanceM: 15, wallCount: 2, materialKey: 'brick', thicknessMm: 100 },
  },
  {
    key: 'far',
    label: 'Three concrete walls',
    state: { distanceM: 20, wallCount: 3, materialKey: 'concrete', thicknessMm: 100 },
  },
];

// ── 표시 함수 ──────────────────────────────────────────────

/** 부호 있는 dB. ASCII 하이픈 대신 −를 쓴다. */
export function display_format_db(value, digits = DB_DIGITS) {
  if (!Number.isFinite(value)) return '—';
  return value.toFixed(digits).replace('-', MINUS);
}

/** 격차처럼 '증가분'인 값은 부호를 앞에 붙여 방향을 읽히게 한다. */
export function display_format_signed_db(value, digits = GAP_DIGITS) {
  if (!Number.isFinite(value)) return '—';
  // 반올림하면 0이 되는 값은 부호를 붙이지 않는다 — "+0.00"·"−0.00"은 방향이 없는데 방향처럼 읽힌다.
  if (Number(Math.abs(value).toFixed(digits)) === 0) return (0).toFixed(digits);
  if (value >= 0) return `+${value.toFixed(digits)}`;
  return `${MINUS}${Math.abs(value).toFixed(digits)}`;
}

/**
 * 세로축 눈금 라벨. **고정 자릿수를 쓰지 않는다** —
 * 축이 좁아지면 눈금 간격이 0.5 dB가 되는데, 정수로 찍으면 두 눈금이 같은 글자가 된다.
 * 자릿수는 값의 크기가 아니라 **간격의 정밀도**로 정한다.
 */
export function display_format_axis_dbm(value, step) {
  if (!Number.isFinite(value)) return '—';
  return value.toFixed(num_calculate_decimal_digits(step)).replace('-', MINUS);
}

/** 거리. 슬라이더 읽기값과 축 라벨이 같은 함수를 쓴다. */
export function display_format_distance(metres) {
  if (!Number.isFinite(metres) || metres <= 0) return '—';
  return units_format_length(metres, LENGTH_SIGNIFICANT);
}

/** 감도에 닿는 거리. 슬라이더 범위 밖이면 그 사실을 말한다 — 그림 밖의 값이다. */
export function display_format_reach(metres) {
  if (!Number.isFinite(metres) || metres <= 0) return '—';
  if (metres < WIFI_DISTANCE_MIN_M) return `under ${WIFI_DISTANCE_MIN_M} m`;
  return display_format_distance(metres);
}

/** "one 100 mm concrete wall" / "three 12.5 mm plasterboard sheets" */
export function display_describe_walls(wallCount, materialKey, thicknessMm) {
  const material = WIFI_MATERIALS[model_clamp_material(materialKey)];
  if (wallCount === 0) return 'no walls at all';
  return (
    `${display_format_count_word(wallCount)} ${thicknessMm} mm ${material.label.toLowerCase()} ` +
    `${num_format_plural(wallCount, material.unitNoun)}`
  );
}

/**
 * 배너 문장. **H1의 질문 — 몇 장의 벽에서 2.4 GHz가 5 GHz를 앞서는가 — 에 직접 답한다.**
 * 상태는 `model_calculate_band_gap_verdict`가 밴드 격차 부호·크기에서 매번 계산한다 —
 * 절대 기본값(예: 'hold')으로 떨어지지 않는다. **주어는 언제나 모델이다.**
 */
export function display_describe_verdict(result) {
  const verdict = model_calculate_band_gap_verdict(result.bandGapDb);
  const magnitude = display_format_db(Math.abs(result.bandGapDb), GAP_DIGITS);
  const headline =
    verdict === 'hold'
      ? `In this model, 2.4 GHz is still ahead of 5 GHz here, by ${magnitude} dB.`
      : verdict === 'edge'
        ? `In this model, 2.4 GHz and 5 GHz are within ${magnitude} dB of each other here.`
        : `In this model, 5 GHz has overtaken 2.4 GHz here, by ${magnitude} dB.`;

  const low = result.byKey[WIFI_BAND_24];
  const high = result.byKey[WIFI_BAND_5];
  const params = result.params;
  const detail =
    `At ${display_format_distance(params.distanceM)} ${params.wallCount === 0 ? 'with' : 'through'} ` +
    `${display_describe_walls(params.wallCount, params.materialKey, params.thicknessMm)}, the model puts ` +
    `2.4 GHz at ${display_format_db(low.receivedDbm)} dBm and 5 GHz at ${display_format_db(high.receivedDbm)} dBm.`;

  return { verdict, headline, detail };
}

const GAP_CARD_LABEL_BELOW = '5 GHz below 2.4 GHz';
const GAP_CARD_LABEL_ABOVE = '5 GHz above 2.4 GHz';

/**
 * "13.03 dB below 2.4 GHz" / "1.59 dB above 2.4 GHz".
 *
 * **방향을 하드코딩하지 않는다.** 손실이 주파수와 함께 커지는 재질(콘크리트·벽돌)에서는
 * 격차가 벌어지지만, 얇은 유리처럼 높은 대역이 덜 잃는 재질에서는 부호가 뒤집힌다 —
 * 유리 11 mm에서는 벽 세 장이면 5 GHz가 위로 올라온다. "below"를 글자로 박아 두면
 * 그 자리에서 화면이 "−4.48 dB below"라고 적는다.
 */
export function display_describe_band_gap(gapDb) {
  const side = gapDb >= 0 ? 'below' : 'above';
  return `${display_format_db(Math.abs(gapDb), GAP_DIGITS)} dB ${side} 2.4 GHz`;
}

/**
 * 배지 한 줄. 벽을 늘릴 때 이 문장의 숫자가 어떻게 움직이는지가 이 페이지의 논점이다.
 * "5 GHz는 X dB 아래/위" 문장은 배너(`display_describe_verdict`)로 옮겼다 —
 * 같은 문장을 두 자리에서 반복하지 않는다.
 */
export function display_describe_gap(result) {
  if (result.params.wallCount === 0) {
    return 'With no walls that gap is the two centre frequencies alone, at the same antenna gain in both bands, and it does not change with distance.';
  }
  const material = result.material.label.toLowerCase();
  const perWall = display_format_db(Math.abs(result.bandGapPerWallDb), GAP_DIGITS);
  const open = display_format_db(result.bandGapOpenDb, GAP_DIGITS);
  // 반올림해 0.00이면 방향어를 쓰지 않는다(나무 16 mm, 벽돌 165 mm 등).
  if (Number(perWall) === 0) {
    return (
      `In this model every ${material} ${result.material.unitNoun} moves the gap by less than ` +
      `${GAP_NEGLIGIBLE_TEXT} dB. With no walls at all, 2.4 GHz starts ${open} dB ahead.`
    );
  }
  // 벽이 5 GHz 쪽으로 미는 재질(유리 11 mm 등)은 몇 장 뒤 부호가 뒤집힌다 — "좁힌다"라고 쓰면
  // 뒤집힌 뒤에는 보이는 격차가 오히려 커지므로, 방향(어느 대역 쪽으로)으로 말한다.
  if (result.bandGapPerWallDb < 0) {
    return (
      `In this model every ${material} ${result.material.unitNoun} moves the gap ${perWall} dB toward 5 GHz. ` +
      `With no walls at all, 2.4 GHz starts ${open} dB ahead.`
    );
  }
  return (
    `In this model every ${material} ${result.material.unitNoun} widens 2.4 GHz’s lead by ${perWall} dB, and ` +
    `${open} dB of the lead is there with no walls at all.`
  );
}

/** 슬래브가 투과 최대점 근처면 화면이 그 사실을 말한다. 조용히 0에 가까운 숫자를 뱉지 않는다. */
export function display_describe_thin_slab(result, showBand6) {
  const flagged = result.bands.filter(
    (band) => band.smallWallLoss && (band.key !== WIFI_BAND_6 || showBand6),
  );
  if (flagged.length === 0) return '';
  const names = flagged.map((band) => `${band.label} at ${display_format_db(band.wallLossDb, TABLE_DIGITS)} dB`);
  return (
    ` One ${result.params.thicknessMm} mm ${result.material.label.toLowerCase()} ` +
    `${result.material.unitNoun} comes out under 1 dB here ` +
    `(${names.join(', ')}). In this model a slab's loss rises and falls with its thickness, because the ` +
    `reflections off its two faces add or cancel depending on how much of a wave fits inside. That is a property ` +
    `of the thickness, not a measurement.`
  );
}

// ── URL 상태 ────────────────────────────────────────────────

export function url_read_state(search) {
  // 재질은 숫자가 아니라 이름이다. 표에 없는 이름은 **최솟값이 아니라 기본값**으로 돌아간다.
  const params = new URLSearchParams(search ?? '');
  const materialKey = model_clamp_material(params.get(URL_KEY_MATERIAL));
  const material = WIFI_MATERIALS[materialKey];

  const numbers = urlstate_read_numbers(search, {
    [URL_KEY_DISTANCE]: { fallback: WIFI_DISTANCE_DEFAULT_M, clamp: model_clamp_distance },
    [URL_KEY_WALLS]: { fallback: WIFI_WALL_COUNT_DEFAULT, clamp: model_clamp_wall_count },
    // 두께의 유효범위는 **재질이 정한다.** 부모가 바뀌면 자식의 범위 자체가 바뀐다.
    [URL_KEY_THICKNESS]: {
      fallback: material.thicknessDefaultMm,
      clamp: (value) => model_clamp_thickness(materialKey, value),
    },
    [URL_KEY_EIRP]: { fallback: WIFI_EIRP_DEFAULT_DBM, clamp: model_clamp_eirp },
    [URL_KEY_SENSITIVITY]: { fallback: WIFI_SENSITIVITY_DEFAULT_DBM, clamp: model_clamp_sensitivity },
    [URL_KEY_BAND6]: { fallback: BAND6_DEFAULT_ON, clamp: (value) => (value >= 1 ? 1 : 0) },
  });

  return {
    distanceM: numbers[URL_KEY_DISTANCE],
    wallCount: numbers[URL_KEY_WALLS],
    materialKey,
    thicknessMm: numbers[URL_KEY_THICKNESS],
    eirpDbm: numbers[URL_KEY_EIRP],
    sensitivityDbm: numbers[URL_KEY_SENSITIVITY],
    showBand6: numbers[URL_KEY_BAND6] === 1,
  };
}

export function url_write_state(state) {
  urlstate_write({
    [URL_KEY_DISTANCE]: state.distanceM,
    [URL_KEY_WALLS]: state.wallCount,
    [URL_KEY_THICKNESS]: state.thicknessMm,
    [URL_KEY_MATERIAL]: state.materialKey,
    [URL_KEY_EIRP]: state.eirpDbm,
    [URL_KEY_SENSITIVITY]: state.sensitivityDbm,
    [URL_KEY_BAND6]: state.showBand6 ? 1 : 0,
  });
}

/** 모델에 넘길 파라미터만 골라낸다. `showBand6`는 그리기의 문제이지 계산의 문제가 아니다. */
export function state_read_params(state) {
  return {
    distanceM: state.distanceM,
    wallCount: state.wallCount,
    materialKey: state.materialKey,
    thicknessMm: state.thicknessMm,
    eirpDbm: state.eirpDbm,
    sensitivityDbm: state.sensitivityDbm,
  };
}

/** 지금 상태가 어느 프리셋과 같은가. 같지 않으면 아무 버튼도 눌린 상태가 아니다. */
export function state_pick_preset(state) {
  const match = WIFI_PRESETS.find((preset) =>
    Object.entries(preset.state).every(([key, value]) => state[key] === value),
  );
  return match ? match.key : null;
}

// ── 그래프 ──────────────────────────────────────────────────

const chart_read_color = canvas_read_css_color;

/**
 * 세로축 범위를 데이터에서 정한다. **감도선도 범위에 넣는다** —
 * 넣지 않으면 벽을 늘렸을 때 기준선이 그림 밖으로 나가 무엇과 비교하는지 사라진다.
 * 스팬이 0에 가까워지면 최소 표시 폭을 준다 (좌표가 NaN이 되지 않게).
 */
export function chart_calculate_scale(curves, sensitivityDbm) {
  let low = Number.POSITIVE_INFINITY;
  let high = Number.NEGATIVE_INFINITY;
  for (const curve of curves) {
    for (const point of curve.points) {
      if (!Number.isFinite(point.receivedDbm)) continue;
      if (point.receivedDbm < low) low = point.receivedDbm;
      if (point.receivedDbm > high) high = point.receivedDbm;
    }
  }
  if (Number.isFinite(sensitivityDbm)) {
    low = Math.min(low, sensitivityDbm);
    high = Math.max(high, sensitivityDbm);
  }
  if (!Number.isFinite(low) || !Number.isFinite(high)) {
    return { low: CHART_FALLBACK_LOW_DBM, high: CHART_FALLBACK_HIGH_DBM };
  }

  low -= CHART_PAD_DB;
  high += CHART_PAD_DB;
  if (high - low < CHART_MIN_SPAN_DB) {
    const middle = (high + low) / 2;
    low = middle - CHART_MIN_SPAN_DB / 2;
    high = middle + CHART_MIN_SPAN_DB / 2;
  }
  return { low, high };
}

/**
 * 축 제목이 가용 폭을 넘으면 단어 단위로 줄바꿈한다.
 * 360px 화면에서 글자 크기를 줄이는 대신 — 사이트의 최소 가독 크기 밑으로 못 내려간다 —
 * 줄을 늘린다. `context.font`가 먼저 설정돼 있어야 한다.
 */
export function chart_wrap_title(context, text, maxWidth) {
  if (!(maxWidth > 0)) return [text];
  const words = text.split(' ');
  const lines = [];
  let line = '';
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && context.measureText(candidate).width > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines.length > 0 ? lines : [text];
}

/** 로그 x. 진입점 방어는 `logscale_calculate_position`이 한다 (0 이하면 null). */
function chart_calculate_x(distanceM, plotWidth) {
  const placed = logscale_calculate_position(distanceM, WIFI_DISTANCE_MIN_M, WIFI_DISTANCE_MAX_M);
  return placed === null ? null : placed.ratio * plotWidth;
}

function chart_calculate_y(receivedDbm, plotHeight, scale) {
  const span = scale.high - scale.low;
  if (!(span > 0)) return null;
  return plotHeight - ((receivedDbm - scale.low) / span) * plotHeight;
}

/**
 * 곡선 위에 얹는 캔버스 글자. 바탕색으로 획 둘레를 먼저 긋고(후광) 그 위에 글자를 채운다.
 * 상자를 깔면 곡선이 글자 폭만큼 통째로 사라지지만, 후광은 획 둘레만 덮는다.
 * textAlign·textBaseline은 부르는 쪽이 정한다.
 */
function chart_draw_haloed_text(context, text, x, y, color, haloColor) {
  context.save();
  context.lineJoin = 'round';
  context.lineWidth = CHART_LABEL_HALO_PX;
  context.strokeStyle = haloColor;
  context.setLineDash([]);
  context.strokeText(text, x, y);
  context.fillStyle = color;
  context.fillText(text, x, y);
  context.restore();
}

/** 곡선 하나. 좌표를 못 만드는 점에서는 선을 끊는다 — 축 경계에 눌러 붙이지 않는다. */
function chart_draw_curve(context, points, plotWidth, plotHeight, scale, style) {
  context.save();
  context.strokeStyle = style.color;
  context.lineWidth = style.width;
  context.setLineDash(style.dash ?? []);
  context.beginPath();
  let started = false;
  for (const point of points) {
    const x = chart_calculate_x(point.distanceM, plotWidth);
    const y = chart_calculate_y(point.receivedDbm, plotHeight, scale);
    if (x === null || y === null) {
      started = false;
      continue;
    }
    if (started) context.lineTo(x, y);
    else context.moveTo(x, y);
    started = true;
  }
  context.stroke();
  context.restore();
}

/**
 * 곡선을 그린다. **자기가 쓴 축을 반환한다** —
 * 캡션이 축을 다시 계산하면 그림과 갈라져 틀린 축 범위가 그림 밑에 적힌다.
 */
export function chart_render_curves(canvasEl, curves, sensitivityDbm, distanceM, reachByKey = {}) {
  const setup = canvas_setup_context(canvasEl, CHART_HEIGHT_PX);
  if (!setup || curves.length === 0) return null;
  const { context, width, height } = setup;
  context.font = CHART_LABEL_FONT; // 줄바꿈 폭을 재려면 폰트를 먼저 확정해야 한다

  // 축 제목이 좁은 화면(360px)에서 잘리지 않게, 필요하면 줄을 늘려 여백을 넓힌다.
  const xTitleLines = chart_wrap_title(context, CHART_TITLE_X, Math.max(1, width - CHART_PAD_LEFT - CHART_PAD_RIGHT));
  const yTitleLines = chart_wrap_title(context, CHART_TITLE_Y, Math.max(1, height - CHART_PAD_TOP - CHART_PAD_BOTTOM));
  const padBottom = CHART_PAD_BOTTOM + Math.max(0, xTitleLines.length - 1) * CHART_TITLE_LINE_HEIGHT_PX;
  const padLeft = CHART_PAD_LEFT + Math.max(0, yTitleLines.length - 1) * CHART_TITLE_LINE_HEIGHT_PX;

  const plotWidth = Math.max(1, width - padLeft - CHART_PAD_RIGHT);
  const plotHeight = Math.max(1, height - CHART_PAD_TOP - padBottom);
  const scale = chart_calculate_scale(curves, sensitivityDbm);

  const colorLow = chart_read_color(canvasEl, COLOR_VAR_BAND_24, COLOR_FALLBACK_BAND_24);
  const colorHigh = chart_read_color(canvasEl, COLOR_VAR_BAND_HIGH, COLOR_FALLBACK_BAND_HIGH);
  const colorGrid = chart_read_color(canvasEl, COLOR_VAR_GRID, COLOR_FALLBACK_GRID);
  const colorText = chart_read_color(canvasEl, COLOR_VAR_TEXT, COLOR_FALLBACK_TEXT);
  const colorAxis = chart_read_color(canvasEl, COLOR_VAR_AXIS, COLOR_FALLBACK_AXIS);
  const colorPaper = chart_read_color(canvasEl, COLOR_VAR_PAPER, COLOR_FALLBACK_PAPER);

  context.save();
  context.translate(padLeft, CHART_PAD_TOP);
  context.font = CHART_LABEL_FONT;

  // ── 세로축 (선형 dBm, 데이터에 맞춰 자동) ──
  const yStep = ticks_calculate_step(scale.high - scale.low);
  const yItems = ticks_build_linear(scale.low, scale.high, yStep).map((value) => ({
    value,
    position: chart_calculate_y(value, plotHeight, scale),
    width: 0,
  }));
  const yKept = ticks_drop_crowded(yItems, CHART_LABEL_MIN_GAP_PX);
  context.strokeStyle = colorGrid;
  context.lineWidth = CHART_GRID_WIDTH;
  context.fillStyle = colorText;
  context.textAlign = 'right';
  context.textBaseline = 'middle';
  for (const item of yKept) {
    context.beginPath();
    context.moveTo(0, item.position);
    context.lineTo(plotWidth, item.position);
    context.stroke();
    context.fillText(display_format_axis_dbm(item.value, yStep), -CHART_LABEL_GAP, item.position);
  }

  // ── 가로축 (로그 m) ──
  const xItems = WIFI_AXIS_DISTANCES.map((value) => ({
    value,
    position: chart_calculate_x(value, plotWidth),
    width: context.measureText(String(value)).width,
  })).filter((item) => item.position !== null);
  const xKept = ticks_drop_crowded(xItems, CHART_LABEL_MIN_GAP_PX);
  context.textAlign = 'center';
  context.textBaseline = 'top';
  for (const item of xKept) {
    context.fillText(String(item.value), item.position, plotHeight + CHART_LABEL_GAP);
  }

  // ── 감도 수평선 ──
  const sensitivityY = chart_calculate_y(sensitivityDbm, plotHeight, scale);
  if (sensitivityY !== null) {
    context.save();
    context.strokeStyle = colorAxis;
    context.lineWidth = CHART_CURVE_WIDTH;
    context.setLineDash(CHART_SENSITIVITY_DASH);
    context.beginPath();
    context.moveTo(0, sensitivityY);
    context.lineTo(plotWidth, sensitivityY);
    context.stroke();
    context.restore();
    // "threshold" 글자는 곡선을 그린 뒤에 얹는다(아래 ── 문턱 라벨 ──).
  }

  // ── 현재 거리 커서 ──
  const cursorX = chart_calculate_x(distanceM, plotWidth);
  if (cursorX !== null) {
    context.save();
    context.strokeStyle = colorGrid;
    context.setLineDash(CHART_CURSOR_DASH);
    context.beginPath();
    context.moveTo(cursorX, 0);
    context.lineTo(cursorX, plotHeight);
    context.stroke();
    context.restore();
  }

  // ── 곡선 ──
  for (const curve of curves) {
    const style =
      curve.key === WIFI_BAND_24
        ? { color: colorLow, width: CHART_CURVE_WIDTH }
        : curve.key === WIFI_BAND_5
          ? { color: colorHigh, width: CHART_CURVE_WIDTH_BAND5 }
          : { color: colorHigh, width: CHART_CURVE_WIDTH_BAND6, dash: CHART_BAND6_DASH };
    chart_draw_curve(context, curve.points, plotWidth, plotHeight, scale, style);
  }

  // ── 문턱 라벨 ── 곡선 뒤에, 글자 획 둘레 후광과 함께 그린다(곡선이 글자를 관통하지 않게).
  if (sensitivityY !== null) {
    context.save();
    context.textAlign = 'right';
    context.textBaseline = 'bottom';
    chart_draw_haloed_text(
      context, SENSITIVITY_RULE_LABEL, plotWidth - CHART_LABEL_GAP / 2, sensitivityY - 2, colorText, colorPaper,
    );
    context.restore();
  }

  // ── 축선 ──
  context.strokeStyle = colorAxis;
  context.lineWidth = CHART_GRID_WIDTH;
  context.setLineDash([]);
  context.beginPath();
  context.moveTo(0, 0);
  context.lineTo(0, plotHeight);
  context.lineTo(plotWidth, plotHeight);
  context.stroke();

  // ── 축 제목 (좁은 화면이면 줄바꿈, 글자는 줄이지 않는다) ──
  context.fillStyle = colorText;
  context.textAlign = 'center';
  context.textBaseline = 'top';
  xTitleLines.forEach((line, index) => {
    context.fillText(
      line,
      plotWidth / 2,
      plotHeight + CHART_LABEL_GAP + CHART_AXIS_TITLE_GAP + index * CHART_TITLE_LINE_HEIGHT_PX,
    );
  });
  context.save();
  context.translate(-padLeft + CHART_AXIS_TITLE_GAP / 2, plotHeight / 2);
  context.rotate(-Math.PI / 2);
  context.textBaseline = 'top';
  yTitleLines.forEach((line, index) => {
    context.fillText(line, 0, index * CHART_TITLE_LINE_HEIGHT_PX);
  });
  context.restore();

  /**
   * ── 도달거리가 축 밖이면 화살표 + 숫자로 명시 ──
   * 가로축은 0.5~50 m로 고정이라(직선성·눈금 정합을 지키려고), 도달거리가 이 밖에
   * 나는 설정이 실재한다. `logscale_calculate_position`이 돌려주는 `clipped`를
   * 버리지 않고 그린다 — 조용히 축 끝에 눌러 붙이지 않는다.
   */
  const offChart = [];
  for (const curve of curves) {
    const reachM = reachByKey[curve.key];
    if (!(reachM > 0)) continue;
    const placed = logscale_calculate_position(reachM, WIFI_DISTANCE_MIN_M, WIFI_DISTANCE_MAX_M);
    if (!placed || (placed.clipped !== LOGSCALE_BELOW && placed.clipped !== LOGSCALE_ABOVE)) continue;
    const style = curve.key === WIFI_BAND_24 ? colorLow : colorHigh;
    const x = placed.ratio * plotWidth; // 0 또는 plotWidth — 왼쪽/오른쪽 끝
    // 문턱선이 글자를 관통하지 않게 한 칸 아래부터 쌓는다. 눈금 숫자 줄에 닿으면 위로 쌓는다.
    const anchorY = sensitivityY ?? plotHeight / 2;
    const belowY = anchorY + (offChart.length + 1) * CHART_REACH_LABEL_STEP_PX;
    // 위로 쌓을 때는 "threshold" 글자 한 줄을 비워 두고 그 위부터 쌓는다.
    const y =
      belowY <= plotHeight - CHART_REACH_LABEL_STEP_PX / 2
        ? belowY
        : anchorY - (offChart.length + 2) * CHART_REACH_LABEL_STEP_PX;
    const pointsLeft = placed.clipped === LOGSCALE_BELOW;
    context.save();
    context.fillStyle = style;
    context.beginPath();
    if (pointsLeft) {
      context.moveTo(x + CHART_REACH_ARROW_SIZE_PX, y - CHART_REACH_ARROW_SIZE_PX);
      context.lineTo(x + CHART_REACH_ARROW_SIZE_PX, y + CHART_REACH_ARROW_SIZE_PX);
      context.lineTo(x, y);
    } else {
      context.moveTo(x - CHART_REACH_ARROW_SIZE_PX, y - CHART_REACH_ARROW_SIZE_PX);
      context.lineTo(x - CHART_REACH_ARROW_SIZE_PX, y + CHART_REACH_ARROW_SIZE_PX);
      context.lineTo(x, y);
    }
    context.closePath();
    context.fill();
    context.textAlign = pointsLeft ? 'left' : 'right';
    context.textBaseline = 'middle';
    const reachText = `${curve.label} reach ${display_format_reach(reachM)}`;
    const textX = pointsLeft
      ? x + CHART_REACH_ARROW_SIZE_PX + CHART_LABEL_GAP
      : x - CHART_REACH_ARROW_SIZE_PX - CHART_LABEL_GAP;
    // 상자를 깔면 곡선 한 토막이 통째로 지워진다 — 글자 획 둘레에만 바탕색 테두리(후광)를 둘러 읽히게 한다.
    chart_draw_haloed_text(context, reachText, textX, y, style, colorPaper);
    context.restore();
    offChart.push({ key: curve.key, label: curve.label, reachM, side: placed.clipped });
  }

  context.restore();

  // 지금 거리에서 이웃한 두 곡선이 선 굵기보다 붙었는가. 캡션이 이 값을 인용한다.
  const cursorYs = curves
    .map((curve) => {
      const point = curve.points.reduce(
        (best, item) =>
          Math.abs(item.distanceM - distanceM) < Math.abs(best.distanceM - distanceM) ? item : best,
        curve.points[0],
      );
      return { key: curve.key, label: curve.label, y: chart_calculate_y(point.receivedDbm, plotHeight, scale) };
    })
    .filter((item) => item.y !== null)
    .sort((left, right) => left.y - right.y);
  let touching = null;
  for (let index = 1; index < cursorYs.length; index += 1) {
    if (cursorYs[index].y - cursorYs[index - 1].y < CHART_TOUCHING_GAP_PX) {
      touching = [cursorYs[index - 1].label, cursorYs[index].label];
    }
  }

  return { scale, step: yStep, touching, xLabels: xKept.map((item) => item.value), offChart };
}

// ── 위젯 ───────────────────────────────────────────────────

export function widget_mount(rootEl) {
  if (!rootEl) return null;
  if (rootEl.dataset.mounted === 'true') return null;
  rootEl.dataset.mounted = 'true';
  rootEl.classList.add('widget');

  const state = url_read_state(typeof window === 'undefined' ? '' : window.location.search);

  const heading = document.createElement('h2');
  heading.className = 'sr-only';
  heading.textContent = 'Wi-Fi signal through walls, band by band';

  // ── 배지 (접힘선 위) ──
  const badge = document.createElement('div');
  badge.className = 'readouts';
  const gapCard = control_build_readout(GAP_CARD_LABEL_BELOW, 'dB');
  const perWallCard = control_build_readout('Added by each wall', 'dB');
  badge.append(gapCard.box, perWallCard.box);

  const badgeNote = document.createElement('p');
  badgeNote.className = 'legend-note';

  // ── 판정 ──
  const verdict = document.createElement('p');
  verdict.className = 'verdict';
  const verdictHeadline = document.createElement('strong');
  const verdictDetail = document.createElement('span');
  verdict.append(verdictHeadline, document.createTextNode(' '), verdictDetail);

  // ── 곡선 ──
  const chartCanvas = document.createElement('canvas');
  chartCanvas.className = 'widget-chart';
  chartCanvas.setAttribute('role', 'img');

  const legend = document.createElement('p');
  legend.className = 'widget-legend';
  const legendNote = document.createElement('p');
  legendNote.className = 'legend-note';

  // ── 프리셋 ──
  const presets = control_build_button_group(
    'Load a room',
    WIFI_PRESETS.map((preset) => ({ key: preset.key, label: preset.label })),
  );

  // ── 조작부 ──
  const distanceSlider = control_build_slider(
    'wifi-distance',
    'How far away the device is',
    `Straight-line distance from the router, ${WIFI_DISTANCE_MIN_M} to ${WIFI_DISTANCE_MAX_M} metres. ` +
      'The slider steps in round numbers, and the readout beside it shows the one in use.',
    { min: 0, max: WIFI_DISTANCE_LADDER.length - 1, step: 1, value: model_pick_distance_index(state.distanceM) },
  );
  const wallSlider = control_build_slider(
    'wifi-walls',
    'How many walls are in the way',
    'Each wall subtracts the same number of decibels, so adding one drops the whole curve without bending it.',
    {
      min: WIFI_WALL_COUNT_MIN, max: WIFI_WALL_COUNT_MAX, step: WIFI_WALL_COUNT_STEP, value: state.wallCount,
    },
  );

  const materialRow = document.createElement('div');
  materialRow.className = 'widget-row';
  const materialLabelBox = document.createElement('div');
  materialLabelBox.className = 'widget-label';
  const materialLabel = document.createElement('label');
  materialLabel.setAttribute('for', 'wifi-material');
  materialLabel.textContent = 'What the walls are made of';
  const materialHint = document.createElement('span');
  materialHint.className = 'widget-hint';
  materialHint.setAttribute('id', 'wifi-material-hint');
  materialHint.textContent =
    'This picks one row of the published table of building materials. Changing it also resets the ' +
    'thickness slider to a sensible range for that material.';
  materialLabelBox.append(materialLabel, materialHint);
  const materialSelect = document.createElement('select');
  materialSelect.setAttribute('id', 'wifi-material');
  materialSelect.setAttribute('aria-describedby', 'wifi-material-hint');
  for (const key of WIFI_MATERIAL_KEYS) {
    const option = document.createElement('option');
    option.value = key;
    option.setAttribute('value', key);
    option.textContent = WIFI_MATERIALS[key].label;
    materialSelect.appendChild(option);
  }
  materialSelect.value = state.materialKey;
  const materialOut = document.createElement('output');
  materialOut.className = 'widget-out';
  materialOut.setAttribute('for', 'wifi-material');
  materialOut.setAttribute('aria-live', 'off');
  materialRow.append(materialLabelBox, materialSelect, materialOut);

  const thicknessSlider = control_build_slider(
    'wifi-thickness',
    'How thick each wall is',
    'Millimetres of solid material. Thicker is not always lossier here — when a whole number of half ' +
      'wavelengths fits inside the material, the reflections off the slab’s two faces cancel and more gets through.',
    {
      min: WIFI_MATERIALS[state.materialKey].thicknessMinMm,
      max: WIFI_MATERIALS[state.materialKey].thicknessMaxMm,
      step: WIFI_MATERIALS[state.materialKey].thicknessStepMm,
      value: state.thicknessMm,
    },
  );

  const eirpSlider = control_build_slider(
    'wifi-eirp',
    'How strongly the router transmits',
    'EIRP — the power it radiates once the antenna gain is folded in, in dBm. All three bands get the same number ' +
      'here, and every band is received by an isotropic antenna — the two choices together set the no-wall gaps.',
    { min: WIFI_EIRP_MIN_DBM, max: WIFI_EIRP_MAX_DBM, step: WIFI_EIRP_STEP_DBM, value: state.eirpDbm },
  );
  const sensitivitySlider = control_build_slider(
    'wifi-sensitivity',
    'The weakest signal the device can still use',
    'Your threshold, in dBm. It is the flat rule across the chart: where a curve crosses it is that band’s ' +
      'reach. The page does not take this number from a standard — it is yours to set.',
    {
      min: WIFI_SENSITIVITY_MIN_DBM,
      max: WIFI_SENSITIVITY_MAX_DBM,
      step: WIFI_SENSITIVITY_STEP_DBM,
      value: state.sensitivityDbm,
    },
  );

  const band6Row = document.createElement('div');
  band6Row.className = 'widget-row';
  const band6LabelBox = document.createElement('div');
  band6LabelBox.className = 'widget-label';
  const band6Label = document.createElement('label');
  band6Label.setAttribute('for', 'wifi-band6');
  band6Label.textContent = 'Draw the 6 GHz curve too';
  const band6Hint = document.createElement('span');
  band6Hint.className = 'widget-hint';
  band6Hint.setAttribute('id', 'wifi-band6-hint');
  band6Hint.textContent =
    'The newest band. It is drawn as a dashed orange line. It starts below both of the others, and how fast it falls further behind — or catches up — depends on what the walls are made of and how thick they are.';
  band6LabelBox.append(band6Label, band6Hint);
  const band6Input = document.createElement('input');
  band6Input.type = 'checkbox';
  band6Input.setAttribute('id', 'wifi-band6');
  band6Input.setAttribute('aria-describedby', 'wifi-band6-hint');
  band6Input.checked = state.showBand6;
  // 공용 규칙(1.15rem≈18.4px)보다 이 요소만 키운다 — global.css는 위젯 두 개 이상이 쓴다.
  const band6Out = document.createElement('output');
  band6Out.className = 'widget-out';
  band6Out.setAttribute('for', 'wifi-band6');
  band6Out.setAttribute('aria-live', 'off');
  band6Row.append(band6LabelBox, band6Input, band6Out);

  const roomGroup = document.createElement('fieldset');
  roomGroup.className = 'widget-group';
  const roomTitle = document.createElement('legend');
  roomTitle.className = 'widget-group-title';
  roomTitle.textContent = 'The room';
  roomGroup.append(roomTitle, distanceSlider.row, wallSlider.row, materialRow, thicknessSlider.row);

  const radioGroup = document.createElement('fieldset');
  radioGroup.className = 'widget-group';
  const radioTitle = document.createElement('legend');
  radioTitle.className = 'widget-group-title';
  radioTitle.textContent = 'The two radios';
  radioGroup.append(radioTitle, eirpSlider.row, sensitivitySlider.row, band6Row);

  const controls = document.createElement('div');
  controls.className = 'widget-controls';
  controls.append(roomGroup, radioGroup);

  // ── 대역별 카드 ──
  const readouts = document.createElement('div');
  readouts.className = 'readouts';
  const cards = {};
  for (const band of WIFI_BANDS) {
    cards[band.key] = {
      received: control_build_readout(`${band.label} — signal here`, 'dBm'),
      margin: control_build_readout(`${band.label} — spare above threshold`, 'dB'),
      reach: control_build_readout(`${band.label} — reaches`, ''),
    };
    readouts.append(cards[band.key].received.box, cards[band.key].margin.box, cards[band.key].reach.box);
  }

  // ── 분해표 ──
  const table = control_build_table(TABLE_CAPTION, TABLE_HEADINGS);
  const tableNote = document.createElement('p');
  tableNote.className = 'legend-note';

  rootEl.append(
    heading, badge, badgeNote, verdict,
    chartCanvas, legend, legendNote,
    presets.group, controls, readouts, table.scroll, tableNote,
  );

  // ── 상태 ──
  let recomputeTimer = 0;
  let redrawTimer = 0;
  let lastResult = null;
  let lastCurves = [];

  /** 조작부에서 현재 상태를 읽는다. 두께는 **지금 고른 재질의** 범위로 자른다. */
  function state_read_controls() {
    const materialKey = model_clamp_material(materialSelect.value);
    return {
      distanceM: model_read_distance(Number(distanceSlider.input.value)),
      wallCount: model_clamp_wall_count(Number(wallSlider.input.value)),
      materialKey,
      thicknessMm: model_clamp_thickness(materialKey, Number(thicknessSlider.input.value)),
      eirpDbm: model_clamp_eirp(Number(eirpSlider.input.value)),
      sensitivityDbm: model_clamp_sensitivity(Number(sensitivitySlider.input.value)),
      showBand6: Boolean(band6Input.checked),
    };
  }

  /**
   * 두께 슬라이더를 지금 재질에 맞춘다.
   * **min·max·step을 value보다 먼저 쓴다** — 순서를 바꾸면 브라우저가 옛 범위로
   * value를 잘라내고, 손잡이가 가리키는 값과 계산에 쓰인 값이 달라진다.
   */
  function slider_update_thickness(materialKey, thicknessMm) {
    const material = WIFI_MATERIALS[materialKey];
    thicknessSlider.input.min = String(material.thicknessMinMm);
    thicknessSlider.input.max = String(material.thicknessMaxMm);
    thicknessSlider.input.step = String(material.thicknessStepMm);
    thicknessSlider.input.value = String(thicknessMm);
  }

  function display_show_controls(current) {
    distanceSlider.output.textContent = display_format_distance(current.distanceM);
    // 인덱스형 슬라이더다. 이것이 없으면 스크린리더가 "17"이라고 읽는다.
    distanceSlider.input.setAttribute('aria-valuetext', display_format_distance(current.distanceM));
    wallSlider.output.textContent = String(current.wallCount);
    wallSlider.input.setAttribute(
      'aria-valuetext',
      `${current.wallCount} ${num_format_plural(current.wallCount, 'wall')}`,
    );
    materialOut.textContent = WIFI_MATERIALS[current.materialKey].label;
    thicknessSlider.output.textContent = `${current.thicknessMm} mm`;
    thicknessSlider.input.setAttribute('aria-valuetext', `${current.thicknessMm} millimetres`);
    eirpSlider.output.textContent = `${current.eirpDbm} dBm`;
    eirpSlider.input.setAttribute('aria-valuetext', `${current.eirpDbm} dBm`);
    sensitivitySlider.output.textContent = `${display_format_db(current.sensitivityDbm, 0)} dBm`;
    sensitivitySlider.input.setAttribute(
      'aria-valuetext',
      `${display_format_db(current.sensitivityDbm, 0)} dBm`,
    );
    band6Out.textContent = current.showBand6 ? 'shown' : 'hidden';

    const pressed = state_pick_preset(current);
    for (const preset of WIFI_PRESETS) {
      presets.buttons[preset.key].setAttribute('aria-pressed', preset.key === pressed ? 'true' : 'false');
    }
  }

  /**
   * 범례를 다시 짓는다. **`hidden`으로 숨기지 않는다** —
   * `.legend-item`이 `display: inline-flex`를 들고 있어서 작성자 규칙이
   * 브라우저 기본 `[hidden] { display: none }`을 이긴다. 숨겼다고 믿는 칸이 그대로 보인다.
   */
  function legend_update(showBand6) {
    legend.textContent = '';
    for (const key of CHART_LEGEND_KEYS) {
      if (key.bandKey === WIFI_BAND_6 && !showBand6) continue;
      const item = document.createElement('span');
      item.className = 'legend-item';
      const swatch = document.createElement('span');
      swatch.className = `legend-key ${key.swatch}`;
      if (key.opacity) swatch.style.opacity = key.opacity;
      item.append(swatch, document.createTextNode(` ${key.label}`));
      legend.appendChild(item);
    }
  }

  function display_show_table(result, showBand6) {
    table.body.textContent = '';
    for (const band of result.bands) {
      if (band.key === WIFI_BAND_6 && !showBand6) continue;
      table.body.appendChild(
        control_build_table_row([
          band.label,
          `${display_format_db(band.freeSpaceLossDb, TABLE_DIGITS)} dB`,
          `${display_format_db(band.wallLossDb, TABLE_DIGITS)} dB`,
          `${display_format_db(band.wallTotalDb, TABLE_DIGITS)} dB`,
          `${display_format_db(band.pathLossDb, TABLE_DIGITS)} dB`,
        ]),
      );
    }
  }

  /** 상태 하나를 받아 화면 전체를 맞춘다. **계산 경로는 여기 하나뿐이다.** */
  function widget_update() {
    const current = state_read_controls();
    Object.assign(state, current);

    display_show_controls(current);

    const result = model_calculate_result(state_read_params(current));
    lastResult = result;
    lastCurves = model_calculate_curves(state_read_params(current), current.showBand6);

    // 라벨도 부호를 따라간다 — "5 GHz below 2.4 GHz: −4.48"은 두 번 부정하는 문장이다.
    gapCard.box.querySelector('.readout-label').textContent =
      result.bandGapDb >= 0 ? GAP_CARD_LABEL_BELOW : GAP_CARD_LABEL_ABOVE;
    gapCard.value.textContent = display_format_db(Math.abs(result.bandGapDb), GAP_DIGITS);
    // 격차 카드가 "above"로 뒤집히면 벽당 값도 그 방향 기준으로 읽힌다 — 부호를 카드 방향에 맞춘다.
    perWallCard.value.textContent = display_format_signed_db(
      result.bandGapDb >= 0 ? result.bandGapPerWallDb : -result.bandGapPerWallDb,
    );
    badgeNote.textContent = display_describe_gap(result);

    const spoken = display_describe_verdict(result);
    verdict.dataset.state = spoken.verdict;
    verdictHeadline.textContent = spoken.headline;
    verdictDetail.textContent = spoken.detail;

    for (const band of result.bands) {
      const card = cards[band.key];
      card.received.value.textContent = display_format_db(band.receivedDbm);
      card.margin.value.textContent = display_format_db(band.marginDb);
      card.reach.value.textContent = display_format_reach(band.rangeM);
      const shown = band.key !== WIFI_BAND_6 || current.showBand6;
      card.received.box.hidden = !shown;
      card.margin.box.hidden = !shown;
      card.reach.box.hidden = !shown;
    }
    legend_update(current.showBand6);

    display_show_table(result, current.showBand6);
    const wallsColumn =
      current.wallCount === 0
        ? `and with no walls standing the walls column is zero`
        : `and the walls column is that figure times ${display_format_count_word(current.wallCount)}`;
    tableNote.textContent =
      `Free-space loss is 20·log₁₀(d) + 20·log₁₀(f) + 32.4478 with the distance in kilometres and the ` +
      `frequency in megahertz. One wall is the slab formula at ${result.params.thicknessMm} mm of ` +
      `${result.material.label.toLowerCase()}, ${wallsColumn}.` +
      display_describe_thin_slab(result, current.showBand6);

    url_write_state(state);
    widget_redraw();
  }

  /** 다시 그리기만. 모델을 다시 부르지 않는다 — 마지막 결과를 붙들어 둔다. */
  function widget_redraw() {
    if (!lastResult) return;
    const reachByKey = Object.fromEntries(lastResult.bands.map((band) => [band.key, band.rangeM]));
    const drawn = chart_render_curves(
      chartCanvas, lastCurves, lastResult.params.sensitivityDbm, lastResult.params.distanceM, reachByKey,
    );
    const spoken = display_describe_verdict(lastResult);

    const keyText = display_describe_legend(state.showBand6);
    if (!drawn) {
      // 폭 0(숨긴 탭)이면 축을 인용할 수 없다. 그림과 무관한 범례 문구는 언제나 채운다.
      legendNote.textContent = keyText;
      chartCanvas.setAttribute('aria-label', `${spoken.headline} ${spoken.detail}`);
      return;
    }
    const touching = drawn.touching
      ? ` At this distance the ${drawn.touching[0]} and ${drawn.touching[1]} curves are within a line ` +
        `width of each other on this axis — the table separates them.`
      : '';
    // 도달거리가 축 밖이면 화살표로 그려두고, 그 뜻을 글로도 적는다 — 그리지 않고 조용히 자르지 않는다.
    const offChart =
      drawn.offChart.length > 0
        ? ' ' +
          drawn.offChart
            .map(
              (item) =>
                `${item.label}'s reach (${display_format_reach(item.reachM)}) falls ` +
                `${item.side === LOGSCALE_BELOW ? 'short of the left edge' : 'past the right edge'} of this ` +
                `chart — the arrow marks it.`,
            )
            .join(' ')
        : '';
    legendNote.textContent =
      `${keyText} Vertical axis ${display_format_axis_dbm(drawn.scale.low, drawn.step)} to ` +
      `${display_format_axis_dbm(drawn.scale.high, drawn.step)} dBm, rescaled to fit — read it before ` +
      `comparing two settings. The horizontal axis is fixed at ${WIFI_DISTANCE_MIN_M} to ` +
      `${WIFI_DISTANCE_MAX_M} m on a log scale, which is why every curve is a straight line.${touching}${offChart}`;
    chartCanvas.setAttribute('aria-label', `${spoken.headline} ${spoken.detail}`);
  }

  function widget_update_deferred() {
    window.clearTimeout(recomputeTimer);
    recomputeTimer = window.setTimeout(widget_update, RECOMPUTE_DELAY_MS);
  }

  function widget_redraw_deferred() {
    window.clearTimeout(redrawTimer);
    redrawTimer = window.setTimeout(widget_redraw, RECOMPUTE_DELAY_MS);
  }

  const bound = [];
  function widget_bind(target, type, handler) {
    target.addEventListener(type, handler);
    bound.push([target, type, handler]);
  }

  const onInput = () => widget_update_deferred();
  const onChange = () => widget_update();
  for (const slider of [distanceSlider, wallSlider, thicknessSlider, eirpSlider, sensitivitySlider]) {
    widget_bind(slider.input, 'input', onInput);
    widget_bind(slider.input, 'change', onChange);
  }

  /** 재질이 바뀌면 두께 슬라이더의 범위와 값 자체가 바뀐다. 부모가 자식을 다시 맞춘다. */
  widget_bind(materialSelect, 'change', () => {
    const materialKey = model_clamp_material(materialSelect.value);
    slider_update_thickness(materialKey, WIFI_MATERIALS[materialKey].thicknessDefaultMm);
    widget_update();
  });
  widget_bind(band6Input, 'change', onChange);

  for (const preset of WIFI_PRESETS) {
    widget_bind(presets.buttons[preset.key], 'click', () => {
      const materialKey = preset.state.materialKey;
      distanceSlider.input.value = String(model_pick_distance_index(preset.state.distanceM));
      wallSlider.input.value = String(preset.state.wallCount);
      materialSelect.value = materialKey;
      slider_update_thickness(materialKey, model_clamp_thickness(materialKey, preset.state.thicknessMm));
      widget_update();
    });
  }

  widget_bind(window, 'resize', widget_redraw_deferred);

  // 로드 즉시 그린다. 빈 폼으로 뜨지 않는다.
  slider_update_thickness(state.materialKey, state.thicknessMm);
  widget_update();

  return function widget_reset() {
    for (const [target, type, handler] of bound) target.removeEventListener(type, handler);
    bound.length = 0;
    window.clearTimeout(recomputeTimer);
    window.clearTimeout(redrawTimer);
    recomputeTimer = 0;
    redrawTimer = 0;
    delete rootEl.dataset.mounted;
    rootEl.textContent = '';
  };
}

if (typeof document !== 'undefined') {
  const root = document.querySelector(ROOT_SELECTOR);
  if (root) widget_mount(root);
}
