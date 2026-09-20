/**
 * Wi-Fi through walls — 위젯 테스트
 *
 * 순수 헬퍼(축 계산·표시 문자열·URL 상태)와, DOM 스텁 위에서만 드러나는 것
 * (리스너·타이머 수명, 종속 슬라이더 재조정, 접근성 속성)을 함께 본다.
 * **소스 문자열을 훑지 않는다.** 동작을 계측한다.
 */
import { describe, it, expect, afterEach } from 'vitest';
import {
  WIFI_MATERIALS,
  WIFI_BANDS,
  WIFI_BAND_24,
  WIFI_BAND_5,
  WIFI_BAND_6,
  WIFI_DISTANCE_MIN_M,
  WIFI_DISTANCE_MAX_M,
  WIFI_DISTANCE_DEFAULT_M,
  WIFI_DISTANCE_LADDER,
  WIFI_WALL_COUNT_DEFAULT,
  WIFI_WALL_COUNT_MAX,
  WIFI_EIRP_DEFAULT_DBM,
  WIFI_SENSITIVITY_DEFAULT_DBM,
  model_calculate_result,
  model_calculate_curves,
  model_pick_distance_index,
} from './model.js';
import {
  WIFI_PRESETS,
  widget_mount,
  url_read_state,
  state_read_params,
  state_pick_preset,
  chart_calculate_scale,
  display_format_db,
  display_format_signed_db,
  display_format_axis_dbm,
  display_format_distance,
  display_format_reach,
  display_describe_walls,
  display_describe_verdict,
  display_describe_gap,
  display_describe_thin_slab,
  chart_wrap_title,
} from './widget.js';
import { fixture_create_dom } from '../_shared/dom-stub.js';

/**
 * 위젯이 붙이는 리스너 개수. **리터럴이다.**
 * 슬라이더 5개 × (input, change) = 10, 재질 select change 1,
 * 6 GHz 체크박스 change 1, 프리셋 버튼 5개 click 5, window resize 1 → 18
 */
const WIDGET_LISTENER_COUNT = 18;
const SLIDER_COUNT = 5;
const PRESET_COUNT = 5;

/** 기본 상태의 모델 파라미터. 카드 값을 대조할 때 쓴다. */
const DEFAULT_PARAMS = {
  distanceM: WIFI_DISTANCE_DEFAULT_M,
  wallCount: WIFI_WALL_COUNT_DEFAULT,
  materialKey: 'concrete',
  thicknessMm: 100,
  eirpDbm: WIFI_EIRP_DEFAULT_DBM,
  sensitivityDbm: WIFI_SENSITIVITY_DEFAULT_DBM,
};

let openDom = null;
afterEach(() => {
  if (openDom) openDom.restore();
  openDom = null;
});

function widget_build_mounted(options = {}) {
  const dom = fixture_create_dom(options);
  openDom = dom;
  dom.install();
  const widget_reset = widget_mount(dom.root);
  return { dom, widget_reset };
}

/** 조작부를 이름으로 집는다. 인덱스로 세면 순서를 바꾼 순간 테스트가 딴 것을 잡는다. */
function fixture_read_control(dom, id) {
  return dom.root.querySelector(`[id="${id}"]`);
}

// ── URL 상태 ────────────────────────────────────────────────

describe('URL 상태', () => {
  it('파라미터가 없으면 기본값으로 뜬다 (빈 폼 금지)', () => {
    expect(url_read_state('')).toEqual({
      distanceM: WIFI_DISTANCE_DEFAULT_M,
      wallCount: WIFI_WALL_COUNT_DEFAULT,
      materialKey: 'concrete',
      thicknessMm: 100,
      eirpDbm: WIFI_EIRP_DEFAULT_DBM,
      sensitivityDbm: WIFI_SENSITIVITY_DEFAULT_DBM,
      showBand6: true,
    });
  });

  it('깨진 값은 최솟값이 아니라 기본값으로 돌아간다', () => {
    // `Number('')`는 0, `Number('0x10')`은 16이라 `??`로는 안 걸러진다.
    const state = url_read_state('?d=&n=0x10&t=abc&m=steel&eirp=1e2&sens=&b6=yes');
    expect(state.distanceM).toBe(WIFI_DISTANCE_DEFAULT_M);
    expect(state.wallCount).toBe(WIFI_WALL_COUNT_DEFAULT);
    expect(state.materialKey).toBe('concrete');
    expect(state.thicknessMm).toBe(100);
    expect(state.eirpDbm).toBe(WIFI_EIRP_DEFAULT_DBM);
    expect(state.sensitivityDbm).toBe(WIFI_SENSITIVITY_DEFAULT_DBM);
    expect(state.showBand6).toBe(true);
  });

  it('음수 감도는 통과하고 범위 밖 값은 잘린다', () => {
    expect(url_read_state('?sens=-90').sensitivityDbm).toBe(-90);
    expect(url_read_state('?sens=-200').sensitivityDbm).toBe(-95);
    expect(url_read_state('?d=999').distanceM).toBe(WIFI_DISTANCE_MAX_M);
    expect(url_read_state('?d=0.01').distanceM).toBe(WIFI_DISTANCE_MIN_M);
    expect(url_read_state('?n=99').wallCount).toBe(8);
  });

  it('두께의 유효범위를 **URL의 재질이** 정한다 (부모가 자식을 자른다)', () => {
    // 재질을 먼저 읽지 않고 두께를 자르면 석고보드에 100 mm가 실린 링크가 통과한다.
    expect(url_read_state('?m=plasterboard&t=100').thicknessMm).toBe(25);
    expect(url_read_state('?m=plasterboard').thicknessMm).toBe(12.5);
    expect(url_read_state('?m=glass&t=7').thicknessMm).toBe(7);
    expect(url_read_state('?m=glass&t=200').thicknessMm).toBe(12);
  });

  it('6 GHz 스위치는 0에서만 꺼진다', () => {
    expect(url_read_state('?b6=0').showBand6).toBe(false);
    expect(url_read_state('?b6=1').showBand6).toBe(true);
    expect(url_read_state('?b6=2').showBand6).toBe(true);
  });

  it('그리기용 스위치가 모델 파라미터에 새지 않는다', () => {
    const params = state_read_params(url_read_state('?b6=0'));
    expect('showBand6' in params).toBe(false);
    expect(Object.keys(params).sort()).toEqual(
      ['distanceM', 'eirpDbm', 'materialKey', 'sensitivityDbm', 'thicknessMm', 'wallCount'],
    );
  });
});

