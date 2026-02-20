#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
qas.jsonl을 이용한 간단 자동평가:
- 각 질문을 /ask 로 질의(직접 함수 호출 or HTTP)
- 정답 문자열 포함 여부 + 유사도 기반 점수(rapidfuzz)
"""
from __future__ import annotations
import argparse, json, os, re
from pathlib import Path
from rapidfuzz import fuzz
import requests

API_URL = os.environ.get("API_URL", "http://localhost:8000/ask")

def load_jsonl(path: Path):
    with path.open("r", encoding="utf-8") as f:
        for line in f:
            if line.strip():
                yield json.loads(line)

def norm(s: str) -> str:
    s = s or ""
    s = re.sub(r"\s+", " ", s).strip().lower()
    return s

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--qas", required=True, help="qas.jsonl")
    ap.add_argument("--out", default="eval_report.json", help="output report json")
    ap.add_argument("--top-k", type=int, default=4)
    args = ap.parse_args()

    rows = list(load_jsonl(Path(args.qas)))
    total = len(rows)
    results = []
    exact = 0
    avg_f1 = 0.0

    for r in rows:
        q = r["question"]
        gold = r["answer"]
        domain = r.get("domain_name")

        resp = requests.post(API_URL, json={"query": q, "domain": domain, "top_k": args.top_k}, timeout=120)
        resp.raise_for_status()
        pred = resp.json().get("answer","")

        g = norm(gold)
        p = norm(pred)

        contains = (g in p) if g else False
        sim = fuzz.token_set_ratio(g, p) / 100.0 if g and p else 0.0

        if contains:
            exact += 1
        avg_f1 += sim

        results.append({
            "qa_id": r.get("qa_id"),
            "domain_name": domain,
            "question": q,
            "gold": gold,
            "pred": pred[:1200],
            "contains": contains,
            "similarity": sim,
        })

    report = {
        "total": total,
        "exact_contains_rate": (exact / total) if total else 0.0,
        "avg_similarity": (avg_f1 / total) if total else 0.0,
        "results": results,
    }

    Path(args.out).write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"[OK] wrote: {args.out}")
    print(f"exact_contains_rate={report['exact_contains_rate']:.3f}  avg_similarity={report['avg_similarity']:.3f}")

if __name__ == "__main__":
    main()
