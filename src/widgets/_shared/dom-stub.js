/**
 * 위젯 공통 — **테스트 전용** 최소 DOM 스텁.
 *
 * 이 파일은 브라우저로 나가지 않는다. `*.test.js`만 import한다.
 *
 * 왜 있는가: 위젯의 수명(리스너를 붙인 만큼 떼는가, 타이머가 남는가)은
 * **소스를 읽어서는 지킬 수 없다.** 실제로 두 번 뚫렸다 —
 *   ① `line.includes("target.addEventListener")` 로 거르니 변수 이름만 바꾸면 통과
 *   ② `widget_reset()` 본문에서 문자열을 찾으니 무엇을 몇 개 떼는지는 안 봄
 * 그래서 여기서는 `addEventListener`/`removeEventListener`/`setTimeout`을
 * **세는** 스텁을 놓고, 렌더 → 리셋을 실제로 돌려 잔여 0을 단언한다.
 * 이 방식은 코드 모양·변수 이름과 무관하다.
 *
 * 실물 DOM을 흉내내는 것이 목적이 아니다. 두 위젯이 실제로 부르는 API만 있다.
 * `dataset`은 속성 맵을 그대로 덮는 Proxy다 — 그래야 `el.dataset.state = 'x'`와
 * `el.setAttribute('data-state','x')`가 **같은 것**이 되어, 한쪽만 검사해도
 * 다른 쪽 우회가 걸린다.
 */

/** camelCase 데이터 키 → `data-kebab-case` 속성 이름. */
function fixture_format_data_attribute(key) {
  return `data-${key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`;
}

/** `.class` / `tag` / `[attr="value"]` 세 가지만 읽는 최소 선택자. */
function fixture_check_selector(element, selector) {
  if (selector.startsWith('.')) {
    return String(element.className).split(/\s+/).includes(selector.slice(1));
  }
  const attribute = /^\[([^=\]]+)(?:="([^"]*)")?\]$/.exec(selector);
  if (attribute) {
    const value = element.getAttribute(attribute[1]);
    return attribute[2] === undefined ? value !== null : value === attribute[2];
  }
  return element.tagName === selector.toLowerCase();
}

function fixture_scan_descendants(element, out = []) {
  for (const child of element.children) {
    out.push(child);
    fixture_scan_descendants(child, out);
  }
  return out;
}

/** 그리기 호출을 기록만 하는 2d 컨텍스트. 실제로 칠하지 않아도 글자와 좌표는 남는다. */
function fixture_create_canvas_context() {
  const texts = [];
  const noop = () => {};
  return {
    texts,
    setTransform: noop, clearRect: noop, save: noop, restore: noop, rotate: noop,
    translate: noop, scale: noop, beginPath: noop, closePath: noop, moveTo: noop,
    lineTo: noop, arc: noop, rect: noop, clip: noop, fill: noop, stroke: noop,
    fillRect: noop, setLineDash: noop,
    // 글자 둘레 후광(strokeText)은 그림일 뿐 글자 기록이 아니다 — fillText만 texts에 남긴다.
    strokeText: noop,
    measureText: (text) => ({ width: String(text).length * 6 }),
    fillText: (text, x, y) => texts.push({ text: String(text), x, y }),
    font: '', textAlign: '', textBaseline: '', fillStyle: '', strokeStyle: '',
    lineWidth: 0, lineJoin: '', lineCap: '', globalAlpha: 1,
  };
}

class DomStubNode {
  constructor(text) {
    this.tagName = '#text';
    this.textContent = text;
    this.children = [];
    this.className = '';
    this.parentElement = null;
  }

  getAttribute() {
    return null;
  }
}

class DomStubElement {
  constructor(tagName, world) {
    this.tagName = String(tagName).toLowerCase();
    this.world = world;
    this.children = [];
    this.parentElement = null;
    this.attributes = new Map();
    this.className = '';
    this.style = {};
    this.width = 0;
    this.height = 0;
    this.clientWidth = world.defaultWidth;
    this.value = '';
    this.checked = false;
    this.context = this.tagName === 'canvas' ? fixture_create_canvas_context() : null;

    this.dataset = new Proxy(
      {},
      {
        get: (_target, key) => this.getAttribute(fixture_format_data_attribute(String(key))) ?? undefined,
        set: (_target, key, value) => {
          this.setAttribute(fixture_format_data_attribute(String(key)), String(value));
          return true;
        },
        deleteProperty: (_target, key) => {
          this.removeAttribute(fixture_format_data_attribute(String(key)));
          return true;
        },
        has: (_target, key) => this.attributes.has(fixture_format_data_attribute(String(key))),
      },
    );

    this.classList = {
      add: (...names) => {
        const set = new Set(String(this.className).split(/\s+/).filter(Boolean));
        for (const name of names) set.add(name);
        this.className = [...set].join(' ');
      },
      remove: (...names) => {
        const set = new Set(String(this.className).split(/\s+/).filter(Boolean));
        for (const name of names) set.delete(name);
        this.className = [...set].join(' ');
      },
      contains: (name) => String(this.className).split(/\s+/).includes(name),
    };
  }