// ── 프리셋 ──────────────────────────────────────────────────

describe('프리셋', () => {
  it('다섯 개 전부 슬라이더 범위 안의 값을 싣는다', () => {
    expect(WIFI_PRESETS.length).toBe(PRESET_COUNT);
    for (const preset of WIFI_PRESETS) {
      const material = WIFI_MATERIALS[preset.state.materialKey];
      expect(material).toBeTruthy();
      expect(WIFI_DISTANCE_LADDER).toContain(preset.state.distanceM);
      expect(preset.state.thicknessMm).toBeGreaterThanOrEqual(material.thicknessMinMm);
      expect(preset.state.thicknessMm).toBeLessThanOrEqual(material.thicknessMaxMm);
    }
  });

  it('프리셋끼리 같은 상태를 싣지 않는다 (버튼 두 개가 동시에 눌린 것처럼 보이지 않게)', () => {
    const seen = new Set(WIFI_PRESETS.map((preset) => JSON.stringify(preset.state)));
    expect(seen.size).toBe(PRESET_COUNT);
  });

  it('어느 프리셋과도 다르면 눌린 버튼이 없다', () => {
    expect(state_pick_preset({ ...WIFI_PRESETS[2].state })).toBe('concrete');
    expect(state_pick_preset({ ...WIFI_PRESETS[2].state, wallCount: 7 })).toBeNull();
  });
});

// ── 축 ──────────────────────────────────────────────────────

describe('세로축', () => {
  it('감도선을 범위에 넣는다 — 기준선이 그림 밖으로 나가지 않게', () => {
    const curves = model_calculate_curves(DEFAULT_PARAMS, true);
    const scale = chart_calculate_scale(curves, -95);
    expect(scale.low).toBeLessThan(-95);
    expect(scale.high).toBeGreaterThan(-95);
  });

  it('모든 곡선의 점이 축 안에 들어온다', () => {
    for (const wallCount of [0, 1, 4, 8]) {
      const params = { ...DEFAULT_PARAMS, wallCount };
      const curves = model_calculate_curves(params, true);
      const scale = chart_calculate_scale(curves, params.sensitivityDbm);
      for (const curve of curves) {
        for (const point of curve.points) {
          expect(point.receivedDbm).toBeGreaterThanOrEqual(scale.low);
          expect(point.receivedDbm).toBeLessThanOrEqual(scale.high);
        }
      }
    }
  });

  it('데이터가 없어도 유효한 축을 낸다 (좌표가 NaN이 되지 않게)', () => {
    const scale = chart_calculate_scale([], Number.NaN);
    expect(Number.isFinite(scale.low)).toBe(true);
    expect(scale.high).toBeGreaterThan(scale.low);
  });

  it('값이 전부 같아도 최소 표시 폭을 준다', () => {
    const flat = [{ key: 'x', points: [{ distanceM: 1, receivedDbm: -50 }, { distanceM: 2, receivedDbm: -50 }] }];
    const scale = chart_calculate_scale(flat, -50);
    expect(scale.high - scale.low).toBeGreaterThanOrEqual(10);
  });
});

// ── 표시 문자열 ─────────────────────────────────────────────

