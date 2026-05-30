from __future__ import annotations

import os
from typing import Any, Dict, List, Optional

from qdrant_client import AsyncQdrantClient, models

QDRANT_URL        = os.environ.get("QDRANT_URL",        "http://qdrant:6333")
QDRANT_COLLECTION = os.environ.get("QDRANT_COLLECTION", "domain_docs")
EMBED_MODEL       = os.environ.get("EMBED_MODEL",       "paraphrase-multilingual-MiniLM-L12-v2")

_client:  Optional[AsyncQdrantClient] = None
_encoder = None


def get_encoder():
    global _encoder
    if _encoder is None:
        from sentence_transformers import SentenceTransformer  # lazy import
        _encoder = SentenceTransformer(EMBED_MODEL)
    return _encoder


def get_client() -> AsyncQdrantClient:
    global _client
    if _client is None:
        _client = AsyncQdrantClient(url=QDRANT_URL)
    return _client


async def qdrant_ping() -> bool:
    try:
        await get_client().get_collections()
        return True
    except Exception:
        return False


async def qdrant_point_count() -> int:
    try:
        info = await get_client().get_collection(QDRANT_COLLECTION)
        return info.points_count or 0
    except Exception:
        return 0


async def qdrant_search(
    query: str,
    domain_name: Optional[str],
    top_k: int,
) -> List[Dict[str, Any]]:
    vector = get_encoder().encode(query).tolist()

    flt = None
    if domain_name:
        flt = models.Filter(
            must=[
                models.FieldCondition(
                    key="domain_name",
                    match=models.MatchValue(value=domain_name),
                )
            ]
        )

    result = await get_client().query_points(
        collection_name=QDRANT_COLLECTION,
        query=vector,
        query_filter=flt,
        limit=top_k,
        with_payload=True,
    )

    return [{"score": float(h.score), "payload": h.payload} for h in result.points]
