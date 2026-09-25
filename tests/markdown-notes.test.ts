import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { JSDOM } from 'jsdom';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const dom = new JSDOM(html, { url: 'https://myagenda.test' });
Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
  Element: dom.window.Element,
  localStorage: dom.window.localStorage,
});
const { renderMarkdown, gitlabProjectUrl } = await import('../src/markdown.ts');
const { setupNotes } = await import('../src/notes.ts');
const { setupTasks } = await import('../src/tasks.ts');
const { setupSchedule } = await import('../src/schedule.ts');
const { setupTimer } = await import('../src/timer.ts');
const get = (id: string) => document.getElementById(id)!;
function input(id: string, value: string) {
  (get(id) as HTMLInputElement).value = value;
  get(id).dispatchEvent(new dom.window.Event('input', { bubbles: true }));
}
function resetNotes() {
  document.body.innerHTML = new JSDOM(html).window.document.body.innerHTML;
  setupNotes();
}

function resetTasks() {
  document.body.innerHTML = new JSDOM(html).window.document.body.innerHTML;
  setupTasks();
}

function resetSchedule() {
  document.body.innerHTML = new JSDOM(html).window.document.body.innerHTML;
  setupSchedule();
}

function resetTimer() {
  document.body.innerHTML = new JSDOM(html).window.document.body.innerHTML;
  setupTimer();
}

test('Markdown renders formatting and resolves GitLab project links safely', () => {
  const container = document.createElement('div');
  const base = gitlabProjectUrl('https://gitlab.example/group/sub/project/-/merge_requests/42');
  assert.equal(base, 'https://gitlab.example/group/sub/project/');
  renderMarkdown(container, '# Título\n\n**Texto**\n\n- [x] Pronto\n\n| A | B |\n| - | - |\n| 1 | 2 |\n\n```rust\nlet a = 1;\n```\n\n[Arquivo](docs/file.md)\n\n![Imagem](/uploads/test.png)', base);
  assert.equal(container.querySelector('h1')?.textContent, 'Título');
  assert.equal(container.querySelector('strong')?.textContent, 'Texto');
  assert.equal(container.querySelector('input')?.disabled, true);
  assert.equal(container.querySelector('input')?.checked, true);
  assert.equal(container.querySelectorAll('td').length, 2);
  assert.match(container.querySelector('pre code')!.textContent!, /let a = 1/);
  assert.equal(container.querySelector('a')?.href, `${base}docs/file.md`);
  assert.equal(container.querySelector('a')?.rel, 'noopener noreferrer');
  assert.equal(container.querySelector('img')?.src, `${base}uploads/test.png`);
});

test('Markdown removes executable HTML and unsafe URLs', () => {
  const container = document.createElement('div');
  renderMarkdown(container, '<script>alert(1)</script><img src="x" onerror="alert(1)"><a href="javascript:alert(1)">bad</a><iframe src="https://example.com"></iframe><svg onload="alert(1)"></svg><p style="position:fixed" id="note-title">Text</p>\n\n[local](file:///etc/passwd)');
  assert.equal(container.querySelector('script, iframe, svg, [onerror], [onload], [style], [id]'), null);
  assert.equal(container.querySelector('a[href]'), null);
});