describe('표시 문자열', () => {
  it('dB는 유니코드 마이너스를 쓴다 (하이픈과 섞이지 않게)', () => {
    expect(display_format_db(-48.256)).toBe('−48.3');
    expect(display_format_db(13.0303, 2)).toBe('13.03');
    expect(display_format_db(Number.NaN)).toBe('—');
  });

  it('증가분은 부호를 앞에 붙인다 — 방향이 숫자보다 먼저 읽힌다', () => {
    expect(display_format_signed_db(5.9602)).toBe('+5.96');
    expect(display_format_signed_db(-0.0795)).toBe('−0.08');
    expect(display_format_signed_db(Number.NaN)).toBe('—');
  });

  it('축 라벨 자릿수를 간격의 정밀도로 정한다 — 크기로 정하지 않는다', () => {
    // 간격 0.5 dB에서 정수로 찍으면 −70.5와 −71.0이 둘 다 "−71"이 된다.
    expect(display_format_axis_dbm(-70.5, 0.5)).toBe('−70.5');
    expect(display_format_axis_dbm(-70, 5)).toBe('−70');
    expect(display_format_axis_dbm(-70.25, 0.25)).toBe('−70.25');
    expect(display_format_axis_dbm(Number.NaN, 5)).toBe('—');
  });

  it('거리 표기와 도달거리 표기', () => {
    expect(display_format_distance(10)).toBe('10 m');
    expect(display_format_distance(486.6)).toBe('486.6 m');
    expect(display_format_reach(486.6)).toBe('486.6 m');
    expect(display_format_reach(0.2)).toBe('under 0.5 m');
    expect(display_format_reach(0)).toBe('—');
  });

  it('벽을 세는 말이 재질을 따라간다', () => {
    expect(display_describe_walls(0, 'concrete', 100)).toBe('no walls at all');
    expect(display_describe_walls(1, 'concrete', 100)).toBe('one 100 mm concrete wall');
    expect(display_describe_walls(3, 'plasterboard', 12.5)).toBe('three 12.5 mm plasterboard sheets');
    expect(display_describe_walls(2, 'glass', 6)).toBe('two 6 mm glass panes');
  });

  it('배지 문장이 격차가 움직이는 폭 두 숫자를 싣는다 ("X dB 아래" 문장은 배너로 옮겼다)', () => {
    const sentence = display_describe_gap(model_calculate_result(DEFAULT_PARAMS));
    expect(sentence).toContain('5.96');
    expect(sentence).toContain('7.07');
    expect(sentence).toContain('widens');
    // 중복 방지 — "5 GHz is X dB below/above 2.4 GHz" 문장은 배너 헤드라인의 몫이다.
    expect(sentence).not.toContain('below 2.4 GHz');
  });

  it('석고보드에서는 배지가 "좁힌다"고 말한다', () => {
    const sentence = display_describe_gap(
      model_calculate_result({ ...DEFAULT_PARAMS, materialKey: 'plasterboard', thicknessMm: 12.5 }),
    );
    expect(sentence).toContain('narrows');
    expect(sentence).toContain('0.08');
  });

  it('투과 최대점 근처면 화면이 그 사실을 말한다 — 조용히 0에 가까운 숫자를 뱉지 않는다', () => {
    const near = model_calculate_result({ ...DEFAULT_PARAMS, materialKey: 'glass', thicknessMm: 11 });
    expect(display_describe_thin_slab(near, true)).toContain('half wavelength');
    expect(display_describe_thin_slab(near, true)).toContain('0.38');
    // 콘크리트 기본값에서는 아무 말도 하지 않는다.
    expect(display_describe_thin_slab(model_calculate_result(DEFAULT_PARAMS), true)).toBe('');
  });

  it('6 GHz를 끄면 그 대역의 경고는 말하지 않는다 (화면에 없는 곡선)', () => {
    const near = model_calculate_result({ ...DEFAULT_PARAMS, materialKey: 'glass', thicknessMm: 9 });
    expect(near.byKey[WIFI_BAND_6].smallWallLoss).toBe(true);
    expect(display_describe_thin_slab(near, true)).toContain('6 GHz');
    expect(display_describe_thin_slab(near, false)).not.toContain('6 GHz');
  });

  it('판정 문장에 단정하거나 권고하는 표현이 없다 — 주어는 모델이다', () => {
    for (const wallCount of [0, 1, 3, 6, 8]) {
      for (const materialKey of ['concrete', 'plasterboard', 'glass']) {
        const result = model_calculate_result({
          ...DEFAULT_PARAMS,
          wallCount,
          materialKey,
          thicknessMm: WIFI_MATERIALS[materialKey].thicknessDefaultMm,
        });
        const sentence = Object.values(display_describe_verdict(result)).join(' ').toLowerCase();
        for (const banned of [
          'in reality', 'you should', 'we recommend', 'is better', 'best band', 'proves',
          'move your router', 'buy ', 'switch to',
        ]) {
          expect(sentence).not.toContain(banned);
        }
        expect(sentence).toContain('the model');
      }
    }
  });

  it('벽이 0장이면 배지가 격차는 거리와 무관하다고 말한다', () => {
    const sentence = display_describe_gap(model_calculate_result({ ...DEFAULT_PARAMS, wallCount: 0 }));
    expect(sentence).toContain('does not change with distance');
  });

  it('배너가 H1의 질문(몇 장의 벽에서 2.4 GHz가 5 GHz를 앞서는가)에 직접 답한다', () => {
    const spoken = display_describe_verdict(model_calculate_result(DEFAULT_PARAMS));
    expect(spoken.headline).toContain('2.4 GHz');
    expect(spoken.headline).toContain('5 GHz');
    expect(spoken.headline).toContain('13.03');
    expect(spoken.verdict).toBe('hold'); // 콘크리트 기본값에서는 2.4 GHz가 앞선다
  });

  it('배너 상태는 절대 기본값이 아니다 — 경계를 스윕하며 상태와 문장이 같이 바뀐다', () => {
    // glass 11mm는 벽마다 격차를 좁힌다(모델 주석의 관찰) — 벽 수를 늘리면
    // bandGapDb가 양수(2.4 GHz 앞섬)에서 음수(5 GHz 역전)로 실제로 건너간다.
    const states = [];
    for (let wallCount = 0; wallCount <= WIFI_WALL_COUNT_MAX; wallCount += 1) {
      const result = model_calculate_result({
        ...DEFAULT_PARAMS,
        wallCount,
        materialKey: 'glass',
        thicknessMm: 11,
      });
      const spoken = display_describe_verdict(result);
      states.push({ wallCount, gapDb: result.bandGapDb, verdict: spoken.verdict, headline: spoken.headline });
    }
    // 실제로 부호가 바뀐다 — 스윕이 진짜로 경계를 건넌다는 전제 확인.
    expect(states[0].gapDb).toBeGreaterThan(0);
    expect(states.at(-1).gapDb).toBeLessThan(0);
    // hold → (edge) → break 순서를 벗어나지 않는다. 즉 뒤로 되돌아가지 않는다.
    const rank = { hold: 0, edge: 1, break: 2 };
    for (let index = 1; index < states.length; index += 1) {
      expect(rank[states[index].verdict]).toBeGreaterThanOrEqual(rank[states[index - 1].verdict]);
    }
    // hold와 break에서 실제로 다른 문장이 나온다 — 상태만 바뀌고 문구는 그대로인 회귀를 잡는다.
    const holdCase = states.find((item) => item.verdict === 'hold');
    const breakCase = states.find((item) => item.verdict === 'break');
    expect(holdCase.headline).not.toBe(breakCase.headline);
    expect(holdCase.headline).toContain('2.4 GHz is still ahead');
    expect(breakCase.headline).toContain('5 GHz has overtaken');
  });
});

