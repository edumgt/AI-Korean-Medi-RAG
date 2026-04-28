"""
SQLAlchemy 연동 모듈.

지원 DB:
  - SQLite  (기본값, 별도 서버 불필요)
  - PostgreSQL (DATABASE_URL 환경 변수에 postgresql+psycopg2://... 형식 지정)

테이블:
  - query_logs : /ask 엔드포인트의 요청/응답 이력을 기록한다.
  - documents  : JSONL 파일에서 읽은 문서 원본 메타데이터를 저장한다.
"""
from __future__ import annotations

import os
from datetime import datetime, timezone
from typing import Generator

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Integer,
    String,
    Text,
    create_engine,
)
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

# ── 연결 설정 ──────────────────────────────────────────────────────────────────

DATABASE_URL: str = os.environ.get(
    "DATABASE_URL",
    "sqlite:///./med_rag.db",  # 개발 기본값: 프로젝트 루트 SQLite 파일
)

# PostgreSQL 의 경우 연결 풀 설정을 조금 더 너그럽게 잡는다.
_connect_args: dict = {}
if DATABASE_URL.startswith("sqlite"):
    _connect_args = {"check_same_thread": False}

engine = create_engine(
    DATABASE_URL,
    connect_args=_connect_args,
    pool_pre_ping=True,   # 끊어진 커넥션 자동 감지
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


# ── ORM 모델 ──────────────────────────────────────────────────────────────────

class Base(DeclarativeBase):
    pass


class QueryLog(Base):
    """사용자가 /ask 엔드포인트로 보낸 질의와 반환된 응답을 저장한다."""

    __tablename__ = "query_logs"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    query = Column(Text, nullable=False, comment="사용자 입력 질문")
    domain = Column(String(120), nullable=True, comment="요청 도메인(과) 필터")
    used_collection = Column(String(120), nullable=True, comment="실제 사용된 컬렉션명")
    answer = Column(Text, nullable=True, comment="반환된 답변 텍스트")
    top_k = Column(Integer, nullable=False, default=4)
    llm_provider = Column(String(40), nullable=True, comment="사용된 LLM 제공자")
    success = Column(Boolean, nullable=False, default=True)
    created_at = Column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        comment="질의 시각(UTC)",
    )

    def __repr__(self) -> str:  # pragma: no cover
        return f"<QueryLog id={self.id} query={self.query[:30]!r}>"


class DocumentMeta(Base):
    """documents.jsonl 에서 읽은 문서의 메타데이터를 관계형 DB에 캐싱한다."""

    __tablename__ = "documents"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    doc_id = Column(String(128), index=True, nullable=False, comment="원본 문서 ID")
    domain_name = Column(String(120), index=True, nullable=True)
    source_spec = Column(String(512), nullable=True)
    creation_year = Column(String(10), nullable=True)
    chunk_idx = Column(Integer, nullable=False, default=0, comment="청크 순번")
    text_preview = Column(String(512), nullable=True, comment="첫 512자 미리보기")
    indexed_at = Column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )

    def __repr__(self) -> str:  # pragma: no cover
        return f"<DocumentMeta doc_id={self.doc_id!r} chunk={self.chunk_idx}>"


# ── 유틸리티 ──────────────────────────────────────────────────────────────────

def init_db() -> None:
    """애플리케이션 시작 시 테이블을 생성(없으면)한다."""
    Base.metadata.create_all(bind=engine)


def get_db() -> Generator[Session, None, None]:
    """FastAPI Depends 용 DB 세션 제너레이터."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
