#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""공공데이터포털(data.go.kr) Open API 어댑터.

serviceKey 인증이 필요한 REST 엔드포인트를 페이지 단위로 호출해서
JSON 응답 항목을 documents.jsonl 스키마(DocRecord)로 매핑한다.
금융위원회 종목시세, 한국관광공사 관광정보 등 대부분의 공공데이터포털
Open API가 공통으로 쓰는 `response.body.items.item` 래핑 구조를 기본값으로 둔다.
"""
from __future__ import annotations

from typing import Any, Dict, Iterator, List, Optional

from .base import DocRecord, SourceAdapter


class DataGoKrSource(SourceAdapter):
    name = "data_go_kr"

    def __init__(
        self,
        endpoint: str,
        service_key: str,
        domain_name: str,
        text_fields: List[str],
        id_field: Optional[str] = None,
        items_path: Optional[List[str]] = None,
        page_size: int = 100,
        max_pages: int = 1,
        extra_params: Optional[Dict[str, str]] = None,
    ) -> None:
        self.endpoint = endpoint
        self.service_key = service_key
        self.domain_name = domain_name
        self.text_fields = text_fields
        self.id_field = id_field
        self.items_path = items_path or ["response", "body", "items", "item"]
        self.page_size = page_size
        self.max_pages = max_pages
        self.extra_params = extra_params or {}

    def _extract_items(self, payload: Dict[str, Any]) -> List[Dict[str, Any]]:
        node: Any = payload
        for key in self.items_path:
            if isinstance(node, dict):
                node = node.get(key)
            else:
                return []
        if node is None:
            return []
        if isinstance(node, dict):
            return [node]
        if isinstance(node, list):
            return node
        return []

    def fetch(self) -> Iterator[DocRecord]:
        import requests

        for page in range(1, self.max_pages + 1):
            params = {
                "serviceKey": self.service_key,
                "pageNo": page,
                "numOfRows": self.page_size,
                "type": "json",
                **self.extra_params,
            }
            resp = requests.get(self.endpoint, params=params, timeout=30)
            resp.raise_for_status()
            payload = resp.json()
            items = self._extract_items(payload)
            if not items:
                break

            for idx, item in enumerate(items):
                text = " ".join(
                    str(item[f]).strip() for f in self.text_fields if item.get(f)
                ).strip()
                if not text:
                    continue
                doc_id = str(item.get(self.id_field)) if self.id_field else f"datagokr_{page}_{idx}"
                yield DocRecord(
                    doc_id=doc_id,
                    domain_name=self.domain_name,
                    text=text,
                    source="data.go.kr",
                    source_spec=self.endpoint,
                    raw=item,
                )
