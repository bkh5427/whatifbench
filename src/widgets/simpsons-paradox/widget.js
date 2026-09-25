/**
 * 심슨의 역설 — 위젯 (DOM·이벤트·렌더)
 *
 * 계산은 전부 model.js가 한다. 이 파일은 그리기와 입력만 담당한다.
 * 상태는 URL 쿼리스트링에 싣는다. localStorage를 쓰지 않는다.
 *
 * 막대를 캔버스가 아니라 DOM으로 그린다. 막대 여섯 개와 띠 두 개뿐이라
 * 캔버스가 주는 것(자유로운 좌표)보다 잃는 것(진짜 텍스트, 축소 확대,
 * 스크린리더가 읽는 숫자)이 크다.
 */
import {
  SIMPSON_SIZE_MIN,
  SIMPSON_SIZE_MAX,
  SIMPSON_SIZE_STEP,
  SIMPSON_RATE_MIN,
  SIMPSON_RATE_MAX,
  SIMPSON_RATE_SLIDER_STEP,
  SIMPSON_RATE_EPSILON,
  SIMPSON_PRESET_DEFAULT,
  SIMPSON_PRESETS,
  SIMPSON_CUSTOM_LABELS,
  SIMPSON_VERDICT_AGREES,
  SIMPSON_VERDICT_TIED,
  SIMPSON_VERDICT_MIXED,
  SIMPSON_VERDICT_REVERSED,
  model_read_preset,
  model_clamp_size,
  model_clamp_rate,
  model_check_parameters,
  model_calculate_preset_state,
  model_calculate_result,
  model_calculate_decomposition,
} from './model.js';

import { num_format_count } from '../_shared/numbers.js';
import { urlstate_read_numbers, urlstate_write } from '../_shared/urlstate.js';
import {
  control_build_slider,
  control_build_readout,
  control_build_button_group,
  control_build_table,
  control_build_table_row,
} from '../_shared/controls.js';

// ── DOM 훅 ─────────────────────────────────────────────────
const ROOT_SELECTOR = '[data-widget="simpsons-paradox"]';

// ── URL 쿼리 키 ────────────────────────────────────────────
const URL_KEY_PRESET = 'preset';
/** 슬라이더 8개의 쿼리 키. 상태 키 ↔ 쿼리 키를 한 자리에서만 적는다. */
const URL_KEYS = {
  sizeA1: 'a1n', rateA1: 'a1p',
  sizeA2: 'a2n', rateA2: 'a2p',
  sizeB1: 'b1n', rateB1: 'b1p',
  sizeB2: 'b2n', rateB2: 'b2p',
};
/** 슬라이더를 움직여 어느 프리셋과도 같지 않게 된 상태. */
export const PRESET_CUSTOM = 'custom';

// ── 표시 형식 ──────────────────────────────────────────────
const PERCENT_SCALE = 100;
const PERCENT_DIGITS = 1;
/** URL에 싣는 비율의 자릿수. 소수 여섯 자리면 1198건짜리 표본에서도 건수가 안 흔들린다. */
const URL_RATE_DIGITS = 6;
const RATE_MISSING_TEXT = '—';

// ── 막대 ───────────────────────────────────────────────────
/**
 * 이 값보다 두 비율이 붙으면 막대로는 구분할 수 없다고 적는다.
 * 축을 더 조이는 대신 "구분 불가"라고 말하는 쪽을 고른다 —
 * 비율 막대의 기준선은 0이어야 하고, 0을 버리면 그림이 거짓말을 시작한다.
 */
const BAR_MERGED_GAP = 0.005;
/** 막대 축의 위쪽 끝. 비율이므로 언제나 100%다 — 데이터에 맞춰 자르지 않는다. */
const BAR_AXIS_MAX = 1;

// ── 디바운스 ───────────────────────────────────────────────
const RECOMPUTE_DELAY_MS = 90;