// ── 마운트·수명 ─────────────────────────────────────────────

describe('마운트와 수명', () => {
  it('붙는 리스너는 정확히 18개다', () => {
    const { dom } = widget_build_mounted();
    expect(dom.listeners_read_added()).toBe(WIDGET_LISTENER_COUNT);
    expect(dom.listeners_read_live()).toBe(WIDGET_LISTENER_COUNT);
  });

  it('reset이 붙인 것을 전부 뗀다 — 잔여 0', () => {
    const { dom, widget_reset } = widget_build_mounted();
    widget_reset();
    expect(dom.listeners_read_removed()).toBe(WIDGET_LISTENER_COUNT);
    expect(dom.listeners_read_live()).toBe(0);
    expect(dom.listeners_read_names()).toEqual([]);
  });

  it('reset이 예약된 타이머까지 끊는다 — 잔여 0', () => {
    const { dom, widget_reset } = widget_build_mounted();
    const distance = fixture_read_control(dom, 'wifi-distance');
    expect(dom.listeners_run_event(distance, 'input')).toBe(1);
    expect(dom.listeners_run_event(dom.window, 'resize')).toBe(1);
    expect(dom.timers_read_pending()).toBe(2);
    widget_reset();
    expect(dom.timers_read_pending()).toBe(0);
  });

  it('같은 자리에 두 번 붙지 않는다', () => {
    const { dom } = widget_build_mounted();
    const before = dom.listeners_read_added();
    expect(widget_mount(dom.root)).toBeNull();
    expect(dom.listeners_read_added()).toBe(before);
  });

  it('뗀 뒤에는 슬라이더를 움직여도 아무 일도 일어나지 않는다', () => {
    const { dom, widget_reset } = widget_build_mounted();
    const distance = fixture_read_control(dom, 'wifi-distance');
    widget_reset();
    expect(dom.listeners_run_event(distance, 'input')).toBe(0);
  });

  it('애니메이션 프레임을 예약하지 않는다 — 이 위젯에는 움직이는 것이 없다', () => {
    const { dom } = widget_build_mounted();
    expect(dom.frames_read_pending()).toBe(0);
  });
});

// ── 첫 렌더 ─────────────────────────────────────────────────

