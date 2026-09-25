import { invoke } from '@tauri-apps/api/core';
import { openUrl } from '@tauri-apps/plugin-opener';
import { renderMarkdown, gitlabProjectUrl } from './markdown.ts';
import { setupNotes } from './notes.ts';
import { setupTasks } from './tasks.ts';
import { setupSchedule } from './schedule.ts';
import { setupTimer } from './timer.ts';

// Data Interfaces
interface GoogleEvent {
  id: string;
  summary: string;
  description?: string;
  start_time: string;
  end_time: string;
  html_link?: string;
  location?: string;
}

interface GitlabIssue {
  id: number;
  iid: number;
  title: string;
  description?: string;
  state: string;
  created_at: string;
  due_date?: string;
  web_url: string;
  labels: string[];
  assignee_name?: string;
  project_name?: string;
}

interface GitlabMR {
  id: number;
  iid: number;
  title: string;
  description?: string;
  state: string;
  created_at: string;
  target_branch?: string;
  source_branch?: string;
  web_url: string;
  labels: string[];
  author_name?: string;
  draft: boolean;
}

interface AppConfig {
  gitlabHost: string;
  gitlabToken: string;
  gitlabUsername: string;
  googleCalId: string;
  googleToken: string;
  googleClientId?: string;
  googleClientSecret?: string;
}

// App State
class AppState {
  currentView: 'monthly' | 'weekly' | 'daily' | 'schedule' | 'gitlab' | 'notes' | 'tasks' | 'timer' = 'monthly';
  currentDate: Date = new Date();
  config: AppConfig = {
    gitlabHost: '',
    gitlabToken: '',
    gitlabUsername: '',
    googleCalId: 'primary',
    googleToken: '',
    googleClientId: '',
    googleClientSecret: '',
  };
  googleEvents: GoogleEvent[] = [];
  gitlabIssues: GitlabIssue[] = [];
  gitlabMRs: GitlabMR[] = [];
  isDemoMode: boolean = true;
  selectedGitlabTab: 'issues' | 'mrs' = 'issues';
  selectedTagFilter: string = 'all';
  searchQuery: string = '';

  constructor() {
    this.loadConfig();
  }

  loadConfig() {
    const saved = localStorage.getItem('my_agenda_config');
    if (saved) {
      try {
        this.config = JSON.parse(saved);
        if (this.config.gitlabToken || this.config.googleToken) {
          this.isDemoMode = false;
        }
      } catch (e) {
        console.error('Failed to parse saved config', e);
      }
    }
  }

  saveConfig(newConfig: AppConfig) {
    this.config = newConfig;
    localStorage.setItem('my_agenda_config', JSON.stringify(newConfig));
    this.isDemoMode = !(newConfig.gitlabToken || newConfig.googleToken);
  }
}

const state = new AppState();

// Helper: Check if running inside Tauri
function isTauriAvailable(): boolean {
  return typeof window !== 'undefined' && ('__TAURI_INTERNALS__' in window || '__TAURI__' in window);
}

// Load Demo Data for Instant Visual Feedback & Testing
function generateDemoData() {
  const today = state.currentDate;
  const year = today.getFullYear();
  const month = today.getMonth();

  const d = (day: number, hour: number = 10) => {
    const dt = new Date(year, month, day, hour, 0);
    return dt.toISOString();
  };

  state.googleEvents = [
    {
      id: 'g1',
      summary: 'Sprint Planning & Alignment',
      description: 'Reunião com a equipe de engenharia para alinhamento das entregas da sprint.',
      start_time: d(14, 9),
      end_time: d(14, 10),
      location: 'Google Meet',
      html_link: 'https://calendar.google.com',
    },
    {
      id: 'g2',
      summary: '1:1 Tech Lead & Arquitetura',
      description: 'Alinhamento semanal de arquitetura Rust + Tauri e integrações.',
      start_time: d(16, 14),
      end_time: d(16, 15),
      location: 'Sala 3B / Remote',
      html_link: 'https://calendar.google.com',
    },
    {
      id: 'g3',
      summary: 'Review de Código & QA',
      description: 'Validação dos relatórios e novos endpoints da API do GitLab.',
      start_time: d(18, 11),
      end_time: d(18, 12),
      html_link: 'https://calendar.google.com',
    },
    {
      id: 'g4',
      summary: 'Apresentação de Resultados',
      description: 'Demo dos dashboards mensais e semanais.',
      start_time: d(22, 15),
      end_time: d(22, 16),
      html_link: 'https://calendar.google.com',
    },
  ];

  state.gitlabIssues = [
    {
      id: 101,
      iid: 42,
      title: 'Implementar autenticação OAuth2 no servidor Rust',
      description: 'Criar handlers em Rust para suporte ao fluxo de token privado do GitLab.',
      state: 'opened',
      created_at: d(10),
      due_date: d(16),
      web_url: 'https://gitlab.com',
      labels: ['Doing', 'Backend', 'Rust'],
      assignee_name: state.config.gitlabUsername || 'schwaad',
      project_name: 'core-backend',
    },
    {
      id: 102,
      iid: 45,
      title: 'Refatorar componentes de Kanban da Visão GitLab',
      description: 'Melhorar a renderização por tags (Doing, Done, To Do, In Review).',
      state: 'opened',
      created_at: d(12),
      due_date: d(18),
      web_url: 'https://gitlab.com',
      labels: ['Doing', 'Frontend', 'Tauri'],
      assignee_name: state.config.gitlabUsername || 'schwaad',
      project_name: 'my-agenda-app',
    },
    {
      id: 103,
      iid: 38,
      title: 'Configurar Webkit leve no pacote Tauri v2',
      description: 'Otimizar o consumo de memória do webview e tempo de compilação.',
      state: 'closed',
      created_at: d(5),
      due_date: d(14),
      web_url: 'https://gitlab.com',
      labels: ['Done', 'DevOps'],
      assignee_name: state.config.gitlabUsername || 'schwaad',
      project_name: 'my-agenda-app',
    },
    {
      id: 104,
      iid: 50,
      title: 'Adicionar filtro de busca global por tags e título',
      description: 'Permitir filtragem dinâmica de compromissos na toolbar.',
      state: 'opened',
      created_at: d(15),
      due_date: d(24),
      web_url: 'https://gitlab.com',
      labels: ['To Do', 'Feature'],
      assignee_name: state.config.gitlabUsername || 'schwaad',
      project_name: 'my-agenda-app',
    },
  ];

  state.gitlabMRs = [
    {
      id: 201,
      iid: 12,
      title: 'Draft: Merge Request - Suporte a múltiplos calendários Google',
      description: 'Adiciona parser de eventos iCal e integração de endpoints v3.',
      state: 'opened',
      created_at: d(14),
      target_branch: 'main',
      source_branch: 'feature/google-cal',
      web_url: 'https://gitlab.com',
      labels: ['In Review', 'Doing'],
      author_name: state.config.gitlabUsername || 'schwaad',
      draft: true,
    },
    {
      id: 202,
      iid: 15,
      title: 'Feat: Paleta de cores oficial #ff8c00 #202020 #a9a9a9',
      description: 'Aplica o tema dark elegante com contrastes otimizados.',
      state: 'merged',
      created_at: d(8),
      target_branch: 'main',
      source_branch: 'feature/dark-theme',
      web_url: 'https://gitlab.com',
      labels: ['Done', 'UI/UX'],
      author_name: state.config.gitlabUsername || 'schwaad',
      draft: false,
    },
  ];
}