test('Notes open rendered by default and switch explicitly to Markdown editing', () => {
  localStorage.clear();
  resetNotes();
  get('note-create').click();
  assert.equal(get('note-edit-pane').hidden, false);
  assert.equal(get('note-preview-pane').hidden, true);
  assert.equal(get('note-edit').textContent, 'Concluir');
  input('note-title', '<b>Primeira</b>');
  input('note-content', '# Texto salvo\n\n**conteúdo especial**');
  get('note-edit').click();
  assert.equal(get('note-edit-pane').hidden, true);
  assert.equal(get('note-preview-pane').hidden, false);
  assert.equal(get('note-edit').textContent, 'Alterar');
  assert.equal(get('note-preview').querySelector('h1')?.textContent, 'Texto salvo');
  assert.equal((get('note-title') as HTMLInputElement).readOnly, true);
  get('note-edit').click();
  assert.equal((get('note-title') as HTMLInputElement).readOnly, false);
  assert.equal(get('notes-list').querySelector('b'), null);
  get('note-create').click();
  input('note-title', 'Segunda');
  input('notes-search', 'conteúdo especial');
  assert.equal(get('notes-list').querySelectorAll('button').length, 1);
  get('notes-list').querySelector('button')!.click();
  assert.equal((get('note-title') as HTMLInputElement).value, '<b>Primeira</b>');
  assert.equal(get('note-preview-pane').hidden, false);
  resetNotes();
  assert.equal(get('notes-list').querySelectorAll('button').length, 2);
  assert.equal(get('note-preview-pane').hidden, false);
  const saved = JSON.parse(localStorage.getItem('my_agenda_notes')!);
  assert.equal(saved[1].content, '# Texto salvo\n\n**conteúdo especial**');
  get('note-delete').click();
  get('note-delete-cancel').click();
  assert.equal(JSON.parse(localStorage.getItem('my_agenda_notes')!).length, 2);
  get('note-delete').click();
  get('note-delete-accept').click();
  assert.equal(JSON.parse(localStorage.getItem('my_agenda_notes')!).length, 1);
  get('note-delete').click();
  get('note-delete-accept').click();
  assert.equal(get('note-editor').hidden, true);
  assert.equal(get('notes-empty').hidden, false);
});

test('Corrupt stored notes are preserved instead of overwritten', (t) => {
  t.mock.method(console, 'error', () => {});
  localStorage.setItem('my_agenda_notes', '{broken');
  resetNotes();
  assert.equal((get('note-create') as HTMLButtonElement).disabled, true);
  assert.equal(localStorage.getItem('my_agenda_notes'), '{broken');
  assert.match(get('notes-status').textContent!, /preservados/);
});

test('A failed save keeps the draft visible and reports the failure', (t) => {
  t.mock.method(console, 'error', () => {});
  localStorage.clear();
  resetNotes();
  get('note-create').click();
  const prototype = Object.getPrototypeOf(localStorage);
  const original = prototype.setItem;
  prototype.setItem = () => { throw new Error('Quota exceeded'); };
  try {
    input('note-content', 'Meu texto ainda está aqui');
    assert.equal((get('note-content') as HTMLTextAreaElement).value, 'Meu texto ainda está aqui');
    assert.match(get('notes-status').textContent!, /Não foi possível salvar/);
  } finally {
    prototype.setItem = original;
  }
  input('note-content', 'Salvo após tentar novamente');
  assert.match(get('notes-status').textContent!, /Salvo neste dispositivo/);
  assert.equal(JSON.parse(localStorage.getItem('my_agenda_notes')!)[0].content, 'Salvo após tentar novamente');
});

test('Tasks support deadlines, completion, filters and persistence', () => {
  localStorage.clear();
  resetTasks();
  input('task-title', 'Entregar relatório');
  input('task-due-date', '2026-09-30');
  input('task-priority', '2');
  get('task-form').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
  assert.equal(get('tasks-list').querySelector('strong')?.textContent, 'Entregar relatório');
  assert.match(get('tasks-list').textContent!, /30\/09\/2026/);
  assert.match(get('tasks-list').textContent!, /Prioridade 2/);
  assert.equal(JSON.parse(localStorage.getItem('my_agenda_tasks')!)[0].priority, 2);
  (get('tasks-list').querySelector('input[type="checkbox"]') as HTMLInputElement).click();
  assert.equal(get('tasks-empty').hidden, false);
  (document.querySelector('[data-task-filter="completed"]') as HTMLButtonElement).click();
  assert.equal(get('tasks-list').querySelectorAll('.task-item').length, 1);
  assert.equal(JSON.parse(localStorage.getItem('my_agenda_tasks')!)[0].completed, true);
  resetTasks();
  (document.querySelector('[data-task-filter="all"]') as HTMLButtonElement).click();
  assert.equal(get('tasks-list').querySelector('strong')?.textContent, 'Entregar relatório');
  (get('tasks-list').querySelector('.task-delete') as HTMLButtonElement).click();
  assert.equal(JSON.parse(localStorage.getItem('my_agenda_tasks')!).length, 0);
});

