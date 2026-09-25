type TimerMode = 'focus' | 'break';

interface TimerSettings {
  focusMinutes: number;
  breakMinutes: number;
}

const STORAGE_KEY = 'my_agenda_timer';
const DEFAULT_SETTINGS: TimerSettings = { focusMinutes: 25, breakMinutes: 5 };

export function setupTimer() {
  const focusInput = document.getElementById('timer-focus-minutes') as HTMLInputElement;
  const breakInput = document.getElementById('timer-break-minutes') as HTMLInputElement;
  const display = document.getElementById('timer-display')!;
  const status = document.getElementById('timer-status')!;
  const toggle = document.getElementById('timer-toggle') as HTMLButtonElement;
  const reset = document.getElementById('timer-reset') as HTMLButtonElement;
  const modeButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-timer-mode]'));
  let settings = { ...DEFAULT_SETTINGS };
  let mode: TimerMode = 'focus';
  let remainingSeconds = settings.focusMinutes * 60;
  let endAt = 0;
  let intervalId: number | undefined;
  let running = false;
  let completionPlayed = false;

  try {
    const saved: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (saved && typeof saved === 'object' &&
      typeof (saved as TimerSettings).focusMinutes === 'number' && (saved as TimerSettings).focusMinutes > 0 &&
      typeof (saved as TimerSettings).breakMinutes === 'number' && (saved as TimerSettings).breakMinutes > 0) {
      settings = saved as TimerSettings;
      remainingSeconds = settings.focusMinutes * 60;
    }
  } catch (error) {
    console.error('Erro ao carregar configuração do timer:', error);
  }

  function durationSeconds(selectedMode = mode) {
    return (selectedMode === 'focus' ? settings.focusMinutes : settings.breakMinutes) * 60;
  }

  function persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch (error) {
      console.error('Erro ao salvar configuração do timer:', error);
      status.textContent = 'Não foi possível salvar as durações.';
    }
  }

  function formatTime(seconds: number) {
    const safeSeconds = Math.max(0, Math.ceil(seconds));
    const minutes = Math.floor(safeSeconds / 60);
    return `${String(minutes).padStart(2, '0')}:${String(safeSeconds % 60).padStart(2, '0')}`;
  }

  function render() {
    display.textContent = formatTime(remainingSeconds);
    toggle.textContent = running ? 'Pausar' : 'Iniciar';
    modeButtons.forEach((button) => {
      const active = button.dataset.timerMode === mode;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
  }

  function stopInterval() {
    if (intervalId !== undefined) window.clearInterval(intervalId);
    intervalId = undefined;
    running = false;
  }

  function playCompletionSound() {
    const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    const context = new AudioContextClass();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(660, context.currentTime);
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.138, context.currentTime + 0.025);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.8);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(context.currentTime);
    oscillator.stop(context.currentTime + 0.8);
    oscillator.onended = () => { void context.close(); };
  }

  function complete() {
    stopInterval();
    remainingSeconds = 0;
    if (!completionPlayed) {
      completionPlayed = true;
      playCompletionSound();
    }
    const completedMode = mode;
    mode = mode === 'focus' ? 'break' : 'focus';
    remainingSeconds = durationSeconds();
    status.textContent = `${completedMode === 'focus' ? 'Foco' : 'Descanso'} concluído. ${mode === 'focus' ? 'Foco' : 'Descanso'} pronto para iniciar.`;
    completionPlayed = false;
    render();
  }

  function tick() {
    remainingSeconds = Math.max(0, (endAt - Date.now()) / 1000);
    if (remainingSeconds <= 0) complete();
    else render();
  }

  function selectMode(nextMode: TimerMode) {
    stopInterval();
    mode = nextMode;
    remainingSeconds = durationSeconds();
    completionPlayed = false;
    status.textContent = 'Pronto para iniciar';
    render();
  }

  function updateDuration(changedMode: TimerMode, input: HTMLInputElement) {
    const value = Number(input.value);
    if (!Number.isFinite(value) || value <= 0) return;
    if (changedMode === 'focus') settings.focusMinutes = value;
    else settings.breakMinutes = value;
    persist();
    if (mode === changedMode && !running) remainingSeconds = durationSeconds();
    render();
  }

  focusInput.value = String(settings.focusMinutes);
  breakInput.value = String(settings.breakMinutes);
  focusInput.onchange = () => updateDuration('focus', focusInput);
  breakInput.onchange = () => updateDuration('break', breakInput);
  modeButtons.forEach((button) => { button.onclick = () => selectMode(button.dataset.timerMode as TimerMode); });
  toggle.onclick = () => {
    if (running) {
      tick();
      stopInterval();
      status.textContent = 'Pausado';
    } else {
      completionPlayed = false;
      playCompletionSound();
      endAt = Date.now() + remainingSeconds * 1000;
      running = true;
      status.textContent = `${mode === 'focus' ? 'Foco' : 'Descanso'} em andamento`;
      intervalId = window.setInterval(tick, 250);
    }
    render();
  };
  reset.onclick = () => {
    stopInterval();
    remainingSeconds = durationSeconds();
    completionPlayed = false;
    status.textContent = 'Pronto para iniciar';
    render();
  };
  render();
}