// Fetch Data from APIs (Rust Commands or Demo)
async function fetchAllData() {
  const syncBtn = document.getElementById('btn-sync');
  if (syncBtn) syncBtn.classList.add('loading');

  if (state.isDemoMode || !isTauriAvailable()) {
    generateDemoData();
    updateUI();
    if (syncBtn) syncBtn.classList.remove('loading');
    return;
  }

  // Fetch GitLab Issues & MRs in isolated try/catch
  if (state.config.gitlabHost && state.config.gitlabToken) {
    try {
      const issues = await invoke<GitlabIssue[]>('fetch_gitlab_issues', {
        host: state.config.gitlabHost,
        token: state.config.gitlabToken,
        username: state.config.gitlabUsername || '',
      });
      state.gitlabIssues = issues;
    } catch (err) {
      console.error('Erro ao buscar Issues do GitLab:', err);
    }

    try {
      const mrs = await invoke<GitlabMR[]>('fetch_gitlab_mrs', {
        host: state.config.gitlabHost,
        token: state.config.gitlabToken,
        username: state.config.gitlabUsername || '',
      });
      state.gitlabMRs = mrs;
    } catch (err) {
      console.error('Erro ao buscar MRs do GitLab:', err);
    }
  }

  // Fetch Google Calendar Events & Google Tasks in isolated try/catch
  if (state.config.googleCalId && state.config.googleToken) {
    try {
      const timeMinDate = new Date(state.currentDate.getFullYear() - 1, 0, 1);
      const timeMinStr = timeMinDate.toISOString();

      const events = await invoke<GoogleEvent[]>('fetch_google_calendar_events', {
        calendarId: state.config.googleCalId,
        apiKeyOrToken: state.config.googleToken,
        clientId: state.config.googleClientId || null,
        clientSecret: state.config.googleClientSecret || null,
        timeMin: timeMinStr,
      });

      try {
        const tasks = await invoke<GoogleEvent[]>('fetch_google_tasks', {
          token: state.config.googleToken,
          clientId: state.config.googleClientId || null,
          clientSecret: state.config.googleClientSecret || null,
        });
        state.googleEvents = [...events, ...tasks];
      } catch (err) {
        state.googleEvents = events;
      }
    } catch (err) {
      console.error('Erro ao buscar eventos do Google Calendar:', err);
    }
  }

  if (state.gitlabIssues.length === 0 && state.gitlabMRs.length === 0 && state.googleEvents.length === 0 && state.isDemoMode) {
    generateDemoData();
  }

  if (syncBtn) syncBtn.classList.remove('loading');
  updateUI();
}

// Update UI according to active view & date
function updateUI() {
  updateStatusBanner();
  updateDateTitle();
  updateNavTabStyles();
  document.querySelector<HTMLElement>('.toolbar-bar')?.classList.toggle('hidden', ['schedule', 'notes', 'tasks', 'timer'].includes(state.currentView));

  if (state.currentView === 'monthly') {
    renderMonthlyGrid();
  } else if (state.currentView === 'weekly') {
    renderWeeklySchedule();
  } else if (state.currentView === 'daily') {
    renderDailyTimeline();
  } else if (state.currentView === 'gitlab') {
    renderGitlabBoard();
  }
}

function updateStatusBanner() {
  const banner = document.getElementById('status-banner');
  if (banner) {
    if (state.isDemoMode) {
      banner.classList.remove('hidden');
    } else {
      banner.classList.add('hidden');
    }
  }
}

function updateNavTabStyles() {
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    const viewName = btn.getAttribute('data-view');
    if (viewName === state.currentView) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  document.querySelectorAll('.view-panel').forEach((panel) => {
    if (panel.id === `view-${state.currentView}`) {
      panel.classList.add('active');
    } else {
      panel.classList.remove('active');
    }
  });
}

function updateDateTitle() {
  const titleEl = document.getElementById('current-date-title');
  if (!titleEl) return;

  const monthNames = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
  ];

  if (state.currentView === 'monthly') {
    titleEl.textContent = `${monthNames[state.currentDate.getMonth()]} ${state.currentDate.getFullYear()}`;
  } else if (state.currentView === 'weekly') {
    const startOfWeek = getStartOfWeek(state.currentDate);
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);
    if (startOfWeek.getMonth() === endOfWeek.getMonth()) {
      titleEl.textContent = `${startOfWeek.getDate()} - ${endOfWeek.getDate()} de ${monthNames[endOfWeek.getMonth()]} ${endOfWeek.getFullYear()}`;
    } else {
      titleEl.textContent = `${startOfWeek.getDate()} de ${monthNames[startOfWeek.getMonth()]} - ${endOfWeek.getDate()} de ${monthNames[endOfWeek.getMonth()]} ${endOfWeek.getFullYear()}`;
    }
  } else {
    titleEl.textContent = `${state.currentDate.getDate()} de ${monthNames[state.currentDate.getMonth()]} ${state.currentDate.getFullYear()}`;
  }
}