test('Weekly schedule stores independent 15-minute entries', () => {
  localStorage.clear();
  resetSchedule();
  assert.equal(get('schedule-table-head').querySelectorAll('th').length, 8);
  assert.equal(get('schedule-table-body').querySelectorAll('tr').length, 72);
  get('schedule-fullscreen').click();
  assert.equal(get('view-schedule').classList.contains('schedule-fullscreen'), true);
  assert.equal(get('schedule-fullscreen').textContent, 'Sair da tela cheia');
  get('schedule-fullscreen').click();
  assert.equal(get('view-schedule').classList.contains('schedule-fullscreen'), false);
  const cell = document.querySelector('[data-schedule-key="0-06:15"]') as HTMLButtonElement;
  cell.click();
  assert.equal(get('schedule-selection-label').textContent, 'Segunda, 06:15');
  const rangeEnd = document.querySelector('[data-schedule-key="0-07:00"]') as HTMLButtonElement;
  rangeEnd.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, shiftKey: true }));
  assert.equal(document.querySelectorAll('.schedule-cell.selected').length, 4);
  assert.equal(get('schedule-selection-label').textContent, '4 horários selecionados');
  input('schedule-activity', 'Planejamento semanal');
  get('schedule-editor').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
  assert.equal((get('schedule-editor') as HTMLElement).hidden, true);
  assert.equal(document.querySelectorAll('.schedule-cell.selected').length, 0);
  assert.equal(document.querySelector('[data-schedule-key="0-06:15"]')?.textContent, 'Planejamento semanal');
  assert.equal(JSON.parse(localStorage.getItem('my_agenda_schedule')!)['0-06:15'], 'Planejamento semanal');
  assert.equal(JSON.parse(localStorage.getItem('my_agenda_schedule')!)['0-07:00'], 'Planejamento semanal');
  assert.equal(localStorage.getItem('my_agenda_tasks'), null);
  resetSchedule();
  assert.equal(document.querySelector('[data-schedule-key="0-06:15"]')?.textContent, 'Planejamento semanal');
  (document.querySelector('[data-schedule-key="0-06:15"]') as HTMLButtonElement).click();
  get('schedule-clear').click();
  assert.equal(document.querySelector('[data-schedule-key="0-06:15"]')?.textContent, '');
});

test('Timer persists both durations and supports focus and break controls', () => {
  localStorage.clear();
  resetTimer();
  assert.equal(get('timer-display').textContent, '25:00');
  input('timer-focus-minutes', '40');
  get('timer-focus-minutes').dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  input('timer-break-minutes', '10');
  get('timer-break-minutes').dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  assert.deepEqual(JSON.parse(localStorage.getItem('my_agenda_timer')!), { focusMinutes: 40, breakMinutes: 10 });
  assert.equal(get('timer-display').textContent, '40:00');
  get('timer-mode-break').click();
  assert.equal(get('timer-display').textContent, '10:00');
  get('timer-toggle').click();
  assert.equal(get('timer-toggle').textContent, 'Pausar');
  get('timer-toggle').click();
  assert.equal(get('timer-toggle').textContent, 'Iniciar');
  assert.equal(get('timer-status').textContent, 'Pausado');
  get('timer-reset').click();
  assert.equal(get('timer-display').textContent, '10:00');
});

