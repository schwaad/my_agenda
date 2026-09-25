import { renderMarkdown } from './markdown.ts';

interface Note {
  id: string;
  title: string;
  content: string;
  updatedAt: string;
}

const STORAGE_KEY = 'my_agenda_notes';

export function setupNotes() {
  const list = document.getElementById('notes-list')!;
  const editor = document.getElementById('note-editor')!;
  const empty = document.getElementById('notes-empty')!;
  const title = document.getElementById('note-title') as HTMLInputElement;
  const content = document.getElementById('note-content') as HTMLTextAreaElement;
  const preview = document.getElementById('note-preview')!;
  const editPane = document.getElementById('note-edit-pane')!;
  const previewPane = document.getElementById('note-preview-pane')!;
  const editButton = document.getElementById('note-edit') as HTMLButtonElement;
  const status = document.getElementById('notes-status')!;
  const create = document.getElementById('note-create') as HTMLButtonElement;
  const remove = document.getElementById('note-delete') as HTMLButtonElement;
  const confirmDelete = document.getElementById('note-delete-confirm')!;
  let notes: Note[] = [];
  let selectedId: string | undefined;
  let query = '';
  let loadFailed = false;
  let isEditing = false;

  try {
    const saved: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    if (!Array.isArray(saved) || !saved.every((note) =>
      note && typeof note.id === 'string' && typeof note.title === 'string' &&
      typeof note.content === 'string' && typeof note.updatedAt === 'string' &&
      Number.isFinite(Date.parse(note.updatedAt))) ||
      new Set(saved.map((note) => note.id)).size !== saved.length) {
      throw new Error('Formato de anotações inválido');
    }
    notes = saved;
    selectedId = notes[0]?.id;
  } catch (error) {
    console.error('Erro ao carregar anotações:', error);
    status.textContent = 'Não foi possível carregar as anotações. Os dados armazenados foram preservados. Reabra o aplicativo para tentar novamente.';
    loadFailed = true;
    create.disabled = true;
  }

  function persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
      status.textContent = 'Salvo neste dispositivo';
      status.classList.remove('save-error');
    } catch (error) {
      console.error('Erro ao salvar anotações:', error);
      status.textContent = 'Não foi possível salvar. Mantenha o aplicativo aberto e copie seu texto antes de sair.';
      status.classList.add('save-error');
    }
  }

  function renderList() {
    list.replaceChildren();
    const filtered = notes.filter((note) => `${note.title}\n${note.content}`.toLocaleLowerCase('pt-BR').includes(query));
    for (const note of filtered) {
      const button = document.createElement('button');
      button.className = 'note-list-item';
      button.classList.toggle('active', note.id === selectedId);
      button.setAttribute('aria-pressed', String(note.id === selectedId));
      const label = document.createElement('strong');
      label.textContent = note.title.trim() || 'Sem título';
      const date = document.createElement('small');
      date.textContent = new Date(note.updatedAt).toLocaleString('pt-BR');
      button.append(label, date);
      button.onclick = () => { selectedId = note.id; isEditing = false; render(); };
      list.append(button);
    }
    if (!filtered.length) {
      const message = document.createElement('p');
      message.className = 'notes-hint';
      message.textContent = notes.length ? 'Nenhuma anotação encontrada.' : 'Suas anotações aparecerão aqui.';
      list.append(message);
    }
  }

  function render() {
    renderList();
    const note = notes.find((item) => item.id === selectedId);
    editor.hidden = !note;
    empty.hidden = !!note;
    confirmDelete.hidden = true;
    if (note) {
      title.value = note.title;
      content.value = note.content;
      renderMarkdown(preview, note.content || '*A prévia do seu Markdown aparecerá aqui.*');
      title.readOnly = !isEditing;
      editPane.hidden = !isEditing;
      previewPane.hidden = isEditing;
      editButton.textContent = isEditing ? 'Concluir' : 'Alterar';
      editButton.setAttribute('aria-pressed', String(isEditing));
    }
  }

  function edit() {
    const note = notes.find((item) => item.id === selectedId);
    if (!note || loadFailed) return;
    note.title = title.value;
    note.content = content.value;
    note.updatedAt = new Date().toISOString();
    persist();
    renderList();
    renderMarkdown(preview, note.content || '*A prévia do seu Markdown aparecerá aqui.*');
  }

  title.addEventListener('input', edit);
  content.addEventListener('input', edit);
  editButton.onclick = () => {
    if (loadFailed) return;
    isEditing = !isEditing;
    render();
    if (isEditing) content.focus();
  };
  create.onclick = () => {
    if (loadFailed) return;
    const note: Note = { id: crypto.randomUUID(), title: '', content: '', updatedAt: new Date().toISOString() };
    notes.unshift(note);
    selectedId = note.id;
    isEditing = true;
    query = '';
    (document.getElementById('notes-search') as HTMLInputElement).value = '';
    persist();
    render();
    title.focus();
  };
  remove.onclick = () => { confirmDelete.hidden = false; };
  document.getElementById('note-delete-cancel')!.onclick = () => { confirmDelete.hidden = true; };
  document.getElementById('note-delete-accept')!.onclick = () => {
    notes = notes.filter((note) => note.id !== selectedId);
    selectedId = notes[0]?.id;
    isEditing = false;
    persist();
    render();
  };
  document.getElementById('notes-search')!.addEventListener('input', (event) => {
    query = (event.target as HTMLInputElement).value.toLocaleLowerCase('pt-BR');
    renderList();
  });
  render();
}
