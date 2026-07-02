(() => {
  'use strict';

  const $ = (sel) => document.querySelector(sel);
  const LS_KEY = 'mind_med_law_rag_v1';
  const ASK_PATH = '/ask';

  let _travelMap = null;

  // ── 도메인 정의 (group 단위로 세분화, offcanvas select에서 optgroup으로 표시) ──
  const DOMAINS = [
    {
      value: '02.법률',
      label: '법률',
      icon: '⚖',
      color: 'amber',
      group: '전문분야',
      desc: '근로기준법, 계약, 판례 등 법률 문서 검색',
      example: '근로자 4인 이하 사업장에 근로기준법 일부만 적용되는 것이 왜 문제 되었나요?',
    },
    {
      value: '01.의료',
      label: '의료',
      icon: '🩺',
      color: 'emerald',
      group: '전문분야',
      desc: '의학 논문, 진료 가이드라인, 의료 기기 문서 검색',
      example: '엑스레이 장치의 디레이팅 모드는 어떤 상황에서 작동하나요?',
    },
    {
      value: '우울증',
      label: '우울증',
      icon: '💙',
      color: 'blue',
      group: '심리상담',
      desc: '우울증 상담 사례 요약 및 대화록 검색',
      example: '우울증 내담자가 무기력감을 호소할 때 상담사가 활용하는 주요 개입 방법은 무엇인가요?',
    },
    {
      value: '불안장애',
      label: '불안장애',
      icon: '🌊',
      color: 'cyan',
      group: '심리상담',
      desc: '불안장애 상담 사례 요약 및 대화록 검색',
      example: '불안장애 내담자의 상담에서 인지 재구성 기법은 어떻게 적용되나요?',
    },
    {
      value: '중독',
      label: '중독',
      icon: '🔗',
      color: 'purple',
      group: '심리상담',
      desc: '중독 상담 사례(알코올·도박 등) 요약 및 대화록 검색',
      example: '알코올 중독 내담자의 동기 강화 상담에서 상담사가 주로 사용하는 접근법은?',
    },
    {
      value: '일반군',
      label: '일반군',
      icon: '🌿',
      color: 'teal',
      group: '심리상담',
      desc: '일반 상담 사례(진로·관계·스트레스 등) 검색',
      example: '진로 고민을 가진 내담자에게 상담사가 정서를 다루는 방식은 무엇인가요?',
    },
    {
      value: '여행',
      label: '여행',
      icon: '✈️',
      color: 'sky',
      group: '여행',
      desc: '전국 관광지 방문 데이터 기반 여행 에이전트',
      example: '서울에서 가족과 함께 즐길 수 있는 역사·문화 관광지를 추천해줘',
    },
    {
      value: '05.금융',
      label: '금융',
      icon: '💰',
      color: 'gold',
      group: '투자·금융',
      desc: '세무·회계, 경제지표, 거시경제, 금융상품 등 금융 기초 문서 검색',
      example: '개인사업자와 법인사업자는 세금 구조가 어떻게 다른가요?',
    },
    {
      value: '06.주식투자',
      label: '주식투자',
      icon: '📈',
      color: 'rose',
      group: '투자·금융',
      desc: '산업·재무제표·밸류에이션·기술적 분석 등 주식 투자 문서 검색',
      example: 'PER과 PBR로 상대가치를 평가할 때 주의할 점은 무엇인가요?',
    },
    {
      value: '',
      label: '전체',
      icon: '🔍',
      color: 'stone',
      group: '',
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
    gold:    '#CA8A04',
    rose:    '#E11D48',
    stone:   '#6B7280',
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
    domainDot:     $('#domainDot'),
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
    // DB현황 모달
    btnDbStatus:      $('#btnDbStatus'),
    dbModal:          $('#dbModal'),
    dbModalBody:      $('#dbModalBody'),
    btnDbModalClose:  $('#btnDbModalClose'),
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

    // DB현황 모달
    if (els.btnDbStatus)     els.btnDbStatus.addEventListener('click', openDbModal);
    if (els.btnDbModalClose) els.btnDbModalClose.addEventListener('click', closeDbModal);
    if (els.dbModal) els.dbModal.addEventListener('click', (e) => { if (e.target === els.dbModal) closeDbModal(); });

    // 키보드
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { closeLeftPanel(); closeRightPanel(); closeModal(); closeDbModal(); }
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') submitQuery();
    });
  }

  // ── 도메인 선택 (offcanvas select, group 단위로 optgroup 구성) ──────
  function buildDomainTabs() {
    const groups = [];
    const byGroup = new Map();
    DOMAINS.forEach((d) => {
      const key = d.group || '';
      if (!byGroup.has(key)) {
        byGroup.set(key, []);
        groups.push(key);
      }
      byGroup.get(key).push(d);
    });

    els.domainTabs.innerHTML = groups.map((key) => {
      const options = byGroup.get(key)
        .map((d) => `<option value="${d.value}">${d.icon} ${d.label}</option>`)
        .join('');
      return key ? `<optgroup label="${key}">${options}</optgroup>` : options;
    }).join('');

    els.domainTabs.addEventListener('change', () => {
      const val = els.domainTabs.value;
      setActiveDomain(val);
      state.defaultDomain = val;
      persistState();
      renderRequestPreview();
    });
  }

  function setActiveDomain(value) {
    const dom = DOMAINS.find((d) => d.value === value) || DOMAINS[0];
    state.defaultDomain = dom.value;

    if (els.domainTabs) els.domainTabs.value = dom.value;
    if (els.defaultDomain) els.defaultDomain.value = dom.value;
    if (els.domainDot) els.domainDot.style.background = DOMAIN_DOT_COLORS[dom.color] || '#6B7280';

    // 예시 질문 업데이트
    if (els.btnUseExample) els.btnUseExample.textContent = dom.example;

    // 히어로 업데이트
    if (els.heroTitle) {
      const labels = {
        '02.법률': '법률 문서 검색', '01.의료': '의료 문서 검색',
        '우울증': '우울증 상담 사례 검색', '불안장애': '불안장애 상담 사례 검색',
        '중독': '중독 상담 사례 검색', '일반군': '일반 상담 사례 검색',
        '여행': '여행지 추천 에이전트',
        '05.금융': '금융 문서 검색', '06.주식투자': '주식투자 문서 검색',
        '': '전체 도메인 통합 검색',
      };
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

  const _LEFT_W  = '280px';
  const _LEFT_W0 = '0px';
  const _RIGHT_W_PC  = '400px';
  const _RIGHT_W_TAB = '380px';
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

  // ── 여행 도메인 헬퍼 ─────────────────────────────────────────────────

  function isTravelCitations(citations) {
    return citations.length > 0 && citations[0].domain_name === '여행';
  }

  function parseTravelStats(text) {
    const t = text || '';
    const stats = [];
    let m;
    if ((m = t.match(/방문 만족도:\s*([\d.]+)/))) stats.push(`⭐ ${m[1]}/5`);
    if ((m = t.match(/재방문 의향:\s*([\d.]+)/))) stats.push(`🔄 재방문 ${m[1]}/5`);
    if ((m = t.match(/추천 의향:\s*([\d.]+)/))) stats.push(`👍 추천 ${m[1]}/5`);
    if ((m = t.match(/평균 체류시간:\s*([\d]+)분/))) stats.push(`⏱ ${m[1]}분`);
    if ((m = t.match(/데이터 방문 횟수:\s*([\d]+)회/))) stats.push(`👥 ${m[1]}회`);
    if ((m = t.match(/방문지 수:\s*([\d]+)곳/))) stats.push(`📍 ${m[1]}곳`);
    if ((m = t.match(/등록 사진 수:\s*([\d]+)장/))) stats.push(`📷 ${m[1]}장`);
    return stats.slice(0, 5);
  }

  function hasValidCoords(item) {
    const lat = parseFloat(item.y_coord);
    const lng = parseFloat(item.x_coord);
    return !isNaN(lat) && !isNaN(lng) && lat > 30 && lat < 40 && lng > 120 && lng < 135;
  }

  // 여행 코스 텍스트에서 경유지 배열 추출
  function parseRouteStops(excerpt) {
    const m = (excerpt || '').match(/여행 코스:\s*(.+?)(?:\s+여행 지역:|\s+방문지 유형:|$)/);
    if (!m) return [];
    return m[1].split('→').map(s => s.trim()).filter(Boolean);
  }

  // 여행 코스 텍스트에서 지역명 추출
  function parseRouteCity(excerpt) {
    const m = (excerpt || '').match(/여행 지역:\s*(.+?)(?:\s+방문지 유형:|\s+주요 이동수단:|$)/);
    return m ? m[1].trim() : '';
  }

  function renderTravelCitations(citations) {
    if (_travelMap) { _travelMap.remove(); _travelMap = null; }

    const withCoords = citations.filter(hasValidCoords);
    const VIS_ICON = {
      '관광지': '🏛', '음식점': '🍽', '숙박': '🏨', '쇼핑': '🛍',
      '문화시설': '🎭', '레저': '🎯', '스포츠': '⚽', '자연': '🌿',
      '역사': '🏯', '공원': '🌳', '관광사진 캡션': '📷', '여행 코스': '🗺',
    };

    let html = '';

    // ── 지도 패널 (항상 표시) ──────────────────────────────────────────
    html += `
      <div class="rounded-xl overflow-hidden border border-[#BAE0FF] mb-3 shadow-sm" style="height:220px;position:relative;">
        <div id="travelMap" style="height:100%;width:100%;"></div>
        <div class="absolute bottom-2 right-2 z-[400] rounded-lg bg-white/90 backdrop-blur px-2 py-1 text-[10px] text-[#555] shadow">
          © <a href="https://www.openstreetmap.org/copyright" target="_blank" class="text-[#5B9CFF]">OpenStreetMap</a>
        </div>
        ${withCoords.length === 0 ? `<div class="absolute top-2 left-1/2 -translate-x-1/2 z-[400] rounded-lg bg-white/90 backdrop-blur px-3 py-1 text-[11px] text-[#888] shadow whitespace-nowrap">📍 GPS 좌표 없음 — 아래 버튼으로 지도 연결</div>` : ''}
      </div>
    `;

    // ── 장소 카드 ──────────────────────────────────────────────
    html += citations.map((item, idx) => {
      const pName    = item.place_name || item.doc_id || `장소 ${idx + 1}`;
      const address  = item.source_spec || '';
      const visType  = item.vis_type || '';
      const stats    = parseTravelStats(item.excerpt);
      const coordsOk = hasValidCoords(item);
      const lat      = coordsOk ? parseFloat(item.y_coord) : null;
      const lng      = coordsOk ? parseFloat(item.x_coord) : null;
      const isRoute  = visType.includes('코스');

      // 루트 타입: 개별 경유지 파싱
      const routeStops = isRoute ? parseRouteStops(item.excerpt) : [];
      const cityStr    = isRoute ? (address || parseRouteCity(item.excerpt)) : address;
      // 지도 검색어: 좌표 없으면 첫 경유지 또는 장소명 사용
      const mapQuery   = isRoute ? (routeStops[0] || cityStr || pName) : (pName.length > 30 ? address || pName : pName);

      // 카카오맵: 좌표 있으면 위치 링크, 없으면 장소 검색 (map.kakao.com)
      const kakaoUrl = coordsOk
        ? `https://map.kakao.com/link/map/${encodeURIComponent(mapQuery)},${lat},${lng}`
        : `https://map.kakao.com/?q=${encodeURIComponent(mapQuery)}`;
      // 네이버지도: 좌표 있으면 좌표 이동, 없으면 검색
      const naverUrl = coordsOk
        ? `https://map.naver.com/v5/?lat=${lat}&lng=${lng}&zoom=16`
        : `https://map.naver.com/v5/search/${encodeURIComponent(mapQuery)}`;
      const imgUrl   = `https://search.naver.com/search.naver?query=${encodeURIComponent(mapQuery + ' 여행')}&where=image`;

      const typeIcon  = Object.entries(VIS_ICON).find(([k]) => visType.includes(k))?.[1] || '📍';
      const typeColor = isRoute ? '#7C3AED'
                      : visType.includes('캡션') ? '#0891B2'
                      : '#0EA5E9';

      // 루트 경유지 칩
      const routeChips = isRoute && routeStops.length > 0 ? `
        <div class="flex flex-wrap gap-1 items-center mb-2">
          ${routeStops.slice(0, 5).map((stop, i) => `
            ${i > 0 ? '<span class="text-[#CCC] text-[10px] select-none">→</span>' : ''}
            <a href="https://map.kakao.com/?q=${encodeURIComponent(stop)}" target="_blank" rel="noreferrer"
              class="rounded-full bg-[#F5F3FF] border border-[#DDD6FE] px-2 py-0.5 text-[10px] text-[#7C3AED] hover:bg-[#EDE9FE] transition">${escapeHtml(stop)}</a>
          `).join('')}
          ${routeStops.length > 5 ? `<span class="text-[10px] text-[#AAA]">+${routeStops.length - 5}곳</span>` : ''}
        </div>
      ` : '';

      const cardTitle = isRoute
        ? escapeHtml((routeStops.slice(0, 2).join(' → ')) || pName)
        : escapeHtml(pName);

      return `
        <article class="rounded-xl border border-[#EBEBEB] bg-white overflow-hidden hover:border-[#BAE0FF] hover:shadow-sm transition">
          <!-- 이미지/플레이스홀더 -->
          <div class="relative" style="height:110px;background:linear-gradient(135deg,${typeColor}18,${typeColor}35);">
            <img id="wikiimg-${idx}" src="" alt=""
              class="w-full h-full object-cover hidden"
              onerror="this.style.display='none';document.getElementById('ph-${idx}').style.display='flex'"/>
            <div id="ph-${idx}" class="absolute inset-0 flex flex-col items-center justify-center gap-1.5">
              <span class="text-3xl">${typeIcon}</span>
              <span class="text-[10px] font-medium text-white rounded-full px-2 py-0.5"
                style="background:${typeColor}bb">${escapeHtml(visType || '관광지')}</span>
            </div>
            <span class="absolute top-2 left-2 h-6 w-6 flex items-center justify-center rounded-full bg-white/90 backdrop-blur text-[11px] font-bold shadow"
              style="color:${typeColor}">${idx + 1}</span>
            ${coordsOk ? `<span class="absolute top-2 right-2 rounded-full bg-white/90 backdrop-blur px-2 py-0.5 text-[10px] font-medium text-[#0EA5E9]">📍 GPS</span>` : ''}
            ${cityStr && !coordsOk ? `<span class="absolute bottom-2 left-2 rounded-full bg-white/80 backdrop-blur px-2 py-0.5 text-[10px] text-[#555]">🗾 ${escapeHtml(cityStr)}</span>` : ''}
          </div>

          <!-- 정보 -->
          <div class="p-3">
            <div class="text-sm font-semibold text-[#1A1A1A] mb-1 leading-5" style="overflow:hidden;display:-webkit-box;-webkit-line-clamp:1;-webkit-box-orient:vertical">${cardTitle}</div>

            ${routeChips}

            ${!isRoute && address ? `
            <div class="flex items-start gap-1 mb-2">
              <svg class="h-3 w-3 shrink-0 text-[#AAA] mt-[2px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/>
                <path stroke-linecap="round" stroke-linejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/>
              </svg>
              <span class="text-[11px] text-[#777] leading-4">${escapeHtml(address)}</span>
            </div>` : ''}

            ${stats.length ? `
            <div class="flex flex-wrap gap-1 mb-2">
              ${stats.map(s => `<span class="rounded-full bg-[#F0F9FF] border border-[#BAE0FF] px-2 py-0.5 text-[10px] text-[#0369A1]">${escapeHtml(s)}</span>`).join('')}
            </div>` : ''}

            <!-- 외부 링크 버튼 -->
            <div class="flex gap-1.5 flex-wrap">
              <a href="${kakaoUrl}" target="_blank" rel="noreferrer"
                class="flex items-center gap-1 rounded-lg bg-[#FEE500] px-2.5 py-1.5 text-[11px] font-medium text-[#3C1E1E] hover:brightness-95 transition">
                🗺 카카오맵
              </a>
              <a href="${naverUrl}" target="_blank" rel="noreferrer"
                class="flex items-center gap-1 rounded-lg bg-[#03C75A] px-2.5 py-1.5 text-[11px] font-medium text-white hover:brightness-95 transition">
                N 네이버지도
              </a>
              <a href="${imgUrl}" target="_blank" rel="noreferrer"
                class="flex items-center gap-1 rounded-lg border border-[#E3E3E3] bg-[#F9FAFB] px-2.5 py-1.5 text-[11px] font-medium text-[#555] hover:bg-[#F0F0F0] transition">
                🖼 이미지
              </a>
            </div>
          </div>
        </article>
      `;
    }).join('');

    els.citations.innerHTML = html;

    // Wikipedia 이미지 비동기 로드 (루트는 첫 경유지, 그 외 장소명)
    citations.forEach((item, idx) => {
      const isRoute = (item.vis_type || '').includes('코스');
      const stops   = isRoute ? parseRouteStops(item.excerpt) : [];
      const name    = stops[0] || item.place_name;
      if (name) loadWikiImage(name, idx);
    });

    // Leaflet 지도 초기화 (항상 — 좌표 없으면 한국 전체 뷰)
    requestAnimationFrame(() => initTravelMap(withCoords));
  }

  async function loadWikiImage(placeName, idx) {
    const imgEl = document.getElementById(`wikiimg-${idx}`);
    const ph    = document.getElementById(`ph-${idx}`);
    if (!imgEl) return;
    try {
      const params = new URLSearchParams({
        action: 'query', titles: placeName, prop: 'pageimages',
        format: 'json', pithumbsize: '400', origin: '*',
      });
      const resp = await fetch(`https://ko.wikipedia.org/w/api.php?${params}`);
      if (!resp.ok) return;
      const data = await resp.json();
      const page = Object.values(data?.query?.pages || {})[0];
      if (page?.thumbnail?.source) {
        imgEl.src = page.thumbnail.source;
        imgEl.style.display = 'block';
        if (ph) ph.style.display = 'none';
      }
    } catch { /* silent fallback */ }
  }

  function initTravelMap(places) {
    if (typeof L === 'undefined') return;
    const mapEl = document.getElementById('travelMap');
    if (!mapEl) return;

    _travelMap = L.map('travelMap', { zoomControl: true, attributionControl: false });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18,
    }).addTo(_travelMap);

    // 좌표 없는 경우: 한국 전체 뷰
    if (!places || places.length === 0) {
      _travelMap.setView([36.5, 127.8], 7);
      return;
    }

    const bounds = [];
    places.forEach((p, i) => {
      const lat = parseFloat(p.y_coord);
      const lng = parseFloat(p.x_coord);

      const icon = L.divIcon({
        html: `<div style="background:#0EA5E9;color:#fff;border:2px solid #fff;border-radius:50%;width:26px;height:26px;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:bold;box-shadow:0 1px 5px rgba(0,0,0,.35)">${i + 1}</div>`,
        className: '',
        iconSize: [26, 26],
        iconAnchor: [13, 13],
      });

      const pName = p.place_name || p.doc_id || `장소 ${i + 1}`;
      L.marker([lat, lng], { icon })
        .addTo(_travelMap)
        .bindPopup(`<b>${escapeHtml(pName)}</b>${p.source_spec ? '<br><span style="font-size:11px;color:#666">' + escapeHtml(p.source_spec) + '</span>' : ''}`);
      bounds.push([lat, lng]);
    });

    if (bounds.length === 1) {
      _travelMap.setView(bounds[0], 14);
    } else {
      _travelMap.fitBounds(bounds, { padding: [20, 20] });
    }
  }

  // ── 응답 렌더링 ───────────────────────────────────────────────────
  function renderResponse(data) {
    const citations = Array.isArray(data?.citations) ? data.citations : [];
    const used      = data?.used_collection || '-';
    const isTravel  = isTravelCitations(citations);
    const answer    = formatAnswer(data?.answer || '응답이 비어 있습니다.', isTravel);

    els.answerBox.innerHTML = answer;
    els.answerBox.classList.add('answer-animate');
    els.usedCollectionBadge.textContent = `collection: ${used}`;
    els.citationCount.textContent       = `${citations.length}건`;
    els.citationCountPanel.textContent  = `${citations.length}건`;

    if (!citations.length) {
      if (_travelMap) { _travelMap.remove(); _travelMap = null; }
      els.citations.innerHTML = `
        <div class="rounded-xl border border-dashed border-[#E3E3E3] px-4 py-6 text-xs leading-6 text-[#BBB] text-center">
          조회된 근거가 없습니다.
        </div>`;
      return;
    }

    if (isTravel) {
      renderTravelCitations(citations);
    } else {
      if (_travelMap) { _travelMap.remove(); _travelMap = null; }
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
    }

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

  // ── DB현황 모달 ───────────────────────────────────────────────────

  function openDbModal() {
    els.dbModal.classList.remove('hidden');
    // 매번 열 때 최신 데이터 페치
    els.dbModalBody.innerHTML = `
      <div class="flex items-center justify-center py-10">
        <div class="dot-anim"><span></span><span></span><span></span></div>
        <span class="ml-3 text-sm text-[#888]">데이터 불러오는 중...</span>
      </div>`;
    fetchDbStatus();
  }

  function closeDbModal() {
    els.dbModal.classList.add('hidden');
  }

  async function fetchDbStatus() {
    try {
      const res  = await fetch(apiUrl('/api/travel-db-status'));
      const data = await res.json();
      if (data.error) {
        els.dbModalBody.innerHTML = `
          <div class="rounded-xl border border-[#FECACA] bg-[#FFF5F5] px-4 py-4 text-sm text-[#DC2626]">
            ⚠️ ${escapeHtml(data.error)}
          </div>`;
        return;
      }
      renderDbStatus(data);
    } catch (err) {
      els.dbModalBody.innerHTML = `
        <div class="rounded-xl border border-[#FECACA] bg-[#FFF5F5] px-4 py-4 text-sm text-[#DC2626]">
          ⚠️ 데이터를 불러오지 못했습니다: ${escapeHtml(err?.message || '')}
        </div>`;
    }
  }

  function renderDbStatus(d) {
    const travel   = d.travel  || {};
    const total    = travel.total   || 0;
    const route    = travel.route   || 0;
    const caption  = travel.caption || 0;
    const place    = travel.place   || 0;
    const pct = (n) => total > 0 ? Math.round(n / total * 100) : 0;
    const fmt = (n) => n.toLocaleString('ko-KR');

    // 비율 바 색상
    const BAR_COLORS = ['#0EA5E9', '#7C3AED', '#F59E0B'];

    const segments = [
      { label: '방문지·POI',    count: place,   color: BAR_COLORS[0], icon: '📍' },
      { label: '여행 코스',     count: route,   color: BAR_COLORS[1], icon: '🗺' },
      { label: '관광사진 캡션', count: caption, color: BAR_COLORS[2], icon: '📷' },
    ];

    // 비율 바 HTML
    const barSegments = segments
      .filter(s => s.count > 0)
      .map(s => `<div style="width:${pct(s.count)}%;background:${s.color};min-width:${s.count > 0 ? 4 : 0}px" class="h-full rounded-full transition-all"></div>`)
      .join('');

    els.dbModalBody.innerHTML = `

      <!-- 컬렉션 기본 정보 -->
      <div class="rounded-xl border border-[#E5E5E5] bg-[#FAFAFA] px-4 py-3">
        <div class="text-[11px] font-semibold uppercase tracking-widest text-[#AAA] mb-2">컬렉션 정보</div>
        <div class="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <div class="flex items-center gap-2">
            <span class="text-[#AAA] text-[11px] w-20 shrink-0">컬렉션</span>
            <code class="text-xs bg-[#F0F0F0] rounded px-1.5 py-0.5 text-[#333] font-mono">${escapeHtml(d.collection || '-')}</code>
          </div>
          <div class="flex items-center gap-2">
            <span class="text-[#AAA] text-[11px] w-20 shrink-0">전체 포인트</span>
            <span class="font-bold text-[#1A1A1A]">${fmt(d.total_points || 0)}</span>
          </div>
          <div class="flex items-center gap-2">
            <span class="text-[#AAA] text-[11px] w-20 shrink-0">벡터 차원</span>
            <span class="font-semibold text-[#333]">${d.vector_size || '-'}<span class="text-[11px] text-[#AAA] ml-0.5">dims</span></span>
          </div>
          <div class="flex items-center gap-2">
            <span class="text-[#AAA] text-[11px] w-20 shrink-0">거리 함수</span>
            <span class="rounded-full bg-[#EEF2FF] border border-[#C7D7FF] px-2 py-0.5 text-[11px] font-medium text-[#5B9CFF]">${escapeHtml(d.distance || '-')}</span>
          </div>
          <div class="col-span-2 flex items-start gap-2">
            <span class="text-[#AAA] text-[11px] w-20 shrink-0 mt-0.5">임베딩 모델</span>
            <code class="text-[11px] bg-[#F0F0F0] rounded px-1.5 py-0.5 text-[#555] font-mono break-all">${escapeHtml(d.embed_model || '-')}</code>
          </div>
        </div>
      </div>

      <!-- 여행 도메인 통계 -->
      <div class="rounded-xl border border-[#BAE0FF] bg-[#F0F9FF] px-4 py-4">
        <div class="flex items-center gap-2 mb-3">
          <span class="text-lg">✈️</span>
          <span class="text-[11px] font-semibold uppercase tracking-widest text-[#0369A1]">여행 도메인</span>
        </div>

        <!-- 총 포인트 큰 숫자 -->
        <div class="flex items-end gap-2 mb-4">
          <span class="text-4xl font-black text-[#0EA5E9] leading-none">${fmt(total)}</span>
          <span class="text-sm text-[#0369A1] mb-1">포인트</span>
          <span class="ml-auto text-[11px] text-[#0369A1]">전체의 ${pct(total)}%</span>
        </div>

        <!-- 비율 바 -->
        <div class="flex gap-0.5 h-3 rounded-full overflow-hidden bg-[#E0F2FE] mb-3">
          ${barSegments || '<div class="w-full h-full bg-[#E0F2FE]"></div>'}
        </div>

        <!-- 세그먼트 상세 -->
        <div class="grid grid-cols-3 gap-2">
          ${segments.map(s => `
            <div class="rounded-lg bg-white border border-[#E5E5E5] px-3 py-2.5 text-center">
              <div class="text-xl mb-0.5">${s.icon}</div>
              <div class="text-xs font-bold text-[#1A1A1A]">${fmt(s.count)}</div>
              <div class="text-[10px] text-[#888] leading-3 mt-0.5">${escapeHtml(s.label)}</div>
              <div class="mt-1 h-1 rounded-full" style="background:${s.color};opacity:0.4;width:${pct(s.count)}%;min-width:${s.count>0?8:0}px;margin:4px auto 0"></div>
              <div class="text-[10px] font-medium mt-0.5" style="color:${s.color}">${pct(s.count)}%</div>
            </div>
          `).join('')}
        </div>
      </div>

      <!-- 데이터 소스 -->
      <div class="rounded-xl border border-[#E5E5E5] bg-[#FAFAFA] px-4 py-3 flex items-start gap-3">
        <svg class="h-4 w-4 shrink-0 text-[#AAA] mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
        </svg>
        <div class="text-[11px] text-[#777] leading-5">
          <span class="font-semibold text-[#555]">데이터 출처:</span> AI Hub 한국관광 데이터셋 (개방데이터)<br>
          인제스트 스크립트: <code class="bg-[#F0F0F0] rounded px-1 font-mono">ingest_travel_qdrant.py</code> · <code class="bg-[#F0F0F0] rounded px-1 font-mono">ingest_travel_enrich_qdrant.py</code>
        </div>
      </div>

    `;
  }

  function formatText(value) {
    return escapeHtml(String(value || ''))
      .replace(/\n{2,}/g, '\n\n')
      .replace(/\n/g, '<br/>');
  }

  function formatAnswer(text, isTravel) {
    let s = escapeHtml(String(text || ''));
    // **bold** → <strong>
    s = s.replace(/\*\*(.*?)\*\*/g, '<strong class="font-semibold text-[#1A1A1A]">$1</strong>');
    // [숫자] citation badge
    s = s.replace(/\[(\d+)\]/g,
      '<span class="inline-flex items-center justify-center rounded-full bg-[#EEF2FF] border border-[#C7D7FF] px-1.5 text-[10px] font-bold text-[#5B9CFF] mx-0.5">$1</span>');
    if (isTravel) {
      // - 으로 시작하는 줄 → 예쁜 bullet
      s = s.replace(/^- (.+)$/gm,
        '<div class="flex gap-2 items-start py-0.5"><span style="color:#0EA5E9;margin-top:2px;flex-shrink:0">●</span><span>$1</span></div>');
    }
    s = s.replace(/\n{2,}/g, '<br/><br/>');
    s = s.replace(/\n/g, '<br/>');
    return s;
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
