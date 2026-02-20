(() => {
  'use strict';

  const $ = (sel) => document.querySelector(sel);

  const LS_KEY = 'med_rag_mvp_web_v1';
  const state = loadState();

  const els = {
    domain: $('#domain'),
    query: $('#query'),
    btnAsk: $('#btnAsk'),
    answer: $('#answer'),
    citations: $('#citations'),
    status: $('#status'),
    badgeMode: $('#badgeMode'),
    history: $('#history'),
    btnClearHistory: $('#btnClearHistory'),
    btnSettings: $('#btnSettings'),
    btnHealth: $('#btnHealth'),
    modal: $('#modal'),
    btnClose: $('#btnClose'),
    apiBase: $('#apiBase'),
    btnSave: $('#btnSave'),
    btnReset: $('#btnReset'),
  };

  init();

  function init() {
    // restore
    els.apiBase.value = state.apiBase || '';
    renderHistory();

    // events
    els.btnAsk.addEventListener('click', ask);
    els.query.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') ask();
    });

    els.btnClearHistory.addEventListener('click', () => {
      state.history = [];
      persistState();
      renderHistory();
    });

    els.btnSettings.addEventListener('click', openModal);
    els.btnClose.addEventListener('click', closeModal);
    els.modal.addEventListener('click', (e) => {
      if (e.target === els.modal) closeModal();
    });

    els.btnSave.addEventListener('click', () => {
      state.apiBase = (els.apiBase.value || '').trim();
      persistState();
      closeModal();
      toast('저장했습니다.');
      updateHealthHref();
    });

    els.btnReset.addEventListener('click', () => {
      els.apiBase.value = '';
      state.apiBase = '';
      persistState();
      toast('초기화했습니다.');
      updateHealthHref();
    });

    updateHealthHref();
  }

  function apiUrl(path) {
    const base = (state.apiBase || '').trim();
    if (!base) return path; // same origin
    return base.replace(/\/+$/, '') + path;
  }

  function updateHealthHref() {
    els.btnHealth.href = apiUrl('/health');
    els.btnHealth.target = '_blank';
    els.btnHealth.rel = 'noreferrer';
  }

  async function ask() {
    const query = (els.query.value || '').trim();
    const domain = (els.domain.value || '').trim();

    if (!query) {
      toast('질문을 입력하세요.');
      els.query.focus();
      return;
    }

    setBusy(true);
    setStatus('검색 중…', false);

    try {
      const payload = domain ? { query, domain } : { query };
      const res = await fetch(apiUrl('/ask'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`HTTP ${res.status} — ${text.slice(0, 300)}`);
      }

      const data = await res.json();

      // Expected shape (backend):
      // { answer: string, mode: "extractive"|"ollama"|"openai"|..., citations: [{excerpt, source_spec, creation_year, doc_id, score}] }
      renderAnswer(data);
      renderCitations(data.citations || []);
      pushHistory({ query, domain, ts: Date.now() });

      setStatus('완료', false);
    } catch (err) {
      console.error(err);
      setStatus(`오류: ${String(err.message || err)}`, true);
    } finally {
      setBusy(false);
    }
  }

  function renderAnswer(data) {
    const answer = (data && data.answer) ? String(data.answer) : '';
    const mode = (data && data.mode) ? String(data.mode) : '—';
    els.badgeMode.textContent = `mode: ${mode}`;

    if (!answer) {
      els.answer.innerHTML = `<p class="text-slate-500">답변이 비어있습니다. (근거 문단은 아래에 표시될 수 있습니다)</p>`;
      return;
    }

    // Simple markdown-ish rendering: preserve line breaks, bullet lines.
    const safe = escapeHtml(answer)
      .replace(/\n\n+/g, '\n\n')
      .split('\n\n')
      .map(block => {
        const lines = block.split('\n');
        // bullets
        if (lines.every(l => /^\s*[-*]\s+/.test(l))) {
          const items = lines.map(l => l.replace(/^\s*[-*]\s+/, '').trim());
          return `<ul class="list-disc pl-5">${items.map(i => `<li>${escapeHtml(i)}</li>`).join('')}</ul>`;
        }
        return `<p>${lines.map(l => escapeHtml(l)).join('<br/>')}</p>`;
      })
      .join('\n');

    els.answer.innerHTML = safe;
  }

  function renderCitations(citations) {
    const list = Array.isArray(citations) ? citations : [];
    if (!list.length) {
      els.citations.innerHTML = `
        <div class="rounded-xl border border-dashed border-slate-200 p-4 text-sm text-slate-500">
          근거 문단이 없습니다. (인덱스/도메인/질문을 확인하세요)
        </div>`;
      return;
    }

    els.citations.innerHTML = list.slice(0, 6).map((c, idx) => {
      const excerpt = escapeHtml(String(c.excerpt || ''));
      const source = escapeHtml(String(c.source_spec || c.source || 'unknown source'));
      const year = escapeHtml(String(c.creation_year || ''));
      const docId = escapeHtml(String(c.doc_id || ''));
      const score = (c.score !== undefined && c.score !== null) ? Number(c.score).toFixed(4) : '';
      return `
        <div class="rounded-2xl border border-slate-200 bg-white p-4">
          <div class="flex items-center gap-2">
            <div class="text-xs font-semibold text-slate-600">#${idx + 1}</div>
            <div class="ml-auto text-xs text-slate-500">${score ? `score: ${score}` : ''}</div>
          </div>
          <div class="mt-2 text-sm text-slate-900 leading-relaxed">${excerpt || '<span class="text-slate-500">excerpt 없음</span>'}</div>
          <div class="mt-3 flex flex-wrap items-center gap-2 text-xs">
            <span class="rounded-full bg-slate-100 px-2 py-1 text-slate-700">${source}</span>
            ${year ? `<span class="rounded-full bg-slate-100 px-2 py-1 text-slate-700">${year}</span>` : ''}
            ${docId ? `<span class="rounded-full bg-slate-100 px-2 py-1 text-slate-700 font-mono">${docId}</span>` : ''}
          </div>
        </div>
      `;
    }).join('');
  }

  function pushHistory(item) {
    state.history = state.history || [];
    state.history.unshift(item);
    state.history = state.history.slice(0, 12);
    persistState();
    renderHistory();
  }

  function renderHistory() {
    const items = (state.history || []);
    if (!items.length) {
      els.history.innerHTML = `<div class="p-3 text-sm text-slate-500">히스토리가 없습니다.</div>`;
      return;
    }

    els.history.innerHTML = items.map((h) => {
      const dt = new Date(h.ts || Date.now());
      const time = dt.toLocaleString();
      const domain = (h.domain || '').trim();
      return `
        <button class="w-full text-left rounded-xl hover:bg-slate-50 p-3 border border-transparent hover:border-slate-200"
                data-q="${escapeAttr(h.query || '')}" data-d="${escapeAttr(domain)}">
          <div class="text-sm text-slate-900 line-clamp-2">${escapeHtml(h.query || '')}</div>
          <div class="mt-1 text-xs text-slate-500 flex items-center gap-2">
            <span>${escapeHtml(domain || '전체')}</span>
            <span class="text-slate-300">•</span>
            <span>${escapeHtml(time)}</span>
          </div>
        </button>
      `;
    }).join('');

    // bind click
    els.history.querySelectorAll('button[data-q]').forEach(btn => {
      btn.addEventListener('click', () => {
        const q = btn.getAttribute('data-q') || '';
        const d = btn.getAttribute('data-d') || '';
        els.query.value = q;
        els.domain.value = d;
        ask();
      });
    });
  }

  function setBusy(busy) {
    els.btnAsk.disabled = busy;
    els.btnAsk.textContent = busy ? '...' : '질의';
    if (busy) els.btnAsk.classList.add('opacity-80', 'cursor-not-allowed');
    else els.btnAsk.classList.remove('opacity-80', 'cursor-not-allowed');
  }

  function setStatus(msg, isError) {
    if (!msg) {
      els.status.classList.add('hidden');
      return;
    }
    els.status.classList.remove('hidden');
    els.status.textContent = msg;
    els.status.classList.toggle('border-red-200', !!isError);
    els.status.classList.toggle('bg-red-50', !!isError);
    els.status.classList.toggle('text-red-700', !!isError);
    if (!isError) {
      els.status.classList.remove('border-red-200', 'bg-red-50', 'text-red-700');
    }
  }

  function toast(msg) {
    setStatus(msg, false);
    window.clearTimeout(toast._t);
    toast._t = window.setTimeout(() => setStatus('', false), 2500);
  }

  function openModal() {
    els.modal.classList.remove('hidden');
    els.apiBase.focus();
  }

  function closeModal() {
    els.modal.classList.add('hidden');
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      return raw ? JSON.parse(raw) : { apiBase: '', history: [] };
    } catch {
      return { apiBase: '', history: [] };
    }
  }

  function persistState() {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(state));
    } catch {}
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function escapeAttr(str) {
    return escapeHtml(str).replace(/`/g, '&#96;');
  }
})();
