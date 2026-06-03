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


async def travel_db_stats() -> Dict[str, Any]:
    """여행 도메인 Qdrant 통계 반환."""
    client = get_client()

    coll = await client.get_collection(QDRANT_COLLECTION)
    total_points = coll.points_count or 0

    # 벡터 설정 추출 (VectorParams / NamedVectorParams 양쪽 대응)
    vc = coll.config.params.vectors
    if hasattr(vc, "size"):
        vector_size = vc.size
        distance = str(vc.distance).replace("Distance.", "")
    else:
        first = next(iter(vc.values()), None)
        vector_size = first.size if first else None
        distance = str(first.distance).replace("Distance.", "") if first else None

    def _f(*conditions: models.FieldCondition) -> models.Filter:
        return models.Filter(must=list(conditions))

    travel_cond = models.FieldCondition(
        key="domain_name", match=models.MatchValue(value="여행")
    )

    async def _count(flt: models.Filter) -> int:
        r = await client.count(QDRANT_COLLECTION, count_filter=flt, exact=False)
        return r.count

    travel_total  = await _count(_f(travel_cond))
    route_count   = await _count(_f(travel_cond, models.FieldCondition(
        key="vis_type", match=models.MatchValue(value="여행 코스"))))
    caption_count = await _count(_f(travel_cond, models.FieldCondition(
        key="vis_type", match=models.MatchValue(value="관광사진 캡션"))))
    place_count   = max(0, travel_total - route_count - caption_count)

    return {
        "collection":   QDRANT_COLLECTION,
        "embed_model":  EMBED_MODEL,
        "vector_size":  vector_size,
        "distance":     distance,
        "total_points": total_points,
        "travel": {
            "total":   travel_total,
            "route":   route_count,
            "caption": caption_count,
            "place":   place_count,
        },
    }


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
