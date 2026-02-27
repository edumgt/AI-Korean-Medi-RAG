(() => {
  'use strict';

  const $ = (sel) => document.querySelector(sel);
  const LS_KEY = 'med_quiz_mvp_web_v1';
  const OPENAI_CHECK_PATH = '/api/openai-check';

  const quiz = {
    qa_id: 330,
    domain: 11,
    q_type: 1,
    question: `콜린에스테라제 억제제 투여 후 나타날 수 있는 폐 관련 부작용으로 가장 적절한 것은 무엇입니까?\n1) 폐경색\n2) 기도 협착\n3) 기관지 경련\n4) 흉수\n5) 폐부종`,
    answer: '3) 기관지 경련'
  };

  const state = loadState();

  const els = {
    badgeQaId: $('#badgeQaId'),
    badgeDomain: $('#badgeDomain'),
    badgeType: $('#badgeType'),
    questionText: $('#questionText'),
    choices: $('#choices'),
    answer: $('#answer'),
    badgeMode: $('#badgeMode'),
    rawJson: $('#rawJson'),
    status: $('#status'),
    btnToggleAnswer: $('#btnToggleAnswer'),
    btnResetView: $('#btnResetView'),
    btnSettings: $('#btnSettings'),
    btnHealth: $('#btnHealth'),
    modal: $('#modal'),
    btnClose: $('#btnClose'),
    apiBase: $('#apiBase'),
    useOpenAI: $('#useOpenAI'),
    openAiModel: $('#openAiModel'),
    btnSave: $('#btnSave'),
    btnReset: $('#btnReset'),
    badgeOpenAi: $('#badgeOpenAi'),
    openAiSummary: $('#openAiSummary'),
    openAiEnabledText: $('#openAiEnabledText'),
    openAiModelText: $('#openAiModelText'),
    openAiEndpointText: $('#openAiEndpointText'),
    btnCheckOpenAI: $('#btnCheckOpenAI'),
    btnClearOpenAI: $('#btnClearOpenAI'),
  };

  let parsed = parseQuestion(quiz.question);
  let isAnswerVisible = false;
  let openAiCheckResult = null;

  init();

  function init() {
    els.apiBase.value = state.apiBase || '';
    els.useOpenAI.checked = Boolean(state.useOpenAI);
    els.openAiModel.value = state.openAiModel || 'gpt-5.2-thinking';

    renderQuiz();
    renderAnswer();
    renderOpenAIState();
    updateHealthHref();

    els.btnToggleAnswer.addEventListener('click', toggleAnswer);
    els.btnResetView.addEventListener('click', hideAnswer);

    els.btnSettings.addEventListener('click', openModal);
    els.btnClose.addEventListener('click', closeModal);
    els.modal.addEventListener('click', (e) => {
      if (e.target === els.modal) closeModal();
    });

    els.btnSave.addEventListener('click', () => {
      state.apiBase = (els.apiBase.value || '').trim();
      state.useOpenAI = Boolean(els.useOpenAI.checked);
      state.openAiModel = (els.openAiModel.value || '').trim() || 'gpt-5.2-thinking';
      persistState();
      updateHealthHref();
      renderOpenAIState();
      closeModal();
      toast('설정을 저장했습니다.');
    });

    els.btnReset.addEventListener('click', () => {
      state.apiBase = '';
      state.useOpenAI = false;
      state.openAiModel = 'gpt-5.2-thinking';
      els.apiBase.value = '';
      els.useOpenAI.checked = false;
      els.openAiModel.value = 'gpt-5.2-thinking';
      openAiCheckResult = null;
      persistState();
      updateHealthHref();
      renderOpenAIState();
      toast('설정을 초기화했습니다.');
    });

    els.btnCheckOpenAI.addEventListener('click', checkOpenAI);
    els.btnClearOpenAI.addEventListener('click', () => {
      openAiCheckResult = null;
      renderOpenAIState();
      toast('OpenAI 체크 결과를 지웠습니다.');
    });
  }

  function renderQuiz() {
    els.badgeQaId.textContent = `qa_id: ${quiz.qa_id}`;
    els.badgeDomain.textContent = `domain: ${quiz.domain}`;
    els.badgeType.textContent = `q_type: ${quiz.q_type}`;
    els.questionText.textContent = parsed.stem;
    els.rawJson.textContent = JSON.stringify(quiz, null, 2);
    renderChoices();
  }

  function renderChoices() {
    const correct = normalize(quiz.answer);

    els.choices.innerHTML = parsed.choices.map((choice) => {
      const isCorrect = normalize(choice) === correct;
      const baseClass = 'rounded-2xl border p-4 transition';
      const stateClass = isAnswerVisible && isCorrect
        ? 'border-emerald-300 bg-emerald-50'
        : 'border-slate-200 bg-white';

      return `
        <div class="${baseClass} ${stateClass}">
          <div class="flex items-start gap-3">
            <div class="mt-0.5 h-5 w-5 shrink-0 rounded-full border ${isAnswerVisible && isCorrect ? 'border-emerald-500 bg-emerald-500' : 'border-slate-300'}"></div>
            <div class="flex-1">
              <div class="text-sm font-medium text-slate-900">${escapeHtml(choice)}</div>
              ${isAnswerVisible && isCorrect ? '<div class="mt-2 text-xs font-semibold text-emerald-700">정답 선택지</div>' : ''}
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  function toggleAnswer() {
    isAnswerVisible = !isAnswerVisible;
    renderAnswer();
    renderChoices();
    toast(isAnswerVisible ? '정답을 표시했습니다.' : '정답을 숨겼습니다.');
  }

  function hideAnswer() {
    isAnswerVisible = false;
    renderAnswer();
    renderChoices();
    toast('정답을 숨겼습니다.');
  }

  function renderAnswer() {
    if (!isAnswerVisible) {
      els.badgeMode.textContent = 'hidden';
      els.badgeMode.className = 'ml-auto text-xs rounded-full bg-slate-100 px-2 py-1 text-slate-600';
      els.answer.innerHTML = '정답 보기 버튼을 누르면 정답이 표시됩니다.';
      els.btnToggleAnswer.textContent = '정답 보기';
      return;
    }

    els.badgeMode.textContent = 'revealed';
    els.badgeMode.className = 'ml-auto text-xs rounded-full bg-emerald-100 px-2 py-1 text-emerald-700';
    els.answer.innerHTML = `
      <div class="rounded-2xl border border-emerald-300 bg-emerald-50 p-4">
        <div class="text-xs font-semibold text-emerald-700">정답</div>
        <div class="mt-2 text-base font-semibold text-slate-900">${escapeHtml(quiz.answer)}</div>
      </div>
    `;
    els.btnToggleAnswer.textContent = '정답 숨기기';
  }

  function renderOpenAIState() {
    const enabled = Boolean(state.useOpenAI);
    const endpoint = apiUrl(OPENAI_CHECK_PATH);

    els.openAiEnabledText.textContent = enabled ? '활성화' : '비활성화';
    els.openAiModelText.textContent = state.openAiModel || 'gpt-5.2-thinking';
    els.openAiEndpointText.textContent = endpoint;
    els.btnCheckOpenAI.disabled = false;
    els.btnCheckOpenAI.className = 'rounded-xl bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-800';

    if (!enabled) {
      els.badgeOpenAi.textContent = 'disabled';
      els.badgeOpenAi.className = 'ml-auto text-xs rounded-full bg-slate-100 px-2 py-1 text-slate-600';
      els.openAiSummary.innerHTML = `
        <div class="font-medium text-slate-900">OpenAI 사용 체크가 비활성화되어 있습니다.</div>
        <div class="mt-2 text-sm text-slate-600">API 설정에서 <b>OpenAI 사용 체크 활성화</b>를 켜면, <code class="rounded bg-white px-1 py-0.5 text-xs">${escapeHtml(endpoint)}</code> 로 확인 요청을 보냅니다.</div>
      `;
      return;
    }

    if (!openAiCheckResult) {
      els.badgeOpenAi.textContent = 'ready';
      els.badgeOpenAi.className = 'ml-auto text-xs rounded-full bg-blue-100 px-2 py-1 text-blue-700';
      els.openAiSummary.innerHTML = `
        <div class="font-medium text-slate-900">OpenAI 체크를 실행할 준비가 되었습니다.</div>
        <div class="mt-2 text-sm text-slate-600">버튼을 누르면 <code class="rounded bg-white px-1 py-0.5 text-xs">${escapeHtml(endpoint)}</code> 로 모델 <b>${escapeHtml(state.openAiModel || 'gpt-5.2-thinking')}</b> 확인 요청을 보냅니다.</div>
      `;
      return;
    }

    if (openAiCheckResult.loading) {
      els.badgeOpenAi.textContent = 'checking';
      els.badgeOpenAi.className = 'ml-auto text-xs rounded-full bg-amber-100 px-2 py-1 text-amber-700';
      els.openAiSummary.innerHTML = `
        <div class="font-medium text-slate-900">OpenAI 사용 상태를 확인 중입니다...</div>
        <div class="mt-2 text-sm text-slate-600">엔드포인트: <code class="rounded bg-white px-1 py-0.5 text-xs">${escapeHtml(endpoint)}</code></div>
      `;
      els.btnCheckOpenAI.disabled = true;
      els.btnCheckOpenAI.className = 'rounded-xl bg-slate-300 px-4 py-2 text-sm text-white cursor-not-allowed';
      return;
    }

    if (openAiCheckResult.ok) {
      els.badgeOpenAi.textContent = 'connected';
      els.badgeOpenAi.className = 'ml-auto text-xs rounded-full bg-emerald-100 px-2 py-1 text-emerald-700';
      els.openAiSummary.innerHTML = `
        <div class="font-medium text-slate-900">OpenAI 체크가 정상 응답했습니다.</div>
        <div class="mt-2 text-sm text-slate-700">${escapeHtml(openAiCheckResult.message || '백엔드에서 OpenAI 사용 가능 상태를 반환했습니다.')}</div>
        <div class="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800">
          model: ${escapeHtml(openAiCheckResult.model || state.openAiModel || 'gpt-5.2-thinking')}
        </div>
      `;
      return;
    }

    els.badgeOpenAi.textContent = 'failed';
    els.badgeOpenAi.className = 'ml-auto text-xs rounded-full bg-red-100 px-2 py-1 text-red-700';
    els.openAiSummary.innerHTML = `
      <div class="font-medium text-slate-900">OpenAI 체크에 실패했습니다.</div>
      <div class="mt-2 text-sm text-red-700">${escapeHtml(openAiCheckResult.message || '엔드포인트 응답을 확인하세요.')}</div>
      <div class="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">
        예상 엔드포인트: ${escapeHtml(endpoint)}<br />
        예상 응답 예시: { "ok": true, "message": "OpenAI key loaded", "model": "gpt-5.2-thinking" }
      </div>
    `;
  }

  async function checkOpenAI() {
    if (!state.useOpenAI) {
      openAiCheckResult = {
        ok: false,
        message: 'OpenAI 사용 체크가 꺼져 있습니다. API 설정에서 먼저 활성화하세요.'
      };
      renderOpenAIState();
      setStatus(openAiCheckResult.message, true);
      return;
    }

    openAiCheckResult = { loading: true };
    renderOpenAIState();
    setStatus('OpenAI 사용 상태를 확인하는 중입니다...', false);

    try {
      const res = await fetch(apiUrl(OPENAI_CHECK_PATH), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          enabled: true,
          model: state.openAiModel || 'gpt-5.2-thinking',
          qa_id: quiz.qa_id,
          question: parsed.stem
        })
      });

      let data = null;
      const text = await res.text();

      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        data = { message: text };
      }

      if (!res.ok) {
        throw new Error(data?.detail || data?.message || `HTTP ${res.status}`);
      }

      openAiCheckResult = {
        ok: Boolean(data?.ok ?? true),
        message: data?.message || data?.detail || 'OpenAI 체크 요청이 정상 처리되었습니다.',
        model: data?.model || state.openAiModel || 'gpt-5.2-thinking'
      };

      if (!openAiCheckResult.ok) {
        throw new Error(openAiCheckResult.message || 'OpenAI 체크 실패');
      }

      renderOpenAIState();
      setStatus('OpenAI 체크가 완료되었습니다.', false);
    } catch (err) {
      openAiCheckResult = {
        ok: false,
        message: err?.message || 'OpenAI 체크 요청에 실패했습니다.'
      };
      renderOpenAIState();
      setStatus(openAiCheckResult.message, true);
    }
  }

  function parseQuestion(raw) {
    const lines = String(raw || '')
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);

    const choicePattern = /^\d+\)\s*/;
    const firstChoiceIndex = lines.findIndex((line) => choicePattern.test(line));

    if (firstChoiceIndex === -1) {
      return { stem: String(raw || '').trim(), choices: [] };
    }

    return {
      stem: lines.slice(0, firstChoiceIndex).join(' ').trim(),
      choices: lines.slice(firstChoiceIndex),
    };
  }

  function normalize(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function apiUrl(path) {
    const base = (state.apiBase || '').trim();
    if (!base) return path;
    return base.replace(/\/+$/, '') + path;
  }

  function updateHealthHref() {
    els.btnHealth.href = apiUrl('/healthz');
    els.btnHealth.target = '_blank';
    els.btnHealth.rel = 'noreferrer';
  }

  function openModal() {
    els.modal.classList.remove('hidden');
    els.apiBase.focus();
  }

  function closeModal() {
    els.modal.classList.add('hidden');
  }

  function setStatus(msg, isError) {
    if (!msg) {
      els.status.classList.add('hidden');
      return;
    }

    els.status.classList.remove('hidden');
    els.status.textContent = msg;
    els.status.className = 'mt-4 rounded-xl border px-3 py-2 text-sm';
    if (isError) {
      els.status.classList.add('border-red-200', 'bg-red-50', 'text-red-700');
    } else {
      els.status.classList.add('border-slate-200', 'bg-slate-50', 'text-slate-700');
    }
  }

  function toast(msg) {
    setStatus(msg, false);
    window.clearTimeout(toast._t);
    toast._t = window.setTimeout(() => setStatus('', false), 2200);
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      const parsedState = raw ? JSON.parse(raw) : {};
      return {
        apiBase: parsedState.apiBase || '',
        useOpenAI: Boolean(parsedState.useOpenAI),
        openAiModel: parsedState.openAiModel || 'gpt-5.2-thinking',
      };
    } catch {
      return {
        apiBase: '',
        useOpenAI: false,
        openAiModel: 'gpt-5.2-thinking',
      };
    }
  }

  function persistState() {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(state));
    } catch {
      setStatus('로컬 저장소에 저장하지 못했습니다.', true);
    }
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
