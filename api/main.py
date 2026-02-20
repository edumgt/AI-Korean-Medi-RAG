from __future__ import annotations
import os, re, json
from typing import Optional, List, Dict, Any

import numpy as np
from fastapi import FastAPI
from pydantic import BaseModel, Field
from dotenv import load_dotenv
from qdrant_client import QdrantClient
from qdrant_client.http import models as rest
from sentence_transformers import SentenceTransformer
import requests

load_dotenv()

QDRANT_URL = os.environ.get("QDRANT_URL", "http://localhost:6333")
EMBED_MODEL = os.environ.get("EMBED_MODEL", "intfloat/multilingual-e5-small")

LLM_PROVIDER = os.environ.get("LLM_PROVIDER", "none").lower()  # none | ollama | openai
OLLAMA_BASE_URL = os.environ.get("OLLAMA_BASE_URL", "http://localhost:11434")
OLLAMA_MODEL = os.environ.get("OLLAMA_MODEL", "llama3.1")

OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY")
OPENAI_MODEL = os.environ.get("OPENAI_MODEL", "gpt-4o-mini")

app = FastAPI(title="Med-RAG MVP", version="0.1.0")

client = QdrantClient(url=QDRANT_URL)
embedder = SentenceTransformer(EMBED_MODEL)

def normalize_collection_name(domain_name: str) -> str:
    s = (domain_name or "").strip()
    s = s.replace(" ", "_")
    s = "".join(ch if ch.isalnum() or ch in "_-" else "_" for ch in s)
    if not s:
        s = "unknown"
    return f"med_{s.lower()}"

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

def embed_query(q: str) -> List[float]:
    vec = embedder.encode(["query: " + q], normalize_embeddings=True)
    return vec[0].tolist()

def collection_exists(name: str) -> bool:
    cols = client.get_collections().collections
    return any(c.name == name for c in cols)

def search_chunks(collection: str, qvec: List[float], top_k: int) -> List[Dict[str, Any]]:
    res = client.search(
        collection_name=collection,
        query_vector=qvec,
        limit=top_k,
        with_payload=True,
    )
    hits = []
    for p in res:
        payload = p.payload or {}
        hits.append({
            "score": float(p.score),
            "payload": payload,
        })
    return hits

def build_prompt(question: str, hits: List[Dict[str, Any]]) -> str:
    ctx = []
    for i, h in enumerate(hits, start=1):
        pl = h["payload"]
        meta = f"[{i}] doc_id={pl.get('doc_id')} domain={pl.get('domain_name')} source={pl.get('source_spec')} year={pl.get('creation_year')}"
        ctx.append(meta + "\n" + (pl.get("text") or ""))
    context_block = "\n\n".join(ctx)
    return f"""당신은 의료 지식 도우미입니다.
아래 '근거'만 사용해서 질문에 답하세요.
- 근거에 없는 내용은 '근거 부족'이라고 말하세요.
- 답변은 간결하게, 핵심만 bullet로 작성하세요.
- 마지막에 [근거]로 어떤 번호를 참고했는지 표시하세요.

[질문]
{question}

[근거]
{context_block}
"""

def call_ollama(prompt: str) -> str:
    # /api/generate
    url = OLLAMA_BASE_URL.rstrip("/") + "/api/generate"
    payload = {"model": OLLAMA_MODEL, "prompt": prompt, "stream": False}
    r = requests.post(url, json=payload, timeout=120)
    r.raise_for_status()
    return r.json().get("response","").strip()

def call_openai(prompt: str) -> str:
    # minimal chat.completions (OpenAI compatible)
    # NOTE: 실제 OpenAI 호출은 네트워크 환경에서 동작.
    import openai  # type: ignore
    if not OPENAI_API_KEY:
        raise RuntimeError("OPENAI_API_KEY is not set")
    openai.api_key = OPENAI_API_KEY
    resp = openai.chat.completions.create(
        model=OPENAI_MODEL,
        messages=[
            {"role":"system","content":"You are a medical knowledge assistant. Use only provided evidence."},
            {"role":"user","content":prompt},
        ],
        temperature=0.2,
    )
    return resp.choices[0].message.content.strip()

def fallback_answer(question: str, hits: List[Dict[str, Any]]) -> str:
    # LLM이 없을 때: 상위 근거 일부를 간단 요약 형태로 반환
    lines = ["(LLM 미설정) 관련 근거를 아래에서 확인하세요.", "", "질문: " + question, "", "핵심 근거:"]
    for i, h in enumerate(hits, start=1):
        t = (h["payload"].get("text") or "")
        t = re.sub(r"\s+", " ", t).strip()
        lines.append(f"- [{i}] " + (t[:240] + ("..." if len(t)>240 else "")))
    lines.append("")
    lines.append("[근거] " + ", ".join([f"[{i}]" for i in range(1, len(hits)+1)]))
    return "\n".join(lines)

@app.post("/ask", response_model=AskResponse)
def ask(req: AskRequest):
    qvec = embed_query(req.query)

    used = "med_all"
    if req.domain:
        cand = normalize_collection_name(req.domain)
        if collection_exists(cand):
            used = cand

    hits = search_chunks(used, qvec, req.top_k)

    citations = []
    for h in hits:
        pl = h["payload"]
        excerpt = (pl.get("text") or "").strip()
        excerpt = re.sub(r"\s+", " ", excerpt)
        citations.append(Citation(
            doc_id=str(pl.get("doc_id")),
            domain_name=str(pl.get("domain_name") or "unknown"),
            source_spec=pl.get("source_spec"),
            creation_year=pl.get("creation_year"),
            excerpt=excerpt[:480] + ("..." if len(excerpt) > 480 else "")
        ))

    if not hits:
        return AskResponse(answer="관련 근거를 찾지 못했습니다.", citations=[], used_collection=used)

    prompt = build_prompt(req.query, hits)

    if LLM_PROVIDER == "ollama":
        answer = call_ollama(prompt)
    elif LLM_PROVIDER == "openai":
        answer = call_openai(prompt)
    else:
        answer = fallback_answer(req.query, hits)

    return AskResponse(answer=answer, citations=citations, used_collection=used)

@app.get("/healthz")
def healthz():
    return {"ok": True, "qdrant": QDRANT_URL, "embed_model": EMBED_MODEL, "llm_provider": LLM_PROVIDER}

from fastapi.staticfiles import StaticFiles
app.mount("/", StaticFiles(directory="web", html=True), name="web")