// ── 판정 문구 ──────────────────────────────────────────────
const VERDICT_HEADLINE = {
  [SIMPSON_VERDICT_AGREES]: 'No reversal.',
  [SIMPSON_VERDICT_TIED]: 'On the edge.',
  [SIMPSON_VERDICT_MIXED]: 'No group winner.',
  [SIMPSON_VERDICT_REVERSED]: 'Reversed.',
};
const VERDICT_BADGE = {
  [SIMPSON_VERDICT_AGREES]: 'agrees',
  [SIMPSON_VERDICT_TIED]: 'tied',
  [SIMPSON_VERDICT_MIXED]: 'mixed',
  [SIMPSON_VERDICT_REVERSED]: 'reversed',
};

const TABLE_HEADINGS = ['Group', 'Option A', 'Option B', 'Gap'];

// ── 표시 함수 ──────────────────────────────────────────────

/**
 * 소수 `digits`자리로 **0.5는 올림** 반올림한다.
 *
 * `toFixed`는 이진 부동소수를 반올림한다. 23/80 = 28.75%는 이진으로 28.7499…라
 * `toFixed(1)`이 28.7%로 찍었다(2026-09-24 shown.test.js 격자, 그룹 비율 6건 ·
 * 합산 비율 109건 · 격차 526건). 화면 옆 칸에는 "23 of 80"이 그대로 있어 한 화면이
 * 스스로 모순됐다. 몬티홀 위젯이 같은 사고를 같은 방식으로 이미 고쳐 두었다.
 *
 * 비율은 정수의 비이거나 슬라이더/URL이 주는 소수 여섯 자리다. 참값이 반올림
 * 경계(…5)에서 떨어진 거리는 그 분모에서 ROUND_EPS보다 훨씬 크므로, 이 보정은
 * 경계에 **정확히** 놓인 값만 올리고 나머지는 건드리지 않는다.
 */
const ROUND_EPS = 1e-9;
function display_round_half_up(value, digits) {
  const scale = 10 ** digits;
  return Math.floor(value * scale + 0.5 + ROUND_EPS) / scale;
}

/** 비율을 백분율 문자열로. 정의되지 않은 비율은 대시. */
export function display_format_percent(rate) {
  if (rate === null || !Number.isFinite(rate)) return RATE_MISSING_TEXT;
  const points = display_round_half_up(rate * PERCENT_SCALE, PERCENT_DIGITS);
  return `${points.toFixed(PERCENT_DIGITS)}%`;
}

/** 격차는 부호를 붙여 찍는다. 0.0%p 앞의 `+`는 붙이지 않는다. */
export function display_format_gap(gap) {
  if (gap === null || !Number.isFinite(gap)) return RATE_MISSING_TEXT;
  const points = gap * PERCENT_SCALE;
  const sign = Math.abs(gap) <= SIMPSON_RATE_EPSILON ? '' : points > 0 ? '+' : '−';
  const size = display_round_half_up(Math.abs(points), PERCENT_DIGITS);
  return `${sign}${size.toFixed(PERCENT_DIGITS)} pp`;
}

export const display_format_count = num_format_count;

/** "512 of 825" — 비율 옆에 건수를 같이 찍는다. 비율만 찍으면 가중치가 사라진다. */
export function display_format_share(successCount, size) {
  return `${display_format_count(successCount)} of ${display_format_count(size)}`;
}

/**
 * 막대로 두 비율을 구분할 수 있는가.
 * 못 하면 축을 조이는 대신 캡션이 그렇게 말한다.
 */
export function display_check_bars_merged(result) {
  const pairs = [
    [result.options.a.groups[1].rate, result.options.b.groups[1].rate],
    [result.options.a.groups[2].rate, result.options.b.groups[2].rate],
    [result.options.a.pooledRate, result.options.b.pooledRate],
  ];
  return pairs.some(([first, second]) => {
    if (first === null || second === null) return false;
    const gap = Math.abs(first - second);
    return gap > SIMPSON_RATE_EPSILON && gap < BAR_MERGED_GAP;
  });
}

