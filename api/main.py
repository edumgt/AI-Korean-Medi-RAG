from __future__ import annotations

import json
import os
import re
from contextlib import asynccontextmanager
from collections import Counter
from pathlib import Path
from typing import Any, AsyncGenerator, Dict, List, Optional

from dotenv import load_dotenv
from fastapi import Depends, FastAPI
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from rapidfuzz import fuzz
from sqlalchemy import text as sa_text
from sqlalchemy.orm import Session

from .awssm import get_openai_api_key
from .db.sql import DocumentMeta, QueryLog, get_db, init_db
from .db.mongo import (
    bulk_upsert_doc_chunks,
    get_recent_query_logs,
    init_mongo_indexes,
    is_mongo_enabled,
    log_query_mongo,
    mongo_ping,
)
from .db.qdrant import (
    qdrant_ping,
    qdrant_point_count,
    qdrant_search,
    QDRANT_URL,
    QDRANT_COLLECTION,
)

load_dotenv()

DATA_PATH    = Path(os.environ.get("DOCS_PATH", "data/documents.jsonl")).expanduser().resolve()
LLM_PROVIDER = os.environ.get("LLM_PROVIDER", "none").lower()   # none | openai
OPENAI_MODEL = os.environ.get("OPENAI_MODEL", "gpt-4o-mini")
# Qdrant 를 기본 검색 엔진으로 사용. 연결 실패 시 in-memory BM25 로 폴백.
USE_QDRANT   = os.environ.get("USE_QDRANT", "true").lower() != "false"


# ── 애플리케이션 라이프사이클 ─────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """시작 시 DB 초기화, 종료 시 정리."""
    # SQLAlchemy 테이블 생성 (없으면)
    init_db()

    # MongoDB 인덱스 초기화
    await init_mongo_indexes()

    # JSONL 문서를 MongoDB 에 동기화 (MONGO_URL 설정 시)
    if is_mongo_enabled() and DOC_CHUNKS:
        await bulk_upsert_doc_chunks(DOC_CHUNKS)

    yield  # 서버 실행


app = FastAPI(title="Med-RAG MVP", version="0.2.0", lifespan=lifespan)


def normalize_collection_name(domain_name: str) -> str:
    s = (domain_name or "").strip()
    s = s.replace(" ", "_")
    s = "".join(ch if ch.isalnum() or ch in "_-" else "_" for ch in s)
    return f"med_{s.lower()}" if s else "med_all"


def chunk_text(text: str, max_chars: int = 1200, overlap: int = 120) -> List[str]:
    text = " ".join((text or "").split())
    if not text:
        return []
    if len(text) <= max_chars:
        return [text]
    chunks = []
    start = 0
    while start < len(text):
        end = min(len(text), start + max_chars)
        chunks.append(text[start:end])
        if end == len(text):
            break
        start = max(0, end - overlap)
    return chunks


def tokenize(text: str) -> set[str]:
    return {tok for tok in re.findall(r"[0-9A-Za-z가-힣]+", (text or "").lower()) if len(tok) >= 2}


def load_documents(path: Path) -> List[Dict[str, Any]]:
    if not path.exists():
        return []

    docs = []
    with path.open("r", encoding="utf-8") as f:
        for line in f:
            if not line.strip():
                continue
            row = json.loads(line)
            for idx, chunk in enumerate(chunk_text(row.get("text", ""))):
                docs.append(
                    {
                        "doc_id": str(row.get("doc_id") or "unknown"),
                        "domain_name": str(row.get("domain_name") or "unknown"),
                        "source_spec": row.get("source_spec"),
                        "creation_year": row.get("creation_year"),
                        "chunk_idx": idx,
                        "text": chunk,
                        "tokens": tokenize(chunk),
                    }
                )
    return docs


DOC_CHUNKS = load_documents(DATA_PATH)
# Qdrant 에 직접 인제스트된 도메인(JSONL 외)도 여기에 등록
EXTRA_DOMAINS = {"여행"}
KNOWN_COLLECTIONS = {"med_all"} | {
    normalize_collection_name(chunk["domain_name"]) for chunk in DOC_CHUNKS if chunk.get("domain_name")
} | {normalize_collection_name(d) for d in EXTRA_DOMAINS}


class AskRequest(BaseModel):
    query: str = Field(..., description="사용자 질문")
    domain: Optional[str] = Field(None, description="도메인(과) 폴더명. 없으면 전체 검색")
    top_k: int = Field(4, ge=1, le=10)


