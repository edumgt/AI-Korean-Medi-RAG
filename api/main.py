from __future__ import annotations

import json
import os
import re
import hashlib
import math
from urllib import parse as urllib_parse, request as urllib_request
from collections import Counter
from pathlib import Path
from typing import Any, Dict, List, Optional

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from rapidfuzz import fuzz

from .awssm import get_openai_api_key

load_dotenv()

DATA_PATH = Path(os.environ.get("DOCS_PATH", "data/documents.jsonl")).expanduser().resolve()
LLM_PROVIDER = os.environ.get("LLM_PROVIDER", "none").lower()  # none | openai
OPENAI_MODEL = os.environ.get("OPENAI_MODEL", "gpt-4o-mini")

app = FastAPI(title="Med-RAG MVP", version="0.2.0")


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
KNOWN_COLLECTIONS = {"med_all"} | {
    normalize_collection_name(chunk["domain_name"]) for chunk in DOC_CHUNKS if chunk.get("domain_name")
}


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


def search_chunks(domain_name: Optional[str], query: str, top_k: int) -> List[Dict[str, Any]]:
    q_tokens = tokenize(query)
    query_norm = " ".join((query or "").split())

    candidates = DOC_CHUNKS
    if domain_name:
        candidates = [chunk for chunk in DOC_CHUNKS if chunk["domain_name"] == domain_name]

    scored = []
    for chunk in candidates:
        excerpt = chunk["text"]
        overlap = len(q_tokens & chunk["tokens"])
        token_score = overlap * 20
        partial = fuzz.partial_ratio(query_norm, excerpt) if query_norm else 0
        score = token_score + partial
        if score <= 0:
            continue
        scored.append({"score": float(score), "payload": chunk})

    scored.sort(key=lambda item: item["score"], reverse=True)
    return scored[:top_k]


def build_prompt(question: str, hits: List[Dict[str, Any]]) -> str:
    ctx = []
    for i, h in enumerate(hits, start=1):
        pl = h["payload"]
        meta = (
            f"[{i}] doc_id={pl.get('doc_id')} "
            f"domain={pl.get('domain_name')} "
            f"source={pl.get('source_spec')} "
            f"year={pl.get('creation_year')}"
        )
        ctx.append(meta + "\n" + (pl.get("text") or ""))

    context_block = "\n\n".join(ctx)
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
    lines = ["(LLM 미설정) 관련 근거를 아래에서 확인하세요.", "", "질문: " + question, "", "핵심 근거:"]
    for i, h in enumerate(hits, start=1):
        t = re.sub(r"\s+", " ", (h["payload"].get("text") or "")).strip()
        lines.append(f"- [{i}] " + (t[:240] + ("..." if len(t) > 240 else "")))
    lines.append("")
    lines.append("[근거] " + ", ".join(f"[{i}]" for i in range(1, len(hits) + 1)))
    return "\n".join(lines)


@app.post("/ask", response_model=AskResponse)
def ask(req: AskRequest):
    used = "med_all"
    domain_name = None

    if req.domain:
        cand = normalize_collection_name(req.domain)
        if collection_exists(cand):
            used = cand
            domain_name = req.domain

    hits = search_chunks(domain_name, req.query, req.top_k)

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
        return AskResponse(answer="관련 근거를 찾지 못했습니다.", citations=[], used_collection=used)

    prompt = build_prompt(req.query, hits)
    if LLM_PROVIDER == "openai":
        try:
            answer = call_openai(prompt)
        except Exception as e:
            answer = (
                "(OpenAI 호출 실패로 근거 기반 요약으로 대체합니다.)\n\n"
                + fallback_answer(req.query, hits)
                + f"\n\n[오류] {str(e)}"
            )
    else:
        answer = fallback_answer(req.query, hits)

    return AskResponse(answer=answer, citations=citations, used_collection=used)


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
def healthz():
    return {
        "ok": True,
        "docs_path": str(DATA_PATH),
        "doc_chunks": len(DOC_CHUNKS),
        "domains": dict(Counter(chunk["domain_name"] for chunk in DOC_CHUNKS)),
        "llm_provider": LLM_PROVIDER,
    }


app.mount("/", StaticFiles(directory="web", html=True), name="web")

def collection_exists(name: str) -> bool:
    return True


def hashed_embedding(text: str, dim: int = 384) -> List[float]:
    vec = [0.0] * dim
    for token in re.findall(r"[0-9A-Za-z가-힣]+", (text or "").lower()):
        if len(token) < 2:
            continue
        digest = hashlib.sha256(token.encode("utf-8")).digest()
        idx = int.from_bytes(digest[:4], "big") % dim
        sign = -1.0 if digest[4] % 2 else 1.0
        weight = 1.0 + (digest[5] / 255.0)
        vec[idx] += sign * weight
    norm = math.sqrt(sum(v * v for v in vec))
    return vec if norm == 0 else [v / norm for v in vec]


def qdrant_hits(collection_name: str, query: str, top_k: int) -> List[Dict[str, Any]]:
    url = os.environ.get("QDRANT_URL", "http://qdrant:6333")
    path = urllib_parse.quote(collection_name, safe="")
    body = json.dumps({"vector": hashed_embedding(query), "limit": top_k, "with_payload": True}).encode("utf-8")
    req = urllib_request.Request(
        f"{url}/collections/{path}/points/search",
        data=body,
        headers={"Content-Type": "application/json"},
    )
    try:
        with urllib_request.urlopen(req, timeout=10) as resp:
            data = json.load(resp)
    except Exception:
        return []
    hits = []
    for item in data.get("result", []):
        hits.append({"score": float(item.get("score") or 0.0), "payload": item.get("payload") or {}})
    return hits


def search_chunks(domain_name: Optional[str], query: str, top_k: int) -> List[Dict[str, Any]]:
    if domain_name:
        hits = qdrant_hits(normalize_collection_name(domain_name), query, top_k)
        if hits:
            return hits
    return qdrant_hits("med_all", query, top_k)
