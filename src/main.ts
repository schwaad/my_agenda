import { invoke } from '@tauri-apps/api/core';
import { openUrl } from '@tauri-apps/plugin-opener';

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
  currentView: 'monthly' | 'weekly' | 'daily' | 'gitlab' = 'monthly';
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

  try {
    // Fetch GitLab Issues & MRs
    if (state.config.gitlabHost && state.config.gitlabToken) {
      const issues = await invoke<GitlabIssue[]>('fetch_gitlab_issues', {
        host: state.config.gitlabHost,
        token: state.config.gitlabToken,
        username: state.config.gitlabUsername,
      });
      state.gitlabIssues = issues;

      const mrs = await invoke<GitlabMR[]>('fetch_gitlab_mrs', {
        host: state.config.gitlabHost,
        token: state.config.gitlabToken,
        username: state.config.gitlabUsername,
      });
      state.gitlabMRs = mrs;
    }

    // Fetch Google Calendar Events & Google Tasks
    if (state.config.googleCalId && state.config.googleToken) {
      const events = await invoke<GoogleEvent[]>('fetch_google_calendar_events', {
        calendarId: state.config.googleCalId,
        apiKeyOrToken: state.config.googleToken,
        clientId: state.config.googleClientId || null,
        clientSecret: state.config.googleClientSecret || null,
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
    }
  } catch (e) {
    console.warn('API Fetch returned warning/error, combining demo items if needed:', e);
    if (state.gitlabIssues.length === 0 && state.googleEvents.length === 0) {
      generateDemoData();
    }
  } finally {
    if (syncBtn) syncBtn.classList.remove('loading');
    updateUI();
  }
}

// Update UI according to active view & date
function updateUI() {
  updateStatusBanner();
  updateDateTitle();
  updateNavTabStyles();

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
    titleEl.textContent = `${startOfWeek.getDate()} - ${endOfWeek.getDate()} de ${monthNames[endOfWeek.getMonth()]} ${endOfWeek.getFullYear()}`;
  } else {
    titleEl.textContent = `${state.currentDate.getDate()} de ${monthNames[state.currentDate.getMonth()]} ${state.currentDate.getFullYear()}`;
  }
}

