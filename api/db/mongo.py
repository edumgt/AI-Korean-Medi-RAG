"""
MongoDB(Motor) 연동 모듈.

Motor는 pymongo의 비동기(async) 래퍼이며 FastAPI의 async 라이프사이클과
자연스럽게 통합된다.

컬렉션:
  - doc_chunks  : 문서 청크 원문 + 메타데이터 (JSONL 대체 / 보완)
  - query_logs  : /ask 요청/응답 이력 (SQLAlchemy 와 병렬 저장 가능)

MONGO_URL 환경 변수가 설정되어 있지 않으면 MongoDB 기능은 비활성화된다.
"""
from __future__ import annotations

import os
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

# Motor 와 pymongo 는 선택적 의존성으로 처리한다.
# MONGO_URL 이 설정되지 않은 환경에서도 서버가 기동될 수 있어야 한다.
try:
    import motor.motor_asyncio as _motor  # type: ignore
    from pymongo import ASCENDING, DESCENDING  # type: ignore

    _motor_available = True
except ImportError:  # pragma: no cover
    _motor_available = False

MONGO_URL: str = os.environ.get("MONGO_URL", "")
MONGO_DB: str = os.environ.get("MONGO_DB", "med_rag")

_client: Any = None  # motor.motor_asyncio.AsyncIOMotorClient


def get_client() -> Any:
    """싱글턴 Motor 클라이언트를 반환한다. MONGO_URL 미설정 시 None."""
    global _client
    if not MONGO_URL or not _motor_available:
        return None
    if _client is None:
        _client = _motor.AsyncIOMotorClient(MONGO_URL)
    return _client


def get_database() -> Any:
    """Motor Database 객체를 반환한다."""
    client = get_client()
    if client is None:
        return None
    return client[MONGO_DB]


def is_mongo_enabled() -> bool:
    """MongoDB 연결 가능 여부."""
    return bool(MONGO_URL) and _motor_available


# ── 인덱스 초기화 ─────────────────────────────────────────────────────────────

async def init_mongo_indexes() -> None:
    """컬렉션 인덱스를 생성한다. 애플리케이션 시작 시 한 번 호출한다."""
    db = get_database()
    if db is None:
        return

    # doc_chunks 인덱스
    await db["doc_chunks"].create_index([("doc_id", ASCENDING)])
    await db["doc_chunks"].create_index([("domain_name", ASCENDING)])
    await db["doc_chunks"].create_index(
        [("doc_id", ASCENDING), ("chunk_idx", ASCENDING)],
        unique=True,
    )

    # query_logs 인덱스
    await db["query_logs"].create_index([("created_at", DESCENDING)])
    await db["query_logs"].create_index([("domain", ASCENDING)])


# ── doc_chunks ────────────────────────────────────────────────────────────────

async def upsert_doc_chunk(chunk: Dict[str, Any]) -> None:
    """
    단일 문서 청크를 doc_chunks 컬렉션에 upsert 한다.

    chunk 딕셔너리 예시:
    {
        "doc_id": "DOC001",
        "domain_name": "내과",
        "source_spec": "2023 진료지침",
        "creation_year": "2023",
        "chunk_idx": 0,
        "text": "...",
    }
    """
    db = get_database()
    if db is None:
        return

    doc = {
        "doc_id": str(chunk.get("doc_id") or "unknown"),
        "domain_name": str(chunk.get("domain_name") or "unknown"),
        "source_spec": chunk.get("source_spec"),
        "creation_year": chunk.get("creation_year"),
        "chunk_idx": int(chunk.get("chunk_idx") or 0),
        "text": str(chunk.get("text") or ""),
        "updated_at": datetime.now(timezone.utc),
    }

    await db["doc_chunks"].update_one(
        {"doc_id": doc["doc_id"], "chunk_idx": doc["chunk_idx"]},
        {"$set": doc},
        upsert=True,
    )


async def bulk_upsert_doc_chunks(chunks: List[Dict[str, Any]]) -> int:
    """
    문서 청크 목록을 일괄 upsert 한다.

    반환값: 처리된 청크 수
    """
    db = get_database()
    if db is None or not chunks:
        return 0

    from pymongo import UpdateOne  # type: ignore

    operations = []
    for chunk in chunks:
        doc = {
            "doc_id": str(chunk.get("doc_id") or "unknown"),
            "domain_name": str(chunk.get("domain_name") or "unknown"),
            "source_spec": chunk.get("source_spec"),
            "creation_year": chunk.get("creation_year"),
            "chunk_idx": int(chunk.get("chunk_idx") or 0),
            "text": str(chunk.get("text") or ""),
            "updated_at": datetime.now(timezone.utc),
        }
        operations.append(
            UpdateOne(
                {"doc_id": doc["doc_id"], "chunk_idx": doc["chunk_idx"]},
                {"$set": doc},
                upsert=True,
            )
        )

    result = await db["doc_chunks"].bulk_write(operations, ordered=False)
    return result.upserted_count + result.modified_count


async def find_doc_chunks(
    domain_name: Optional[str] = None,
    limit: int = 100,
) -> List[Dict[str, Any]]:
    """
    domain_name 으로 필터링하여 doc_chunks 를 반환한다.
    domain_name 이 None 이면 전체를 반환한다.
    """
    db = get_database()
    if db is None:
        return []

    query: Dict[str, Any] = {}
    if domain_name:
        query["domain_name"] = domain_name

    cursor = db["doc_chunks"].find(query, {"_id": 0}).limit(limit)
    return await cursor.to_list(length=limit)


# ── query_logs ────────────────────────────────────────────────────────────────

async def log_query_mongo(
    query: str,
    domain: Optional[str],
    used_collection: str,
    answer: str,
    top_k: int,
    llm_provider: str,
    success: bool = True,
) -> None:
    """/ask 요청 정보를 MongoDB query_logs 컬렉션에 저장한다."""
    db = get_database()
    if db is None:
        return

    await db["query_logs"].insert_one(
        {
            "query": query,
            "domain": domain,
            "used_collection": used_collection,
            "answer": answer,
            "top_k": top_k,
            "llm_provider": llm_provider,
            "success": success,
            "created_at": datetime.now(timezone.utc),
        }
    )


async def get_recent_query_logs(limit: int = 20) -> List[Dict[str, Any]]:
    """최근 query_logs 를 최신순으로 반환한다."""
    db = get_database()
    if db is None:
        return []

    cursor = (
        db["query_logs"]
        .find({}, {"_id": 0})
        .sort("created_at", DESCENDING)
        .limit(limit)
    )
    return await cursor.to_list(length=limit)


# ── 헬스 체크 ─────────────────────────────────────────────────────────────────

async def mongo_ping() -> bool:
    """MongoDB 연결 상태를 확인한다. 연결 불가 시 False 반환."""
    db = get_database()
    if db is None:
        return False
    try:
        await db.command("ping")
        return True
    except Exception:
        return False
