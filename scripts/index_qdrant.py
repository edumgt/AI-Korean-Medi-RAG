#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
documents.jsonl -> Qdrant 적재(도메인별 + 전체)

- 청킹: 단순 문장 단위 기반(길이 기반)
- 임베딩: sentence-transformers (기본: intfloat/multilingual-e5-small)
"""
from __future__ import annotations
import argparse, hashlib, json, os
from pathlib import Path
from typing import List, Dict, Iterable

import numpy as np
from tqdm import tqdm
from qdrant_client import QdrantClient
from qdrant_client.http import models as rest
from sentence_transformers import SentenceTransformer

DEFAULT_MODEL = os.environ.get("EMBED_MODEL", "intfloat/multilingual-e5-small")
QDRANT_URL = os.environ.get("QDRANT_URL", "http://localhost:6333")

def load_jsonl(path: Path) -> List[Dict]:
    rows = []
    with path.open("r", encoding="utf-8") as f:
        for line in f:
            if line.strip():
                rows.append(json.loads(line))
    return rows

def normalize_collection_name(domain_name: str) -> str:
    # qdrant collection은 영문/숫자/underscore가 안전
    s = domain_name.strip()
    s = s.replace(" ", "_")
    s = "".join(ch if ch.isalnum() or ch in "_-" else "_" for ch in s)
    if not s:
        s = "unknown"
    return f"med_{s.lower()}"

def chunk_text(text: str, max_chars: int = 1400, overlap: int = 150) -> List[str]:
    """
    토큰 라이브러리 없이 간단히 chars 기반 청킹.
    긴 문서는 겹침(overlap) 포함.
    """
    text = " ".join(text.split())
    if len(text) <= max_chars:
        return [text] if text else []
    chunks = []
    start = 0
    while start < len(text):
        end = min(len(text), start + max_chars)
        chunk = text[start:end]
        chunks.append(chunk)
        if end == len(text):
            break
        start = max(0, end - overlap)
    return chunks

def point_id(doc_id: str, idx: int) -> int:
    h = hashlib.sha1(f"{doc_id}:{idx}".encode("utf-8")).hexdigest()
    # qdrant int id
    return int(h[:15], 16)

def ensure_collection(client: QdrantClient, name: str, vector_size: int):
    collections = [c.name for c in client.get_collections().collections]
    if name in collections:
        return
    client.create_collection(
        collection_name=name,
        vectors_config=rest.VectorParams(size=vector_size, distance=rest.Distance.COSINE),
    )

def upsert_points(client: QdrantClient, collection: str, vectors: np.ndarray, payloads: List[Dict], ids: List[int], batch: int = 256):
    for i in range(0, len(ids), batch):
        client.upsert(
            collection_name=collection,
            points=rest.Batch(
                ids=ids[i:i+batch],
                vectors=vectors[i:i+batch].tolist(),
                payloads=payloads[i:i+batch],
            )
        )

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--docs", required=True, help="documents.jsonl path")
    ap.add_argument("--max-chars", type=int, default=1400)
    ap.add_argument("--overlap", type=int, default=150)
    args = ap.parse_args()

    docs_path = Path(args.docs).expanduser().resolve()
    rows = load_jsonl(docs_path)

    model = SentenceTransformer(DEFAULT_MODEL)
    vector_size = model.get_sentence_embedding_dimension()

    client = QdrantClient(url=QDRANT_URL)

    # prepare all points
    all_texts = []
    all_payloads = []
    all_ids = []
    per_domain = {}  # domain_name -> list of (text, payload, id)

    for r in rows:
        doc_id = r["doc_id"]
        domain = r.get("domain_name") or "unknown"
        chunks = chunk_text(r.get("text",""), max_chars=args.max_chars, overlap=args.overlap)
        for idx, ch in enumerate(chunks):
            pid = point_id(doc_id, idx)
            payload = {
                "doc_id": doc_id,
                "chunk_idx": idx,
                "domain_name": domain,
                "source_spec": r.get("source_spec"),
                "creation_year": r.get("creation_year"),
                "text": ch,
            }
            all_texts.append("passage: " + ch)
            all_payloads.append(payload)
            all_ids.append(pid)
            per_domain.setdefault(domain, []).append(( "passage: "+ch, payload, pid))

    print(f"[INFO] total chunks: {len(all_ids)}  (from {len(rows)} docs)")
    if not all_ids:
        print("[WARN] no chunks found. check documents.jsonl")
        return

    # embed all once (faster)
    vectors = model.encode(all_texts, normalize_embeddings=True, batch_size=64, show_progress_bar=True)
    vectors = np.asarray(vectors, dtype=np.float32)

    # ensure global collection
    col_all = "med_all"
    ensure_collection(client, col_all, vector_size)
    upsert_points(client, col_all, vectors, all_payloads, all_ids)

    # domain collections (reuse precomputed vectors by mapping)
    # Build index mapping from id to vector row
    id_to_row = {pid: i for i, pid in enumerate(all_ids)}
    for domain, items in per_domain.items():
        col = normalize_collection_name(domain)
        ensure_collection(client, col, vector_size)
        ids = [pid for _,_,pid in items]
        payloads = [pl for _,pl,_ in items]
        vecs = vectors[[id_to_row[pid] for pid in ids], :]
        upsert_points(client, col, vecs, payloads, ids)

    print("[OK] indexed to qdrant:", QDRANT_URL)
    print("[OK] collections: med_all + per-domain")

if __name__ == "__main__":
    main()
