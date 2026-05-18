#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
DATA_ROOT 심리상담 데이터 -> data/documents.jsonl 변환 (append 모드)

원천 데이터(TXT) 는 대화 전사록, 라벨 데이터(JSON) 는 케이스 요약을 포함한다.
동일 케이스(환자 ID)의 TXT + JSON 을 병합해 하나의 문서로 출력한다.

도메인 매핑:
  001. 우울증   -> 우울증
  002. 불안장애 -> 불안장애
  003. 중독     -> 중독
  004. 일반군   -> 일반군
"""
from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from typing import Dict, Optional

DOMAIN_MAP: Dict[str, str] = {
    "001. 우울증": "우울증",
    "002. 불안장애": "불안장애",
    "003. 중독": "중독",
    "004. 일반군": "일반군",
}


def extract_patient_id(stem: str) -> str:
    """resource_depression_1_check_D012 -> D012"""
    parts = stem.split("_")
    return parts[-1] if parts else stem


def domain_from_path(p: Path, source_root: Path) -> Optional[str]:
    try:
        rel_parts = p.relative_to(source_root).parts
        # parts[0] = domain folder (e.g. "001. 우울증")
        folder = rel_parts[0] if rel_parts else ""
        return DOMAIN_MAP.get(folder, folder)
    except ValueError:
        return None


def session_from_path(p: Path) -> str:
    """0001. 1회기 -> 1회기"""
    try:
        parts = p.parts
        for part in parts:
            m = re.search(r"(\d+회기)", part)
            if m:
                return m.group(1)
    except Exception:
        pass
    return ""


def load_txt_docs(src_root: Path) -> Dict[str, dict]:
    docs: Dict[str, dict] = {}
    for txt in sorted(src_root.rglob("*.txt")):
        stem = txt.stem
        patient_id = extract_patient_id(stem)
        domain = domain_from_path(txt, src_root)
        session = session_from_path(txt)
        text = txt.read_text(encoding="utf-8-sig").strip()
        key = f"{domain}_{patient_id}"
        if key not in docs:
            docs[key] = {
                "doc_id": f"CS_{patient_id}",
                "domain_name": domain or "심리상담",
                "source_spec": session,
                "creation_year": None,
                "transcript": text,
                "summary": "",
                "meta": {},
            }
        else:
            if not docs[key]["transcript"] and text:
                docs[key]["transcript"] = text
    return docs


def merge_label_docs(docs: Dict[str, dict], label_root: Path) -> None:
    for jf in sorted(label_root.rglob("*.json")):
        try:
            raw = json.loads(jf.read_text(encoding="utf-8-sig"))
        except Exception:
            continue

        patient_id = raw.get("id") or extract_patient_id(jf.stem)
        domain_folder = domain_from_path(jf, label_root)
        domain = domain_folder or "심리상담"
        key = f"{domain}_{patient_id}"

        summary = raw.get("summary", "")
        session = session_from_path(jf)

        meta = {k: raw[k] for k in ("age", "gender", "depression", "anxiety", "addiction", "class", "total_time")
                if k in raw}

        if key not in docs:
            docs[key] = {
                "doc_id": f"CS_{patient_id}",
                "domain_name": domain,
                "source_spec": session,
                "creation_year": None,
                "transcript": "",
                "summary": summary,
                "meta": meta,
            }
        else:
            if not docs[key]["summary"] and summary:
                docs[key]["summary"] = summary
            if not docs[key]["meta"]:
                docs[key]["meta"] = meta


def build_text(doc: dict) -> str:
    parts = []
    if doc["summary"]:
        parts.append("[상담 요약]\n" + doc["summary"])
    if doc["transcript"]:
        parts.append("[상담 대화록]\n" + doc["transcript"])
    return "\n\n".join(parts)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--data-root", default="DATA_ROOT",
                    help="DATA_ROOT 경로 (01.원천데이터/02.라벨링데이터 포함)")
    ap.add_argument("--out", default="data/documents.jsonl",
                    help="출력 JSONL 경로 (append 모드)")
    ap.add_argument("--overwrite", action="store_true",
                    help="기존 파일을 덮어쓰지 않고 append")
    args = ap.parse_args()

    data_root = Path(args.data_root).expanduser().resolve()
    src_root = data_root / "01.원천데이터"
    label_root = data_root / "02.라벨링데이터"
    out_path = Path(args.out).expanduser().resolve()

    if not src_root.exists():
        raise SystemExit(f"[ERR] 원천데이터 폴더 없음: {src_root}")

    docs = load_txt_docs(src_root)
    if label_root.exists():
        merge_label_docs(docs, label_root)

    # 기존 doc_id 목록 읽어서 중복 건너뛰기
    existing_ids: set = set()
    if out_path.exists() and not args.overwrite:
        with out_path.open("r", encoding="utf-8") as f:
            for line in f:
                if line.strip():
                    try:
                        existing_ids.add(json.loads(line)["doc_id"])
                    except Exception:
                        pass

    out_path.parent.mkdir(parents=True, exist_ok=True)
    added = skipped = 0
    with out_path.open("a", encoding="utf-8") as f:
        for doc in docs.values():
            if doc["doc_id"] in existing_ids:
                skipped += 1
                continue
            text = build_text(doc)
            if not text.strip():
                skipped += 1
                continue
            record = {
                "doc_id": doc["doc_id"],
                "domain_name": doc["domain_name"],
                "source_spec": doc["source_spec"],
                "creation_year": doc["creation_year"],
                "text": text,
            }
            f.write(json.dumps(record, ensure_ascii=False) + "\n")
            added += 1

    print(f"[OK] 추가: {added}건 / 중복 스킵: {skipped}건")
    print(f"[OUT] {out_path}")


if __name__ == "__main__":
    main()
