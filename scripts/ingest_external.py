#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""AI Hub 외부 데이터셋 사이트를 연동해 documents.jsonl/qas.jsonl에 추가한다.

기존 normalize.py(AI Hub DATA_ROOT 전용)와 별도로, id 기준 upsert 방식으로
기존 파일에 안전하게 append한다. domain_name은 자유롭게 지정할 수 있으며,
AI Hub 도메인(01.의료/02.법률/여행 등)과 겹치지 않는 새 도메인
(예: 05.금융, 06.주식투자)으로 분리하는 것을 권장한다.

지원 소스:
  - huggingface : Hugging Face Hub 공개 데이터셋 (KLUE, KorQuAD 포함, API 키 불필요)
  - data_go_kr  : 공공데이터포털 Open API (serviceKey 필요)

사용 예:
  # KLUE-MRC(질의응답) -> qas.jsonl + documents.jsonl, 금융 도메인으로 적재
  python scripts/ingest_external.py huggingface --dataset klue --config mrc \\
      --split train --limit 500 --question-field question --answer-field answers \\
      --context-field context --domain 05.금융

  # KorQuAD 1.0
  python scripts/ingest_external.py huggingface --dataset KorQuAD/squad_kor_v1 \\
      --split train --limit 500 --question-field question --answer-field answers \\
      --context-field context --domain 05.금융

  # 공공데이터포털 예시(금융위원회 주식시세 정보 등)
  python scripts/ingest_external.py data_go_kr \\
      --endpoint https://apis.data.go.kr/1160100/service/GetStockSecuritiesInfoService/getStockPriceInfo \\
      --service-key $DATA_GO_KR_KEY --text-fields itmsNm,mrktCtg,clpr \\
      --domain 06.주식투자
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path
from typing import Dict, Iterable

sys.path.insert(0, str(Path(__file__).parent))

from sources.base import DocRecord, QaRecord  # noqa: E402
from sources.data_go_kr_source import DataGoKrSource  # noqa: E402
from sources.huggingface_source import HuggingFaceSource  # noqa: E402
from sources.markdown_source import MarkdownFilesSource  # noqa: E402


def expand_paths(patterns: str) -> list:
    """콤마로 구분된 파일 경로/글롭 패턴(절대경로 포함)을 실제 파일 목록으로 펼친다."""
    import glob as glob_mod

    paths = []
    for pattern in patterns.split(","):
        pattern = pattern.strip()
        if not pattern:
            continue
        if any(ch in pattern for ch in "*?["):
            paths.extend(Path(p) for p in sorted(glob_mod.glob(pattern)))
        else:
            paths.append(Path(pattern))
    return paths


def load_existing(path: Path) -> Dict[str, dict]:
    rows: Dict[str, dict] = {}
    if not path.exists():
        return rows
    with path.open("r", encoding="utf-8") as f:
        for line in f:
            if not line.strip():
                continue
            row = json.loads(line)
            key = row.get("doc_id") or row.get("qa_id")
            if key:
                rows[key] = row
    return rows


