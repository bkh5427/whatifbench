/**
 * 줄 하나 vs 줄 여럿 — 히어로 애니메이션의 상태 기계
 *
 * **이 파일은 그림을 위한 것이지 숫자를 위한 것이 아니다.**
 * 카드·곡선·표는 model.js의 닫힌 형태에서 나오고, 여기서 아무것도 읽지 않는다.
 * 애니메이션이 하는 일은 하나다 — **같은 도착열**을 두 배치에 흘려보내
 * 두 줄의 차이가 운이 아니라 배치라는 것을 눈으로 보이게 하는 것.
 *
 * DOM에 접근하지 않는다. 순수 함수만. 시계는 바깥에서 주입한다 —
 * 그래야 테스트가 프레임을 손으로 밀 수 있다 (rAF는 숨긴 탭에서 멈춘다).
 */

import { rng_create_seeded } from '../_shared/random.js';

/** 화면에 남겨 두는 대기 인원 상한. 이보다 길어지면 앞쪽만 그린다. */
export const SIM_QUEUE_DRAW_MAX = 26;
/** 한 번의 전진에서 처리하는 최대 이벤트 수. 무한루프 방지용 안전핀이다. */
export const SIM_EVENT_BUDGET = 4000;
/** 프레임 간격이 이보다 크면 잘라 쓴다 (탭이 백그라운드에 있다가 돌아온 경우). */
export const SIM_MAX_STEP_SECONDS = 0.25;
/**
 * 실제 1초에 흐르는 가게 시간(분). 6이었을 때는 3분짜리 처리가 0.5초에 끝나 눈으로 따라갈 수
 * 없었다(2026-09-26 운영자 지적). 1.5면 기본 처리 3분이 2초다.
 */
export const SIM_MINUTES_PER_SECOND = 1.5;

/** 도착 하나가 소비하는 난수 개수. **분기와 무관하게 언제나 이만큼 뽑는다.** */
export const SIM_RANDOM_PER_ARRIVAL = 4;

/**
 * 지수분포 표본. 평균 `mean`.
 * `Math.log(0)`이 −Infinity라 0을 그대로 넘기지 않는다.
 */
export function sim_calculate_exponential(uniform, mean) {
  const safe = uniform <= 0 ? Number.EPSILON : uniform >= 1 ? 1 - Number.EPSILON : uniform;
  return -Math.log(safe) * mean;
}

/**
 * 평균과 변동계수를 그대로 맞추는 처리시간 표본 — 로그정규.
 *
 * 모델(Allen–Cunneen)이 처리시간에서 쓰는 것은 1·2차 모멘트뿐이므로,
 * 같은 평균·같은 CV를 내는 분포면 그림으로서 대표성이 있다.
 * σ² = ln(1 + CV²), μ = ln(mean) − σ²/2.
 *
 * 정규 표본은 Box–Muller로 만든다 — **균등난수 두 개를 언제나 소비한다.**
 */
export function sim_calculate_service(uniformA, uniformB, meanMinutes, variation) {
  if (!(variation > 0)) return meanMinutes;
  const sigmaSquared = Math.log(1 + variation * variation);
  const sigma = Math.sqrt(sigmaSquared);
  const mu = Math.log(meanMinutes) - sigmaSquared / 2;
  const safeA = uniformA <= 0 ? Number.EPSILON : uniformA;
  const normal = Math.sqrt(-2 * Math.log(safeA)) * Math.cos(2 * Math.PI * uniformB);
  return Math.exp(mu + sigma * normal);
}

/**
 * 상태 하나를 만든다. 두 배치가 **같은 도착열**을 본다 —
 * 도착 시각·처리시간·줄 선택을 한 스트림에서 미리 뽑아 양쪽에 같이 먹인다.
 */
export function sim_create_state(seed, counterCount) {
  return {
    seed,
    counterCount,
    /** 시뮬레이션 안에서 흐른 시간(분). */
    clockMinutes: 0,
    /** 다음 손님이 오는 시각(분). */
    nextArrivalMinutes: 0,
    /** 손님 번호. 화면에 찍지는 않지만 스트림이 몇 명 지났는지 세는 데 쓴다. */
    servedCount: 0,
    arrivedCount: 0,
    random: rng_create_seeded(seed),
    /** 단일 대기열 — 대기열 하나 + 창구 c개. */
    single: { waiting: [], counters: Array.from({ length: counterCount }, () => null) },
    /** 창구별 대기열 — 줄 c개, 각 줄 끝에 창구 하나. */
    separate: {
      lines: Array.from({ length: counterCount }, () => []),
      counters: Array.from({ length: counterCount }, () => null),
    },
  };
}

/** 창구가 비어 있으면 대기열 머리를 앉힌다. 단일 대기열 쪽. */
function sim_seat_single(layout, clockMinutes) {
  for (let index = 0; index < layout.counters.length; index += 1) {
    if (layout.counters[index] !== null) continue;
    const next = layout.waiting.shift();
    if (!next) break;
    layout.counters[index] = { finishMinutes: clockMinutes + next.serviceMinutes };
  }
}

