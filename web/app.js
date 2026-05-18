(() => {
  'use strict';

  const $ = (sel) => document.querySelector(sel);
  const LS_KEY = 'mind_med_law_rag_v1';
  const ASK_PATH = '/ask';

  // ── 도메인 정의 ────────────────────────────────────────────────────
  const DOMAINS = [
    {
      value: '02.법률',
      label: '법률',
      icon: '⚖',
      color: 'amber',
      desc: '근로기준법, 계약, 판례 등 법률 문서 검색',
      example: '근로자 4인 이하 사업장에 근로기준법 일부만 적용되는 것이 왜 문제 되었나요?',
    },
    {
      value: '01.의료',
      label: '의료',
      icon: '🩺',
      color: 'emerald',
      desc: '의학 논문, 진료 가이드라인, 의료 기기 문서 검색',
      example: '엑스레이 장치의 디레이팅 모드는 어떤 상황에서 작동하나요?',
    },
    {
      value: '우울증',
      label: '우울증',
      icon: '💙',
      color: 'blue',
      desc: '우울증 상담 사례 요약 및 대화록 검색',
      example: '우울증 내담자가 무기력감을 호소할 때 상담사가 활용하는 주요 개입 방법은 무엇인가요?',
    },
    {
      value: '불안장애',
      label: '불안장애',
      icon: '🌊',
      color: 'cyan',
      desc: '불안장애 상담 사례 요약 및 대화록 검색',
      example: '불안장애 내담자의 상담에서 인지 재구성 기법은 어떻게 적용되나요?',
    },
    {
      value: '중독',
      label: '중독',
      icon: '🔗',
      color: 'purple',
      desc: '중독 상담 사례(알코올·도박 등) 요약 및 대화록 검색',
      example: '알코올 중독 내담자의 동기 강화 상담에서 상담사가 주로 사용하는 접근법은?',
    },
    {
      value: '일반군',
      label: '일반군',
      icon: '🌿',
      color: 'teal',
      desc: '일반 상담 사례(진로·관계·스트레스 등) 검색',
      example: '진로 고민을 가진 내담자에게 상담사가 정서를 다루는 방식은 무엇인가요?',
    },
    {
      value: '',
      label: '전체',
      icon: '🔍',
      color: 'stone',
      desc: '모든 도메인을 통합 검색합니다',
      example: '상담사가 내담자의 정서 조절을 돕는 공통적인 방법은 무엇인가요?',
    },
  ];

  const COLOR_MAP = {
    amber:   { btn: 'border-amber-300 bg-amber-50 text-amber-900',   active: 'bg-amber-600 text-white border-amber-600' },
    emerald: { btn: 'border-emerald-300 bg-emerald-50 text-emerald-900', active: 'bg-emerald-600 text-white border-emerald-600' },
    blue:    { btn: 'border-blue-300 bg-blue-50 text-blue-900',      active: 'bg-blue-600 text-white border-blue-600' },
    cyan:    { btn: 'border-cyan-300 bg-cyan-50 text-cyan-900',      active: 'bg-cyan-600 text-white border-cyan-600' },
    purple:  { btn: 'border-purple-300 bg-purple-50 text-purple-900',active: 'bg-purple-600 text-white border-purple-600' },
    teal:    { btn: 'border-teal-300 bg-teal-50 text-teal-900',      active: 'bg-teal-600 text-white border-teal-600' },
    stone:   { btn: 'border-stone-300 bg-stone-50 text-stone-700',   active: 'bg-stone-700 text-white border-stone-700' },
  };

  // ── 상태 ───────────────────────────────────────────────────────────
  const state = loadState();

  // ── DOM 참조 ───────────────────────────────────────────────────────
  const els = {
    leftPanel:    $('#leftPanel'),
    leftBackdrop: $('#leftBackdrop'),
    rightPanel:   $('#rightPanel'),
    rightBackdrop:$('#rightBackdrop'),
    btnOpenLeft:  $('#btnOpenLeft'),
    btnCloseLeft: $('#btnCloseLeft'),
    btnOpenRight: $('#btnOpenRight'),
    btnCloseRight:('#btnCloseRight') ? $('#btnCloseRight') : null,
    btnOpenRightMd: $('#btnOpenRightMd'),
    btnOpenEvidenceFromAnswer: $('#btnOpenEvidenceFromAnswer'),
    btnUseExample: $('#btnUseExample'),
    btnExample:    $('#btnExample'),
    btnResetQuery: $('#btnResetQuery'),
    btnSubmit:     $('#btnSubmit'),
    btnClearHistory: $('#btnClearHistory'),
    queryInput:    $('#queryInput'),
    domainTabs:    $('#domainTabs'),
    topK:          $('#topK'),
    answerBox:     $('#answerBox'),
    citations:     $('#citations'),
    citationCount: $('#citationCount'),
    citationCountPanel: $('#citationCountPanel'),
    usedCollectionBadge: $('#usedCollectionBadge'),
    requestPreview: $('#requestPreview'),
    historyList:   $('#historyList'),
    status:        $('#status'),
    heroTitle:     $('#heroTitle'),
    heroDesc:      $('#heroDesc'),
    btnSettings:   $('#btnSettings'),
    btnSettingsMobile: $('#btnSettingsMobile'),
    btnSettingsLeft:   $('#btnSettingsLeft'),
    btnHealth:     $('#btnHealth'),
    btnHealthMobile:   $('#btnHealthMobile'),
    btnHealthLeft: $('#btnHealthLeft'),
    modal:         $('#modal'),
    btnClose:      $('#btnClose'),
    apiBase:       $('#apiBase'),
    defaultDomain: $('#defaultDomain'),
    btnSave:       $('#btnSave'),
    btnReset:      $('#btnReset'),
  };

  init();

  function init() {
    buildDomainTabs();
    setActiveDomain(state.defaultDomain);

    els.apiBase.value      = state.apiBase || '';
    els.defaultDomain.value = state.defaultDomain || '02.법률';
    els.queryInput.value   = state.lastQuery || currentDomain().example;
    els.topK.value         = String(state.topK || 4);

    updateHealthHref();
    renderHistory();
    renderRequestPreview();

    // 패널 토글
    els.btnOpenLeft.addEventListener('click', openLeftPanel);
    els.btnCloseLeft.addEventListener('click', closeLeftPanel);
    els.leftBackdrop.addEventListener('click', closeLeftPanel);

    els.btnOpenRight.addEventListener('click', openRightPanel);
    if (els.btnCloseRight) els.btnCloseRight.addEventListener('click', closeRightPanel);
    if ($('#btnCloseRight')) $('#btnCloseRight').addEventListener('click', closeRightPanel);
    els.rightBackdrop.addEventListener('click', closeRightPanel);
    if (els.btnOpenRightMd) els.btnOpenRightMd.addEventListener('click', openRightPanel);
    els.btnOpenEvidenceFromAnswer.addEventListener('click', openRightPanel);

    // 액션
    els.btnUseExample.addEventListener('click', useExample);
    els.btnExample.addEventListener('click', useExample);
    els.btnResetQuery.addEventListener('click', resetQuery);
    els.btnSubmit.addEventListener('click', submitQuery);
    els.btnClearHistory.addEventListener('click', clearHistory);

    els.queryInput.addEventListener('input', () => {
      state.lastQuery = els.queryInput.value;
      persistState();
      renderRequestPreview();
    });

    els.topK.addEventListener('change', () => {
      state.topK = Number(els.topK.value) || 4;
      persistState();
      renderRequestPreview();
    });

    // 설정 모달
    [els.btnSettings, els.btnSettingsMobile, els.btnSettingsLeft].forEach((b) => {
      if (b) b.addEventListener('click', openModal);
    });
    els.btnClose.addEventListener('click', closeModal);
    els.modal.addEventListener('click', (e) => { if (e.target === els.modal) closeModal(); });
    els.btnSave.addEventListener('click', saveSettings);
    els.btnReset.addEventListener('click', resetSettings);

    // 키보드
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { closeLeftPanel(); closeRightPanel(); closeModal(); }
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') submitQuery();
    });
  }

  // ── 도메인 탭 ─────────────────────────────────────────────────────
  function buildDomainTabs() {
    els.domainTabs.innerHTML = DOMAINS.map((d) => {
      const c = COLOR_MAP[d.color];
      return `
        <button
          data-domain="${d.value}"
          class="domain-tab flex w-full items-center gap-2 rounded-xl border px-3 py-2 text-left text-xs font-medium transition ${c.btn}"
        >
          <span>${d.icon}</span>
          <span>${d.label}</span>
        </button>
      `;
    }).join('');

    document.querySelectorAll('.domain-tab').forEach((btn) => {
      btn.addEventListener('click', () => {
        const val = btn.dataset.domain;
        setActiveDomain(val);
        state.defaultDomain = val;
        persistState();
        renderRequestPreview();
        closeLeftPanel();
      });
    });
  }

  function setActiveDomain(value) {
    const dom = DOMAINS.find((d) => d.value === value) || DOMAINS[0];
    state.defaultDomain = dom.value;

    document.querySelectorAll('.domain-tab').forEach((btn) => {
      const isActive = btn.dataset.domain === dom.value;
      const c = COLOR_MAP[DOMAINS.find((d) => d.value === btn.dataset.domain)?.color || 'stone'];
      btn.className = `domain-tab flex w-full items-center gap-2 rounded-xl border px-3 py-2 text-left text-xs font-medium transition ${isActive ? c.active : c.btn}`;
    });

    // 예시 질문 업데이트
    if (els.btnUseExample) els.btnUseExample.textContent = dom.example;

    // 히어로 업데이트
    if (els.heroTitle) {
      const labels = { '02.법률': '법률 문서 검색', '01.의료': '의료 문서 검색', '우울증': '우울증 상담 사례 검색', '불안장애': '불안장애 상담 사례 검색', '중독': '중독 상담 사례 검색', '일반군': '일반 상담 사례 검색', '': '전체 도메인 통합 검색' };
      els.heroTitle.textContent = labels[dom.value] ?? dom.label + ' 검색';
    }
    if (els.heroDesc) els.heroDesc.textContent = dom.desc;
  }

  function currentDomain() {
    return DOMAINS.find((d) => d.value === state.defaultDomain) || DOMAINS[0];
  }

  // ── 패널 토글 ─────────────────────────────────────────────────────
  function openLeftPanel() {
    els.leftPanel.classList.add('open');
    els.leftBackdrop.classList.remove('hidden');
  }
  function closeLeftPanel() {
    els.leftPanel.classList.remove('open');
    els.leftBackdrop.classList.add('hidden');
  }
  function openRightPanel() {
    els.rightPanel.classList.add('open');
    els.rightBackdrop.classList.remove('hidden');
  }
  function closeRightPanel() {
    els.rightPanel.classList.remove('open');
    els.rightBackdrop.classList.add('hidden');
  }
  function openModal() {
    els.modal.classList.remove('hidden');
    els.apiBase.focus();
  }
  function closeModal() {
    els.modal.classList.add('hidden');
  }

  // ── 예시·리셋 ─────────────────────────────────────────────────────
  function useExample() {
    const dom = currentDomain();
    els.queryInput.value = dom.example;
    state.lastQuery = dom.example;
    persistState();
    renderRequestPreview();
    toast('예시 질문을 적용했습니다.');
    closeLeftPanel();
  }

  function resetQuery() {
    els.queryInput.value = '';
    state.lastQuery = '';
    persistState();
    renderRequestPreview();
    toast('입력을 비웠습니다.');
  }

  // ── 질의 전송 ─────────────────────────────────────────────────────
  async function submitQuery() {
    const query  = (els.queryInput.value || '').trim();
    const domain = state.defaultDomain;
    const topK   = Number(els.topK.value) || 4;

    if (!query) {
      setStatus('질문을 입력해 주세요.', true);
      els.queryInput.focus();
      return;
    }

    const payload = { query, domain: domain || null, top_k: topK };

    state.lastQuery = query;
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
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const text = await res.text();
      let data = {};
      try { data = text ? JSON.parse(text) : {}; } catch { data = { answer: text }; }

      if (!res.ok) throw new Error(data?.detail || data?.message || `HTTP ${res.status}`);

      renderResponse(data);
      setStatus('응답을 받아왔습니다.', false);
    } catch (err) {
      renderError(err?.message || '질의 요청에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  }

  // ── 응답 렌더링 ───────────────────────────────────────────────────
  function renderResponse(data) {
    const answer    = formatText(data?.answer || '응답이 비어 있습니다.');
    const citations = Array.isArray(data?.citations) ? data.citations : [];
    const used      = data?.used_collection || '-';

    els.answerBox.innerHTML = answer;
    els.usedCollectionBadge.textContent = `collection: ${used}`;
    els.citationCount.textContent       = `${citations.length}건`;
    els.citationCountPanel.textContent  = `${citations.length}건`;

    if (!citations.length) {
      els.citations.innerHTML = `
        <div class="rounded-xl border border-dashed border-stone-200 px-4 py-5 text-xs leading-5 text-stone-400">
          조회된 근거가 없습니다.
        </div>`;
      return;
    }

    els.citations.innerHTML = citations.map((item, idx) => `
      <article class="rounded-xl border border-stone-200 bg-stone-50 p-4">
        <div class="flex flex-wrap items-center gap-1.5">
          <span class="rounded-full bg-stone-800 px-2 py-0.5 text-[10px] font-semibold text-white">${idx + 1}</span>
          <span class="text-xs font-semibold text-stone-800">${escapeHtml(item.doc_id || '-')}</span>
          <span class="rounded-full bg-white px-2 py-0.5 text-[10px] font-medium text-stone-500 border border-stone-200">${escapeHtml(item.domain_name || 'unknown')}</span>
          ${item.source_spec ? `<span class="rounded-full bg-white px-2 py-0.5 text-[10px] font-medium text-stone-400 border border-stone-200">${escapeHtml(item.source_spec)}</span>` : ''}
        </div>
        <div class="mt-2.5 text-xs leading-6 text-stone-600">${formatText(item.excerpt || '')}</div>
      </article>
    `).join('');

    if (window.innerWidth < 768) openRightPanel();
  }

  function renderError(message) {
    els.answerBox.innerHTML = `
      <div class="rounded-xl border border-red-200 bg-red-50 p-3 text-xs leading-5 text-red-700">${escapeHtml(message)}</div>`;
    els.citationCount.textContent      = '0건';
    els.citationCountPanel.textContent = '0건';
    els.usedCollectionBadge.textContent = 'collection: -';
    els.citations.innerHTML = `
      <div class="rounded-xl border border-dashed border-stone-200 px-4 py-5 text-xs leading-5 text-stone-400">
        오류로 인해 근거를 표시하지 못했습니다.
      </div>`;
    setStatus(message, true);
  }

  function renderRequestPreview(overridePayload) {
    const payload = overridePayload || {
      query:  (els.queryInput.value || '').trim(),
      domain: state.defaultDomain || null,
      top_k:  Number(els.topK.value) || 4,
    };
    els.requestPreview.textContent = JSON.stringify(payload, null, 2);
  }

  // ── 히스토리 ──────────────────────────────────────────────────────
  function renderHistory() {
    const items = Array.isArray(state.history) ? state.history : [];
    if (!items.length) {
      els.historyList.innerHTML = `
        <div class="rounded-xl border border-dashed border-stone-200 px-3 py-4 text-[10px] leading-4 text-stone-400">
          아직 저장된 질문이 없습니다.
        </div>`;
      return;
    }
    els.historyList.innerHTML = items.map((item, idx) => `
      <button data-history-index="${idx}"
        class="history-item w-full rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-left text-[10px] leading-4 text-stone-600 hover:border-stone-300 hover:bg-stone-50">
        ${escapeHtml(item)}
      </button>`).join('');

    document.querySelectorAll('.history-item').forEach((btn) => {
      btn.addEventListener('click', () => {
        const q = state.history[Number(btn.dataset.historyIndex)];
        if (!q) return;
        els.queryInput.value = q;
        state.lastQuery = q;
        persistState();
        renderRequestPreview();
        closeLeftPanel();
        toast('최근 질문을 불러왔습니다.');
      });
    });
  }

  function pushHistory(query) {
    state.history = [query, ...(state.history || []).filter((i) => i !== query)].slice(0, 8);
  }

  function clearHistory() {
    state.history = [];
    persistState();
    renderHistory();
    toast('최근 질문을 비웠습니다.');
  }

  // ── 설정 ──────────────────────────────────────────────────────────
  function saveSettings() {
    state.apiBase      = (els.apiBase.value || '').trim();
    state.defaultDomain = els.defaultDomain.value;
    setActiveDomain(state.defaultDomain);
    persistState();
    updateHealthHref();
    renderRequestPreview();
    closeModal();
    toast('설정을 저장했습니다.');
  }

  function resetSettings() {
    state.apiBase = '';
    state.defaultDomain = '02.법률';
    els.apiBase.value   = '';
    els.defaultDomain.value = '02.법률';
    setActiveDomain('02.법률');
    persistState();
    updateHealthHref();
    renderRequestPreview();
    toast('설정을 초기화했습니다.');
  }

  // ── 유틸 ──────────────────────────────────────────────────────────
  function setLoading(isLoading) {
    els.btnSubmit.disabled = isLoading;
    els.btnSubmit.className = isLoading
      ? 'rounded-xl bg-stone-400 px-4 py-2 text-sm font-medium text-white cursor-not-allowed'
      : 'rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700';
  }

  function apiUrl(path) {
    const base = (state.apiBase || '').trim();
    return base ? base.replace(/\/+$/, '') + path : path;
  }

  function updateHealthHref() {
    const href = apiUrl('/healthz');
    [els.btnHealth, els.btnHealthMobile, els.btnHealthLeft].forEach((el) => {
      if (!el) return;
      el.href   = href;
      el.target = '_blank';
      el.rel    = 'noreferrer';
    });
  }

  function setStatus(message, isError) {
    if (!message) { els.status.classList.add('hidden'); return; }
    els.status.classList.remove('hidden');
    els.status.textContent = message;
    els.status.className = 'mt-3 rounded-xl border px-3 py-2 text-xs ' +
      (isError ? 'border-red-200 bg-red-50 text-red-700' : 'border-stone-200 bg-stone-100 text-stone-600');
  }

  function toast(message) {
    setStatus(message, false);
    clearTimeout(toast._t);
    toast._t = setTimeout(() => setStatus('', false), 2200);
  }

  function formatText(value) {
    return escapeHtml(String(value || ''))
      .replace(/\n{2,}/g, '\n\n')
      .replace(/\n/g, '<br/>');
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function loadState() {
    try {
      const raw    = localStorage.getItem(LS_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      return {
        apiBase:       parsed.apiBase || '',
        defaultDomain: parsed.defaultDomain ?? '02.법률',
        lastQuery:     parsed.lastQuery || '',
        topK:          parsed.topK || 4,
        history:       Array.isArray(parsed.history) ? parsed.history : [],
      };
    } catch {
      return { apiBase: '', defaultDomain: '02.법률', lastQuery: '', topK: 4, history: [] };
    }
  }

  function persistState() {
    try { localStorage.setItem(LS_KEY, JSON.stringify(state)); }
    catch { setStatus('로컬 저장소에 상태를 저장하지 못했습니다.', true); }
  }
})();