// Helper Date Functions
function getEventDateStr(dateStr: string): string {
  if (!dateStr) return '';
  const clean = dateStr.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) {
    return clean;
  }
  const d = new Date(clean);
  if (!isNaN(d.getTime())) {
    return formatDateToStr(d);
  }
  const match = clean.match(/(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : '';
}

function formatDateToStr(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function isAllDayEvent(dateStr: string): boolean {
  if (!dateStr) return true;
  const clean = dateStr.trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(clean);
}

function getEventDisplayTime(dateStr: string): string {
  if (!dateStr) return '';
  const clean = dateStr.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) {
    return 'Dia todo';
  }
  const d = new Date(clean);
  if (!isNaN(d.getTime())) {
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
  }
  const match = clean.match(/T(\d{2}):(\d{2})/);
  return match ? `${match[1]}:${match[2]}` : 'Dia todo';
}

function getEventStartHourFraction(dateStr: string): number {
  if (!dateStr || isAllDayEvent(dateStr)) return -1;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return -1;
  return d.getHours() + d.getMinutes() / 60;
}

function getEventDurationMinutes(startTimeStr: string, endTimeStr?: string): number {
  if (!startTimeStr || isAllDayEvent(startTimeStr)) return 60;
  const start = new Date(startTimeStr);
  if (isNaN(start.getTime())) return 60;
  if (endTimeStr && !isAllDayEvent(endTimeStr)) {
    const end = new Date(endTimeStr);
    if (!isNaN(end.getTime()) && end.getTime() > start.getTime()) {
      const diffMinutes = Math.round((end.getTime() - start.getTime()) / (1000 * 60));
      return Math.max(20, Math.min(diffMinutes, 24 * 60));
    }
  }
  return 60; // default 1 hour
}

function parseEventDate(dateStr: string): Date {
  if (!dateStr) return new Date(NaN);
  const clean = dateStr.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) {
    const parts = clean.split('-').map(Number);
    return new Date(parts[0], parts[1] - 1, parts[2], 12, 0, 0);
  }
  return new Date(clean);
}

function getStartOfWeek(d: Date): Date {
  const date = new Date(d);
  const day = date.getDay(); // 0 = Sunday
  date.setDate(date.getDate() - day);
  date.setHours(0, 0, 0, 0);
  return date;
}

function isSameDay(d1: Date, d2: Date): boolean {
  if (isNaN(d1.getTime()) || isNaN(d2.getTime())) return false;
  return (
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate()
  );
}

interface UnifiedCalendarItem {
  id: string;
  type: 'google' | 'gitlab-issue' | 'gitlab-mr';
  title: string;
  description: string;
  url?: string;
  tags: string[];
  isAllDay: boolean;
  startHourFraction: number;
  endHourFraction: number;
  timeDisplay: string;
  rawDate: Date;
}

function layoutTimedEvents(
  timedEvents: UnifiedCalendarItem[]
): { item: UnifiedCalendarItem; colIdx: number; totalCols: number }[] {
  if (timedEvents.length === 0) return [];

  timedEvents.sort((a, b) => a.startHourFraction - b.startHourFraction || b.endHourFraction - a.endHourFraction);

  const results: { item: UnifiedCalendarItem; colIdx: number; totalCols: number }[] = [];
  let cluster: UnifiedCalendarItem[] = [];
  let clusterEnd = -1;

  const flushCluster = (c: UnifiedCalendarItem[]) => {
    if (c.length === 0) return;
    const columns: number[] = [];
    const placed: { item: UnifiedCalendarItem; colIdx: number }[] = [];

    for (const ev of c) {
      let placedCol = -1;
      for (let i = 0; i < columns.length; i++) {
        if (columns[i] <= ev.startHourFraction) {
          columns[i] = ev.endHourFraction;
          placedCol = i;
          break;
        }
      }
      if (placedCol === -1) {
        columns.push(ev.endHourFraction);
        placedCol = columns.length - 1;
      }
      placed.push({ item: ev, colIdx: placedCol });
    }

    const totalCols = columns.length;
    for (const p of placed) {
      results.push({ item: p.item, colIdx: p.colIdx, totalCols });
    }
  };

  for (const ev of timedEvents) {
    if (cluster.length === 0) {
      cluster.push(ev);
      clusterEnd = ev.endHourFraction;
    } else if (ev.startHourFraction < clusterEnd) {
      cluster.push(ev);
      clusterEnd = Math.max(clusterEnd, ev.endHourFraction);
    } else {
      flushCluster(cluster);
      cluster = [ev];
      clusterEnd = ev.endHourFraction;
    }
  }

  if (cluster.length > 0) {
    flushCluster(cluster);
  }

  return results;
}

