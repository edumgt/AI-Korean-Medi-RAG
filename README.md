# Med-RAG MVP (의학 도메인 원천/라벨링 JSON → RAG + 자동평가)
 
## AI 학습 데이타는 AI Hub 공공기관 사이트에서 다운로드 가능합니다.

![alt text](image.png)

이 레포는 **의학/법률 도메인 문서 데이터**를 이용해,
- (1) 공통 스키마로 **정규화(JSONL)** 하고
- (2) 문서를 직접 읽는 **경량 텍스트 검색 API(FastAPI)** 를 제공하며
- (4) 라벨링 QA로 **자동 평가(Eval)** 를 돌릴 수 있는 MVP입니다.

> ✅ “폴더 = 도메인(과)” 구조를 그대로 활용하도록 설계했습니다.

---

## 0) 전제
- Python 3.11+
- Docker
- (선택) OpenAI API Key

---

## 1) 폴더 구조(권장)
아래처럼 두 루트를 둡니다. 하위 폴더는 과/도메인명으로 자유롭게 구성합니다.

```
DATA_ROOT/
  01.원천데이터/
    소아청소년과/
      cid_....json
    응급의학과/
      cid_....json
  02.라벨링데이터/
    소아청소년과/
      필수_....json
    내과/
      필수_....json
```

---

## 2) 빠른 시작(로컬)
### 2-1. 가상환경 + 의존성
```bash
python3 -m venv .venv
# windows: .venv\Scripts\activate
source .venv/bin/activate
pip install -U pip
pip install -r requirements.txt
```

### 2-2. 정규화(JSONL 생성)
```bash
python3 scripts/normalize.py --data-root DATA_ROOT --out-dir data
# 결과:
#   data/documents.jsonl
#   data/qas.jsonl
```

### 2-3. 문서 검증
```bash
python3 scripts/index_qdrant.py --docs data/documents.jsonl
```

### 2-4. API 실행
```bash
uvicorn api.main:app --reload --port 8000
```

테스트:
```bash
curl -X POST http://localhost:8000/ask \
  -H "Content-Type: application/json" \
  -d '{"query":"엑스레이 장치의 디레이팅 모드는 어떤 상황에서 활성화되나요?","domain":"01.의료"}'
```

---

## 3) LLM 설정(선택)
기본은 **LLM 없이** “근거 문단 + 간단 요약”을 반환합니다.
더 자연스러운 답변을 원하면 `.env`를 만들고 아래 중 하나를 사용하세요.

### 3-1. OpenAI
```env
LLM_PROVIDER=openai
OPENAI_API_KEY=...
OPENAI_MODEL=gpt-4o-mini
```

기본은 `LLM_PROVIDER=none` 이며, 이 경우 근거 중심 요약만 반환합니다.

---

## 4) 자동 평가(Eval)
라벨링 QA(JSONL)를 이용해 기본 성능을 점검합니다.

```bash
python3 eval/run_eval.py --qas data/qas.jsonl --out eval_report.json
```

---

