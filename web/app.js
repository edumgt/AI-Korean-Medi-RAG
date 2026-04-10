(() => {
  'use strict';

  const $ = (sel) => document.querySelector(sel);
  const LS_KEY = 'med_rag_web_app_v2';
  const ASK_PATH = '/ask';
  const EXAMPLE_QUESTION = '근로자 4인 이하 사업장에 근로기준법 일부만 적용되는 것이 왜 문제 되었나요?';

  const state = loadState();

  const els = {
    sidebar: $('#sidebar'),
    sidebarBackdrop: $('#sidebarBackdrop'),
    evidencePanel: $('#evidencePanel'),
    evidenceBackdrop: $('#evidenceBackdrop'),
    btnOpenSidebar: $('#btnOpenSidebar'),
    btnCloseSidebar: $('#btnCloseSidebar'),
    btnOpenEvidence: $('#btnOpenEvidence'),
    btnOpenEvidenceHeader: $('#btnOpenEvidenceHeader'),
    btnOpenEvidenceFromAnswer: $('#btnOpenEvidenceFromAnswer'),
    btnCloseEvidence: $('#btnCloseEvidence'),
    btnUseExample: $('#btnUseExample'),
    btnExample: $('#btnExample'),
    btnResetQuery: $('#btnResetQuery'),
    btnSubmit: $('#btnSubmit'),
    btnClearHistory: $('#btnClearHistory'),
    queryInput: $('#queryInput'),
    domainSelect: $('#domainSelect'),
    topK: $('#topK'),
    answerBox: $('#answerBox'),
    citations: $('#citations'),
    citationCount: $('#citationCount'),
    citationCountPanel: $('#citationCountPanel'),
    usedCollectionBadge: $('#usedCollectionBadge'),
    requestPreview: $('#requestPreview'),
    historyList: $('#historyList'),
    status: $('#status'),
    btnSettings: $('#btnSettings'),
    btnSettingsMobile: $('#btnSettingsMobile'),
    btnHealth: $('#btnHealth'),
    btnHealthMobile: $('#btnHealthMobile'),
    modal: $('#modal'),
    btnClose: $('#btnClose'),
    apiBase: $('#apiBase'),
    defaultDomain: $('#defaultDomain'),
    btnSave: $('#btnSave'),
    btnReset: $('#btnReset'),
  };

  init();

  function init() {
    els.apiBase.value = state.apiBase || '';
    els.defaultDomain.value = state.defaultDomain || '02.법률';
    els.domainSelect.value = state.defaultDomain || '02.법률';
    els.queryInput.value = state.lastQuery || EXAMPLE_QUESTION;
    els.topK.value = String(state.topK || 4);

    updateHealthHref();
    renderHistory();
    renderRequestPreview();

    els.btnOpenSidebar.addEventListener('click', openSidebar);
    els.btnCloseSidebar.addEventListener('click', closeSidebar);
    els.sidebarBackdrop.addEventListener('click', closeSidebar);
    els.btnOpenEvidence.addEventListener('click', openEvidencePanel);
    els.btnOpenEvidenceHeader?.addEventListener('click', openEvidencePanel);
    els.btnOpenEvidenceFromAnswer.addEventListener('click', openEvidencePanel);
    els.btnCloseEvidence.addEventListener('click', closeEvidencePanel);
    els.evidenceBackdrop.addEventListener('click', closeEvidencePanel);

    els.btnUseExample.addEventListener('click', useExampleQuestion);
    els.btnExample.addEventListener('click', useExampleQuestion);
    els.btnResetQuery.addEventListener('click', resetQuery);
    els.btnSubmit.addEventListener('click', submitQuery);
    els.btnClearHistory.addEventListener('click', clearHistory);

    els.queryInput.addEventListener('input', () => {
      state.lastQuery = els.queryInput.value;
      persistState();
      renderRequestPreview();
    });

    els.domainSelect.addEventListener('change', () => {
      renderRequestPreview();
    });

    els.topK.addEventListener('change', () => {
      state.topK = Number(els.topK.value) || 4;
      persistState();
      renderRequestPreview();
    });

    els.btnSettings.addEventListener('click', openModal);
    els.btnSettingsMobile.addEventListener('click', openModal);
    els.btnClose.addEventListener('click', closeModal);
    els.modal.addEventListener('click', (e) => {
      if (e.target === els.modal) closeModal();
    });

    els.btnSave.addEventListener('click', saveSettings);
    els.btnReset.addEventListener('click', resetSettings);

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        closeSidebar();
        closeEvidencePanel();
        closeModal();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        submitQuery();
      }
    });
  }

  function openSidebar() {
    els.sidebar.classList.remove('-translate-x-full');
    els.sidebarBackdrop.classList.remove('hidden');
  }

  function closeSidebar() {
    els.sidebar.classList.add('-translate-x-full');
    els.sidebarBackdrop.classList.add('hidden');
  }

  function openEvidencePanel() {
    els.evidencePanel.classList.remove('translate-x-full');
    els.evidenceBackdrop.classList.remove('hidden');
  }

  function closeEvidencePanel() {
    els.evidencePanel.classList.add('translate-x-full');
    els.evidenceBackdrop.classList.add('hidden');
  }

  function openModal() {
    els.modal.classList.remove('hidden');
    els.apiBase.focus();
  }

  function closeModal() {
    els.modal.classList.add('hidden');
  }

  function useExampleQuestion() {
    els.queryInput.value = EXAMPLE_QUESTION;
    els.domainSelect.value = '02.법률';
    state.lastQuery = EXAMPLE_QUESTION;
    state.defaultDomain = '02.법률';
    persistState();
    renderRequestPreview();
    toast('예시 질문을 적용했습니다.');
    closeSidebar();
  }

  function resetQuery() {
    els.queryInput.value = '';
    state.lastQuery = '';
    persistState();
    renderRequestPreview();
    toast('질문 입력을 비웠습니다.');
  }

  async function submitQuery() {
    const query = (els.queryInput.value || '').trim();
    const domain = (els.domainSelect.value || '').trim();
    const topK = Number(els.topK.value) || 4;

    if (!query) {
      setStatus('질문을 입력해 주세요.', true);
      els.queryInput.focus();
      return;
    }

    const payload = {
      query,
      domain: domain || null,
      top_k: topK,
    };

    state.lastQuery = query;
    state.defaultDomain = domain;
    state.topK = topK;
    pushHistory(query);
    persistState();
    renderHistory();
    renderRequestPreview(payload);
    setLoading(true);
    setStatus('질문을 전송하고 있습니다...', false);

    try {
      const res = await fetch(apiUrl(ASK_PATH), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const text = await res.text();
      let data = {};

      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        data = { answer: text };
      }

      if (!res.ok) {
        throw new Error(data?.detail || data?.message || `HTTP ${res.status}`);
      }

      renderResponse(data);
      setStatus('응답을 받아왔습니다.', false);
    } catch (err) {
      renderError(err?.message || '질의 요청에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  }

  function renderResponse(data) {
    const answer = formatText(data?.answer || '응답이 비어 있습니다.');
    const citations = Array.isArray(data?.citations) ? data.citations : [];
    const usedCollection = data?.used_collection || '-';

    els.answerBox.innerHTML = answer;
    els.usedCollectionBadge.textContent = `collection: ${usedCollection}`;
    els.citationCount.textContent = `${citations.length}건`;
    els.citationCountPanel.textContent = `${citations.length}건`;

    if (!citations.length) {
      els.citations.innerHTML = `
        <div class="rounded-[1.5rem] border border-dashed border-stone-300 px-5 py-6 text-sm leading-6 text-stone-500">
          조회된 근거가 없습니다.
        </div>
      `;
      return;
    }

    els.citations.innerHTML = citations.map((item, idx) => {
      return `
        <article class="rounded-[1.75rem] border border-stone-200 bg-stone-50 p-5">
          <div class="flex flex-wrap items-center gap-2">
            <div class="rounded-full bg-stone-900 px-2.5 py-1 text-xs font-semibold text-white">${idx + 1}</div>
            <div class="text-sm font-semibold text-stone-900">${escapeHtml(item.doc_id || '-')}</div>
            <div class="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-stone-600">${escapeHtml(item.domain_name || 'unknown')}</div>
            <div class="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-stone-500">${escapeHtml(item.creation_year || '-')}</div>
          </div>
          <div class="mt-4 text-sm leading-7 text-stone-700">${formatText(item.excerpt || '')}</div>
        </article>
      `;
    }).join('');
    if (window.innerWidth < 768) {
      openEvidencePanel();
    }
  }

  function renderError(message) {
    els.answerBox.innerHTML = `
      <div class="rounded-[1.5rem] border border-red-200 bg-red-50 p-4 text-sm leading-6 text-red-700">
        ${escapeHtml(message)}
      </div>
    `;
    els.citationCount.textContent = '0건';
    els.citationCountPanel.textContent = '0건';
    els.usedCollectionBadge.textContent = 'collection: -';
    els.citations.innerHTML = `
      <div class="rounded-[1.5rem] border border-dashed border-stone-300 px-5 py-6 text-sm leading-6 text-stone-500">
        오류로 인해 근거를 표시하지 못했습니다.
      </div>
    `;
    setStatus(message, true);
  }

  function renderRequestPreview(overridePayload) {
    const payload = overridePayload || {
      query: (els.queryInput.value || '').trim(),
      domain: (els.domainSelect.value || '').trim() || null,
      top_k: Number(els.topK.value) || 4,
    };
    els.requestPreview.textContent = JSON.stringify(payload, null, 2);
  }

  function renderHistory() {
    const items = Array.isArray(state.history) ? state.history : [];

    if (!items.length) {
      els.historyList.innerHTML = `
        <div class="rounded-3xl border border-dashed border-stone-300 px-4 py-5 text-sm leading-6 text-stone-500">
          아직 저장된 질문이 없습니다.
        </div>
      `;
      return;
    }

    els.historyList.innerHTML = items.map((item, idx) => `
      <button data-history-index="${idx}" class="history-item w-full rounded-3xl border border-stone-200 bg-white px-4 py-4 text-left text-sm leading-6 text-stone-700 transition hover:border-stone-300 hover:bg-stone-50">
        ${escapeHtml(item)}
      </button>
    `).join('');

    document.querySelectorAll('.history-item').forEach((button) => {
      button.addEventListener('click', () => {
        const index = Number(button.getAttribute('data-history-index'));
        const query = state.history[index];
        if (!query) return;
        els.queryInput.value = query;
        state.lastQuery = query;
        persistState();
        renderRequestPreview();
        closeSidebar();
        toast('최근 질문을 불러왔습니다.');
      });
    });
  }

  function pushHistory(query) {
    const next = [query, ...(state.history || []).filter((item) => item !== query)].slice(0, 8);
    state.history = next;
  }

  function clearHistory() {
    state.history = [];
    persistState();
    renderHistory();
    toast('최근 질문을 비웠습니다.');
  }

  function saveSettings() {
    state.apiBase = (els.apiBase.value || '').trim();
    state.defaultDomain = els.defaultDomain.value || '02.법률';
    els.domainSelect.value = state.defaultDomain;
    persistState();
    updateHealthHref();
    renderRequestPreview();
    closeModal();
    toast('설정을 저장했습니다.');
  }

  function resetSettings() {
    state.apiBase = '';
    state.defaultDomain = '02.법률';
    els.apiBase.value = '';
    els.defaultDomain.value = '02.법률';
    els.domainSelect.value = '02.법률';
    persistState();
    updateHealthHref();
    renderRequestPreview();
    toast('설정을 초기화했습니다.');
  }

  function setLoading(isLoading) {
    els.btnSubmit.disabled = isLoading;
    els.btnSubmit.className = isLoading
      ? 'rounded-2xl bg-stone-400 px-5 py-3 text-sm font-medium text-white'
      : 'rounded-2xl bg-stone-900 px-5 py-3 text-sm font-medium text-white hover:bg-stone-700';
  }

  function apiUrl(path) {
    const base = (state.apiBase || '').trim();
    if (!base) return path;
    return base.replace(/\/+$/, '') + path;
  }

  function updateHealthHref() {
    const href = apiUrl('/healthz');
    els.btnHealth.href = href;
    els.btnHealth.target = '_blank';
    els.btnHealth.rel = 'noreferrer';
    els.btnHealthMobile.href = href;
    els.btnHealthMobile.target = '_blank';
    els.btnHealthMobile.rel = 'noreferrer';
  }

  function setStatus(message, isError) {
    if (!message) {
      els.status.classList.add('hidden');
      return;
    }

    els.status.classList.remove('hidden');
    els.status.textContent = message;
    els.status.className = 'mt-4 rounded-2xl border px-4 py-3 text-sm';
    if (isError) {
      els.status.classList.add('border-red-200', 'bg-red-50', 'text-red-700');
    } else {
      els.status.classList.add('border-stone-200', 'bg-stone-100', 'text-stone-700');
    }
  }

  function toast(message) {
    setStatus(message, false);
    window.clearTimeout(toast._timer);
    toast._timer = window.setTimeout(() => setStatus('', false), 2200);
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      return {
        apiBase: parsed.apiBase || '',
        defaultDomain: parsed.defaultDomain || '02.법률',
        lastQuery: parsed.lastQuery || '',
        topK: parsed.topK || 4,
        history: Array.isArray(parsed.history) ? parsed.history : [],
      };
    } catch {
      return {
        apiBase: '',
        defaultDomain: '02.법률',
        lastQuery: '',
        topK: 4,
        history: [],
      };
    }
  }

  function persistState() {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(state));
    } catch {
      setStatus('로컬 저장소에 상태를 저장하지 못했습니다.', true);
    }
  }

  function formatText(value) {
    return escapeHtml(String(value || ''))
      .replace(/\n{2,}/g, '\n\n')
      .replace(/\n/g, '<br />');
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
})();
