import { invoke } from '@tauri-apps/api/core';

type ScheduleEntries = Record<string, string>;

const STORAGE_KEY = 'my_agenda_schedule';
const DAYS = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];
const START_HOUR = 6;
const END_HOUR = 24;

function timeLabel(slot: number) {
  const totalMinutes = START_HOUR * 60 + slot * 15;
  return `${String(Math.floor(totalMinutes / 60)).padStart(2, '0')}:${String(totalMinutes % 60).padStart(2, '0')}`;
}

function csvCell(value: string) {
  const spreadsheetSafe = /^[=+\-@]/.test(value) ? `'${value}` : value;
  return `"${spreadsheetSafe.replace(/"/g, '""')}"`;
}

function buildCsv(entries: ScheduleEntries) {
  const header = ['Horário', ...DAYS].map(csvCell).join(';');
  const rows = Array.from({ length: 24 * 4 }, (_, slot) => {
    const totalMinutes = slot * 15;
    const time = `${String(Math.floor(totalMinutes / 60)).padStart(2, '0')}:${String(totalMinutes % 60).padStart(2, '0')}`;
    const activities = DAYS.map((_, day) => entries[`${day}-${time}`] || '');
    return [time, ...activities].map(csvCell).join(';');
  });
  return `\uFEFF${header}\r\n${rows.join('\r\n')}\r\n`;
}

function keyCoordinates(key: string) {
  const [dayText, time] = key.split('-');
  const [hours, minutes] = time.split(':').map(Number);
  return { day: Number(dayText), slot: (hours - START_HOUR) * 4 + minutes / 15 };
}

