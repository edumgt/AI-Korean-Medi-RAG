#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
폴더 구조를 순회하면서 현재 DATA_ROOT 포맷을 정규화한다.

- 원천 TXT/JSON(content 포함) -> documents.jsonl
- 라벨링 JSON(question/answer 포함) -> qas.jsonl
- 라벨링 JSON이 {"data": [...]} 형태인 경우 배열을 펼쳐서 처리

분류 규칙(우선순위):
1) dict에 question & answer -> QA
2) 파일명이 "필수_" 로 시작 -> QA
3) dict에 content 또는 text -> DOC
4) 원천 .txt -> DOC
그 외는 스킵(로그)
"""
from __future__ import annotations
import argparse, json, sys
from pathlib import Path
from typing import Dict, Iterable, List

def load_json(path: Path):
    # BOM 대응
    return json.loads(path.read_text(encoding="utf-8-sig"))

def load_text(path: Path) -> str:
    return path.read_text(encoding="utf-8-sig").strip()

def iter_json_records(obj) -> Iterable[dict]:
    if isinstance(obj, dict) and isinstance(obj.get("data"), list):
        for item in obj["data"]:
            if isinstance(item, dict):
                yield item
        return
    if isinstance(obj, list):
        for item in obj:
            if isinstance(item, dict):
                yield item
        return
    if isinstance(obj, dict):
        yield obj

def is_qa(obj: dict, filename: str) -> bool:
    if isinstance(obj, dict) and ("question" in obj and "answer" in obj):
        return True
    if filename.startswith("필수_"):
        return True
    if isinstance(obj, dict) and ("qa_id" in obj):
        return True
    return False

def is_doc(obj: dict) -> bool:
    return isinstance(obj, dict) and ("content" in obj or "text" in obj)

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

def append_doc(docs_by_id: Dict[str, dict], p: Path, data_root: Path, obj: dict, text: str):
    doc_id = str(obj.get("c_id") or obj.get("book_id") or p.stem)
    existing = docs_by_id.get(doc_id)
    base = {
        "doc_id": doc_id,
        "domain_name": safe_domain_name(p, data_root),
        "source": obj.get("source"),
        "source_spec": obj.get("source_spec"),
        "creation_year": obj.get("creation_year") or obj.get("publication_ymd"),
        "text": (text or "").strip(),
        "raw": obj,
    }
    if existing is None:
        docs_by_id[doc_id] = base
        return

    if not existing.get("text") and base["text"]:
        existing["text"] = base["text"]
    if not existing.get("source") and base["source"] is not None:
        existing["source"] = base["source"]
    if not existing.get("source_spec") and base["source_spec"] is not None:
        existing["source_spec"] = base["source_spec"]
    if not existing.get("creation_year") and base["creation_year"] is not None:
        existing["creation_year"] = base["creation_year"]
    existing.setdefault("raw_label", obj)

def append_qa(qas: List[dict], p: Path, data_root: Path, obj: dict):
    qas.append({
        "qa_id": str(obj.get("qa_id") or p.stem),
        "domain_name": safe_domain_name(p, data_root),
        "q_type": obj.get("q_type"),
        "question": obj.get("question", "").strip(),
        "answer": obj.get("answer", "").strip(),
        "raw": obj,
    })

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data-root", required=True, help="DATA_ROOT (01.원천데이터/02.라벨링데이터 포함)")
    ap.add_argument("--out-dir", default="data", help="output directory (default: data)")
    ap.add_argument("--verbose", action="store_true")
    args = ap.parse_args()

    data_root = Path(args.data_root).expanduser().resolve()
    out_dir = Path(args.out_dir).expanduser().resolve()

    docs_by_id: Dict[str, dict] = {}
    qas = []
    skipped = 0

    for p in sorted(data_root.rglob("*")):
        if not p.is_file():
            continue

        if p.suffix.lower() == ".txt":
            append_doc(docs_by_id, p, data_root, {"book_id": p.stem}, load_text(p))
            continue

        if p.suffix.lower() != ".json":
            skipped += 1
            continue

        try:
            obj = load_json(p)
        except Exception as e:
            if args.verbose:
                print(f"[SKIP][bad json] {p} :: {e}", file=sys.stderr)
            skipped += 1
            continue

        matched = False
        for record in iter_json_records(obj):
            if is_qa(record, p.name):
                append_qa(qas, p, data_root, record)
                matched = True
            elif is_doc(record):
                append_doc(docs_by_id, p, data_root, record, record.get("content") or record.get("text") or "")
                matched = True

        if not matched:
            if args.verbose:
                print(f"[SKIP][unknown schema] {p}", file=sys.stderr)
            skipped += 1

    docs = list(docs_by_id.values())
    write_jsonl(out_dir / "documents.jsonl", docs)
    write_jsonl(out_dir / "qas.jsonl", qas)

    print(f"[OK] documents: {len(docs)}")
    print(f"[OK] qas      : {len(qas)}")
    print(f"[OK] skipped  : {skipped}")
    print(f"[OUT] {out_dir}")

if __name__ == "__main__":
    main()
