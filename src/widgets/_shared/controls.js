/**
 * 위젯 공통 — 조작부 DOM 조각.
 *
 * 슬라이더 한 줄, 읽기값 카드, 버튼 묶음. 위젯마다 다시 적으면 접근성 속성 중
 * 하나가 조용히 빠진다 — 실제로 `aria-describedby` 없는 슬라이더와
 * `aria-live`를 안 끈 `<output>`이 각각 한 번씩 있었다.
 * 여기 한 벌만 두고 전부 이것을 부른다.
 *
 * 이 모듈은 **DOM을 만들기만 한다.** 계산도, 값 갱신도 하지 않는다.
 */

/** 터치 타깃 최소 크기는 CSS(`global.css`)가 정한다. 여기서는 구조만 만든다. */

/**
 * 슬라이더 한 줄을 만든다. 라벨 + 설명(hint) + range + 읽기값.
 *
 * 설명은 **라벨 바로 아래** 붙는다. 본문까지 내려가서 읽게 만들지 않는다.
 * `aria-describedby`로 묶어 스크린리더도 같은 순서로 듣는다.
 *
 * config: { min, max, step, value }
 *   step에 문자열 `'any'`를 넘길 수 있다 — 눈금 없이 연속값을 받는 슬라이더다.
 *   이때 브라우저는 `value`를 스냅하지 않고, 방향키가 범위의 1/100씩 움직인다.
 */
export function control_build_slider(id, labelText, hintText, config) {
  const row = document.createElement('div');
  row.className = 'widget-row';

  const labelBox = document.createElement('div');
  labelBox.className = 'widget-label';

  const label = document.createElement('label');
  label.setAttribute('for', id);
  label.textContent = labelText;

  const hint = document.createElement('span');
  hint.className = 'widget-hint';
  hint.setAttribute('id', `${id}-hint`);
  hint.textContent = hintText;

  labelBox.append(label, hint);

  const input = document.createElement('input');
  input.type = 'range';
  // `el.id = ...`가 아니라 속성으로 쓴다. 실물 DOM에서는 같지만, 테스트 스텁은
  // 속성 맵만 들여다본다 — `aria-describedby`가 가리키는 자리가 실제로 있는지를
  // 테스트가 확인할 수 있어야 한다.
  input.setAttribute('id', id);
  input.min = String(config.min);
  input.max = String(config.max);
  input.step = String(config.step);
  input.value = String(config.value);
  input.setAttribute('aria-describedby', `${id}-hint`);

  const output = document.createElement('output');
  output.className = 'widget-out';
  output.setAttribute('for', id);
  // `<output>`은 암묵적 live region이다. 슬라이더 하나를 끌 때마다 값이
  // 여럿 순차 발화되지 않도록 끈다. 발화는 판정문 하나로 모은다.
  output.setAttribute('aria-live', 'off');

  row.append(labelBox, input, output);
  return { row, input, output, label, hint };
}

/**
 * 읽기값 카드 하나. 값과 단위를 한 줄에 둔다.
 * 단위 줄도 돌려준다 — 큰 숫자 밑에 작은 글씨로 대조값을 붙이려면 갱신할 수 있어야 한다.
 */
export function control_build_readout(labelText, unitText) {
  const box = document.createElement('div');
  box.className = 'readout';

  const label = document.createElement('p');
  label.className = 'readout-label';
  label.textContent = labelText;

  const line = document.createElement('p');
  line.className = 'readout-line';

  const value = document.createElement('span');
  value.className = 'readout-value';

  const unit = document.createElement('span');
  unit.className = 'readout-unit';
  unit.textContent = unitText;

  line.append(value, unit);
  box.append(label, line);
  return { box, value, unit };
}

/**
 * 버튼 묶음. 프리셋처럼 "누르면 상태가 통째로 갈아끼워지는" 조작에 쓴다.
 *
 * 라디오가 아니라 버튼인 이유: 프리셋은 **현재 상태의 이름이 아니라 동작**이다.
 * 슬라이더를 하나라도 움직이면 어느 프리셋도 선택된 상태가 아니게 되는데,
 * 라디오로 만들면 그 순간 화면이 거짓말을 한다.
 * 대신 지금 상태가 어느 프리셋과 같은지는 `aria-pressed`로 알린다.
 */
export function control_build_button_group(legendText, items) {
  const group = document.createElement('div');
  group.className = 'widget-presets';
  group.setAttribute('role', 'group');
  group.setAttribute('aria-label', legendText);

  const legend = document.createElement('span');
  legend.className = 'widget-presets-label';
  legend.textContent = legendText;
  group.appendChild(legend);

  const buttons = {};
  for (const item of items) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'widget-preset';
    button.textContent = item.label;
    button.setAttribute('aria-pressed', 'false');
    button.dataset.preset = item.key;
    group.appendChild(button);
    buttons[item.key] = button;
  }
  return { group, buttons };
}

/**
 * 자체 스크롤 컨테이너에 담긴 표. 페이지 전체가 가로로 스크롤되면 WCAG Reflow 위반이다.
 * 키보드로도 스크롤할 수 있어야 하므로 `tabindex="0"` + `role="region"`을 붙인다.
 */
export function control_build_table(captionText, headings) {
  const scroll = document.createElement('div');
  scroll.className = 'widget-table-scroll';
  scroll.setAttribute('tabindex', '0');
  scroll.setAttribute('role', 'region');
  // 영역 이름은 캡션과 구분한다 — 캡션이 표를 이름 짓고, 영역 이름은 스크롤 가능함을 알린다
  scroll.setAttribute('aria-label', `${captionText}, scrollable table`);

  const table = document.createElement('table');
  table.className = 'widget-table';

  // 캡션은 눈에 보인다. sr-only로 감추면 표가 무엇을 담았는지 보고는 알 수 없다
  const caption = document.createElement('caption');
  caption.textContent = captionText;
  table.appendChild(caption);

  const head = document.createElement('thead');
  const headRow = document.createElement('tr');
  for (const heading of headings) {
    const cell = document.createElement('th');
    cell.setAttribute('scope', 'col');
    cell.textContent = heading;
    headRow.appendChild(cell);
  }
  head.appendChild(headRow);

  const body = document.createElement('tbody');
  table.append(head, body);
  scroll.appendChild(table);
  return { scroll, table, body };
}

/**
 * 표 한 줄을 채운다. 첫 칸은 행 제목(`th scope="row"`)으로 둔다 —
 * 전부 `td`면 스크린리더가 어느 값이 무엇인지 알려줄 수 없다.
 */
export function control_build_table_row(cells, options = {}) {
  const row = document.createElement('tr');
  if (options.current) row.setAttribute('aria-current', 'true');
  cells.forEach((text, index) => {
    const cell = document.createElement(index === 0 ? 'th' : 'td');
    if (index === 0) cell.setAttribute('scope', 'row');
    cell.textContent = text;
    row.appendChild(cell);
  });
  return row;
}