// ── 상태 ───────────────────────────────────────────────────

/** 지금 상태가 어느 프리셋과 정확히 같은가. 아니면 null. */
export function state_pick_matching_preset(state) {
  for (const preset of SIMPSON_PRESETS) {
    const candidate = model_calculate_preset_state(preset.key);
    const same = Object.keys(URL_KEYS).every((key) => {
      const gap = Math.abs(candidate[key] - state[key]);
      return key.startsWith('size') ? gap === 0 : gap <= SIMPSON_RATE_EPSILON;
    });
    if (same) return preset.key;
  }
  return null;
}

/** 프리셋 이름 → 화면 라벨 묶음. 프리셋이 아니면 중립 라벨. */
export function state_read_labels(presetKey) {
  return model_read_preset(presetKey) ?? SIMPSON_CUSTOM_LABELS;
}

/**
 * 쿼리스트링에서 상태를 읽는다.
 *
 * 숫자가 하나도 없으면 기본 프리셋을 통째로 싣는다 — 빈 폼으로 두지 않는다.
 * 숫자가 있으면 그것이 진실이고, **프리셋 이름은 숫자와 대조해 다시 정한다.**
 * URL의 `preset=berkeley`를 그대로 믿으면 숫자를 손댄 링크가 화면에
 * "Berkeley"라고 적힌 채로 다른 그림을 보여준다.
 */
export function url_read_state(search) {
  const params = new URLSearchParams(search ?? '');
  const fallback = model_calculate_preset_state(SIMPSON_PRESET_DEFAULT);
  const hasNumbers = Object.values(URL_KEYS).some((key) => params.has(key));
  if (!hasNumbers) return { ...fallback, preset: SIMPSON_PRESET_DEFAULT };

  const spec = {};
  for (const [stateKey, urlKey] of Object.entries(URL_KEYS)) {
    spec[urlKey] = {
      fallback: fallback[stateKey],
      clamp: stateKey.startsWith('size') ? model_clamp_size : model_clamp_rate,
    };
  }
  const read = urlstate_read_numbers(search, spec);

  const state = {};
  for (const [stateKey, urlKey] of Object.entries(URL_KEYS)) state[stateKey] = read[urlKey];
  state.preset = state_pick_matching_preset(state) ?? PRESET_CUSTOM;
  return state;
}

/** 현재 상태를 주소창에 쓴다. */
export function url_write_state(state) {
  const written = {};
  for (const [stateKey, urlKey] of Object.entries(URL_KEYS)) {
    written[urlKey] = stateKey.startsWith('size')
      ? state[stateKey]
      : Number(state[stateKey].toFixed(URL_RATE_DIGITS));
  }
  written[URL_KEY_PRESET] = state.preset;
  urlstate_write(written);
}

/**
 * 판정 문장. 첫 줄에 결론 하나, 나머지는 뒤 문장으로 민다.
 * **주어는 언제나 모델이다** — "실제로 ~이다"라고 쓰지 않는다.
 */