// ----------------------------------------------------
// VIEW 1: MONTHLY CALENDAR GRID
// ----------------------------------------------------
function renderMonthlyGrid() {
  const gridContainer = document.getElementById('monthly-grid');
  if (!gridContainer) return;

  gridContainer.innerHTML = '';

  const year = state.currentDate.getFullYear();
  const month = state.currentDate.getMonth();

  const firstDayOfMonth = new Date(year, month, 1);
  const lastDayOfMonth = new Date(year, month + 1, 0);

  let startDayOfWeek = firstDayOfMonth.getDay(); // 0 = Sunday
  const totalMonthDays = lastDayOfMonth.getDate();

  const today = new Date();

  // Create padding cells for previous month
  const prevMonthLastDay = new Date(year, month, 0).getDate();
  for (let i = startDayOfWeek - 1; i >= 0; i--) {
    const dayNum = prevMonthLastDay - i;
    const cell = document.createElement('div');
    cell.className = 'day-cell other-month';
    cell.innerHTML = `<div class="day-number-bar"><span class="day-num">${dayNum}</span></div>`;
    gridContainer.appendChild(cell);
  }

  // Filter items by search query
  const query = state.searchQuery.toLowerCase();

  // Create current month day cells
  for (let day = 1; day <= totalMonthDays; day++) {
    const cellDate = new Date(year, month, day);
    const cellDateStr = formatDateToStr(cellDate);
    const cell = document.createElement('div');
    cell.className = 'day-cell';
    if (isSameDay(cellDate, today)) cell.classList.add('today');

    const numBar = document.createElement('div');
    numBar.className = 'day-number-bar';
    numBar.innerHTML = `<span class="day-num">${day}</span>`;
    cell.appendChild(numBar);

    const stack = document.createElement('div');
    stack.className = 'events-stack';

    // Google Events for this day
    const dayEvents = state.googleEvents.filter((ev) => {
      const evDateStr = getEventDateStr(ev.start_time);
      const matchesDay = evDateStr === cellDateStr;
      const matchesQuery = !query || ev.summary.toLowerCase().includes(query) || (ev.description || '').toLowerCase().includes(query);
      return matchesDay && matchesQuery;
    });

    dayEvents.sort((a, b) => {
      const tA = parseEventDate(a.start_time).getTime();
      const tB = parseEventDate(b.start_time).getTime();
      return tA - tB;
    });

    dayEvents.forEach((ev) => {
      const chip = document.createElement('div');
      chip.className = 'event-chip type-google';
      const timeStr = getEventDisplayTime(ev.start_time);
      chip.innerHTML = `<span class="chip-time">${timeStr}</span> <span class="chip-title">${escapeHtml(ev.summary)}</span>`;
      chip.onclick = () => showItemDetail('Google Agenda', ev.summary, ev.description || '', ev.html_link, [ev.location || 'Sem local']);
      stack.appendChild(chip);
    });

    // GitLab Issues for this day
    const dayIssues = state.gitlabIssues.filter((iss) => {
      if (!iss.due_date) return false;
      const issDate = parseEventDate(iss.due_date);
      const matchesDay = isSameDay(issDate, cellDate);
      const matchesQuery = !query || iss.title.toLowerCase().includes(query) || iss.labels.some((l) => l.toLowerCase().includes(query));
      return matchesDay && matchesQuery;
    });

    dayIssues.sort((a, b) => {
      const tA = parseEventDate(a.due_date || '').getTime();
      const tB = parseEventDate(b.due_date || '').getTime();
      return tA - tB;
    });

    dayIssues.forEach((iss) => {
      const chip = document.createElement('div');
      chip.className = 'event-chip type-gitlab-issue';
      chip.innerHTML = `<span class="chip-time">#${iss.iid}</span> <span class="chip-title">${escapeHtml(iss.title)}</span>`;
      chip.onclick = () => showItemDetail(`GitLab Issue #${iss.iid}`, iss.title, iss.description || '', iss.web_url, iss.labels, true);
      stack.appendChild(chip);
    });

    cell.appendChild(stack);
    gridContainer.appendChild(cell);
  }
}