describe('첫 렌더', () => {
  it('슬라이더 5개·셀렉트 1개·체크박스 1개·프리셋 5개·캔버스 1개가 있다', () => {
    const { dom } = widget_build_mounted();
    const inputs = dom.root.querySelectorAll('input');
    expect(inputs.filter((input) => input.type !== 'checkbox').length).toBe(SLIDER_COUNT);
    expect(inputs.filter((input) => input.type === 'checkbox').length).toBe(1);
    expect(dom.root.querySelectorAll('select').length).toBe(1);
    expect(dom.root.querySelectorAll('.widget-preset').length).toBe(PRESET_COUNT);
    expect(dom.root.querySelectorAll('canvas').length).toBe(1);
  });

  it('재질 셀렉트가 다섯 가지를 담고 기본값이 선택되어 있다', () => {
    const { dom } = widget_build_mounted();
    const select = fixture_read_control(dom, 'wifi-material');
    expect(select.children.length).toBe(5);
    expect(select.value).toBe('concrete');
  });

  it('배지가 밴드 격차와 벽당 증가폭을 싣는다', () => {
    const { dom } = widget_build_mounted();
    const values = dom.root.querySelectorAll('.readout-value').map((el) => el.textContent);
    expect(values[0]).toBe('13.03');
    expect(values[1]).toBe('+5.96');
  });

  it('대역별 카드가 모델의 값과 정확히 같다', () => {
    const { dom } = widget_build_mounted();
    const result = model_calculate_result(DEFAULT_PARAMS);
    // 앞의 두 칸은 배지다. 그 뒤가 대역별 카드 아홉 칸.
    const values = dom.root.querySelectorAll('.readout-value').map((el) => el.textContent).slice(2);
    expect(values.length).toBe(WIFI_BANDS.length * 3);
    WIFI_BANDS.forEach((band, index) => {
      const cell = result.byKey[band.key];
      expect(values[index * 3]).toBe(display_format_db(cell.receivedDbm));
      expect(values[index * 3 + 1]).toBe(display_format_db(cell.marginDb));
      expect(values[index * 3 + 2]).toBe(display_format_reach(cell.rangeM));
    });
    // 본문 블록 8이 인용하는 두 숫자가 실제로 화면에 뜬다.
    expect(values[0]).toBe('−48.3');
    expect(values[3]).toBe('−61.3');
  });

  it('분해표가 대역마다 한 줄씩, FSPL·벽 한 장·벽 합·총합을 싣는다', () => {
    const { dom } = widget_build_mounted();
    const rows = dom.root.querySelectorAll('tbody').flatMap((body) => body.children);
    expect(rows.length).toBe(3);
    const cells = rows[0].children.map((cell) => cell.textContent);
    expect(cells).toEqual(['2.4 GHz', '60.18 dB', '8.07 dB', '8.07 dB', '68.26 dB']);
  });

  it('판정 배너가 상태를 달고 뜬다', () => {
    const { dom } = widget_build_mounted();
    const verdict = dom.root.querySelector('.verdict');
    expect(verdict.getAttribute('data-state')).toBe('hold');
  });

  it('로드하자마자 주소창에 일곱 키가 전부 실린다', () => {
    const { dom } = widget_build_mounted();
    const written = dom.urlsWritten.at(-1);
    for (const fragment of ['d=10', 'n=1', 't=100', 'm=concrete', 'eirp=20', 'sens=-82', 'b6=1']) {
      expect(written).toContain(fragment);
    }
  });

  it('범례에 색 견본 네 칸이 있고 선 종류의 뜻이 글로 적힌다', () => {
    const { dom } = widget_build_mounted();
    expect(dom.root.querySelectorAll('.legend-item').length).toBe(4);
    const classes = dom.root.querySelectorAll('.legend-key').map((el) => String(el.className));
    // `.legend-key`는 다른 위젯도 쓰는 클래스다. 견본에 그대로 붙어 있어야 한다.
    for (const name of classes) expect(name.startsWith('legend-key ')).toBe(true);
    // 색만으로 갈리지 않는다 — 실선 둘, 점선 둘.
    expect(classes.filter((name) => name.includes('legend-tail-') || name.includes('legend-reference')).length).toBe(2);
    const note = dom.root.querySelectorAll('.legend-note').map((el) => el.textContent).join(' ');
    expect(note).toContain('Orange dashed = 6 GHz');
    expect(note).toContain('log scale');
  });

  it('두 곡선이 선 굵기보다 붙으면 축을 더 조이지 않고 "구분 불가"라고 적는다', () => {
    // 유리 5.5 mm 7장·EIRP 36·감도 −95에서 5 GHz와 6 GHz가 0.02 px까지 붙는다.
    // 여기서 축을 더 확대하면 2.4 GHz 곡선이 창 밖으로 나간다.
    const { dom } = widget_build_mounted({ search: '?d=10&n=7&t=5.5&m=glass&eirp=36&sens=-95' });
    const note = dom.root.querySelectorAll('.legend-note').map((el) => el.textContent).join(' ');
    expect(note).toContain('within a line width');
    // 기본 설정에서는 그런 말을 하지 않는다.
    openDom.restore();
    openDom = null;
    const plain = widget_build_mounted();
    const plainNote = plain.dom.root.querySelectorAll('.legend-note').map((el) => el.textContent).join(' ');
    expect(plainNote).not.toContain('within a line width');
  });

  it('캔버스 폭이 0이어도 범례 문구와 aria-label이 비지 않는다', () => {
    const { dom } = widget_build_mounted({ width: 0 });
    const notes = dom.root.querySelectorAll('.legend-note').map((el) => el.textContent);
    expect(notes.some((text) => text.includes('Blue solid = 2.4 GHz'))).toBe(true);
    expect(dom.root.querySelector('canvas').getAttribute('aria-label')).toBeTruthy();
  });

  it('그림이 인용하는 축 범위가 렌더가 실제로 쓴 값이다', () => {
    const { dom } = widget_build_mounted();
    const note = dom.root.querySelectorAll('.legend-note').map((el) => el.textContent).join(' ');
    const curves = model_calculate_curves(DEFAULT_PARAMS, true);
    const scale = chart_calculate_scale(curves, WIFI_SENSITIVITY_DEFAULT_DBM);
    expect(note).toContain(display_format_axis_dbm(scale.low, 5));
    expect(note).toContain(display_format_axis_dbm(scale.high, 5));
  });

  it('도달거리가 가로축(0.5~50 m) 위로 넘치면 조용히 자르지 않고 화살표+숫자로 적는다', () => {
    // EIRP 36 · 감도 −95 · 벽 없음: 모델이 내는 2.4 GHz 도달거리가 34734 m로,
    // 옛 고정 축 상단(50 m)을 한참 넘는다 — 독립 계산 없이도 이 값은 model.js 자체가
    // 낸 값이니 "축 밖으로 넘친다"는 사실 자체가 결과다.
    const { dom } = widget_build_mounted({ search: '?d=10&n=0&t=100&m=concrete&eirp=36&sens=-95' });
    const chart = dom.root.querySelectorAll('canvas')[0];
    const drawnTexts = chart.getContext('2d').texts.map((entry) => entry.text);
    expect(drawnTexts.some((text) => text.includes('2.4 GHz reach'))).toBe(true);
    const note = dom.root.querySelectorAll('.legend-note').map((el) => el.textContent).join(' ');
    expect(note).toContain('past the right edge');
  });

  it('도달거리가 가로축 아래로 넘치면(0.5 m 미만) 왼쪽 화살표+숫자로 적는다', () => {
    // EIRP 0 · 감도 −60 · 벽 8장(콘크리트 100 mm): 2.4 GHz 도달거리가 0.006 m로,
    // 옛 고정 축 하단(0.5 m)에 한참 못 미친다.
    const { dom } = widget_build_mounted({ search: '?d=10&n=8&t=100&m=concrete&eirp=0&sens=-60' });
    const chart = dom.root.querySelectorAll('canvas')[0];
    const drawnTexts = chart.getContext('2d').texts.map((entry) => entry.text);
    expect(drawnTexts.some((text) => text.includes('2.4 GHz reach'))).toBe(true);
    const note = dom.root.querySelectorAll('.legend-note').map((el) => el.textContent).join(' ');
    expect(note).toContain('short of the left edge');
  });

  it('도달거리가 축 안에 있으면 화살표 문구를 적지 않는다 (조용한 자르기 방지가 과잉 발화는 아니다)', () => {
    const { dom } = widget_build_mounted();
    const note = dom.root.querySelectorAll('.legend-note').map((el) => el.textContent).join(' ');
    expect(note).not.toContain('off this chart');
  });

  it('축 제목 줄바꿈 — 넓으면 한 줄, 좁으면 여러 줄로(글자를 줄이지 않는다)', () => {
    // 스텁 measureText는 글자당 6px다. 함수를 직접 불러 폭 판정을 못박는다.
    const stubContext = { measureText: (text) => ({ width: String(text).length * 6 }) };
    const title = 'Distance from the router, metres (log scale)'; // CHART_TITLE_X와 동일 문자열
    expect(chart_wrap_title(stubContext, title, 10000)).toEqual([title]); // 넓으면 한 줄
    const wrapped = chart_wrap_title(stubContext, title, 100); // 좁으면 여러 줄
    expect(wrapped.length).toBeGreaterThan(1);
    expect(wrapped.join(' ')).toBe(title); // 줄이 나뉘어도 단어 하나 잃지 않는다
    for (const line of wrapped) expect(line.length * 6).toBeLessThanOrEqual(100);
  });

  it('마운트한 그림도 좁은 화면에서는 제목을 한 줄로 찍지 않는다', () => {
    const wide = widget_build_mounted();
    const wideTexts = wide.dom.root.querySelectorAll('canvas')[0].getContext('2d').texts.map((t) => t.text);
    expect(wideTexts).toContain('Distance from the router, metres (log scale)');
    openDom.restore();
    openDom = null;

    const narrow = widget_build_mounted({ width: 220 });
    const narrowTexts = narrow.dom.root.querySelectorAll('canvas')[0].getContext('2d').texts.map((t) => t.text);
    expect(narrowTexts).not.toContain('Distance from the router, metres (log scale)');
  });
});