class Citation(BaseModel):
    doc_id: str
    domain_name: str
    source_spec: Optional[str] = None
    creation_year: Optional[str] = None
    excerpt: str


class AskResponse(BaseModel):
    answer: str
    citations: List[Citation]
    used_collection: str


class OpenAICheckRequest(BaseModel):
    enabled: bool = True
    model: Optional[str] = None
    qa_id: Optional[int] = None
    question: Optional[str] = None


class OpenAICheckResponse(BaseModel):
    ok: bool
    enabled: bool
    provider: str
    model: str
    key_source: str
    key_loaded: bool
    message: str


def collection_exists(name: str) -> bool:
    return name in KNOWN_COLLECTIONS


def _bm25_search(domain_name: Optional[str], query: str, top_k: int) -> List[Dict[str, Any]]:
    """In-memory BM25/fuzzy 폴백 검색."""
    q_tokens   = tokenize(query)
    query_norm = " ".join((query or "").split())

    candidates = DOC_CHUNKS
    if domain_name:
        candidates = [c for c in DOC_CHUNKS if c["domain_name"] == domain_name]

    scored = []
    for chunk in candidates:
        overlap     = len(q_tokens & chunk["tokens"])
        token_score = overlap * 20
        partial     = fuzz.partial_ratio(query_norm, chunk["text"]) if query_norm else 0
        score       = token_score + partial
        if score <= 0:
            continue
        scored.append({"score": float(score), "payload": chunk})

    scored.sort(key=lambda x: x["score"], reverse=True)
    return scored[:top_k]


async def search_chunks(domain_name: Optional[str], query: str, top_k: int) -> List[Dict[str, Any]]:
    """Qdrant 벡터 검색 우선, 실패 시 BM25 폴백."""
    if USE_QDRANT:
        try:
            results = await qdrant_search(query, domain_name, top_k)
            if results:
                return results
        except Exception as e:
            pass  # 폴백
    return _bm25_search(domain_name, query, top_k)


COUNSELING_DOMAINS = {"우울증", "불안장애", "중독", "일반군"}
TRAVEL_DOMAINS     = {"여행"}


def build_prompt(question: str, hits: List[Dict[str, Any]]) -> str:
    ctx = []
    domain_name   = hits[0]["payload"].get("domain_name", "") if hits else ""
    is_counseling = domain_name in COUNSELING_DOMAINS
    is_travel     = domain_name in TRAVEL_DOMAINS

    for i, h in enumerate(hits, start=1):
        pl = h["payload"]
        if is_travel:
            meta = f"[{i}] {pl.get('doc_id','')} | 주소: {pl.get('source_spec','')}"
        else:
            meta = (
                f"[{i}] doc_id={pl.get('doc_id')} "
                f"domain={pl.get('domain_name')} "
                f"source={pl.get('source_spec')} "
                f"year={pl.get('creation_year')}"
            )
        ctx.append(meta + "\n" + (pl.get("text") or ""))

    context_block = "\n\n".join(ctx)

    if is_travel:
        return f"""당신은 한국 여행 전문 에이전트입니다.
아래 '관광지 데이터'를 기반으로 사용자의 여행 질문에 친절하고 구체적으로 답하세요.

답변 규칙:
- 관광지명, 주소, 장소 유형, 만족도, 추천 의향, 평균 체류시간 등의 정보를 활용하세요.
- 추천 이유를 구체적으로 설명하세요 (예: 만족도 높음, 체류시간 적당 등).
- 가족여행/커플/혼자 등 여행 유형에 맞게 조언하세요.
- bullet 형식으로 2~5개 장소를 추천하세요.
- 마지막에 [참고 데이터]로 어떤 번호를 참고했는지 표시하세요.
- 데이터에 없는 정보는 추측하지 마세요.

[질문]
{question}

[관광지 데이터]
{context_block}
"""
    if is_counseling:
        return f"""당신은 심리상담 전문 문서 도우미입니다.
아래 '근거'(실제 상담 사례 요약 및 대화록)만 사용해서 질문에 답하세요.
- 근거에 없는 내용은 '근거 부족'이라고 말하세요.
- 내담자 프라이버시를 보호하며 익명으로 설명하세요.
- 답변은 간결하게, 핵심만 bullet로 작성하세요.
- 마지막에 [근거]로 어떤 번호를 참고했는지 표시하세요.
- 이 정보는 연구/교육 목적이며 전문 치료를 대체하지 않음을 명시하세요.

[질문]
{question}

[근거]
{context_block}
"""
    return f"""당신은 의료/법률 문서 도우미입니다.
아래 '근거'만 사용해서 질문에 답하세요.
- 근거에 없는 내용은 '근거 부족'이라고 말하세요.
- 답변은 간결하게, 핵심만 bullet로 작성하세요.
- 마지막에 [근거]로 어떤 번호를 참고했는지 표시하세요.

[질문]
{question}

[근거]
{context_block}
"""


