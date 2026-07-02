#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""외부 데이터셋 소스 어댑터 공통 인터페이스.

normalize.py가 만드는 documents.jsonl/qas.jsonl과 동일한 스키마로
레코드를 방출(yield)하는 것이 각 어댑터의 책임이다.
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any, Dict, Iterator, Optional


@dataclass
class DocRecord:
    doc_id: str
    domain_name: str
    text: str
    source: Optional[str] = None
    source_spec: Optional[str] = None
    creation_year: Optional[str] = None
    raw: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "doc_id": self.doc_id,
            "domain_name": self.domain_name,
            "source": self.source,
            "source_spec": self.source_spec,
            "creation_year": self.creation_year,
            "text": self.text,
            "raw": self.raw,
        }


@dataclass
class QaRecord:
    qa_id: str
    domain_name: str
    question: str
    answer: str
    q_type: Optional[str] = None
    raw: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "qa_id": self.qa_id,
            "domain_name": self.domain_name,
            "q_type": self.q_type,
            "question": self.question,
            "answer": self.answer,
            "raw": self.raw,
        }


class SourceAdapter(ABC):
    """외부 사이트 하나를 표현하는 어댑터. fetch()가 DocRecord/QaRecord를 순서대로 방출한다."""

    name: str = "source"

    @abstractmethod
    def fetch(self) -> Iterator[Any]:
        ...