// ── 종속 슬라이더 ───────────────────────────────────────────

describe('두께 슬라이더는 재질이 바뀌면 자기 범위를 다시 맞춘다', () => {
  it('min·max·step·value가 새 재질의 값으로 갈아끼워진다', () => {
    const { dom } = widget_build_mounted();
    const select = fixture_read_control(dom, 'wifi-material');
    const thickness = fixture_read_control(dom, 'wifi-thickness');
    expect([thickness.min, thickness.max, thickness.step, thickness.value]).toEqual(['50', '300', '5', '100']);

    select.value = 'plasterboard';
    dom.listeners_run_event(select, 'change');
    // 안 맞추면 손잡이가 100을 가리키는데 계산은 25로 돈다 — 클램프가 삼킨다.
    expect([thickness.min, thickness.max, thickness.step, thickness.value]).toEqual(['9', '25', '0.5', '12.5']);

    select.value = 'glass';
    dom.listeners_run_event(select, 'change');
    expect([thickness.min, thickness.max, thickness.step, thickness.value]).toEqual(['3', '12', '0.5', '6']);
  });

  it('재질을 바꾸면 표와 배지가 새 값으로 따라간다', () => {
    const { dom } = widget_build_mounted();
    const select = fixture_read_control(dom, 'wifi-material');
    select.value = 'plasterboard';
    dom.listeners_run_event(select, 'change');

    const expected = model_calculate_result({
      ...DEFAULT_PARAMS, materialKey: 'plasterboard', thicknessMm: 12.5,
    });
    const values = dom.root.querySelectorAll('.readout-value').map((el) => el.textContent);
    expect(values[0]).toBe(display_format_db(expected.bandGapDb, 2));
    expect(values[1]).toBe('−0.08');
    expect(dom.urlsWritten.at(-1)).toContain('m=plasterboard');
    expect(dom.urlsWritten.at(-1)).toContain('t=12.5');
  });

  it('URL에 실린 두께가 새 재질 범위 밖이면 로드 시점에 이미 잘려 있다', () => {
    const { dom } = widget_build_mounted({ search: '?m=glass&t=250' });
    const thickness = fixture_read_control(dom, 'wifi-thickness');
    expect(thickness.value).toBe('12');
    expect(thickness.max).toBe('12');
  });

  it('프리셋도 두께 슬라이더의 범위를 같이 맞춘다', () => {
    const { dom } = widget_build_mounted();
    const thickness = fixture_read_control(dom, 'wifi-thickness');
    const button = dom.root.querySelectorAll('.widget-preset')[1]; // Next room, plasterboard
    dom.listeners_run_event(button, 'click');
    expect([thickness.min, thickness.max, thickness.value]).toEqual(['9', '25', '12.5']);
    expect(fixture_read_control(dom, 'wifi-material').value).toBe('plasterboard');
  });
});