def call_openai(prompt: str) -> str:
    import openai  # type: ignore

    api_key = get_openai_api_key()
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY is not set")

    openai.api_key = api_key

    resp = openai.chat.completions.create(
        model=OPENAI_MODEL,
        messages=[
            {"role": "system", "content": "You are a Korean document assistant. Use only provided evidence."},
            {"role": "user", "content": prompt},
        ],
        temperature=0.2,
    )
    return resp.choices[0].message.content.strip()


def fallback_answer(question: str, hits: List[Dict[str, Any]]) -> str:
    domain_name = hits[0]["payload"].get("domain_name", "") if hits else ""
    is_travel   = domain_name in TRAVEL_DOMAINS

    if is_travel:
        lines = ["(LLM 미설정) 관련 관광지 정보를 아래에서 확인하세요.", "", f"질문: {question}", "", "추천 관광지:"]
        for i, h in enumerate(hits, start=1):
            pl = h["payload"]
            name = pl.get("place_name") or pl.get("doc_id", f"장소{i}")
            addr = pl.get("address") or pl.get("source_spec") or ""
            t    = re.sub(r"\s+", " ", (pl.get("text") or "")).strip()
            lines.append(f"- [{i}] {name}")
            if addr:
                lines.append(f"       주소: {addr}")
            lines.append("       " + t[:200] + ("..." if len(t) > 200 else ""))
        lines.append("")
        lines.append("[참고 데이터] " + ", ".join(f"[{i}]" for i in range(1, len(hits) + 1)))
    else:
        lines = ["(LLM 미설정) 관련 근거를 아래에서 확인하세요.", "", f"질문: {question}", "", "핵심 근거:"]
        for i, h in enumerate(hits, start=1):
            t = re.sub(r"\s+", " ", (h["payload"].get("text") or "")).strip()
            lines.append(f"- [{i}] " + (t[:240] + ("..." if len(t) > 240 else "")))
        lines.append("")
        lines.append("[근거] " + ", ".join(f"[{i}]" for i in range(1, len(hits) + 1)))
    return "\n".join(lines)


@app.post("/ask", response_model=AskResponse)
async def ask(req: AskRequest, db: Session = Depends(get_db)):
    used = "med_all"
    domain_name = None
    success = True

    if req.domain:
        cand = normalize_collection_name(req.domain)
        if collection_exists(cand):
            used = cand
            domain_name = req.domain

    hits = await search_chunks(domain_name, req.query, req.top_k)

    citations = []
    for h in hits:
        pl = h["payload"]
        excerpt = re.sub(r"\s+", " ", (pl.get("text") or "").strip())
        citations.append(
            Citation(
                doc_id=str(pl.get("doc_id")),
                domain_name=str(pl.get("domain_name") or "unknown"),
                source_spec=pl.get("source_spec"),
                creation_year=pl.get("creation_year"),
                excerpt=excerpt[:480] + ("..." if len(excerpt) > 480 else ""),
            )
        )

    if not hits:
        answer = "관련 근거를 찾지 못했습니다."
        await _persist_query(db, req, used, answer, success=False)
        return AskResponse(answer=answer, citations=[], used_collection=used)

    prompt = build_prompt(req.query, hits)
    if LLM_PROVIDER == "openai":
        try:
            answer = call_openai(prompt)
        except Exception as e:
            success = False
            answer = (
                "(OpenAI 호출 실패로 근거 기반 요약으로 대체합니다.)\n\n"
                + fallback_answer(req.query, hits)
                + f"\n\n[오류] {str(e)}"
            )
    else:
        answer = fallback_answer(req.query, hits)

    # 심리상담 도메인 응답 시 면책 고지 추가
    if req.domain in COUNSELING_DOMAINS:
        answer = (
            "[※ 이 응답은 상담 연구 데이터 기반 정보 제공이며, 전문 치료를 대체하지 않습니다.]\n\n"
            + answer
        )

    await _persist_query(db, req, used, answer, success=success)

    return AskResponse(answer=answer, citations=citations, used_collection=used)