  /** 실물과 같이 0을 돌려준다. 강제 리플로우를 읽는 코드가 죽지 않게. */
  get offsetWidth() {
    return 0;
  }

  get parentNode() {
    return this.parentElement;
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  getAttribute(name) {
    return this.attributes.has(name) ? this.attributes.get(name) : null;
  }

  hasAttribute(name) {
    return this.attributes.has(name);
  }

  removeAttribute(name) {
    this.attributes.delete(name);
  }

  get textContent() {
    if (this.children.length === 0) return this.ownText ?? '';
    return this.children.map((child) => child.textContent ?? '').join('');
  }

  /** 실물과 같이 자식을 전부 지우고 글자 하나로 바꾼다. `= ''`가 곧 비우기다. */
  set textContent(text) {
    this.children = [];
    this.ownText = String(text);
  }

  /**
   * 태그 이름만 훑어 빈 자식을 만든다. 본문 파서가 아니다 —
   * 프로덕션이 `innerHTML` 뒤에 `querySelector('tbody')`로 자리를 잡기 때문에
   * **그 자리가 존재하기만 하면** 된다.
   */
  set innerHTML(markup) {
    this.children = [];
    this.ownText = '';
    for (const match of String(markup).matchAll(/<([a-zA-Z]+)[^>]*>/g)) {
      this.appendChild(this.world.document.createElement(match[1]));
    }
  }

  get innerHTML() {
    return this.textContent;
  }

  appendChild(child) {
    if (child.parentElement) child.parentElement.removeChild(child);
    child.parentElement = this;
    this.children.push(child);
    this.ownText = '';
    return child;
  }

  append(...nodes) {
    for (const node of nodes) {
      this.appendChild(typeof node === 'string' ? new DomStubNode(node) : node);
    }
  }

  removeChild(child) {
    const index = this.children.indexOf(child);
    if (index >= 0) this.children.splice(index, 1);
    child.parentElement = null;
    return child;
  }

  remove() {
    if (this.parentElement) this.parentElement.removeChild(this);
  }

  querySelector(selector) {
    return fixture_scan_descendants(this).find((el) => fixture_check_selector(el, selector)) ?? null;
  }

  querySelectorAll(selector) {
    return fixture_scan_descendants(this).filter((el) => fixture_check_selector(el, selector));
  }

  getContext(kind) {
    return kind === '2d' ? this.context : null;
  }

  addEventListener(type, handler) {
    this.world.listeners_add(this, type, handler);
  }

  removeEventListener(type, handler) {
    this.world.listeners_remove(this, type, handler);
  }
}

/**
 * 스텁 하나를 만든다. `install()`을 부르기 전에는 전역을 건드리지 않는다.
 *
 * options:
 *   search      — `window.location.search`. 위젯의 초기 상태가 여기서 나온다
 *   width       — 새로 만든 원소의 `clientWidth`. 0이면 캔버스가 못 그리는 상황
 *   hasPath2D   — 아이콘을 실제로 세고 싶을 때만 true (없으면 아이콘은 그려지지 않는다)
 */
export function fixture_create_dom(options = {}) {
  const { search = '', width = 900, hasPath2D = false } = options;

  const live = [];
  let addedCount = 0;
  let removedCount = 0;

  const timers = new Map();
  let nextTimerId = 1;

  const frames = new Map();
  let nextFrameId = 1;

  const world = {
    defaultWidth: width,
    listeners_add(target, type, handler) {
      addedCount += 1;
      live.push({ target, type, handler });
    },
    listeners_remove(target, type, handler) {
      const index = live.findIndex(
        (entry) => entry.target === target && entry.type === type && entry.handler === handler,
      );
      // 실물과 같이 **붙어 있지 않은 것을 떼는 것은 아무 일도 아니다.**
      // 여기서 세어 버리면 헛된 remove로 잔여를 0처럼 보이게 만들 수 있다.
      if (index < 0) return;
      removedCount += 1;
      live.splice(index, 1);
    },
  };

  const document = {
    readyState: 'complete',
    hidden: false,
    createElement: (tag) => new DomStubElement(tag, world),
    createElementNS: (_ns, tag) => new DomStubElement(tag, world),
    createTextNode: (text) => new DomStubNode(String(text)),
    querySelector: (selector) => document.body.querySelector(selector),
    querySelectorAll: (selector) => document.body.querySelectorAll(selector),
    addEventListener: (type, handler) => world.listeners_add(document, type, handler),
    removeEventListener: (type, handler) => world.listeners_remove(document, type, handler),
  };
  world.document = document;
  document.body = new DomStubElement('body', world);

  const written = [];
  const window = {
    devicePixelRatio: 1,
    location: { search, pathname: '/test' },
    history: {
      replaceState: (_state, _title, url) => {
        written.push(String(url));
        const query = String(url).indexOf('?');
        window.location.search = query < 0 ? '' : String(url).slice(query);
      },
    },
    matchMedia: () => ({ matches: false }),
    setTimeout: (callback, delay) => {
      const id = nextTimerId;
      nextTimerId += 1;
      timers.set(id, { callback, delay });
      return id;
    },
    clearTimeout: (id) => {
      timers.delete(id);
    },
    // 애니메이션 프레임. 타이머와 **따로 센다** — 위젯이 rAF만 안 끊고
    // 타이머만 끊어도 리셋 뒤에 시뮬레이션이 계속 도는데, 타이머 잔여는 0이라
    // 아무 표시도 나지 않는다.
    requestAnimationFrame: (callback) => {
      const id = nextFrameId;
      nextFrameId += 1;
      frames.set(id, callback);
      return id;
    },
    cancelAnimationFrame: (id) => {
      frames.delete(id);
    },
    addEventListener: (type, handler) => world.listeners_add(window, type, handler),
    removeEventListener: (type, handler) => world.listeners_remove(window, type, handler),
  };

  const saved = new Map();
  function global_set(key, value) {
    if (!saved.has(key)) saved.set(key, { had: key in globalThis, value: globalThis[key] });
    globalThis[key] = value;
  }

  return {
    document,
    window,
    /** 위젯을 붙일 자리. `data-widget`은 자동 로더가 찾는 이름이다. */
    root: document.body.appendChild(new DomStubElement('div', world)),
    /** 주소창에 실제로 쓰인 URL들. 하나도 없으면 URL 공유가 죽은 것이다. */
    urlsWritten: written,

    /** 지금 살아 있는 리스너 수 (붙인 것 − 뗀 것). 리셋 뒤 0이어야 한다. */
    listeners_read_live: () => live.length,
    listeners_read_added: () => addedCount,
    listeners_read_removed: () => removedCount,
    /** 살아 있는 리스너를 `타입@대상` 문자열로. 무엇이 남았는지 보고할 때 쓴다. */
    listeners_read_names: () =>
      live.map((entry) => `${entry.type}@${entry.target === window ? 'window' : entry.target.tagName}`),

    /** 아직 안 끊긴 타이머 수. 리셋 뒤 0이어야 한다. */
    timers_read_pending: () => timers.size,
    /** 아직 안 끊긴 애니메이션 프레임 수. 리셋 뒤 0이어야 한다. */
    frames_read_pending: () => frames.size,
    /** 예약된 프레임을 한 번 돌린다. `timestampMs`는 rAF가 주는 시계다. */
    frames_run_pending: (timestampMs = 0) => {
      const queued = [...frames.entries()];
      frames.clear();
      for (const [, callback] of queued) callback(timestampMs);
      return queued.length;
    },
    /** 예약된 타이머를 전부 지금 돌린다 (디바운스를 강제로 흘려보낼 때). */
    timers_run_pending: () => {
      const queued = [...timers.entries()];
      timers.clear();
      for (const [, entry] of queued) entry.callback();
      return queued.length;
    },

    /** 붙어 있는 리스너를 실제로 발화시킨다. 뗀 뒤에는 아무 일도 일어나지 않아야 한다. */
    listeners_run_event: (target, type) => {
      let fired = 0;
      for (const entry of [...live]) {
        if (entry.target === target && entry.type === type) {
          fired += 1;
          entry.handler({ type });
        }
      }
      return fired;
    },

    install() {
      global_set('document', document);
      global_set('window', window);
      global_set('getComputedStyle', () => ({ getPropertyValue: () => '' }));
      if (hasPath2D) {
        global_set('Path2D', class DomStubPath2D {
          constructor(d) { this.d = d; }
        });
      }
    },

    restore() {
      for (const [key, previous] of saved) {
        if (previous.had) globalThis[key] = previous.value;
        else delete globalThis[key];
      }
      saved.clear();
    },
  };
}