// ── 접근성 ──────────────────────────────────────────────────

describe('접근성', () => {
  it('모든 조작부가 자기 설명과 묶여 있다 (슬라이더·셀렉트·체크박스)', () => {
    const { dom } = widget_build_mounted();
    const controls = [...dom.root.querySelectorAll('input'), ...dom.root.querySelectorAll('select')];
    expect(controls.length).toBe(SLIDER_COUNT + 2);
    for (const control of controls) {
      const described = control.getAttribute('aria-describedby');
      expect(described).toBeTruthy();
      expect(dom.root.querySelector(`[id="${described}"]`)).not.toBeNull();
    }
  });

  it('모든 조작부에 자기 라벨이 붙어 있다', () => {
    const { dom } = widget_build_mounted();
    const targets = dom.root.querySelectorAll('label').map((label) => label.getAttribute('for'));
    for (const id of ['wifi-distance', 'wifi-walls', 'wifi-material', 'wifi-thickness', 'wifi-eirp', 'wifi-sensitivity', 'wifi-band6']) {
      expect(targets).toContain(id);
      expect(fixture_read_control(dom, id)).not.toBeNull();
    }
  });

  it('인덱스형 거리 슬라이더가 aria-valuetext로 실제 미터를 준다', () => {
    const { dom } = widget_build_mounted();
    // 이것이 없으면 스크린리더가 "17"이라고 읽는다.
    expect(fixture_read_control(dom, 'wifi-distance').getAttribute('aria-valuetext')).toBe('10 m');
    expect(fixture_read_control(dom, 'wifi-distance').value).toBe(String(model_pick_distance_index(10)));
  });

  it('벽 개수·두께·감도도 사람이 읽는 값을 준다', () => {
    const { dom } = widget_build_mounted();
    expect(fixture_read_control(dom, 'wifi-walls').getAttribute('aria-valuetext')).toBe('1 wall');
    expect(fixture_read_control(dom, 'wifi-thickness').getAttribute('aria-valuetext')).toBe('100 millimetres');
    expect(fixture_read_control(dom, 'wifi-sensitivity').getAttribute('aria-valuetext')).toBe('−82 dBm');
  });

  it('캔버스에 role=img와 갱신되는 요약 aria-label이 붙는다', () => {
    const { dom } = widget_build_mounted();
    const canvas = dom.root.querySelector('canvas');
    expect(canvas.getAttribute('role')).toBe('img');
    const before = canvas.getAttribute('aria-label');
    expect(before).toBeTruthy();
    const walls = fixture_read_control(dom, 'wifi-walls');
    walls.value = '5';
    dom.listeners_run_event(walls, 'change');
    expect(canvas.getAttribute('aria-label')).not.toBe(before);
  });

  it('output이 live region으로 발화되지 않는다', () => {
    const { dom } = widget_build_mounted();
    const outputs = dom.root.querySelectorAll('output');
    expect(outputs.length).toBe(SLIDER_COUNT + 2);
    for (const output of outputs) expect(output.getAttribute('aria-live')).toBe('off');
  });

  it('표가 자체 스크롤 컨테이너 안에 있다 (WCAG Reflow)', () => {
    const { dom } = widget_build_mounted();
    const scroll = dom.root.querySelector('.widget-table-scroll');
    expect(scroll.getAttribute('role')).toBe('region');
    expect(scroll.getAttribute('tabindex')).toBe('0');
    expect(scroll.getAttribute('aria-label')).toBeTruthy();
  });

  it('프리셋 버튼이 지금 상태와 같으면 aria-pressed가 켜진다', () => {
    const { dom } = widget_build_mounted();
    const buttons = dom.root.querySelectorAll('.widget-preset');
    // 기본 상태는 세 번째 프리셋("Through one concrete wall")과 같다.
    expect(buttons.map((button) => button.getAttribute('aria-pressed')))
      .toEqual(['false', 'false', 'true', 'false', 'false']);
    dom.listeners_run_event(buttons[3], 'click');
    expect(buttons.map((button) => button.getAttribute('aria-pressed')))
      .toEqual(['false', 'false', 'false', 'true', 'false']);
    // 슬라이더를 한 칸만 움직이면 어느 프리셋도 눌린 상태가 아니다.
    const walls = fixture_read_control(dom, 'wifi-walls');
    walls.value = '7';
    dom.listeners_run_event(walls, 'change');
    expect(buttons.every((button) => button.getAttribute('aria-pressed') === 'false')).toBe(true);
  });
});

// ── 조작 ────────────────────────────────────────────────────