async def _persist_query(
    db: Session,
    req: AskRequest,
    used_collection: str,
    answer: str,
    success: bool = True,
) -> None:
    """질의 이력을 SQLAlchemy(동기) 와 MongoDB(비동기)에 동시 저장한다. 실패해도 요청을 막지 않는다."""
    _log_query_sql(db, req, used_collection, answer, success)
    await log_query_mongo(req.query, req.domain, used_collection, answer, req.top_k, LLM_PROVIDER, success=success)


def _log_query_sql(
    db: Session,
    req: AskRequest,
    used_collection: str,
    answer: str,
    success: bool = True,
) -> None:
    """SQLAlchemy 세션을 사용해 질의 이력을 저장한다. 실패해도 요청을 막지 않는다."""
    try:
        log = QueryLog(
            query=req.query,
            domain=req.domain,
            used_collection=used_collection,
            answer=answer[:2000],
            top_k=req.top_k,
            llm_provider=LLM_PROVIDER,
            success=success,
        )
        db.add(log)
        db.commit()
    except Exception:
        db.rollback()


@app.post("/api/openai-check", response_model=OpenAICheckResponse)
def openai_check(req: OpenAICheckRequest):
    if not req.enabled:
        return OpenAICheckResponse(
            ok=True,
            enabled=False,
            provider="openai",
            model=req.model or OPENAI_MODEL,
            key_source="disabled",
            key_loaded=False,
            message="OpenAI 사용 체크가 비활성화되어 있습니다.",
        )

    try:
        api_key = get_openai_api_key()
        model_name = (req.model or OPENAI_MODEL).strip() or OPENAI_MODEL
        key_source = "env" if os.getenv("OPENAI_API_KEY") else "aws-secrets-manager"
        if not api_key:
            raise RuntimeError("OPENAI_API_KEY is empty")

        return OpenAICheckResponse(
            ok=True,
            enabled=True,
            provider="openai",
            model=model_name,
            key_source=key_source,
            key_loaded=True,
            message="OpenAI API 키를 정상적으로 불러왔습니다.",
        )
    except Exception as e:
        return OpenAICheckResponse(
            ok=False,
            enabled=True,
            provider="openai",
            model=req.model or OPENAI_MODEL,
            key_source="unknown",
            key_loaded=False,
            message=f"OpenAI 체크 실패: {str(e)}",
        )


@app.get("/healthz")
async def healthz():
    qdrant_ok    = await qdrant_ping() if USE_QDRANT else None
    qdrant_count = await qdrant_point_count() if USE_QDRANT else None
    return {
        "ok": True,
        "docs_path":     str(DATA_PATH),
        "doc_chunks":    len(DOC_CHUNKS),
        "domains":       dict(Counter(chunk["domain_name"] for chunk in DOC_CHUNKS)),
        "llm_provider":  LLM_PROVIDER,
        "qdrant_url":    QDRANT_URL,
        "qdrant_ok":     qdrant_ok,
        "qdrant_points": qdrant_count,
        "search_engine": "qdrant" if (USE_QDRANT and qdrant_ok) else "bm25",
    }


class DbStatusResponse(BaseModel):
    sql_ok: bool
    sql_url: str
    mongo_enabled: bool
    mongo_ok: bool
    mongo_url: str


@app.get("/api/db-status", response_model=DbStatusResponse)
async def db_status(db: Session = Depends(get_db)):
    """SQLAlchemy 와 MongoDB 연결 상태를 반환한다."""
    from .db.sql import DATABASE_URL as SQL_URL
    from .db.mongo import MONGO_URL as _MONGO_URL

    # SQLAlchemy 헬스 체크
    sql_ok = False
    try:
        db.execute(sa_text("SELECT 1"))
        sql_ok = True
    except Exception:
        pass

    # MongoDB 헬스 체크
    mongo_ok = await mongo_ping()

    # URL 에서 비밀번호 마스킹
    def _mask(url: str) -> str:
        return re.sub(r"(://[^:@]+:)[^@]+(@)", r"\1***\2", url) if url else ""

    return DbStatusResponse(
        sql_ok=sql_ok,
        sql_url=_mask(SQL_URL),
        mongo_enabled=is_mongo_enabled(),
        mongo_ok=mongo_ok,
        mongo_url=_mask(_MONGO_URL),
    )


@app.get("/api/query-logs")
async def query_logs_recent(limit: int = 20):
    """최근 질의 이력을 MongoDB 에서 반환한다 (MongoDB 미설정 시 빈 배열)."""
    logs = await get_recent_query_logs(limit=min(limit, 100))
    return {"logs": logs, "count": len(logs)}


app.mount("/", StaticFiles(directory="web", html=True), name="web")