test('Timer plays the gentle sound when starting and completing, then changes mode', async () => {
  localStorage.clear();
  let soundsPlayed = 0;
  class AudioContextMock {
    currentTime = 0;
    destination = {};
    constructor() { soundsPlayed++; }
    createOscillator() {
      return { type: 'sine', frequency: { setValueAtTime() {} }, connect() {}, start() {}, stop() {}, onended: null };
    }
    createGain() {
      return { gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {} };
    }
    close() { return Promise.resolve(); }
  }
  const originalAudioContext = window.AudioContext;
  Object.defineProperty(window, 'AudioContext', { configurable: true, value: AudioContextMock });
  try {
    resetTimer();
    input('timer-focus-minutes', '0.001');
    get('timer-focus-minutes').dispatchEvent(new dom.window.Event('change', { bubbles: true }));
    get('timer-toggle').click();
    assert.equal(soundsPlayed, 1);
    await new Promise((resolve) => setTimeout(resolve, 600));
    assert.equal(soundsPlayed, 2);
    assert.equal(get('timer-mode-break').classList.contains('active'), true);
    assert.match(get('timer-status').textContent!, /Foco concluído/);
    await new Promise((resolve) => setTimeout(resolve, 350));
    assert.equal(soundsPlayed, 2);
  } finally {
    Object.defineProperty(window, 'AudioContext', { configurable: true, value: originalAudioContext });
  }
});


test('Navigation exposes notes and renders Issue and MR details as Markdown', async () => {
  localStorage.clear();
  document.body.innerHTML = new JSDOM(html).window.document.body.innerHTML;
  await import('../src/main.ts');
  document.dispatchEvent(new dom.window.Event('DOMContentLoaded'));
  assert.equal(document.querySelectorAll('.nav-group:not([hidden])').length, 1);
  assert.equal((document.querySelector('.nav-group:not([hidden])') as HTMLElement).dataset.navGroup, 'agenda');
  get('nav-group-next').click();
  assert.equal((document.querySelector('.nav-group:not([hidden])') as HTMLElement).dataset.navGroup, 'organize');
  assert.equal(get('view-notes').classList.contains('active'), true);
  get('nav-group-next').click();
  assert.equal((document.querySelector('.nav-group:not([hidden])') as HTMLElement).dataset.navGroup, 'gitlab');
  assert.equal(get('view-gitlab').classList.contains('active'), true);
  get('nav-group-prev').click();
  assert.equal((document.querySelector('.nav-group:not([hidden])') as HTMLElement).dataset.navGroup, 'organize');
  assert.equal(get('view-notes').classList.contains('active'), true);
  get('nav-group-prev').click();
  assert.equal((document.querySelector('.nav-group:not([hidden])') as HTMLElement).dataset.navGroup, 'agenda');
  assert.equal(get('view-monthly').classList.contains('active'), true);
  get('nav-group-next').click();
  get('tab-notes').click();
  assert.equal(get('view-notes').classList.contains('active'), true);
  assert.equal(document.querySelector('.toolbar-bar')!.classList.contains('hidden'), true);
  get('tab-timer').click();
  assert.equal(get('view-timer').classList.contains('active'), true);
  assert.equal(document.querySelector('.toolbar-bar')!.classList.contains('hidden'), true);
  get('tab-notes').click();
  get('tab-tasks').click();
  assert.equal(get('view-tasks').classList.contains('active'), true);
  assert.equal(document.querySelector('.toolbar-bar')!.classList.contains('hidden'), true);
  get('tab-schedule').click();
  assert.equal(get('view-schedule').classList.contains('active'), true);
  assert.equal(document.querySelector('.toolbar-bar')!.classList.contains('hidden'), true);
  get('tab-notes').click();
  get('note-create').click();
  input('note-content', '**Mantida ao navegar**');
  get('tab-gitlab').click();
  assert.equal(document.querySelector('.toolbar-bar')!.classList.contains('hidden'), false);
  (get('view-gitlab').querySelector('.kanban-card') as HTMLElement).click();
  assert.equal(get('detail-description').classList.contains('markdown-body'), true);
  assert.ok(get('detail-description').querySelector('p'));
  get('close-modal-detail').click();
  get('gitlab-tab-mrs').click();
  (get('view-gitlab').querySelector('.kanban-card') as HTMLElement).click();
  assert.match(get('detail-badge').textContent!, /MR/);
  assert.equal(get('detail-description').classList.contains('markdown-body'), true);
  get('close-modal-detail').click();
  get('tab-notes').click();
  assert.equal(get('note-preview').querySelector('strong')?.textContent, 'Mantida ao navegar');
});