// ----------------------------------------------------
// VIEW 2: WEEKLY SCHEDULE
// ----------------------------------------------------
function renderWeeklySchedule() {
  const headerContainer = document.getElementById('weekly-header');
  const allDayRow = document.getElementById('weekly-all-day-row');
  const timeColumn = document.getElementById('weekly-time-column');
  const daysGrid = document.getElementById('weekly-grid-days');
  const bodyScroll = document.getElementById('weekly-body-scroll');

  if (!headerContainer || !daysGrid || !timeColumn) return;

  headerContainer.innerHTML = '<div class="weekly-header-col time-col-header"><span>Hora</span></div>';
  if (allDayRow) {
    allDayRow.innerHTML = '<div class="all-day-label">Dia Todo</div>';
  }
  timeColumn.innerHTML = '';
  daysGrid.innerHTML = '';

  const HOUR_HEIGHT = 56;
  const startOfWeek = getStartOfWeek(state.currentDate);
  const today = new Date();
  const weekDays: Date[] = [];
  const dayNames = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

  // Render Time Labels (00:00 - 23:00)
  for (let h = 0; h < 24; h++) {
    const slot = document.createElement('div');
    slot.className = 'time-slot';
    slot.style.height = `${HOUR_HEIGHT}px`;
    slot.textContent = `${String(h).padStart(2, '0')}:00`;
    timeColumn.appendChild(slot);
  }

  // Render 7 Day Headers
  for (let i = 0; i < 7; i++) {
    const d = new Date(startOfWeek);
    d.setDate(startOfWeek.getDate() + i);
    weekDays.push(d);

    const isToday = isSameDay(d, today);
    const colHeader = document.createElement('div');
    colHeader.className = `weekly-header-col ${isToday ? 'today' : ''}`;
    colHeader.innerHTML = `
      <div class="weekly-day-name">${dayNames[d.getDay()]}</div>
      <div class="weekly-day-num ${isToday ? 'today' : ''}">${d.getDate()}</div>
    `;
    headerContainer.appendChild(colHeader);
  }

  const query = state.searchQuery.toLowerCase();

  // Render 7 Days Columns & All-Day Row
  weekDays.forEach((date) => {
    const targetDateStr = formatDateToStr(date);
    const dayItems: UnifiedCalendarItem[] = [];

    // 1. Google Events
    state.googleEvents.forEach((ev) => {
      const evDateStr = getEventDateStr(ev.start_time);
      if (evDateStr !== targetDateStr) return;

      const matchesQuery =
        !query ||
        ev.summary.toLowerCase().includes(query) ||
        (ev.description || '').toLowerCase().includes(query) ||
        (ev.location || '').toLowerCase().includes(query);
      if (!matchesQuery) return;

      const isAllDay = isAllDayEvent(ev.start_time);
      const startHour = isAllDay ? -1 : getEventStartHourFraction(ev.start_time);
      const duration = isAllDay ? 0 : getEventDurationMinutes(ev.start_time, ev.end_time);

      dayItems.push({
        id: ev.id,
        type: 'google',
        title: ev.summary,
        description: ev.description || '',
        url: ev.html_link,
        tags: [ev.location || 'Google Agenda'],
        isAllDay,
        startHourFraction: startHour,
        endHourFraction: isAllDay ? -1 : startHour + duration / 60,
        timeDisplay: getEventDisplayTime(ev.start_time),
        rawDate: parseEventDate(ev.start_time),
      });
    });

    // 2. GitLab Issues
    state.gitlabIssues.forEach((iss) => {
      if (!iss.due_date) return;
      const issDateStr = getEventDateStr(iss.due_date);
      if (issDateStr !== targetDateStr) return;

      const matchesQuery =
        !query ||
        iss.title.toLowerCase().includes(query) ||
        (iss.description || '').toLowerCase().includes(query) ||
        iss.labels.some((l) => l.toLowerCase().includes(query));
      if (!matchesQuery) return;

      const isAllDay = isAllDayEvent(iss.due_date);
      const startHour = isAllDay ? -1 : getEventStartHourFraction(iss.due_date);
      const duration = isAllDay ? 0 : 60;

      dayItems.push({
        id: `iss-${iss.id}`,
        type: 'gitlab-issue',
        title: `#${iss.iid} ${iss.title}`,
        description: iss.description || '',
        url: iss.web_url,
        tags: iss.labels,
        isAllDay,
        startHourFraction: startHour,
        endHourFraction: isAllDay ? -1 : startHour + duration / 60,
        timeDisplay: isAllDay ? 'Dia todo' : getEventDisplayTime(iss.due_date),
        rawDate: parseEventDate(iss.due_date),
      });
    });

    // Separate all-day vs timed
    const allDayItems = dayItems.filter((item) => item.isAllDay);
    const timedItems = dayItems.filter((item) => !item.isAllDay);

    // Sort all-day items alphabetically
    allDayItems.sort((a, b) => a.title.localeCompare(b.title));

    // Sort timed items chronologically
    timedItems.sort((a, b) => a.startHourFraction - b.startHourFraction || a.rawDate.getTime() - b.rawDate.getTime());

    // 3. Render All-Day Cell
    if (allDayRow) {
      const allDayCell = document.createElement('div');
      allDayCell.className = 'all-day-cell';
      allDayItems.forEach((item) => {
        const chip = document.createElement('div');
        chip.className = `event-chip type-${item.type} all-day-chip`;
        chip.innerHTML = `<span class="chip-title">${escapeHtml(item.title)}</span>`;
        chip.onclick = () =>
          showItemDetail(
            item.type === 'google' ? 'Google Agenda' : 'GitLab Issue',
            item.title,
            item.description,
            item.url,
            item.tags,
            item.type !== 'google'
          );
        allDayCell.appendChild(chip);
      });
      allDayRow.appendChild(allDayCell);
    }

    // 4. Render Day Column with Hour Grid and Timed Events
    const col = document.createElement('div');
    col.className = 'weekly-day-column';
    col.style.height = `${24 * HOUR_HEIGHT}px`;

    // 24 Hour Grid Lines
    for (let h = 0; h < 24; h++) {
      const cell = document.createElement('div');
      cell.className = 'weekly-hour-cell';
      cell.style.height = `${HOUR_HEIGHT}px`;
      col.appendChild(cell);
    }

    // Current Time Line (if today)
    if (isSameDay(date, today)) {
      const now = new Date();
      const currentMinutes = now.getHours() * 60 + now.getMinutes();
      const lineTop = (currentMinutes / 60) * HOUR_HEIGHT;
      const timeIndicator = document.createElement('div');
      timeIndicator.className = 'current-time-line';
      timeIndicator.style.top = `${lineTop}px`;
      col.appendChild(timeIndicator);
    }

    // Position Timed Events
    const layouted = layoutTimedEvents(timedItems);
    layouted.forEach(({ item, colIdx, totalCols }) => {
      const top = item.startHourFraction * HOUR_HEIGHT;
      const durationHours = Math.max(0.5, item.endHourFraction - item.startHourFraction);
      const height = Math.max(26, durationHours * HOUR_HEIGHT - 3);

      const widthPercent = 100 / totalCols;
      const leftPercent = colIdx * widthPercent;

      const chip = document.createElement('div');
      chip.className = `event-chip weekly-timed type-${item.type}`;
      chip.style.top = `${top}px`;
      chip.style.height = `${height}px`;
      chip.style.left = `calc(${leftPercent}% + 2px)`;
      chip.style.width = `calc(${widthPercent}% - 4px)`;

      chip.innerHTML = `
        <div class="weekly-chip-content">
          <span class="chip-time">${item.timeDisplay}</span>
          <span class="chip-title">${escapeHtml(item.title)}</span>
        </div>
      `;
      chip.onclick = () =>
        showItemDetail(
          item.type === 'google' ? 'Google Agenda' : 'GitLab Issue',
          item.title,
          item.description,
          item.url,
          item.tags,
          item.type !== 'google'
        );
      col.appendChild(chip);
    });

    daysGrid.appendChild(col);
  });

  // Auto-scroll to morning (~07:00) on first weekly view activation
  if (bodyScroll && !bodyScroll.dataset.scrolled) {
    bodyScroll.scrollTop = 7 * HOUR_HEIGHT;
    bodyScroll.dataset.scrolled = 'true';
  }
}