export function display_describe_verdict(result, labels) {
  const nameA = labels.optionLabels.a;
  const nameB = labels.optionLabels.b;
  const group1 = labels.groupLabels[1];
  const group2 = labels.groupLabels[2];

  const headline = VERDICT_HEADLINE[result.verdict];
  const winnerIn = (lead) => (lead === null ? null : lead === 0 ? null : lead > 0 ? nameA : nameB);
  const groupWinner = winnerIn(result.leads[1]);
  const pooledWinner = winnerIn(result.leads.pooled);

  let detail;
  if (result.verdict === SIMPSON_VERDICT_REVERSED) {
    detail =
      `The model puts ${groupWinner} ahead in ${group1} and in ${group2}, and ${pooledWinner} ahead ` +
      `once the two are pooled. None of the four group figures changed — ` +
      `${display_format_percent(result.options.a.weight)} of the ${nameA} trials sat in ${group1}, ` +
      `against ${display_format_percent(result.options.b.weight)} on the ${nameB} side.`;
  } else if (result.verdict === SIMPSON_VERDICT_MIXED) {
    // leads[1]·leads[2]가 null이면 그 그룹엔 애초에 두 선택지를 견줄 시도가 없다 —
    // "두 그룹이 승자를 놓고 엇갈린다"는 문장은 비교가 실제로 있을 때만 참이다.
    const emptyGroup1 = result.leads[1] === null;
    const emptyGroup2 = result.leads[2] === null;
    if (emptyGroup1 && emptyGroup2) {
      detail =
        `Neither ${group1} nor ${group2} has trials for both options at once, so the model has no ` +
        `winner to compare in either group — there is nothing yet for a pooled figure to agree with ` +
        `or reverse. Raise the trials sliders above zero on both sides in each group.`;
    } else if (emptyGroup1 || emptyGroup2) {
      const emptyName = emptyGroup1 ? group1 : group2;
      const otherName = emptyGroup1 ? group2 : group1;
      detail =
        `${emptyName} has no trials for one of the two options, so the model has no winner to compare ` +
        `there. A winner in ${otherName} alone is not a group-wide lead for the pooled figure to reverse.`;
    } else {
      detail =
        `The two groups do not agree on a winner, so there is no group-wide lead for the pooled ` +
        `figure to overturn. Move the rates until one option leads in both ${group1} and ${group2}.`;
    }
  } else if (result.verdict === SIMPSON_VERDICT_TIED) {
    detail =
      `Two of the figures the model compares are exactly level, which is the boundary rather than ` +
      `a reversal. Nudge any slider to fall to one side of it.`;
  } else {
    detail =
      `The model puts ${groupWinner} ahead in ${group1}, in ${group2}, and in the pooled total. ` +
      `The two mixtures are ${display_format_percent(result.options.a.weight)} and ` +
      `${display_format_percent(result.options.b.weight)} — the closer those two sit, ` +
      `the less room the pooled figure has to move.`;
  }
  return { headline, detail, badge: VERDICT_BADGE[result.verdict] };
}

/**
 * 시도가 하나도 없는 선택지를 짚어 준다.
 * 빈 쪽이 하나일 때와 둘일 때를 갈라 말한다 — 슬라이더 최솟값이 0이므로
 * 두 선택지가 동시에 비는 상태를 독자가 만들 수 있다.
 */
export function display_describe_empty_options(state, labels) {
  const emptyA = state.sizeA1 + state.sizeA2 <= 0;
  const emptyB = state.sizeB1 + state.sizeB2 <= 0;
  const tail = 'so the model has no pooled rate to report.';
  if (emptyA && emptyB) {
    return `Neither option has any trials, ${tail} Raise a trials slider on each side above zero.`;
  }
  if (emptyA || emptyB) {
    const emptyName = emptyA ? labels.optionLabels.a : labels.optionLabels.b;
    return `${emptyName} has no trials at all, ${tail} Raise one of its trials sliders above zero.`;
  }
  return `The sliders sit outside the range the model accepts, ${tail}`;
}

/**
 * 가중치 띠가 무엇을 말하는지 한 문장으로.
 * 항등식의 둘째 항이 화면의 어디에 있는지 글로 이어 준다.
 */
export function display_describe_mixing(state, result, labels) {
  const parts = model_calculate_decomposition(state);
  return (
    `Reading the identity above, left to right: the two within-group margins, weighted by where ` +
    `${labels.optionLabels.a} ran its trials, come to ${display_format_gap(parts.withinTerm)}. ` +
    `The difference in mixing adds ${display_format_gap(parts.mixingTerm)}. ` +
    `Together they make the pooled gap of ${display_format_gap(parts.total)}.`
  );
}

// ── 막대 ───────────────────────────────────────────────────