def write_jsonl(path: Path, rows: Iterable[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        for row in rows:
            f.write(json.dumps(row, ensure_ascii=False) + "\n")


def build_source(args: argparse.Namespace):
    if args.source == "huggingface":
        return HuggingFaceSource(
            dataset=args.dataset,
            domain_name=args.domain,
            config=args.config,
            split=args.split,
            limit=args.limit,
            question_field=args.question_field,
            answer_field=args.answer_field,
            context_field=args.context_field,
            text_field=args.text_field,
            id_field=args.id_field,
        )
    if args.source == "data_go_kr":
        if not args.service_key:
            raise SystemExit("--service-key (또는 DATA_GO_KR_KEY 환경변수)가 필요합니다.")
        return DataGoKrSource(
            endpoint=args.endpoint,
            service_key=args.service_key,
            domain_name=args.domain,
            text_fields=args.text_fields.split(",") if args.text_fields else [],
            id_field=args.id_field,
            page_size=args.page_size,
            max_pages=args.max_pages,
        )
    if args.source == "markdown":
        paths = expand_paths(args.paths)
        if not paths:
            raise SystemExit(f"--paths에 해당하는 파일을 찾지 못했습니다: {args.paths}")
        return MarkdownFilesSource(
            paths=paths,
            domain_name=args.domain,
            split_level=args.heading_level,
            min_chars=args.min_chars,
        )
    raise SystemExit(f"알 수 없는 소스: {args.source}")


def main() -> None:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    sub = parser.add_subparsers(dest="source", required=True)

    hf = sub.add_parser("huggingface", help="Hugging Face Hub 데이터셋 (KLUE/KorQuAD 포함)")
    hf.add_argument("--dataset", required=True, help="예: klue, KorQuAD/squad_kor_v1, maywell/ko_en_chitchat")
    hf.add_argument("--config", default=None, help="예: mrc (klue의 서브태스크)")
    hf.add_argument("--split", default="train")
    hf.add_argument("--limit", type=int, default=None, help="가져올 최대 레코드 수 (기본: 전체)")
    hf.add_argument("--question-field", default=None)
    hf.add_argument("--answer-field", default=None)
    hf.add_argument("--context-field", default=None)
    hf.add_argument("--text-field", default=None)
    hf.add_argument("--id-field", default=None)

    dgk = sub.add_parser("data_go_kr", help="공공데이터포털 Open API")
    dgk.add_argument("--endpoint", required=True)
    dgk.add_argument("--service-key", default=None, help="미지정 시 DATA_GO_KR_KEY 환경변수 사용")
    dgk.add_argument("--text-fields", required=True, help="콤마로 구분된 응답 필드명 (예: itmsNm,mrktCtg,clpr)")
    dgk.add_argument("--id-field", default=None)
    dgk.add_argument("--page-size", type=int, default=100)
    dgk.add_argument("--max-pages", type=int, default=1)

    md = sub.add_parser("markdown", help="로컬 마크다운(.md) 파일/글롭 패턴")
    md.add_argument("--paths", required=True, help="콤마로 구분된 파일 경로 또는 글롭 패턴 (예: docs/*.md)")
    md.add_argument("--heading-level", type=int, default=2, help="분할 기준 헤딩 레벨, #=1,##=2 (기본: 2)")
    md.add_argument("--min-chars", type=int, default=30, help="이 길이 미만인 섹션은 스킵 (기본: 30)")

    for sp in (hf, dgk, md):
        sp.add_argument("--domain", required=True, help="domain_name (예: 05.금융, 06.주식투자)")
        sp.add_argument("--out-dir", default="data")

    args = parser.parse_args()

    if args.source == "data_go_kr" and not args.service_key:
        args.service_key = os.environ.get("DATA_GO_KR_KEY")

    source = build_source(args)

    out_dir = Path(args.out_dir)
    docs_path = out_dir / "documents.jsonl"
    qas_path = out_dir / "qas.jsonl"

    docs = load_existing(docs_path)
    qas = load_existing(qas_path)

    added_docs = added_qas = 0
    for record in source.fetch():
        row = record.to_dict()
        if isinstance(record, DocRecord):
            if row["doc_id"] not in docs:
                added_docs += 1
            docs[row["doc_id"]] = row
        elif isinstance(record, QaRecord):
            if row["qa_id"] not in qas:
                added_qas += 1
            qas[row["qa_id"]] = row

    write_jsonl(docs_path, docs.values())
    write_jsonl(qas_path, qas.values())

    print(f"[OK] source={args.source} domain={args.domain}")
    print(f"[OK] documents: +{added_docs} (총 {len(docs)}) -> {docs_path}")
    print(f"[OK] qas      : +{added_qas} (총 {len(qas)}) -> {qas_path}")


if __name__ == "__main__":
    main()
