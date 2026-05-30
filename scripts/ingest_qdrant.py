#!/usr/bin/env python3
"""
documents.jsonl → Qdrant domain_docs 컬렉션에 임베딩 후 업서트.

사용법:
  python scripts/ingest_qdrant.py [--qdrant http://localhost:6333] [--data data/documents.jsonl]
"""
from __future__ import annotations

import argparse
import json
import re
import uuid
from pathlib import Path
from typing import Any, Dict, List

from qdrant_client import QdrantClient, models
from sentence_transformers import SentenceTransformer

COLLECTION     = "domain_docs"
VECTOR_SIZE    = 384
EMBED_MODEL    = "paraphrase-multilingual-MiniLM-L12-v2"
BATCH_SIZE     = 64
MAX_CHARS      = 1200
OVERLAP        = 120


# ── 청킹 ─────────────────────────────────────────────────────────────────────

def chunk_text(text: str) -> List[str]:
    text = " ".join((text or "").split())
    if not text:
        return []
    if len(text) <= MAX_CHARS:
        return [text]
    chunks, start = [], 0
    while start < len(text):
        end = min(len(text), start + MAX_CHARS)
        chunks.append(text[start:end])
        if end == len(text):
            break
        start = max(0, end - OVERLAP)
    return chunks


# ── 문서 로드 ─────────────────────────────────────────────────────────────────

def load_chunks(path: Path) -> List[Dict[str, Any]]:
    rows = []
    with path.open("r", encoding="utf-8") as f:
        for line in f:
            if not line.strip():
                continue
            row = json.loads(line)
            for idx, chunk in enumerate(chunk_text(row.get("text", ""))):
                rows.append({
                    "doc_id":        str(row.get("doc_id") or "unknown"),
                    "domain_name":   str(row.get("domain_name") or "unknown"),
                    "source_spec":   row.get("source_spec"),
                    "creation_year": row.get("creation_year"),
                    "chunk_idx":     idx,
                    "text":          chunk,
                })
    return rows


# ── Qdrant 컬렉션 초기화 ───────────────────────────────────────────────────────

def ensure_collection(client: QdrantClient) -> None:
    existing = {c.name for c in client.get_collections().collections}
    if COLLECTION in existing:
        print(f"[info] 컬렉션 '{COLLECTION}' 이미 존재합니다.")
        return
    client.create_collection(
        collection_name=COLLECTION,
        vectors_config=models.VectorParams(size=VECTOR_SIZE, distance=models.Distance.COSINE),
    )
    print(f"[info] 컬렉션 '{COLLECTION}' 생성 완료.")


# ── 배치 업서트 ───────────────────────────────────────────────────────────────

def upsert_batches(client: QdrantClient, encoder: SentenceTransformer, chunks: List[Dict]) -> None:
    total = len(chunks)
    print(f"[info] 총 {total}개 청크를 임베딩 후 업서트합니다.")

    for start in range(0, total, BATCH_SIZE):
        batch = chunks[start:start + BATCH_SIZE]
        texts   = [c["text"] for c in batch]
        vectors = encoder.encode(texts, show_progress_bar=False).tolist()

        points = [
            models.PointStruct(
                id=str(uuid.uuid5(uuid.NAMESPACE_URL, f"{c['doc_id']}_{c['chunk_idx']}")),
                vector=v,
                payload={k: c[k] for k in ("doc_id", "domain_name", "source_spec", "creation_year", "chunk_idx", "text")},
            )
            for c, v in zip(batch, vectors)
        ]
        client.upsert(collection_name=COLLECTION, points=points)
        end = min(start + BATCH_SIZE, total)
        print(f"  {end}/{total} 업서트 완료", end="\r")

    print(f"\n[done] {total}개 청크 업서트 완료.")


# ── main ──────────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--qdrant", default="http://localhost:6333")
    parser.add_argument("--data",   default="data/documents.jsonl")
    args = parser.parse_args()

    data_path = Path(args.data)
    if not data_path.exists():
        raise FileNotFoundError(f"데이터 파일을 찾을 수 없습니다: {data_path}")

    print(f"[info] 데이터: {data_path}  |  Qdrant: {args.qdrant}")
    print(f"[info] 임베딩 모델 로드 중: {EMBED_MODEL}")
    encoder = SentenceTransformer(EMBED_MODEL)

    client = QdrantClient(url=args.qdrant)
    ensure_collection(client)

    chunks = load_chunks(data_path)
    print(f"[info] 문서 청크 {len(chunks)}개 로드 완료.")

    upsert_batches(client, encoder, chunks)

    count = client.get_collection(COLLECTION).points_count
    print(f"[info] 최종 포인트 수: {count}")


if __name__ == "__main__":
    main()