export function setupSchedule() {
  const head = document.getElementById('schedule-table-head')!;
  const body = document.getElementById('schedule-table-body')!;
  const editor = document.getElementById('schedule-editor') as HTMLFormElement;
  const selectionLabel = document.getElementById('schedule-selection-label')!;
  const activity = document.getElementById('schedule-activity') as HTMLInputElement;
  const clear = document.getElementById('schedule-clear') as HTMLButtonElement;
  const fullscreen = document.getElementById('schedule-fullscreen') as HTMLButtonElement;
  const exportButton = document.getElementById('schedule-export') as HTMLButtonElement;
  const scheduleView = document.getElementById('view-schedule')!;
  const status = document.getElementById('schedule-status')!;
  let entries: ScheduleEntries = {};
  let selectedKeys = new Set<string>();
  let anchorKey = '';
  let isDragging = false;
  let loadFailed = false;

  try {
    const saved: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    if (!saved || typeof saved !== 'object' || Array.isArray(saved) ||
      !Object.entries(saved).every(([key, value]) => /^\d-[0-9]{2}:[0-9]{2}$/.test(key) && typeof value === 'string')) {
      throw new Error('Formato de cronograma inválido');
    }
    entries = saved as ScheduleEntries;
  } catch (error) {
    console.error('Erro ao carregar cronograma:', error);
    status.textContent = 'Não foi possível carregar o cronograma. Os dados armazenados foram preservados.';
    status.classList.add('save-error');
    loadFailed = true;
  }

  function persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
      status.textContent = 'Cronograma salvo neste dispositivo';
      status.classList.remove('save-error');
    } catch (error) {
      console.error('Erro ao salvar cronograma:', error);
      status.textContent = 'Não foi possível salvar. Mantenha o aplicativo aberto.';
      status.classList.add('save-error');
    }
  }

  function updateSelectionUI(focus = false) {
    body.querySelectorAll<HTMLButtonElement>('.schedule-cell').forEach((cell) => {
      const selected = selectedKeys.has(cell.dataset.scheduleKey || '');
      cell.classList.toggle('selected', selected);
      cell.setAttribute('aria-pressed', String(selected));
    });
    editor.hidden = selectedKeys.size === 0;
    if (!selectedKeys.size) return;
    const keys = [...selectedKeys];
    if (keys.length === 1) {
      const { day } = keyCoordinates(keys[0]);
      const time = keys[0].slice(2);
      selectionLabel.textContent = `${DAYS[day]}, ${time}`;
    } else {
      selectionLabel.textContent = `${keys.length} horários selecionados`;
    }
    const values = [...new Set(keys.map((key) => entries[key] || ''))];
    activity.value = values.length === 1 ? values[0] : '';
    activity.placeholder = values.length > 1 ? 'Digite para substituir as atividades selecionadas' : 'Ex.: Estudo, academia, planejamento...';
    if (focus) activity.focus();
  }

  function clearSelection() {
    selectedKeys.clear();
    anchorKey = '';
    editor.hidden = true;
    updateSelectionUI();
  }

  function selectRange(fromKey: string, toKey: string) {
    const from = keyCoordinates(fromKey);
    const to = keyCoordinates(toKey);
    selectedKeys.clear();
    for (let day = Math.min(from.day, to.day); day <= Math.max(from.day, to.day); day++) {
      for (let slot = Math.min(from.slot, to.slot); slot <= Math.max(from.slot, to.slot); slot++) {
        selectedKeys.add(`${day}-${timeLabel(slot)}`);
      }
    }
  }

  function select(key: string, extend = false, toggle = false, focus = false) {
    if (loadFailed) return;
    if (extend && anchorKey) selectRange(anchorKey, key);
    else if (toggle) {
      if (selectedKeys.has(key)) selectedKeys.delete(key);
      else selectedKeys.add(key);
      anchorKey = key;
    } else if (selectedKeys.size === 1 && selectedKeys.has(key)) {
      clearSelection();
      return;
    } else {
      selectedKeys = new Set([key]);
      anchorKey = key;
    }
    updateSelectionUI(focus);
  }

  function renderTable() {
    head.replaceChildren();
    const timeHeader = document.createElement('th');
    timeHeader.scope = 'col';
    timeHeader.textContent = 'Horário';
    head.append(timeHeader);
    for (const day of DAYS) {
      const header = document.createElement('th');
      header.scope = 'col';
      header.textContent = day;
      head.append(header);
    }

    body.replaceChildren();
    const slotCount = (END_HOUR - START_HOUR) * 4;
    for (let slot = 0; slot < slotCount; slot++) {
      const time = timeLabel(slot);
      const row = document.createElement('tr');
      const timeCell = document.createElement('th');
      timeCell.scope = 'row';
      timeCell.textContent = time;
      row.append(timeCell);
      for (let day = 0; day < DAYS.length; day++) {
        const cell = document.createElement('td');
        const button = document.createElement('button');
        const key = `${day}-${time}`;
        button.type = 'button';
        button.className = `schedule-cell${entries[key] ? ' filled' : ''}${selectedKeys.has(key) ? ' selected' : ''}`;
        button.dataset.scheduleKey = key;
        button.textContent = entries[key] || '';
        button.title = entries[key] || `${DAYS[day]}, ${time}`;
        button.setAttribute('aria-label', `${DAYS[day]}, ${time}${entries[key] ? `: ${entries[key]}` : ', vazio'}`);
        button.setAttribute('aria-pressed', String(selectedKeys.has(key)));
        button.onmousedown = (event) => {
          event.preventDefault();
          isDragging = true;
          select(key, event.shiftKey, event.ctrlKey || event.metaKey);
        };
        button.onmouseenter = () => {
          if (!isDragging) return;
          selectedKeys.add(key);
          updateSelectionUI();
        };
        button.onclick = (event) => {
          if (event.detail === 0) select(key, event.shiftKey, event.ctrlKey || event.metaKey, true);
        };
        cell.append(button);
        row.append(cell);
      }
      body.append(row);
    }
  }

  editor.onsubmit = (event) => {
    event.preventDefault();
    if (!selectedKeys.size || loadFailed) return;
    const value = activity.value.trim();
    for (const key of selectedKeys) {
      if (value) entries[key] = value;
      else delete entries[key];
    }
    persist();
    clearSelection();
    renderTable();
  };

  clear.onclick = () => {
    if (!selectedKeys.size || loadFailed) return;
    for (const key of selectedKeys) delete entries[key];
    activity.value = '';
    persist();
    clearSelection();
    renderTable();
  };

  fullscreen.onclick = () => {
    const expanded = scheduleView.classList.toggle('schedule-fullscreen');
    fullscreen.textContent = expanded ? 'Sair da tela cheia' : 'Tela cheia';
    fullscreen.setAttribute('aria-pressed', String(expanded));
  };

  exportButton.onclick = async () => {
    const content = buildCsv(entries);
    exportButton.disabled = true;
    try {
      if ('__TAURI_INTERNALS__' in window || '__TAURI__' in window) {
        const path = await invoke<string | null>('export_schedule_csv', { content });
        if (!path) {
          status.textContent = 'Exportação cancelada';
          return;
        }
        status.textContent = `Cronograma exportado para ${path}`;
      } else {
        const blob = new Blob([content], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'meu-cronograma.csv';
        link.click();
        URL.revokeObjectURL(url);
        status.textContent = 'Cronograma exportado';
      }
      status.classList.remove('save-error');
    } catch (error) {
      console.error('Erro ao exportar cronograma:', error);
      status.textContent = 'Não foi possível exportar o cronograma.';
      status.classList.add('save-error');
    } finally {
      exportButton.disabled = false;
    }
  };

  document.addEventListener('mouseup', () => { isDragging = false; });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && selectedKeys.size) clearSelection();
  });
  renderTable();
}