/** 막대 한 줄. 라벨 + 트랙 + 채움 + 값. 값은 진짜 텍스트다. */
function widget_build_bar(labelText) {
  const row = document.createElement('div');
  row.className = 'bar-row';

  const label = document.createElement('span');
  label.className = 'bar-label';
  label.textContent = labelText;

  const track = document.createElement('span');
  track.className = 'bar-track';

  const fill = document.createElement('span');
  fill.className = 'bar-fill';
  track.appendChild(fill);

  const value = document.createElement('span');
  value.className = 'bar-value';

  const share = document.createElement('span');
  share.className = 'bar-share';

  row.append(label, track, value, share);
  return { row, label, track, fill, value, share };
}

/** 막대 한 줄을 갱신한다. 이미 있는 DOM을 바꾼다 — 매번 새로 만들지 않는다. */
function display_update_bar(bar, cell, seriesIndex) {
  const rate = cell.rate;
  const width = rate === null ? 0 : (rate / BAR_AXIS_MAX) * PERCENT_SCALE;
  bar.fill.style.width = `${width}%`;
  bar.fill.dataset.series = String(seriesIndex);
  bar.value.textContent = display_format_percent(rate);
  bar.share.textContent = cell.size > 0 ? display_format_share(cell.success, cell.size) : 'no trials';
}

/** 가중치 띠 한 줄. 한 선택지의 시도가 그룹 1·2에 어떻게 갈렸는지 100% 스택으로. */
function widget_build_strip(labelText) {
  const row = document.createElement('div');
  row.className = 'strip-row';

  const label = document.createElement('span');
  label.className = 'bar-label';
  label.textContent = labelText;

  const track = document.createElement('span');
  track.className = 'strip-track';

  const first = document.createElement('span');
  first.className = 'strip-part';
  first.dataset.part = '1';

  const second = document.createElement('span');
  second.className = 'strip-part';
  second.dataset.part = '2';

  track.append(first, second);

  const value = document.createElement('span');
  value.className = 'bar-value';

  row.append(label, track, value);
  return { row, track, first, second, value };
}

function display_update_strip(strip, option, labels) {
  const weight = option.weight ?? 0;
  strip.first.style.width = `${weight * PERCENT_SCALE}%`;
  strip.second.style.width = `${(1 - weight) * PERCENT_SCALE}%`;
  strip.first.title = labels.groupLabels[1];
  strip.second.title = labels.groupLabels[2];
  strip.value.textContent = display_format_percent(option.weight);
}

// ── 위젯 ───────────────────────────────────────────────────

