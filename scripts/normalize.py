#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
폴더 구조를 순회하면서:
- 원천 JSON(content 포함) -> documents.jsonl
- 라벨링/QA JSON(question/answer 포함) -> qas.jsonl

분류 규칙(우선순위):
1) dict에 question & answer -> QA
2) 파일명이 "필수_" 로 시작 -> QA
3) dict에 content -> DOC
그 외는 스킵(로그)
"""
from __future__ import annotations
import argparse, json, os, sys
from pathlib import Path

def load_json(path: Path):
    # BOM 대응
    return json.loads(path.read_text(encoding="utf-8-sig"))

def is_qa(obj: dict, filename: str) -> bool:
    if isinstance(obj, dict) and ("question" in obj and "answer" in obj):
        return True
    if filename.startswith("필수_"):
        return True
    if isinstance(obj, dict) and ("qa_id" in obj):
        return True
    return False

def is_doc(obj: dict) -> bool:
    return isinstance(obj, dict) and ("content" in obj)

def safe_domain_name(p: Path, data_root: Path) -> str:
    # DATA_ROOT/01.원천데이터/소아청소년과/xxx.json -> "소아청소년과"
    rel = p.relative_to(data_root)
    parts = rel.parts
    # parts[0] = 01.원천데이터 or 02.라벨링데이터
    if len(parts) >= 3:
        return parts[1]
    # fallback: domain numeric or unknown
    return "unknown"

def write_jsonl(path: Path, rows):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        for r in rows:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data-root", required=True, help="DATA_ROOT (01.원천데이터/02.라벨링데이터 포함)")
    ap.add_argument("--out-dir", default="data", help="output directory (default: data)")
    ap.add_argument("--verbose", action="store_true")
    args = ap.parse_args()

    data_root = Path(args.data_root).expanduser().resolve()
    out_dir = Path(args.out_dir).expanduser().resolve()

    docs = []
    qas = []
    skipped = 0

    for p in data_root.rglob("*.json"):
        try:
            obj = load_json(p)
        except Exception as e:
            if args.verbose:
                print(f"[SKIP][bad json] {p} :: {e}", file=sys.stderr)
            skipped += 1
            continue

        domain_name = safe_domain_name(p, data_root)

        if is_qa(obj, p.name):
            qas.append({
                "qa_id": str(obj.get("qa_id") or p.stem),
                "domain_name": domain_name,
                "q_type": obj.get("q_type"),
                "question": obj.get("question", "").strip(),
                "answer": obj.get("answer", "").strip(),
                "raw": obj,  # 원본 보존(추후 확장용)
            })
        elif is_doc(obj):
            docs.append({
                "doc_id": str(obj.get("c_id") or p.stem),
                "domain_name": domain_name,
                "source": obj.get("source"),
                "source_spec": obj.get("source_spec"),
                "creation_year": obj.get("creation_year"),
                "text": (obj.get("content") or "").strip(),
                "raw": obj,
            })
        else:
            if args.verbose:
                print(f"[SKIP][unknown schema] {p}", file=sys.stderr)
            skipped += 1

    write_jsonl(out_dir / "documents.jsonl", docs)
    write_jsonl(out_dir / "qas.jsonl", qas)

    print(f"[OK] documents: {len(docs)}")
    print(f"[OK] qas      : {len(qas)}")
    print(f"[OK] skipped  : {skipped}")
    print(f"[OUT] {out_dir}")

if __name__ == "__main__":
    main()
