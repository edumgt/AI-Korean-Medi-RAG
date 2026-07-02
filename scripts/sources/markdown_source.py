#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""로컬 마크다운(.md) 디렉터리/파일 어댑터.

AI Hub 밖에서 확보한 로컬 문서(강의노트, 리서치 자료 등)를 헤딩 단위로
쪼개서 documents.jsonl 스키마(DocRecord)로 매핑한다. 지정한 파일들은
모두 동일한 domain_name으로 적재되므로, 도메인이 섞인 자료는 파일 단위로
나눠서 소스를 여러 번 실행하면 된다.
"""
from __future__ import annotations

import re
from pathlib import Path
from typing import Iterator, List, Tuple

from .base import DocRecord, SourceAdapter

_HEADING_RE = re.compile(r"^(#{1,6})\s+(.*)$")


def _split_sections(text: str, split_level: int) -> List[Tuple[str, str]]:
    """지정한 헤딩 레벨(# 개수) 기준으로 (제목, 본문) 목록을 반환한다."""
    sections: List[Tuple[str, str]] = []
    current_title = ""
    current_lines: List[str] = []

    def flush() -> None:
        body = "\n".join(current_lines).strip()
        if body:
            sections.append((current_title, body))

    for line in text.splitlines():
        m = _HEADING_RE.match(line)
        if m and len(m.group(1)) <= split_level:
            flush()
            current_title = m.group(2).strip()
            current_lines = [line]
        else:
            current_lines.append(line)
    flush()
    return sections


def _slugify(title: str, fallback: str) -> str:
    slug = re.sub(r"[^0-9a-zA-Z가-힣]+", "-", title).strip("-").lower()
    return slug or fallback


class MarkdownFilesSource(SourceAdapter):
    name = "markdown"

    def __init__(
        self,
        paths: List[Path],
        domain_name: str,
        split_level: int = 2,
        min_chars: int = 30,
    ) -> None:
        self.paths = paths
        self.domain_name = domain_name
        self.split_level = split_level
        self.min_chars = min_chars

    def fetch(self) -> Iterator[DocRecord]:
        for path in self.paths:
            text = path.read_text(encoding="utf-8")
            sections = _split_sections(text, self.split_level)
            if not sections:
                sections = [(path.stem, text.strip())]

            for idx, (title, body) in enumerate(sections):
                if len(body) < self.min_chars:
                    continue
                slug = _slugify(title, f"sec{idx}")
                doc_id = f"{path.stem}__{idx:03d}_{slug}"[:120]
                yield DocRecord(
                    doc_id=doc_id,
                    domain_name=self.domain_name,
                    text=body,
                    source="local-markdown",
                    source_spec=str(path),
                    raw={"file": path.name, "heading": title},
                )