/** 창구별 대기열 쪽. 자기 줄에서만 데려온다 — 옆 줄이 비어도 못 간다. */
function sim_seat_separate(layout, clockMinutes) {
  for (let index = 0; index < layout.counters.length; index += 1) {
    if (layout.counters[index] !== null) continue;
    const next = layout.lines[index].shift();
    if (!next) continue;
    layout.counters[index] = { finishMinutes: clockMinutes + next.serviceMinutes };
  }
}

/** 끝난 창구를 비운다. 몇 명이 나갔는지 돌려준다. */
function sim_release_counters(layout, clockMinutes) {
  let released = 0;
  for (let index = 0; index < layout.counters.length; index += 1) {
    const busy = layout.counters[index];
    if (busy && busy.finishMinutes <= clockMinutes) {
      layout.counters[index] = null;
      released += 1;
    }
  }
  return released;
}

/** 두 배치를 통틀어 가장 이른 처리 완료 시각. 없으면 +∞. */
function sim_read_next_finish(state) {
  let earliest = Number.POSITIVE_INFINITY;
  for (const counter of state.single.counters) {
    if (counter && counter.finishMinutes < earliest) earliest = counter.finishMinutes;
  }
  for (const counter of state.separate.counters) {
    if (counter && counter.finishMinutes < earliest) earliest = counter.finishMinutes;
  }
  return earliest;
}

/**
 * 상태를 `stepMinutes`분 앞으로 민다. **새 상태를 만들지 않고 같은 객체를 고친다** —
 * 프레임마다 배열 두 벌을 복사하면 긴 줄에서 프레임이 떨어진다.
 *
 * **이산사건 루프다.** 프레임 경계에서만 창구를 비우면 한 걸음 안에 두 번 끝나는
 * 창구를 놓쳐, 프레임률이 낮을수록 처리량이 줄어든다 — 같은 시드가 화면 주사율에
 * 따라 다른 그림을 낸다. 실제로 그렇게 짜서 한 번 걸렸다. 도착과 처리 완료를
 * 둘 다 사건으로 놓고 이른 것부터 소화한다.
 *
 * 한 손님이 소비하는 난수는 언제나 `SIM_RANDOM_PER_ARRIVAL`개다.
 * 분기마다 개수를 바꾸면 스트림 안에 상관이 생겨 두 배치의 비교가 오염된다.
 */
export function sim_advance_state(state, stepMinutes, params) {
  const { load, serviceMinutes, variation } = params;
  const counterCount = state.counterCount;
  // 도착률: 창구 c개가 ρ만큼 바쁘려면 λ = cρ/E[S].
  const arrivalMeanGap = serviceMinutes / (counterCount * load);
  const target = state.clockMinutes + Math.max(0, stepMinutes);

  let budget = SIM_EVENT_BUDGET;
  while (budget > 0) {
    budget -= 1;
    const nextEvent = Math.min(state.nextArrivalMinutes, sim_read_next_finish(state));
    if (!(nextEvent <= target)) break;

    state.clockMinutes = nextEvent;
    sim_release_counters(state.single, nextEvent);
    sim_release_counters(state.separate, nextEvent);

    if (state.nextArrivalMinutes <= nextEvent) {
      // 난수 네 개를 **언제나** 뽑는다: 다음 간격, 처리시간 두 개, 줄 선택.
      const gapUniform = state.random();
      const serviceUniformA = state.random();
      const serviceUniformB = state.random();
      const lineUniform = state.random();

      const serviceTime = sim_calculate_service(serviceUniformA, serviceUniformB, serviceMinutes, variation);
      const customer = { arrivalMinutes: nextEvent, serviceMinutes: serviceTime };
      const lineIndex = Math.min(counterCount - 1, Math.floor(lineUniform * counterCount));

      state.single.waiting.push({ ...customer });
      state.separate.lines[lineIndex].push({ ...customer });
      state.arrivedCount += 1;
      state.nextArrivalMinutes = nextEvent + sim_calculate_exponential(gapUniform, arrivalMeanGap);
    }

    sim_seat_single(state.single, nextEvent);
    sim_seat_separate(state.separate, nextEvent);
  }

  state.clockMinutes = target;
  return state;
}

/**
 * 그리기에 필요한 만큼만 상태를 요약한다.
 * 캔버스 쪽이 상태 객체를 직접 뒤지지 않게 하는 것이 목적 —
 * 그리는 코드가 시뮬레이션 내부를 알면 둘이 같이 썩는다.
 */
export function sim_read_frame(state) {
  return {
    clockMinutes: state.clockMinutes,
    arrivedCount: state.arrivedCount,
    single: {
      waitingCount: state.single.waiting.length,
      drawCount: Math.min(state.single.waiting.length, SIM_QUEUE_DRAW_MAX),
      busy: state.single.counters.map((counter) => counter !== null),
    },
    separate: {
      waitingCounts: state.separate.lines.map((line) => line.length),
      drawCounts: state.separate.lines.map((line) => Math.min(line.length, SIM_QUEUE_DRAW_MAX)),
      busy: state.separate.counters.map((counter) => counter !== null),
    },
  };
}

/** 프레임 간격(초)을 시뮬레이션 시간(분)으로. 큰 간격은 잘라 쓴다. */
export function sim_calculate_step_minutes(elapsedSeconds) {
  const bounded = Math.min(Math.max(elapsedSeconds, 0), SIM_MAX_STEP_SECONDS);
  return bounded * SIM_MINUTES_PER_SECOND;
}
