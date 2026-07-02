#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""Hugging Face Hub 데이터셋 어댑터.

`datasets` 라이브러리로 공개 데이터셋을 스트리밍해서, 지정한 필드를
documents.jsonl/qas.jsonl 스키마로 매핑한다. API 키가 필요 없다.
KLUE(mrc 등)·KorQuAD처럼 SQuAD 스타일(question/context/answers)인
데이터셋도 이 어댑터 하나로 처리한다.
"""
from __future__ import annotations

from typing import Any, Iterator, Optional

from .base import DocRecord, QaRecord, SourceAdapter


def _first_answer(value: Any) -> str:
    """KLUE/KorQuAD의 answers: {"text": [...]} 형태 및 일반 리스트/문자열을 통일해서 처리한다."""
    if isinstance(value, dict) and "text" in value:
        texts = value["text"]
        return texts[0] if texts else ""
    if isinstance(value, list):
        return str(value[0]) if value else ""
    return str(value or "")


class HuggingFaceSource(SourceAdapter):
    name = "huggingface"

    def __init__(
        self,
        dataset: str,
        domain_name: str,
        config: Optional[str] = None,
        split: str = "train",
        limit: Optional[int] = None,
        question_field: Optional[str] = None,
        answer_field: Optional[str] = None,
        context_field: Optional[str] = None,
        text_field: Optional[str] = None,
        id_field: Optional[str] = None,
    ) -> None:
        self.dataset = dataset
        self.domain_name = domain_name
        self.config = config
        self.split = split
        self.limit = limit
        self.question_field = question_field
        self.answer_field = answer_field
        self.context_field = context_field
        self.text_field = text_field
        self.id_field = id_field

    def _load(self):
        try:
            from datasets import load_dataset
        except ImportError as e:
            raise RuntimeError(
                "huggingface 소스를 쓰려면 `pip install datasets`가 필요합니다."
            ) from e
        return load_dataset(self.dataset, self.config, split=self.split, streaming=True)

    def fetch(self) -> Iterator[Any]:
        rows = self._load()
        for idx, row in enumerate(rows):
            if self.limit is not None and idx >= self.limit:
                break
            row_id = str(row.get(self.id_field)) if self.id_field else f"{self.dataset}_{idx}"

            if self.question_field and self.answer_field:
                question = str(row.get(self.question_field, "")).strip()
                answer = _first_answer(row.get(self.answer_field)).strip()
                if not question or not answer:
                    continue
                yield QaRecord(
                    qa_id=row_id,
                    domain_name=self.domain_name,
                    question=question,
                    answer=answer,
                    q_type=self.dataset,
                    raw=dict(row),
                )
                if self.context_field and row.get(self.context_field):
                    yield DocRecord(
                        doc_id=row_id,
                        domain_name=self.domain_name,
                        text=str(row[self.context_field]).strip(),
                        source="huggingface",
                        source_spec=self.dataset,
                    )
                continue

            text_field = self.text_field or self.context_field
            if text_field and row.get(text_field):
                yield DocRecord(
                    doc_id=row_id,
                    domain_name=self.domain_name,
                    text=str(row[text_field]).strip(),
                    source="huggingface",
                    source_spec=self.dataset,
                    raw=dict(row),
                )
