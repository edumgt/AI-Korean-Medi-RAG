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
      value: '여행',
      label: '여행',
      icon: '✈️',
      color: 'sky',
      desc: '전국 관광지 방문 데이터 기반 여행 에이전트',
      example: '서울에서 가족과 함께 즐길 수 있는 역사·문화 관광지를 추천해줘',
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

  const DOMAIN_ICONS_SVG = {
    sky:     '<svg class="h-3.5 w-3.5 shrink-0" viewBox="0 0 20 20" fill="currentColor"><path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z"/></svg>',
    amber:   '<svg class="h-3.5 w-3.5 shrink-0" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 1.944A11.954 11.954 0 012.166 5C2.056 5.649 2 6.318 2 7c0 5.225 3.34 9.67 8 11.317C14.66 16.67 18 12.225 18 7c0-.682-.057-1.35-.166-2.001A11.954 11.954 0 0110 1.944z" clip-rule="evenodd"/></svg>',
    emerald: '<svg class="h-3.5 w-3.5 shrink-0" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z" clip-rule="evenodd"/></svg>',
    blue:    '<svg class="h-3.5 w-3.5 shrink-0" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-3a1 1 0 00-.867.5 1 1 0 11-1.731-1A3 3 0 0113 8a3.001 3.001 0 01-2 2.83V11a1 1 0 11-2 0v-1a1 1 0 011-1 1 1 0 100-2zm0 8a1 1 0 100-2 1 1 0 000 2z" clip-rule="evenodd"/></svg>',
    cyan:    '<svg class="h-3.5 w-3.5 shrink-0" viewBox="0 0 20 20" fill="currentColor"><path d="M5 3a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2V5a2 2 0 00-2-2H5zM5 11a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2v-2a2 2 0 00-2-2H5zM11 5a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V5zM14 11a1 1 0 011 1v1h1a1 1 0 110 2h-1v1a1 1 0 11-2 0v-1h-1a1 1 0 110-2h1v-1a1 1 0 011-1z"/></svg>',
    purple:  '<svg class="h-3.5 w-3.5 shrink-0" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M12.395 2.553a1 1 0 00-1.45-.385c-.345.23-.614.558-.822.88-.214.33-.403.713-.57 1.116-.334.804-.614 1.768-.84 2.734a31.365 31.365 0 00-.613 3.58 2.64 2.64 0 01-.945-1.067c-.328-.68-.398-1.534-.398-2.654A1 1 0 005.05 6.05 6.981 6.981 0 003 11a7 7 0 1011.95-4.95c-.592-.591-.98-.985-1.348-1.467-.363-.476-.724-1.063-1.207-2.03zM12.12 15.12A3 3 0 017 13s.879.5 2.5.5c0-1 .5-4 1.25-4.5.5 1 .786 1.293 1.371 1.879A2.99 2.99 0 0113 13a2.99 2.99 0 01-.879 2.121z" clip-rule="evenodd"/></svg>',
    teal:    '<svg class="h-3.5 w-3.5 shrink-0" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M4 2a2 2 0 00-2 2v11a3 3 0 106 0V4a2 2 0 00-2-2H4zm1 14a1 1 0 100-2 1 1 0 000 2zm5-1.757l4.9-4.9a2 2 0 000-2.828L13.485 5.1a2 2 0 00-2.828 0L10 5.757v8.486zM16 18H9.071l6-6H16a2 2 0 012 2v2a2 2 0 01-2 2z" clip-rule="evenodd"/></svg>',
    stone:   '<svg class="h-3.5 w-3.5 shrink-0" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clip-rule="evenodd"/></svg>',
  };

  const DOMAIN_DOT_COLORS = {
    amber:   '#F59E0B',
    emerald: '#10B981',
    blue:    '#3B82F6',
    cyan:    '#06B6D4',
    purple:  '#8B5CF6',
    teal:    '#14B8A6',
    sky:     '#0EA5E9',
    stone:   '#6B7280',
  };

  const COLOR_MAP = {
    amber:   { btn: 'text-[#444] hover:bg-[#FFF8E6]',   active: 'bg-[#5B9CFF] text-white shadow-sm' },
    emerald: { btn: 'text-[#444] hover:bg-[#ECFDF5]',   active: 'bg-[#5B9CFF] text-white shadow-sm' },
    blue:    { btn: 'text-[#444] hover:bg-[#EFF6FF]',   active: 'bg-[#5B9CFF] text-white shadow-sm' },
    cyan:    { btn: 'text-[#444] hover:bg-[#ECFEFF]',   active: 'bg-[#5B9CFF] text-white shadow-sm' },
    purple:  { btn: 'text-[#444] hover:bg-[#F5F3FF]',   active: 'bg-[#5B9CFF] text-white shadow-sm' },
    teal:    { btn: 'text-[#444] hover:bg-[#F0FDFA]',   active: 'bg-[#5B9CFF] text-white shadow-sm' },
    sky:     { btn: 'text-[#444] hover:bg-[#F0F9FF]',   active: 'bg-[#0EA5E9] text-white shadow-sm' },
    stone:   { btn: 'text-[#444] hover:bg-[#F5F5F5]',   active: 'bg-[#5B9CFF] text-white shadow-sm' },
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

    // 패널 토글 — 모든 브레이크포인트 통합 처리
    els.btnOpenLeft.addEventListener('click', toggleLeftPanel);
    els.btnCloseLeft.addEventListener('click', () => {
      if (window.innerWidth >= 768) toggleLeftPanel();
      else closeLeftPanel();
    });
    els.leftBackdrop.addEventListener('click', closeLeftPanel);

    els.btnOpenRight.addEventListener('click', toggleRightPanel);
    if ($('#btnCloseRight')) $('#btnCloseRight').addEventListener('click', () => {
      if (window.innerWidth >= 768) toggleRightPanel();
      else closeRightPanel();
    });
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
      const dot = DOMAIN_DOT_COLORS[d.color] || '#6B7280';
      return `
        <button
          data-domain="${d.value}"
          class="domain-tab flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-xs font-medium transition ${c.btn}"
        >
          <span class="h-2 w-2 shrink-0 rounded-full" style="background:${dot}"></span>
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
      const dot = DOMAIN_DOT_COLORS[DOMAINS.find((d) => d.value === btn.dataset.domain)?.color || 'stone'];
      const dotEl = btn.querySelector('span');
      if (isActive) {
        btn.className = `domain-tab flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-xs font-medium transition ${c.active}`;
        if (dotEl) dotEl.style.background = 'rgba(255,255,255,0.8)';
      } else {
        btn.className = `domain-tab flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-xs font-medium transition ${c.btn}`;
        if (dotEl) dotEl.style.background = dot;
      }
    });

    // 예시 질문 업데이트
    if (els.btnUseExample) els.btnUseExample.textContent = dom.example;

    // 히어로 업데이트
    if (els.heroTitle) {
      const labels = { '02.법률': '법률 문서 검색', '01.의료': '의료 문서 검색', '우울증': '우울증 상담 사례 검색', '불안장애': '불안장애 상담 사례 검색', '중독': '중독 상담 사례 검색', '일반군': '일반 상담 사례 검색', '여행': '여행지 추천 에이전트', '': '전체 도메인 통합 검색' };
      els.heroTitle.textContent = labels[dom.value] ?? dom.label + ' 검색';
    }
    if (els.heroDesc) els.heroDesc.textContent = dom.desc;
  }

  function currentDomain() {
    return DOMAINS.find((d) => d.value === state.defaultDomain) || DOMAINS[0];
  }

  // ── 패널 상태 ─────────────────────────────────────────────────────
  const shell = document.getElementById('appShell');
  let _leftOpen  = true;
  let _rightOpen = true;

  function _isMobile()  { return window.innerWidth < 768; }

  // 햄버거 ☰ ↔ ✕ 전환
  function _updateLeftBtnIcon(open) {
    const btn = els.btnOpenLeft;
    if (!btn) return;
    const bars = btn.querySelectorAll('.hbg-bar');
    if (open) {
      if (bars[0]) bars[0].style.transform = '';
      if (bars[1]) { bars[1].style.opacity = '1'; bars[1].style.transform = ''; }
      if (bars[2]) bars[2].style.transform = '';
      btn.classList.remove('panel-btn-active');
    } else {
      if (bars[0]) bars[0].style.transform = 'translateY(5px) rotate(45deg)';
      if (bars[1]) { bars[1].style.opacity = '0'; bars[1].style.transform = 'scaleX(0)'; }
      if (bars[2]) bars[2].style.transform = 'translateY(-5px) rotate(-45deg)';
      btn.classList.add('panel-btn-active');
    }
  }
  function _updateRightBtnIcon(open) {
    const btn = els.btnOpenRight;
    if (!btn) return;
    if (open) btn.classList.remove('panel-btn-active');
    else      btn.classList.add('panel-btn-active');
  }

  const _LEFT_W  = '260px';
  const _LEFT_W0 = '0px';
  const _RIGHT_W_PC  = '360px';
  const _RIGHT_W_TAB = '340px';
  const _RIGHT_W0 = '0px';

  function _rightDefaultW() {
    return window.innerWidth >= 1280 ? _RIGHT_W_PC : _RIGHT_W_TAB;
  }

  // ── 왼쪽 패널 ─────────────────────────────────────────────────
  function toggleLeftPanel() {
    if (_isMobile()) {
      if (els.leftPanel.classList.contains('open')) closeLeftPanel();
      else openLeftPanel();
      return;
    }
    _leftOpen = !_leftOpen;
    if (_leftOpen) {
      shell.style.setProperty('--left-col', _LEFT_W);
      els.leftPanel.classList.remove('panel-closed');
    } else {
      shell.style.setProperty('--left-col', _LEFT_W0);
      els.leftPanel.classList.add('panel-closed');
    }
    _updateLeftBtnIcon(_leftOpen);
  }

  function openLeftPanel() {
    if (_isMobile()) {
      els.leftPanel.classList.add('open');
      els.leftBackdrop.classList.remove('hidden');
    } else {
      _leftOpen = true;
      shell.style.setProperty('--left-col', _LEFT_W);
      els.leftPanel.classList.remove('panel-closed');
    }
    _updateLeftBtnIcon(true);
  }

  function closeLeftPanel() {
    if (_isMobile()) {
      els.leftPanel.classList.remove('open');
      els.leftBackdrop.classList.add('hidden');
    } else {
      _leftOpen = false;
      shell.style.setProperty('--left-col', _LEFT_W0);
      els.leftPanel.classList.add('panel-closed');
    }
    _updateLeftBtnIcon(false);
  }

  // ── 오른쪽 패널 ─────────────────────────────────────────────
  function toggleRightPanel() {
    if (_isMobile()) {
      if (els.rightPanel.classList.contains('open')) closeRightPanel();
      else openRightPanel();
      return;
    }
    _rightOpen = !_rightOpen;
    if (_rightOpen) {
      shell.style.setProperty('--right-col', _rightDefaultW());
      els.rightPanel.classList.remove('panel-closed');
    } else {
      shell.style.setProperty('--right-col', _RIGHT_W0);
      els.rightPanel.classList.add('panel-closed');
    }
    _updateRightBtnIcon(_rightOpen);
  }

  function openRightPanel() {
    if (_isMobile()) {
      els.rightPanel.classList.add('open');
      els.rightBackdrop.classList.remove('hidden');
    } else {
      _rightOpen = true;
      shell.style.setProperty('--right-col', _rightDefaultW());
      els.rightPanel.classList.remove('panel-closed');
    }
    _updateRightBtnIcon(true);
  }

  function closeRightPanel() {
    if (_isMobile()) {
      els.rightPanel.classList.remove('open');
      els.rightBackdrop.classList.add('hidden');
    } else {
      _rightOpen = false;
      shell.style.setProperty('--right-col', _RIGHT_W0);
      els.rightPanel.classList.add('panel-closed');
    }
    _updateRightBtnIcon(false);
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
        <div class="rounded-xl border border-dashed border-[#E3E3E3] px-4 py-6 text-xs leading-6 text-[#BBB] text-center">
          조회된 근거가 없습니다.
        </div>`;
      return;
    }

    els.citations.innerHTML = citations.map((item, idx) => `
      <article class="rounded-xl border border-[#EBEBEB] bg-[#FAFAFA] p-4 hover:border-[#C7D7FF] transition">
        <div class="flex flex-wrap items-center gap-1.5 mb-2.5">
          <span class="h-5 w-5 flex items-center justify-center rounded-full bg-[#5B9CFF] text-[10px] font-bold text-white shrink-0">${idx + 1}</span>
          <span class="text-xs font-semibold text-[#1A1A1A] truncate max-w-[140px]">${escapeHtml(item.doc_id || '-')}</span>
          <span class="rounded-full bg-white border border-[#E3E3E3] px-2 py-0.5 text-[10px] font-medium text-[#666]">${escapeHtml(item.domain_name || 'unknown')}</span>
          ${item.source_spec ? `<span class="rounded-full bg-white border border-[#E3E3E3] px-2 py-0.5 text-[10px] font-medium text-[#999]">${escapeHtml(item.source_spec)}</span>` : ''}
        </div>
        <div class="text-xs leading-6 text-[#555]">${formatText(item.excerpt || '')}</div>
      </article>
    `).join('');

    if (window.innerWidth < 768) openRightPanel();
  }

  function renderError(message) {
    els.answerBox.innerHTML = `
      <div class="flex items-start gap-2.5 rounded-xl border border-[#FECACA] bg-[#FFF5F5] p-3">
        <svg class="h-4 w-4 shrink-0 text-[#EF4444] mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
        </svg>
        <span class="text-xs leading-5 text-[#DC2626]">${escapeHtml(message)}</span>
      </div>`;
    els.citationCount.textContent      = '0건';
    els.citationCountPanel.textContent = '0건';
    els.usedCollectionBadge.textContent = 'collection: -';
    els.citations.innerHTML = `
      <div class="rounded-xl border border-dashed border-[#E3E3E3] px-4 py-6 text-xs leading-6 text-[#BBB] text-center">
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
        <div class="rounded-xl border border-dashed border-[#E3E3E3] px-3 py-4 text-[10px] leading-4 text-[#BBB] text-center">
          아직 저장된 질문이 없습니다.
        </div>`;
      return;
    }
    els.historyList.innerHTML = items.map((item, idx) => `
      <button data-history-index="${idx}"
        class="history-item w-full flex items-center gap-2 rounded-xl px-3 py-2.5 text-left text-[10px] leading-4 text-[#555] hover:bg-[#F0F0F0] transition">
        <svg class="h-3 w-3 shrink-0 text-[#BBB]" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
        </svg>
        <span class="truncate">${escapeHtml(item)}</span>
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
    if (isLoading) {
      els.btnSubmit.className = 'flex items-center gap-2 rounded-xl bg-[#C8DDFF] px-5 py-2.5 text-sm font-semibold text-white cursor-not-allowed transition';
      els.btnSubmit.innerHTML = '<span class="dot-anim"><span></span><span></span><span></span></span><span>처리 중...</span>';
    } else {
      els.btnSubmit.className = 'flex items-center gap-2 rounded-xl bg-[#5B9CFF] px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#4A8AEE] transition';
      els.btnSubmit.innerHTML = '<span>질문 보내기</span><svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6"/></svg>';
    }
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
    els.status.className = 'hidden rounded-xl border px-3 py-2 text-xs flex-1 ' +
      (isError ? 'border-[#FECACA] bg-[#FFF5F5] text-[#DC2626]' : 'border-[#E3E3E3] bg-[#F5F5F5] text-[#666]');
    els.status.classList.remove('hidden');
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
