# Web (Vanilla JS + Tailwind)

정적 웹 페이지에서 FastAPI `/ask` 엔드포인트로 질의합니다.

## 실행 방법

### A) FastAPI가 같은 Origin에서 정적 호스팅하는 경우 (권장)
- `web/` 폴더를 FastAPI에서 정적 서빙하도록 마운트하면 CORS 이슈가 없습니다.
- 이 레포의 백엔드에 아래처럼 추가하면 됩니다(선택):

```python
from fastapi.staticfiles import StaticFiles
app.mount("/", StaticFiles(directory="web", html=True), name="web")
```

### B) 따로 띄우는 경우
웹만 따로 띄우면 API와 Origin이 달라져 CORS가 필요합니다.
- `web/index.html` 상단의 **API 설정**에서 `http://localhost:8000` 같은 API Base URL을 입력하세요.
- 백엔드에 CORS 허용이 필요할 수 있습니다.

간단 정적 서버:
```bash
cd web
python3 -m http.server 5173
# http://localhost:5173
```

## 화면 기능
- 도메인 선택(폴더명 기준)
- 질문 입력/Enter 실행
- 답변 + 근거(출처/연도/문단) 카드 표시
- 최근 히스토리 (localStorage 저장)