describe('조작', () => {
  it('벽을 늘리면 카드·표·주소창이 따라간다', () => {
    const { dom } = widget_build_mounted();
    const walls = fixture_read_control(dom, 'wifi-walls');
    walls.value = '3';
    dom.listeners_run_event(walls, 'change');

    const expected = model_calculate_result({ ...DEFAULT_PARAMS, wallCount: 3 });
    const values = dom.root.querySelectorAll('.readout-value').map((el) => el.textContent);
    expect(values[0]).toBe(display_format_db(expected.bandGapDb, 2));
    expect(values[2]).toBe(display_format_db(expected.byKey[WIFI_BAND_24].receivedDbm));
    expect(dom.urlsWritten.at(-1)).toContain('n=3');
    // 콘크리트는 벽마다 격차를 벌리기만 한다 — 2.4 GHz가 계속 앞선다('hold').
    expect(dom.root.querySelector('.verdict').getAttribute('data-state')).toBe('hold');
  });

  it('벽을 늘릴 때 밴드 격차가 벽당 증가폭만큼씩 커진다 (배지가 이 페이지의 논점이다)', () => {
    const { dom } = widget_build_mounted();
    const walls = fixture_read_control(dom, 'wifi-walls');
    const gapAt = (count) => {
      walls.value = String(count);
      dom.listeners_run_event(walls, 'change');
      return Number(dom.root.querySelectorAll('.readout-value')[0].textContent);
    };
    expect(gapAt(0)).toBeCloseTo(7.07, 2);
    expect(gapAt(1)).toBeCloseTo(13.03, 2);
    expect(gapAt(2)).toBeCloseTo(18.99, 2);
  });

  it('6 GHz를 끄면 카드 세 장과 표 한 줄과 범례 한 칸이 숨는다', () => {
    const { dom } = widget_build_mounted();
    const toggle = fixture_read_control(dom, 'wifi-band6');
    expect(dom.root.querySelectorAll('tbody').flatMap((body) => body.children).length).toBe(3);

    toggle.checked = false;
    dom.listeners_run_event(toggle, 'change');

    expect(dom.root.querySelectorAll('tbody').flatMap((body) => body.children).length).toBe(2);
    expect(dom.root.querySelectorAll('.readout').filter((box) => box.hidden === true).length).toBe(3);
    // 범례 칸은 숨기지 않고 **지운다** — `.legend-item`의 display가 `[hidden]`을 이긴다.
    expect(dom.root.querySelectorAll('.legend-item').length).toBe(3);
    expect(dom.root.querySelector('.widget-legend').textContent).not.toContain('6 GHz');
    // 그리지 않은 곡선의 선 종류를 설명하지 않는다.
    const notes = dom.root.querySelectorAll('.legend-note').map((el) => el.textContent).join(' ');
    expect(notes).not.toContain('Orange dashed = 6 GHz');
    expect(notes).toContain('Orange solid = 5 GHz');
    expect(dom.urlsWritten.at(-1)).toContain('b6=0');
    // 다시 켜면 되돌아온다.
    toggle.checked = true;
    dom.listeners_run_event(toggle, 'change');
    expect(dom.root.querySelectorAll('.readout').filter((box) => box.hidden === true).length).toBe(0);
    expect(dom.root.querySelectorAll('.legend-item').length).toBe(4);
  });

  it('6 GHz를 꺼도 2.4/5 GHz 숫자는 그대로다 — 그리기가 계산을 바꾸지 않는다', () => {
    const { dom } = widget_build_mounted();
    const before = dom.root.querySelectorAll('.readout-value').map((el) => el.textContent).slice(0, 8);
    const toggle = fixture_read_control(dom, 'wifi-band6');
    toggle.checked = false;
    dom.listeners_run_event(toggle, 'change');
    expect(dom.root.querySelectorAll('.readout-value').map((el) => el.textContent).slice(0, 8)).toEqual(before);
  });

  it('input은 디바운스되고 change는 즉시 반영된다', () => {
    const { dom } = widget_build_mounted();
    const eirp = fixture_read_control(dom, 'wifi-eirp');
    const before = dom.urlsWritten.length;

    eirp.value = '30';
    dom.listeners_run_event(eirp, 'input');
    expect(dom.urlsWritten.length).toBe(before);
    dom.timers_run_pending();
    expect(dom.urlsWritten.length).toBe(before + 1);
    expect(dom.urlsWritten.at(-1)).toContain('eirp=30');

    eirp.value = '24';
    dom.listeners_run_event(eirp, 'change');
    expect(dom.urlsWritten.length).toBe(before + 2);
  });

  it('resize는 다시 그리기만 한다 — 모델을 다시 부르지 않는다', () => {
    const { dom } = widget_build_mounted();
    const before = dom.urlsWritten.length;
    dom.listeners_run_event(dom.window, 'resize');
    dom.timers_run_pending();
    expect(dom.urlsWritten.length).toBe(before);
  });

  it('감도를 내리면 도달거리 카드가 늘어난다', () => {
    const { dom } = widget_build_mounted();
    const before = dom.root.querySelectorAll('.readout-value')[4].textContent;
    const sensitivity = fixture_read_control(dom, 'wifi-sensitivity');
    sensitivity.value = '-95';
    dom.listeners_run_event(sensitivity, 'change');
    const after = dom.root.querySelectorAll('.readout-value')[4].textContent;
    expect(after).not.toBe(before);
    expect(dom.urlsWritten.at(-1)).toContain('sens=-95');
  });

  it('프리셋을 누르면 상태 전체가 갈아끼워진다', () => {
    const { dom } = widget_build_mounted();
    const button = dom.root.querySelectorAll('.widget-preset')[0]; // Same room, no walls
    dom.listeners_run_event(button, 'click');
    expect(fixture_read_control(dom, 'wifi-walls').value).toBe('0');
    expect(fixture_read_control(dom, 'wifi-distance').getAttribute('aria-valuetext')).toBe('5 m');
    expect(dom.urlsWritten.at(-1)).toContain('n=0');
    expect(dom.urlsWritten.at(-1)).toContain('d=5');
  });
});