/** 위젯 전체를 만들고 첫 렌더까지 끝낸다. 해제 함수를 돌려준다. */
export function widget_mount(rootEl) {
  if (!rootEl) return null;
  // 모듈이 두 번 평가되면(HMR, 스크립트 중복) 같은 자리에 위젯이 두 벌 붙는다.
  if (rootEl.dataset.mounted === 'true') return null;
  rootEl.dataset.mounted = 'true';
  rootEl.classList.add('widget');

  const state = url_read_state(typeof window === 'undefined' ? '' : window.location.search);

  const heading = document.createElement('h2');
  heading.className = 'sr-only';
  heading.textContent = 'Simpson’s paradox mixer';

  // ── 프리셋 버튼 ──
  const presets = control_build_button_group(
    'Load a published data set',
    SIMPSON_PRESETS.map((preset) => ({ key: preset.key, label: preset.name })),
  );

  // ── 슬라이더 8개 ──
  const sliders = {};
  const sliderBlocks = [];
  for (const group of ['1', '2']) {
    const block = document.createElement('fieldset');
    block.className = 'widget-group';
    const caption = document.createElement('legend');
    caption.className = 'widget-group-title';
    block.appendChild(caption);

    for (const option of ['a', 'b']) {
      const upper = option.toUpperCase();
      const sizeKey = `size${upper}${group}`;
      const rateKey = `rate${upper}${group}`;

      const sizeSlider = control_build_slider(
        `simpson-${option}${group}-n`,
        'trials',
        `How many trials this option ran here — the slider that moves the pooled figure without touching a single rate.`,
        { min: SIMPSON_SIZE_MIN, max: SIMPSON_SIZE_MAX, step: SIMPSON_SIZE_STEP, value: state[sizeKey] },
      );
      const rateSlider = control_build_slider(
        `simpson-${option}${group}-p`,
        'success rate',
        `The share of those trials that succeeded. The slider has no notches, so how far an arrow key moves it is up to the browser.`,
        {
          min: SIMPSON_RATE_MIN,
          max: SIMPSON_RATE_MAX,
          step: SIMPSON_RATE_SLIDER_STEP,
          value: state[rateKey],
        },
      );
      block.append(sizeSlider.row, rateSlider.row);
      sliders[sizeKey] = sizeSlider;
      sliders[rateKey] = rateSlider;
    }
    sliderBlocks.push({ group, block, caption });
  }

  const controls = document.createElement('div');
  controls.className = 'widget-controls';
  controls.append(presets.group, ...sliderBlocks.map((entry) => entry.block));

  // ── 막대 ──
  const chart = document.createElement('div');
  chart.className = 'bars';

  const bars = {};
  const barCaptions = {};
  for (const section of ['1', '2', 'pooled']) {
    const block = document.createElement('div');
    block.className = 'bar-block';
    if (section === 'pooled') block.dataset.pooled = 'true';

    const title = document.createElement('p');
    title.className = 'bar-block-title';
    block.appendChild(title);
    barCaptions[section] = title;

    for (const option of ['a', 'b']) {
      const bar = widget_build_bar('');
      bars[`${option}${section}`] = bar;
      block.appendChild(bar.row);
    }
    chart.appendChild(block);
  }

  // ── 가중치 띠 ──
  const stripBlock = document.createElement('div');
  // 띠 줄은 칸이 셋(라벨·띠·값)이다 — 막대 블록의 네 칸 격자에 그대로 흘리면
  // 두 번째 줄이 첫 줄의 빈 넷째 칸부터 채워져 어긋난다. 전용 격자를 준다.
  stripBlock.className = 'bar-block strip-block';
  const stripTitle = document.createElement('p');
  stripTitle.className = 'bar-block-title';
  stripBlock.appendChild(stripTitle);
  const strips = { a: widget_build_strip(''), b: widget_build_strip('') };
  stripBlock.append(strips.a.row, strips.b.row);

  const stripNote = document.createElement('p');
  stripNote.className = 'legend-note';
  stripBlock.appendChild(stripNote);

  // ── 판정 배너 ──
  const verdict = document.createElement('p');
  verdict.className = 'verdict';
  const verdictHeadline = document.createElement('strong');
  const verdictDetail = document.createElement('span');
  verdict.append(verdictHeadline, document.createTextNode(' '), verdictDetail);

  // ── 표 ──
  const table = control_build_table('Rates by group and pooled', TABLE_HEADINGS);

  rootEl.append(heading, controls, verdict, chart, stripBlock, table.scroll);

  // ── 갱신 ──
  let recomputeTimer = 0;

  function state_read_sliders() {
    const next = {};
    for (const key of Object.keys(URL_KEYS)) {
      const raw = Number(sliders[key].input.value);
      next[key] = key.startsWith('size') ? model_clamp_size(raw) : model_clamp_rate(raw);
    }
    return next;
  }

  function display_show_sliders(current, labels) {
    for (const group of ['1', '2']) {
      for (const option of ['a', 'b']) {
        const upper = option.toUpperCase();
        const optionName = labels.optionLabels[option];
        const sizeKey = `size${upper}${group}`;
        const rateKey = `rate${upper}${group}`;

        sliders[sizeKey].input.value = String(current[sizeKey]);
        sliders[rateKey].input.value = String(current[rateKey]);
        sliders[sizeKey].label.textContent = `${optionName} — ${labels.unitLabel}`;
        sliders[rateKey].label.textContent = `${optionName} — ${labels.successLabel} rate`;
        sliders[sizeKey].output.textContent = display_format_count(current[sizeKey]);
        sliders[rateKey].output.textContent = display_format_percent(current[rateKey]);
        // 값 슬라이더는 인덱스가 아니지만, 비율은 0~1로 읽히므로 백분율을 따로 준다.
        sliders[rateKey].input.setAttribute('aria-valuetext', display_format_percent(current[rateKey]));
      }
    }
    for (const entry of sliderBlocks) entry.caption.textContent = labels.groupLabels[entry.group];
  }

  function display_show_bars(result, labels) {
    barCaptions['1'].textContent = labels.groupLabels[1];
    barCaptions['2'].textContent = labels.groupLabels[2];
    barCaptions.pooled.textContent = `Both groups added together`;
    stripTitle.textContent = `Where each option ran its trials — share in ${labels.groupLabels[1]}`;

    for (const option of ['a', 'b']) {
      const seriesIndex = option === 'a' ? 1 : 2;
      const optionData = result.options[option];
      for (const group of ['1', '2']) {
        const bar = bars[`${option}${group}`];
        bar.label.textContent = labels.optionLabels[option];
        display_update_bar(bar, optionData.groups[group], seriesIndex);
      }
      const pooledBar = bars[`${option}pooled`];
      pooledBar.label.textContent = labels.optionLabels[option];
      display_update_bar(
        pooledBar,
        { rate: optionData.pooledRate, size: optionData.totalSize, success: optionData.pooledSuccess },
        seriesIndex,
      );
      strips[option].row.querySelector('.bar-label').textContent = labels.optionLabels[option];
      display_update_strip(strips[option], optionData, labels);
    }
  }

  function display_show_table(result, labels) {
    table.body.textContent = '';
    const rows = [
      [labels.groupLabels[1], result.options.a.groups[1].rate, result.options.b.groups[1].rate],
      [labels.groupLabels[2], result.options.a.groups[2].rate, result.options.b.groups[2].rate],
      ['Pooled', result.options.a.pooledRate, result.options.b.pooledRate],
    ];
    for (const [name, rateA, rateB] of rows) {
      const gap = rateA === null || rateB === null ? null : rateA - rateB;
      table.body.appendChild(
        control_build_table_row(
          [name, display_format_percent(rateA), display_format_percent(rateB), display_format_gap(gap)],
          { current: name === 'Pooled' },
        ),
      );
    }
    // 표 머리글의 선택지 이름도 프리셋을 따라간다.
    const headCells = table.table.querySelectorAll('th');
    if (headCells[1]) headCells[1].textContent = labels.optionLabels.a;
    if (headCells[2]) headCells[2].textContent = labels.optionLabels.b;
    if (headCells[3]) headCells[3].textContent = 'Gap';
  }

  /**
   * 비교할 것이 없는 상태. 배너만 바꾸면 **막대·띠·표가 앞 상태의 숫자를 그대로 들고
   * 있다** — 슬라이더는 시도 0을 적고 배너는 "no trials at all"이라 말하는데 막대에는
   * "171 of 341"이 남아 있었다(2026-09-25 전수검사). `hidden`은 화면과 접근성 트리에서
   * 함께 빼므로 복사·스크린리더에도 남지 않는다.
   */
  function display_show_invalid(message) {
    verdict.removeAttribute('data-state');
    verdictHeadline.textContent = 'Nothing to compare.';
    verdictDetail.textContent = message;
    display_clear_figures();
    chart.hidden = true;
    stripBlock.hidden = true;
    table.scroll.hidden = true;
    chart.setAttribute('aria-hidden', 'true');
  }

  /**
   * 숫자를 **지운다.** `hidden`만으로는 모자랐다 — `.bar-block`이 `display: grid`를
   * 저작자 스타일로 정해 브라우저 기본 `[hidden]{display:none}`을 이겼고, 띠 블록만
   * 화면에 남아 앞 상태의 가중치("Option A 68.9%")와 앞 상태를 가리키는 설명문을
   * 계속 말했다(2026-09-25). CSS 쪽도 고쳤지만, 글자를 지우는 쪽이 스타일시트가
   * 없거나 늦게 오는 환경에서도 앞 상태를 못 남긴다.
   */
  function display_clear_figures() {
    for (const caption of Object.values(barCaptions)) caption.textContent = '';
    for (const bar of Object.values(bars)) {
      bar.value.textContent = '';
      bar.share.textContent = '';
      bar.fill.style.width = '0%';
    }
    stripTitle.textContent = '';
    stripNote.textContent = '';
    for (const strip of Object.values(strips)) {
      strip.row.querySelector('.bar-label').textContent = '';
      strip.value.textContent = '';
    }
    table.body.textContent = '';
  }

  /** 다시 비교할 것이 생겼다. 숨긴 셋을 되돌린다. */
  function display_show_figures() {
    chart.hidden = false;
    stripBlock.hidden = false;
    table.scroll.hidden = false;
    chart.removeAttribute('aria-hidden');
  }

  /** 상태 하나를 받아 화면 전체를 맞춘다. 계산 경로는 여기 하나뿐이다. */
  function widget_update(next = null) {
    const current = next ?? { ...state_read_sliders(), preset: PRESET_CUSTOM };
    current.preset = state_pick_matching_preset(current) ?? PRESET_CUSTOM;
    const labels = state_read_labels(current.preset);

    display_show_sliders(current, labels);
    for (const [key, button] of Object.entries(presets.buttons)) {
      button.setAttribute('aria-pressed', String(key === current.preset));
    }

    const check = model_check_parameters(current);
    if (!check.ok) {
      display_show_invalid(display_describe_empty_options(current, labels));
      url_write_state(current);
      return;
    }
    display_show_figures();

    const result = model_calculate_result(current);
    const spoken = display_describe_verdict(result, labels);

    verdict.dataset.state = result.tone;
    verdictHeadline.textContent = spoken.headline;
    verdictDetail.textContent = spoken.detail;

    display_show_bars(result, labels);
    display_show_table(result, labels);

    const merged = display_check_bars_merged(result)
      ? ` Two of the pairs above differ by less than ${(BAR_MERGED_GAP * PERCENT_SCALE).toFixed(1)} points, ` +
        `which the bars cannot separate — read the figures beside them instead.`
      : '';
    stripNote.textContent = `${display_describe_mixing(current, result, labels)}${merged}`;

    url_write_state(current);
  }

  function widget_update_deferred() {
    window.clearTimeout(recomputeTimer);
    recomputeTimer = window.setTimeout(() => widget_update(), RECOMPUTE_DELAY_MS);
  }

  function widget_load_preset(key) {
    const loaded = model_calculate_preset_state(key);
    if (loaded) widget_update(loaded);
  }

  // 붙인 리스너를 그대로 들고 있어야 뗄 수 있다.
  const bound = [];
  function widget_bind(target, type, handler) {
    target.addEventListener(type, handler);
    bound.push([target, type, handler]);
  }

  const onInput = () => widget_update_deferred();
  const onChange = () => widget_update();
  for (const key of Object.keys(URL_KEYS)) {
    widget_bind(sliders[key].input, 'input', onInput);
    widget_bind(sliders[key].input, 'change', onChange);
  }
  for (const [key, button] of Object.entries(presets.buttons)) {
    widget_bind(button, 'click', () => widget_load_preset(key));
  }

  widget_update(state);

  return function widget_reset() {
    for (const [target, type, handler] of bound) target.removeEventListener(type, handler);
    bound.length = 0;
    window.clearTimeout(recomputeTimer);
    delete rootEl.dataset.mounted;
    rootEl.textContent = '';
  };
}

if (typeof document !== 'undefined') {
  const root = document.querySelector(ROOT_SELECTOR);
  if (root) widget_mount(root);
}
