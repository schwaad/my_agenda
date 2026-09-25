import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { openUrl } from '@tauri-apps/plugin-opener';

function safeUrl(value: string, baseUrl?: string): string | null {
  try {
    const path = baseUrl && value.startsWith('/uploads/') ? value.slice(1) : value;
    const url = baseUrl ? new URL(path, baseUrl) : new URL(path);
    return ['https:', 'http:', 'mailto:'].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

/** Shared renderer for GitLab descriptions and local notes. */
export function renderMarkdown(container: HTMLElement, source: string, baseUrl?: string) {
  container.classList.add('markdown-body');
  container.innerHTML = DOMPurify.sanitize(marked.parse(source, { async: false, gfm: true, breaks: true }), {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ['style', 'form', 'button', 'textarea', 'select'],
    FORBID_ATTR: ['style', 'id', 'name'],
  });
  container.querySelectorAll('a').forEach((link) => {
    const url = safeUrl(link.getAttribute('href') || '', baseUrl);
    if (!url) {
      link.removeAttribute('href');
      return;
    }
    link.href = url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
  });
  container.querySelectorAll('img').forEach((img) => {
    const url = safeUrl(img.getAttribute('src') || '', baseUrl);
    if (url && /^https?:/.test(url)) {
      img.src = url;
      img.loading = 'lazy';
      img.referrerPolicy = 'no-referrer';
    } else {
      img.removeAttribute('src');
    }
    img.removeAttribute('srcset');
  });
  container.querySelectorAll('input').forEach((input) => {
    if (input.type === 'checkbox') input.disabled = true;
    else input.remove();
  });
  container.onclick = (event) => {
    const link = event.target instanceof Element ? event.target.closest('a') : null;
    if (link?.href && '__TAURI_INTERNALS__' in window) {
      event.preventDefault();
      void openUrl(link.href).catch((error) => {
        console.error('Erro ao abrir link:', error);
        window.alert('Não foi possível abrir o link no navegador.');
      });
    }
  };
}

export function gitlabProjectUrl(itemUrl?: string): string | undefined {
  // GitLab uploads and relative links are scoped to the project, including subgroups.
  return itemUrl?.replace(/\/-\/(?:issues|merge_requests)\/\d+.*$/, '/');
}