// ----------------------------------------------------
// VIEW 3: DAILY AGENDA
// ----------------------------------------------------
function renderDailyTimeline() {
  const labelEl = document.getElementById('daily-day-label');
  const subEl = document.getElementById('daily-day-sub');
  const timelineList = document.getElementById('daily-timeline-list');
  const gitlabList = document.getElementById('daily-gitlab-list');
  const countEl = document.getElementById('daily-gitlab-count');

  if (!timelineList || !gitlabList) return;

  timelineList.innerHTML = '';
  gitlabList.innerHTML = '';

  const targetDate = state.currentDate;
  const targetDateStr = formatDateToStr(targetDate);
  if (labelEl) labelEl.textContent = `Agenda de ${targetDate.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}`;

  const dayEvents = state.googleEvents.filter((ev) => getEventDateStr(ev.start_time) === targetDateStr);
  if (subEl) subEl.textContent = `${dayEvents.length} compromisso(s) agendado(s) para hoje`;

  if (dayEvents.length === 0) {
    timelineList.innerHTML = `
      <div class="timeline-card" style="border-left-color: var(--color-text-secondary);">
        <div class="timeline-time">--:--</div>
        <div class="timeline-content">
          <h4>Nenhum evento do Google Agenda para hoje</h4>
          <p>Você não possui compromissos agendados no dia de hoje.</p>
        </div>
      </div>
    `;
  } else {
    dayEvents.forEach((ev) => {
      const timeStr = getEventDisplayTime(ev.start_time);
      const card = document.createElement('div');
      card.className = 'timeline-card';
      card.innerHTML = `
        <div class="timeline-time">${timeStr}</div>
        <div class="timeline-content">
          <h4>${escapeHtml(ev.summary)}</h4>
          <p>${escapeHtml(ev.description || ev.location || 'Sem descrição adicional')}</p>
        </div>
      `;
      card.onclick = () => showItemDetail('Google Agenda', ev.summary, ev.description || '', ev.html_link, [ev.location || '']);
      timelineList.appendChild(card);
    });
  }

  // Sidebar GitLab Tasks
  const gitlabItems = [...state.gitlabIssues, ...state.gitlabMRs];
  if (countEl) countEl.textContent = `${gitlabItems.length}`;

  gitlabItems.forEach((item) => {
    const card = document.createElement('div');
    card.className = 'kanban-card';
    const isIssue = !('draft' in item);
    const title = item.title;
    const iid = item.iid;
    card.innerHTML = `
      <div class="card-top">
        <span class="card-project">${isIssue ? 'Issue' : 'MR'} #${iid}</span>
        <span>${escapeHtml(item.state)}</span>
      </div>
      <div class="card-title">${escapeHtml(title)}</div>
    `;
    card.onclick = () => showItemDetail(isIssue ? `Issue #${iid}` : `MR #${iid}`, title, item.description || '', item.web_url, item.labels, true);
    gitlabList.appendChild(card);
  });
}

// ----------------------------------------------------
// VIEW 4: GITLAB KANBAN BOARD (ISSUES & MRS COM TAGS)
// ----------------------------------------------------
function renderGitlabBoard() {
  const cardsTodo = document.getElementById('cards-todo');
  const cardsDoing = document.getElementById('cards-doing');
  const cardsReview = document.getElementById('cards-review');
  const cardsDone = document.getElementById('cards-done');

  const countTodo = document.getElementById('count-todo');
  const countDoing = document.getElementById('count-doing');
  const countReview = document.getElementById('count-review');
  const countDone = document.getElementById('count-done');

  const badgeIssues = document.getElementById('badge-issues-count');
  const badgeMRs = document.getElementById('badge-mrs-count');

  if (!cardsTodo || !cardsDoing || !cardsReview || !cardsDone) return;

  cardsTodo.innerHTML = '';
  cardsDoing.innerHTML = '';
  cardsReview.innerHTML = '';
  cardsDone.innerHTML = '';

  if (badgeIssues) badgeIssues.textContent = `${state.gitlabIssues.length}`;
  if (badgeMRs) badgeMRs.textContent = `${state.gitlabMRs.length}`;

  const query = state.searchQuery.toLowerCase();
  const activeTab = state.selectedGitlabTab;
  const tagFilter = state.selectedTagFilter;

  const itemsToRender: (GitlabIssue | GitlabMR)[] = activeTab === 'issues' ? state.gitlabIssues : state.gitlabMRs;

  let countMap = { todo: 0, doing: 0, review: 0, done: 0 };

  itemsToRender.forEach((item) => {
    // Tag / Query Filtering
    const matchesQuery = !query || item.title.toLowerCase().includes(query) || item.labels.some((l) => l.toLowerCase().includes(query));
    if (!matchesQuery) return;

    // Categorize into Kanban Columns based on labels & state
    let column: 'todo' | 'doing' | 'review' | 'done' = 'todo';

    const labelsLower = item.labels.map((l) => l.toLowerCase());

    if (labelsLower.includes('done') || item.state === 'closed' || item.state === 'merged') {
      column = 'done';
    } else if (labelsLower.includes('doing') || labelsLower.includes('in progress')) {
      column = 'doing';
    } else if (labelsLower.includes('in review') || labelsLower.includes('review') || ('draft' in item && item.draft)) {
      column = 'review';
    } else {
      column = 'todo';
    }

    if (tagFilter !== 'all') {
      const matchTag = labelsLower.includes(tagFilter.toLowerCase()) || column.toLowerCase() === tagFilter.toLowerCase();
      if (!matchTag) return;
    }

    countMap[column]++;

    const card = document.createElement('div');
    card.className = 'kanban-card';

    const project = 'project_name' in item && item.project_name ? item.project_name : 'GitLab';
    const authorOrAssignee = 'assignee_name' in item ? item.assignee_name : ('author_name' in item ? item.author_name : '');

    card.innerHTML = `
      <div class="card-top">
        <span class="card-project">${escapeHtml(project)}</span>
        <span class="card-iid">#${item.iid}</span>
      </div>
      <div class="card-title">${escapeHtml(item.title)}</div>
      <div class="card-tags">
        ${item.labels.map((lbl) => `<span class="tag-pill ${lbl.toLowerCase()}">${escapeHtml(lbl)}</span>`).join('')}
      </div>
      <div class="card-footer">
        <span>👤 ${escapeHtml(authorOrAssignee || 'Atribuído')}</span>
        <span>${item.state}</span>
      </div>
    `;

    card.onclick = () => showItemDetail(`${activeTab === 'issues' ? 'Issue' : 'MR'} #${item.iid}`, item.title, item.description || '', item.web_url, item.labels, true);

    if (column === 'todo') cardsTodo.appendChild(card);
    else if (column === 'doing') cardsDoing.appendChild(card);
    else if (column === 'review') cardsReview.appendChild(card);
    else if (column === 'done') cardsDone.appendChild(card);
  });

  if (countTodo) countTodo.textContent = `${countMap.todo}`;
  if (countDoing) countDoing.textContent = `${countMap.doing}`;
  if (countReview) countReview.textContent = `${countMap.review}`;
  if (countDone) countDone.textContent = `${countMap.done}`;
}

