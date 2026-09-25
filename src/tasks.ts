interface Task {
  id: string;
  title: string;
  dueDate: string;
  completed: boolean;
  createdAt: string;
  priority: TaskPriority;
}

type TaskFilter = 'pending' | 'all' | 'completed';
type TaskPriority = 1 | 2 | 3 | 4;

const STORAGE_KEY = 'my_agenda_tasks';

export function setupTasks() {
  const form = document.getElementById('task-form') as HTMLFormElement;
  const title = document.getElementById('task-title') as HTMLInputElement;
  const dueDate = document.getElementById('task-due-date') as HTMLInputElement;
  const priority = document.getElementById('task-priority') as HTMLSelectElement;
  const list = document.getElementById('tasks-list')!;
  const empty = document.getElementById('tasks-empty')!;
  const status = document.getElementById('tasks-status')!;
  const summary = document.getElementById('tasks-summary')!;
  let tasks: Task[] = [];
  let filter: TaskFilter = 'pending';
  let loadFailed = false;

  try {
    const saved: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    if (!Array.isArray(saved) || !saved.every((task) =>
      task && typeof task.id === 'string' && typeof task.title === 'string' &&
      typeof task.dueDate === 'string' && typeof task.completed === 'boolean' &&
      typeof task.createdAt === 'string' && Number.isFinite(Date.parse(task.createdAt)) &&
      (task.priority === undefined || [1, 2, 3, 4].includes(task.priority))) ||
      new Set(saved.map((task) => task.id)).size !== saved.length) {
      throw new Error('Formato de afazeres inválido');
    }
    tasks = (saved as Array<Omit<Task, 'priority'> & { priority?: TaskPriority }>).map((task) => ({
      ...task,
      priority: task.priority ?? 4,
    }));
  } catch (error) {
    console.error('Erro ao carregar afazeres:', error);
    status.textContent = 'Não foi possível carregar os afazeres. Os dados armazenados foram preservados.';
    status.classList.add('save-error');
    loadFailed = true;
    form.querySelectorAll('input, select, button').forEach((element) => { (element as HTMLInputElement | HTMLSelectElement | HTMLButtonElement).disabled = true; });
  }

  function persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
      status.textContent = 'Afazeres salvos neste dispositivo';
      status.classList.remove('save-error');
    } catch (error) {
      console.error('Erro ao salvar afazeres:', error);
      status.textContent = 'Não foi possível salvar. Mantenha o aplicativo aberto.';
      status.classList.add('save-error');
    }
  }

  function render() {
    const today = new Date();
    const localToday = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const pending = tasks.filter((task) => !task.completed).length;
    summary.textContent = `${pending} pendente${pending === 1 ? '' : 's'} · ${tasks.length} no total`;
    list.replaceChildren();
    const visible = tasks
      .filter((task) => filter === 'all' || (filter === 'completed' ? task.completed : !task.completed))
      .sort((a, b) => Number(a.completed) - Number(b.completed) || a.priority - b.priority || (a.dueDate || '9999').localeCompare(b.dueDate || '9999'));

    for (const task of visible) {
      const item = document.createElement('article');
      const overdue = Boolean(task.dueDate && task.dueDate < localToday && !task.completed);
      item.className = `task-item${task.completed ? ' completed' : ''}${overdue ? ' overdue' : ''}`;

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = task.completed;
      checkbox.setAttribute('aria-label', `Marcar ${task.title} como ${task.completed ? 'pendente' : 'concluída'}`);
      checkbox.onchange = () => { task.completed = checkbox.checked; persist(); render(); };

      const body = document.createElement('div');
      body.className = 'task-item-body';
      const taskTitle = document.createElement('strong');
      taskTitle.textContent = task.title;
      const meta = document.createElement('span');
      meta.className = 'task-due-label';
      meta.textContent = task.dueDate ? `${overdue ? 'Atrasada · ' : 'Prazo · '}${new Date(`${task.dueDate}T12:00:00`).toLocaleDateString('pt-BR')}` : 'Sem prazo';
      const priorityBadge = document.createElement('span');
      priorityBadge.className = `task-priority-badge priority-${task.priority}`;
      priorityBadge.textContent = `Prioridade ${task.priority}`;
      const metadata = document.createElement('div');
      metadata.className = 'task-metadata';
      metadata.append(priorityBadge, meta);
      body.append(taskTitle, metadata);

      const priorityInput = document.createElement('select');
      priorityInput.className = 'task-priority-select';
      priorityInput.setAttribute('aria-label', `Alterar prioridade de ${task.title}`);
      for (let value = 1; value <= 4; value++) {
        const option = document.createElement('option');
        option.value = String(value);
        option.textContent = `Prioridade ${value}`;
        option.selected = value === task.priority;
        priorityInput.append(option);
      }
      priorityInput.onchange = () => { task.priority = Number(priorityInput.value) as TaskPriority; persist(); render(); };

      const dateInput = document.createElement('input');
      dateInput.type = 'date';
      dateInput.value = task.dueDate;
      dateInput.setAttribute('aria-label', `Alterar prazo de ${task.title}`);
      dateInput.onchange = () => { task.dueDate = dateInput.value; persist(); render(); };

      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'task-delete';
      remove.textContent = 'Excluir';
      remove.onclick = () => { tasks = tasks.filter((item) => item.id !== task.id); persist(); render(); };
      item.append(checkbox, body, priorityInput, dateInput, remove);
      list.append(item);
    }
    empty.hidden = visible.length > 0;
  }

  form.onsubmit = (event) => {
    event.preventDefault();
    const value = title.value.trim();
    if (!value || loadFailed) return;
    tasks.push({ id: crypto.randomUUID(), title: value, dueDate: dueDate.value, completed: false, createdAt: new Date().toISOString(), priority: Number(priority.value) as TaskPriority });
    title.value = '';
    dueDate.value = '';
    priority.value = '4';
    filter = 'pending';
    document.querySelectorAll<HTMLButtonElement>('[data-task-filter]').forEach((button) => button.classList.toggle('active', button.dataset.taskFilter === filter));
    persist();
    render();
    title.focus();
  };

  document.querySelectorAll<HTMLButtonElement>('[data-task-filter]').forEach((button) => {
    button.onclick = () => {
      filter = button.dataset.taskFilter as TaskFilter;
      document.querySelectorAll<HTMLButtonElement>('[data-task-filter]').forEach((item) => item.classList.toggle('active', item === button));
      render();
    };
  });
  render();
}