// Helper Date Functions
function getEventDateStr(dateStr: string): string {
  if (!dateStr) return '';
  const match = dateStr.match(/(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : '';
}

function formatDateToStr(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function getEventDisplayTime(dateStr: string): string {
  if (!dateStr) return '';
  const match = dateStr.match(/T(\d{2}):(\d{2})/);
  if (match) {
    if (match[1] === '12' && match[2] === '00' && dateStr.length === 19) {
      return 'Dia todo';
    }
    return `${match[1]}:${match[2]}`;
  }
  return 'Dia todo';
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
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1); // Adjust for Monday start
  return new Date(date.setDate(diff));
}

function isSameDay(d1: Date, d2: Date): boolean {
  if (isNaN(d1.getTime()) || isNaN(d2.getTime())) return false;
  return (
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate()
  );
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
      const matchesQuery = !query || ev.summary.toLowerCase().includes(query);
      return matchesDay && matchesQuery;
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

    dayIssues.forEach((iss) => {
      const chip = document.createElement('div');
      chip.className = 'event-chip type-gitlab-issue';
      chip.innerHTML = `<span class="chip-time">#${iss.iid}</span> <span class="chip-title">${escapeHtml(iss.title)}</span>`;
      chip.onclick = () => showItemDetail(`GitLab Issue #${iss.iid}`, iss.title, iss.description || '', iss.web_url, iss.labels);
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
  const daysGrid = document.getElementById('weekly-grid-days');
  if (!headerContainer || !daysGrid) return;

  headerContainer.innerHTML = '<div class="weekly-header-col"></div>';
  daysGrid.innerHTML = '';

  const startOfWeek = getStartOfWeek(state.currentDate);
  const today = new Date();
  const weekDays: Date[] = [];

  const dayNames = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

  for (let i = 0; i < 7; i++) {
    const d = new Date(startOfWeek);
    d.setDate(startOfWeek.getDate() + i);
    weekDays.push(d);

    const isToday = isSameDay(d, today);
    const colHeader = document.createElement('div');
    colHeader.className = 'weekly-header-col';
    colHeader.innerHTML = `
      <div class="weekly-day-name">${dayNames[d.getDay()]}</div>
      <div class="weekly-day-num ${isToday ? 'today' : ''}">${d.getDate()}</div>
    `;
    headerContainer.appendChild(colHeader);
  }

  // Render 7 Day Columns
  weekDays.forEach((date) => {
    const col = document.createElement('div');
    col.className = 'weekly-day-column';
    const targetDateStr = formatDateToStr(date);

    // 7 hour slots
    for (let h = 8; h <= 20; h += 2) {
      const cell = document.createElement('div');
      cell.className = 'weekly-hour-cell';
      col.appendChild(cell);
    }

    // Add Events for this day
    state.googleEvents.forEach((ev) => {
      const evDateStr = getEventDateStr(ev.start_time);
      if (evDateStr === targetDateStr) {
        const chip = document.createElement('div');
        chip.className = 'event-chip type-google';
        chip.style.margin = '6px';
        const timeStr = getEventDisplayTime(ev.start_time);
        chip.innerHTML = `<span class="chip-title">${timeStr} - ${escapeHtml(ev.summary)}</span>`;
        chip.onclick = () => showItemDetail('Google Agenda', ev.summary, ev.description || '', ev.html_link, [ev.location || '']);
        col.appendChild(chip);
      }
    });

    state.gitlabIssues.forEach((iss) => {
      if (iss.due_date && getEventDateStr(iss.due_date) === targetDateStr) {
        const chip = document.createElement('div');
        chip.className = 'event-chip type-gitlab-issue';
        chip.style.margin = '6px';
        chip.innerHTML = `<span class="chip-title">#${iss.iid} ${escapeHtml(iss.title)}</span>`;
        chip.onclick = () => showItemDetail(`GitLab Issue #${iss.iid}`, iss.title, iss.description || '', iss.web_url, iss.labels);
        col.appendChild(chip);
      }
    });

    daysGrid.appendChild(col);
  });
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
    const isIssue = 'iid' in item && 'due_date' in item;
    const title = item.title;
    const iid = item.iid;
    card.innerHTML = `
      <div class="card-top">
        <span class="card-project">${isIssue ? 'Issue' : 'MR'} #${iid}</span>
        <span>${escapeHtml(item.state)}</span>
      </div>
      <div class="card-title">${escapeHtml(title)}</div>
    `;
    card.onclick = () => showItemDetail(isIssue ? `Issue #${iid}` : `MR #${iid}`, title, item.description || '', item.web_url, item.labels);
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

    card.onclick = () => showItemDetail(`${activeTab === 'issues' ? 'Issue' : 'MR'} #${item.iid}`, item.title, item.description || '', item.web_url, item.labels);

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
function showItemDetail(badge: string, title: string, description: string, url?: string, tags: string[] = []) {
  const modal = document.getElementById('modal-item-detail');
  const badgeEl = document.getElementById('detail-badge');
  const titleEl = document.getElementById('detail-title');
  const descEl = document.getElementById('detail-description');
  const tagsEl = document.getElementById('detail-tags');
  const linkBtn = document.getElementById('detail-link-btn') as HTMLAnchorElement;

  if (!modal) return;

  if (badgeEl) badgeEl.textContent = badge;
  if (titleEl) titleEl.textContent = title;
  if (descEl) descEl.textContent = description || 'Sem descrição detalhada fornecida.';

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
  // Navigation Tabs
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const view = btn.getAttribute('data-view') as AppState['currentView'];
      if (view) {
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
    const host = (document.getElementById('cfg-gitlab-host') as HTMLInputElement).value;
    const token = (document.getElementById('cfg-gitlab-token') as HTMLInputElement).value;
    const user = (document.getElementById('cfg-gitlab-username') as HTMLInputElement).value;
    const calId = (document.getElementById('cfg-google-cal-id') as HTMLInputElement).value;
    const gToken = (document.getElementById('cfg-google-token') as HTMLInputElement).value;
    const gClientId = (document.getElementById('cfg-google-client-id') as HTMLInputElement).value;
    const gClientSecret = (document.getElementById('cfg-google-client-secret') as HTMLInputElement).value;

    state.saveConfig({
      gitlabHost: host,
      gitlabToken: token,
      gitlabUsername: user,
      googleCalId: calId,
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
    const host = (document.getElementById('cfg-gitlab-host') as HTMLInputElement).value;
    const token = (document.getElementById('cfg-gitlab-token') as HTMLInputElement).value;
    const resultSpan = document.getElementById('test-gitlab-result');

    if (!resultSpan) return;
    resultSpan.textContent = 'Testando...';
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
    const calId = (document.getElementById('cfg-google-cal-id') as HTMLInputElement).value;
    const token = (document.getElementById('cfg-google-token') as HTMLInputElement).value;
    const clientId = (document.getElementById('cfg-google-client-id') as HTMLInputElement).value;
    const clientSecret = (document.getElementById('cfg-google-client-secret') as HTMLInputElement).value;
    const resultSpan = document.getElementById('test-google-result');

    if (!resultSpan) return;
    resultSpan.textContent = 'Testando...';
    resultSpan.className = 'test-result';

    if (!isTauriAvailable()) {
      resultSpan.textContent = 'Ambiente Web standard: Teste simulado OK!';
      resultSpan.className = 'test-result success';
      return;
    }

    try {
      const res = await invoke<string>('test_google_connection', {
        calendarId: calId,
        apiKeyOrToken: token,
        clientId: clientId || null,
        clientSecret: clientSecret || null,
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
  fetchAllData();
});