// ----------------------------------------------------
// MODALS & EVENT HANDLERS
// ----------------------------------------------------
function showItemDetail(badge: string, title: string, description: string, url?: string, tags: string[] = [], markdown = false) {
  const modal = document.getElementById('modal-item-detail');
  const badgeEl = document.getElementById('detail-badge');
  const titleEl = document.getElementById('detail-title');
  const descEl = document.getElementById('detail-description');
  const tagsEl = document.getElementById('detail-tags');
  const linkBtn = document.getElementById('detail-link-btn') as HTMLAnchorElement;

  if (!modal) return;

  if (badgeEl) badgeEl.textContent = badge;
  if (titleEl) titleEl.textContent = title;
  if (descEl) {
    const text = description || 'Sem descrição detalhada fornecida.';
    descEl.classList.toggle('markdown-body', markdown);
    descEl.onclick = null;
    if (markdown) renderMarkdown(descEl, text, gitlabProjectUrl(url));
    else descEl.textContent = text;
  }

  if (tagsEl) {
    tagsEl.innerHTML = tags.map((t) => `<span class="tag-pill doing">${escapeHtml(t)}</span>`).join(' ');
  }

  if (linkBtn) {
    if (url) {
      linkBtn.style.display = 'inline-flex';
      linkBtn.href = url;
      linkBtn.onclick = (e) => {
        if (isTauriAvailable()) {
          e.preventDefault();
          openUrl(url);
        }
      };
    } else {
      linkBtn.style.display = 'none';
    }
  }

  modal.classList.remove('hidden');
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Setup Event Listeners
function setupEventListeners() {
  const navGroups = Array.from(document.querySelectorAll<HTMLElement>('.nav-group'));
  let activeNavGroup = Math.max(0, navGroups.findIndex((group) => !group.hidden));

  const showNavGroup = (index: number, openFirstView = false) => {
    activeNavGroup = (index + navGroups.length) % navGroups.length;
    navGroups.forEach((group, groupIndex) => {
      const active = groupIndex === activeNavGroup;
      group.hidden = !active;
      group.classList.toggle('active', active);
    });
    if (openFirstView) {
      const firstView = navGroups[activeNavGroup].querySelector<HTMLElement>('.tab-btn')?.dataset.view as AppState['currentView'] | undefined;
      if (firstView) {
        state.currentView = firstView;
        updateUI();
      }
    }
  };

  document.getElementById('nav-group-prev')?.addEventListener('click', () => showNavGroup(activeNavGroup - 1, true));
  document.getElementById('nav-group-next')?.addEventListener('click', () => showNavGroup(activeNavGroup + 1, true));

  // Navigation Tabs
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const view = btn.getAttribute('data-view') as AppState['currentView'];
      if (view) {
        const groupIndex = navGroups.indexOf(btn.closest<HTMLElement>('.nav-group')!);
        if (groupIndex >= 0) showNavGroup(groupIndex);
        state.currentView = view;
        updateUI();
      }
    });
  });

  // Date Navigator Controls
  document.getElementById('btn-prev-date')?.addEventListener('click', () => {
    if (state.currentView === 'monthly') {
      state.currentDate.setMonth(state.currentDate.getMonth() - 1);
    } else if (state.currentView === 'weekly') {
      state.currentDate.setDate(state.currentDate.getDate() - 7);
    } else {
      state.currentDate.setDate(state.currentDate.getDate() - 1);
    }
    updateUI();
  });

  document.getElementById('btn-next-date')?.addEventListener('click', () => {
    if (state.currentView === 'monthly') {
      state.currentDate.setMonth(state.currentDate.getMonth() + 1);
    } else if (state.currentView === 'weekly') {
      state.currentDate.setDate(state.currentDate.getDate() + 7);
    } else {
      state.currentDate.setDate(state.currentDate.getDate() + 1);
    }
    updateUI();
  });

  document.getElementById('btn-today')?.addEventListener('click', () => {
    state.currentDate = new Date();
    updateUI();
  });

  // Global Search
  const searchInput = document.getElementById('global-search') as HTMLInputElement;
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      state.searchQuery = (e.target as HTMLInputElement).value;
      updateUI();
    });
  }

  // Sync Button
  document.getElementById('btn-sync')?.addEventListener('click', () => {
    fetchAllData();
  });

  // Settings Modal Open/Close
  const modalSettings = document.getElementById('modal-settings');
  document.getElementById('btn-settings')?.addEventListener('click', () => {
    populateSettingsForm();
    modalSettings?.classList.remove('hidden');
  });

  document.getElementById('banner-config-btn')?.addEventListener('click', () => {
    populateSettingsForm();
    modalSettings?.classList.remove('hidden');
  });

  document.getElementById('close-modal-settings')?.addEventListener('click', () => {
    modalSettings?.classList.add('hidden');
  });

  document.getElementById('btn-cancel-settings')?.addEventListener('click', () => {
    modalSettings?.classList.add('hidden');
  });

  document.getElementById('close-modal-detail')?.addEventListener('click', () => {
    document.getElementById('modal-item-detail')?.classList.add('hidden');
  });

  // Save Settings Form
  document.getElementById('btn-save-settings')?.addEventListener('click', () => {
    const host = (document.getElementById('cfg-gitlab-host') as HTMLInputElement).value.trim();
    const token = (document.getElementById('cfg-gitlab-token') as HTMLInputElement).value.trim();
    const user = (document.getElementById('cfg-gitlab-username') as HTMLInputElement).value.trim();
    const calId = (document.getElementById('cfg-google-cal-id') as HTMLInputElement).value.trim();
    const gToken = (document.getElementById('cfg-google-token') as HTMLInputElement).value.trim();
    const gClientId = (document.getElementById('cfg-google-client-id') as HTMLInputElement).value.trim();
    const gClientSecret = (document.getElementById('cfg-google-client-secret') as HTMLInputElement).value.trim();

    state.saveConfig({
      gitlabHost: host,
      gitlabToken: token,
      gitlabUsername: user,
      googleCalId: calId || 'primary',
      googleToken: gToken,
      googleClientId: gClientId,
      googleClientSecret: gClientSecret,
    });

    modalSettings?.classList.add('hidden');
    fetchAllData();
  });

  // Load Demo Data Button
  document.getElementById('btn-load-demo')?.addEventListener('click', () => {
    state.isDemoMode = true;
    generateDemoData();
    modalSettings?.classList.add('hidden');
    updateUI();
  });

  // Test GitLab Connection
  document.getElementById('btn-test-gitlab')?.addEventListener('click', async () => {
    const host = (document.getElementById('cfg-gitlab-host') as HTMLInputElement).value.trim();
    const token = (document.getElementById('cfg-gitlab-token') as HTMLInputElement).value.trim();
    const resultSpan = document.getElementById('test-gitlab-result');

    if (!resultSpan) return;
    resultSpan.textContent = 'Testando conexão...';
    resultSpan.className = 'test-result';

    if (!isTauriAvailable()) {
      resultSpan.textContent = 'Ambiente Web standard: Teste simulado OK!';
      resultSpan.className = 'test-result success';
      return;
    }

    try {
      const res = await invoke<string>('test_gitlab_connection', { host, token });
      resultSpan.textContent = res;
      resultSpan.className = 'test-result success';
    } catch (err: any) {
      resultSpan.textContent = String(err);
      resultSpan.className = 'test-result error';
    }
  });

  // Test Google Calendar Connection
  document.getElementById('btn-test-google')?.addEventListener('click', async () => {
    const calId = (document.getElementById('cfg-google-cal-id') as HTMLInputElement).value.trim();
    const token = (document.getElementById('cfg-google-token') as HTMLInputElement).value.trim();
    const clientId = (document.getElementById('cfg-google-client-id') as HTMLInputElement).value.trim();
    const clientSecret = (document.getElementById('cfg-google-client-secret') as HTMLInputElement).value.trim();
    const resultSpan = document.getElementById('test-google-result');

    if (!resultSpan) return;
    resultSpan.textContent = 'Testando conexão...';
    resultSpan.className = 'test-result';

    if (!isTauriAvailable()) {
      resultSpan.textContent = 'Ambiente Web standard: Teste simulado OK!';
      resultSpan.className = 'test-result success';
      return;
    }

    try {
      const timeMinDate = new Date(state.currentDate.getFullYear() - 1, 0, 1);
      const res = await invoke<string>('test_google_connection', {
        calendarId: calId || 'primary',
        apiKeyOrToken: token,
        clientId: clientId || null,
        clientSecret: clientSecret || null,
        timeMin: timeMinDate.toISOString(),
      });
      resultSpan.textContent = res;
      resultSpan.className = 'test-result success';
    } catch (err: any) {
      resultSpan.textContent = String(err);
      resultSpan.className = 'test-result error';
    }
  });

  // GitLab Sub-tabs (Issues vs MRs)
  document.getElementById('gitlab-tab-issues')?.addEventListener('click', () => {
    state.selectedGitlabTab = 'issues';
    document.getElementById('gitlab-tab-issues')?.classList.add('active');
    document.getElementById('gitlab-tab-mrs')?.classList.remove('active');
    renderGitlabBoard();
  });

  document.getElementById('gitlab-tab-mrs')?.addEventListener('click', () => {
    state.selectedGitlabTab = 'mrs';
    document.getElementById('gitlab-tab-mrs')?.classList.add('active');
    document.getElementById('gitlab-tab-issues')?.classList.remove('active');
    renderGitlabBoard();
  });

  // Tag filter select
  const tagSelect = document.getElementById('tag-filter-select') as HTMLSelectElement;
  if (tagSelect) {
    tagSelect.addEventListener('change', (e) => {
      state.selectedTagFilter = (e.target as HTMLSelectElement).value;
      renderGitlabBoard();
    });
  }
}

function populateSettingsForm() {
  (document.getElementById('cfg-gitlab-host') as HTMLInputElement).value = state.config.gitlabHost;
  (document.getElementById('cfg-gitlab-token') as HTMLInputElement).value = state.config.gitlabToken;
  (document.getElementById('cfg-gitlab-username') as HTMLInputElement).value = state.config.gitlabUsername;
  (document.getElementById('cfg-google-cal-id') as HTMLInputElement).value = state.config.googleCalId;
  (document.getElementById('cfg-google-token') as HTMLInputElement).value = state.config.googleToken;
  (document.getElementById('cfg-google-client-id') as HTMLInputElement).value = state.config.googleClientId || '';
  (document.getElementById('cfg-google-client-secret') as HTMLInputElement).value = state.config.googleClientSecret || '';
}

// Initialization
document.addEventListener('DOMContentLoaded', () => {
  setupEventListeners();
  setupNotes();
  setupTasks();
  setupSchedule();
  setupTimer();
  fetchAllData();
});
