FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    SENTENCE_TRANSFORMERS_HOME=/app/.model_cache

WORKDIR /app

COPY requirements.txt .
RUN pip install --upgrade pip \
    && pip install -r requirements.txt

# 임베딩 모델을 빌드 시점에 미리 다운로드 (시작 시 지연 방지)
# RUN python -c "\
# from sentence_transformers import SentenceTransformer; \
# SentenceTransformer('paraphrase-multilingual-MiniLM-L12-v2')"

COPY api ./api
COPY web ./web
COPY data ./data

EXPOSE 8000

CMD ["uvicorn", "api.main:app", "--host", "0.0.0.0", "--port", "8000"]
