#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
기존 Qdrant 인덱싱 스크립트의 대체 안내 스크립트.

현재 애플리케이션은 외부 벡터 인덱스 없이
`data/documents.jsonl` 을 직접 읽어 경량 텍스트 검색을 수행한다.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--docs", required=True, help="documents.jsonl path")
    args = ap.parse_args()

    docs_path = Path(args.docs).expanduser().resolve()
    if not docs_path.exists():
        raise SystemExit(f"[ERR] documents file not found: {docs_path}")

    count = 0
    with docs_path.open("r", encoding="utf-8") as f:
        for line in f:
            if line.strip():
                json.loads(line)
                count += 1

    print("[OK] lightweight search mode enabled")
    print(f"[OK] validated documents: {count}")
    print(f"[OK] docs path: {docs_path}")
    print("[INFO] no Qdrant indexing is required")


if __name__ == "__main__":
    main()
