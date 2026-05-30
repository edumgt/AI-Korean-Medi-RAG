#!/usr/bin/env python3
"""
여행 데이터(travel CSV) → Qdrant domain_docs 컬렉션 업서트.

방문지 레코드를 장소 단위로 집계해 풍부한 한국어 설명 텍스트를 만들고
paraphrase-multilingual-MiniLM-L12-v2 모델로 임베딩 후 업로드.

사용법:
  python scripts/ingest_travel_qdrant.py [--qdrant http://localhost:6333]
"""
from __future__ import annotations

import argparse
import csv
import io
import sys
import uuid
import zipfile
from collections import defaultdict
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from qdrant_client import QdrantClient, models
from sentence_transformers import SentenceTransformer

# ── 경로 ────────────────────────────────────────────────────────────────────
BASE  = Path(__file__).parent.parent / "travel" / "3.개방데이터" / "1.데이터"
TL_ZIP = BASE / "Training" / "02.라벨링데이터" / "TL_csv.zip"
VL_ZIP = BASE / "Validation" / "02.라벨링데이터" / "VL_csv.zip"

COLLECTION  = "domain_docs"
EMBED_MODEL = "paraphrase-multilingual-MiniLM-L12-v2"
VECTOR_SIZE = 384
BATCH_SIZE  = 64
DOMAIN_NAME = "여행"

# 가정집/사무실 등 실제 관광지가 아닌 방문지 유형 코드 제외
SKIP_VIS_TYPES = {"21", "22", "23"}   # 집, 친구집, 사무실

# ── 코드 테이블 파싱 ──────────────────────────────────────────────────────────

def _open_csv_from_zip(zf: zipfile.ZipFile, keyword: str) -> Optional[csv.DictReader]:
    """zip 내에서 keyword 가 포함된 파일을 찾아 DictReader 반환."""
    for name in zf.namelist():
        if keyword in name:
            raw = zf.read(name)
            # BOM 제거
            text = raw.decode("utf-8-sig", errors="replace")
            return csv.DictReader(io.StringIO(text))
    return None


def load_code_map(zf: zipfile.ZipFile) -> Dict[str, Dict[str, str]]:
    """code_a → {code_b: name} 매핑 반환."""
    reader = _open_csv_from_zip(zf, "tc_codeb")
    if not reader:
        return {}
    mapping: Dict[str, Dict[str, str]] = defaultdict(dict)
    for row in reader:
        mapping[row.get("cd_a", "").strip()][row.get("cd_b", "").strip()] = \
            row.get("cd_nm", "").strip()
    return dict(mapping)


# ── 방문지 데이터 파싱 ─────────────────────────────────────────────────────────

def load_visit_areas(
    zf: zipfile.ZipFile,
    code_map: Dict[str, Dict[str, str]],
) -> Dict[str, Dict[str, Any]]:
    """
    tn_visit_area_info CSV → 장소 단위 집계.
    반환: {place_key: aggregated_place_dict}
    """
    reader = _open_csv_from_zip(zf, "tn_visit_area_info")
    if not reader:
        return {}

    vis_map = code_map.get("VIS", {})
    ren_map = code_map.get("REN", {})

    places: Dict[str, Dict[str, Any]] = {}

    for row in reader:
        poi_nm   = (row.get("POI_NM")        or "").strip()
        area_nm  = (row.get("VISIT_AREA_NM")  or "").strip()
        name     = poi_nm or area_nm
        if not name or name in ("집", "사무실", "회사", "학교", "병원"):
            continue

        vis_type = (row.get("VISIT_AREA_TYPE_CD") or "").strip()
        if vis_type in SKIP_VIS_TYPES:
            continue

        addr_road = (row.get("ROAD_NM_ADDR") or "").strip()
        addr_lot  = (row.get("LOTNO_ADDR")   or "").strip()
        address   = addr_road or addr_lot

        x = (row.get("X_COORD") or "").strip()
        y = (row.get("Y_COORD") or "").strip()

        try:
            dgstfn   = float(row.get("DGSTFN", 0) or 0)
            revisit  = float(row.get("REVISIT_INTENTION", 0) or 0)
            rcmdtn   = float(row.get("RCMDTN_INTENTION", 0) or 0)
            res_time = float(row.get("RESIDENCE_TIME_MIN", 0) or 0)
        except (ValueError, TypeError):
            dgstfn = revisit = rcmdtn = res_time = 0.0

        reason_raw = (row.get("VISIT_CHC_REASON_CD") or "").strip()
        reasons    = [r.strip() for r in reason_raw.split(";") if r.strip()]

        # 장소 키: 이름 + 주소 앞 20자 (중복 병합)
        key = f"{name}|{address[:20]}"

        if key not in places:
            places[key] = {
                "name":        name,
                "address":     address,
                "x":           x,
                "y":           y,
                "vis_type":    vis_map.get(vis_type, vis_type),
                "visit_count": 0,
                "dgstfn_sum":  0.0,
                "revisit_sum": 0.0,
                "rcmdtn_sum":  0.0,
                "res_time_sum": 0.0,
                "res_time_cnt": 0,
                "reasons":     defaultdict(int),
            }

        p = places[key]
        p["visit_count"] += 1
        if dgstfn  > 0: p["dgstfn_sum"]  += dgstfn
        if revisit > 0: p["revisit_sum"] += revisit
        if rcmdtn  > 0: p["rcmdtn_sum"]  += rcmdtn
        if res_time > 0:
            p["res_time_sum"] += res_time
            p["res_time_cnt"] += 1
        for r in reasons:
            p["reasons"][ren_map.get(r, r)] += 1

        # 주소/좌표 보완
        if not p["address"] and address:
            p["address"] = address
        if not p["x"] and x:
            p["x"] = x
        if not p["y"] and y:
            p["y"] = y

    return places


# ── 텍스트 생성 ────────────────────────────────────────────────────────────────

def build_place_text(p: Dict[str, Any]) -> str:
    cnt   = p["visit_count"]
    dgst  = round(p["dgstfn_sum"]  / cnt, 2) if cnt else 0
    rev   = round(p["revisit_sum"] / cnt, 2) if cnt else 0
    rcm   = round(p["rcmdtn_sum"]  / cnt, 2) if cnt else 0
    res   = round(p["res_time_sum"] / p["res_time_cnt"], 0) \
            if p["res_time_cnt"] else 0

    top_reasons = sorted(p["reasons"].items(), key=lambda x: -x[1])[:3]
    reason_str  = ", ".join(r for r, _ in top_reasons) if top_reasons else "정보 없음"

    parts = [
        f"관광지명: {p['name']}",
    ]
    if p["address"]:
        parts.append(f"주소: {p['address']}")
    if p["x"] and p["y"]:
        parts.append(f"위치(경도/위도): {p['x']}, {p['y']}")
    if p["vis_type"]:
        parts.append(f"장소유형: {p['vis_type']}")
    if res:
        parts.append(f"평균 체류시간: {int(res)}분")
    if dgst:
        parts.append(f"방문 만족도: {dgst}/5점")
    if rev:
        parts.append(f"재방문 의향: {rev}/5점")
    if rcm:
        parts.append(f"추천 의향: {rcm}/5점")
    parts.append(f"주요 방문 이유: {reason_str}")
    parts.append(f"데이터 방문 횟수: {cnt}회")

    return "\n".join(parts)


# ── 메인 ──────────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--qdrant", default="http://localhost:6333")
    args = parser.parse_args()

    print(f"[info] Qdrant: {args.qdrant}  |  모델: {EMBED_MODEL}")
    print("[info] 임베딩 모델 로드 중...")
    encoder = SentenceTransformer(EMBED_MODEL)
    client  = QdrantClient(url=args.qdrant)

    # 컬렉션 확인
    existing = {c.name for c in client.get_collections().collections}
    if COLLECTION not in existing:
        client.create_collection(
            collection_name=COLLECTION,
            vectors_config=models.VectorParams(size=VECTOR_SIZE, distance=models.Distance.COSINE),
        )
        print(f"[info] 컬렉션 '{COLLECTION}' 생성 완료.")

    # Training + Validation 합산
    all_places: Dict[str, Dict[str, Any]] = {}
    for zip_path, label in [(TL_ZIP, "Training"), (VL_ZIP, "Validation")]:
        if not zip_path.exists():
            print(f"[warn] 파일 없음: {zip_path}")
            continue
        print(f"[info] {label} 데이터 파싱 중: {zip_path.name}")
        with zipfile.ZipFile(zip_path) as zf:
            code_map = load_code_map(zf)
            places   = load_visit_areas(zf, code_map)

        # 병합 (같은 key면 통계 합산)
        for key, p in places.items():
            if key not in all_places:
                all_places[key] = p
            else:
                ap = all_places[key]
                ap["visit_count"]  += p["visit_count"]
                ap["dgstfn_sum"]   += p["dgstfn_sum"]
                ap["revisit_sum"]  += p["revisit_sum"]
                ap["rcmdtn_sum"]   += p["rcmdtn_sum"]
                ap["res_time_sum"] += p["res_time_sum"]
                ap["res_time_cnt"] += p["res_time_cnt"]
                for r, c in p["reasons"].items():
                    ap["reasons"][r] += c
                if not ap["address"] and p["address"]:
                    ap["address"] = p["address"]
                if not ap["x"] and p["x"]:
                    ap["x"], ap["y"] = p["x"], p["y"]

    places_list = list(all_places.values())
    print(f"[info] 고유 관광지 {len(places_list)}개 집계 완료.")

    # 배치 임베딩 & 업서트
    total  = len(places_list)
    upsert = 0
    for start in range(0, total, BATCH_SIZE):
        batch = places_list[start:start + BATCH_SIZE]
        texts   = [build_place_text(p) for p in batch]
        vectors = encoder.encode(texts, show_progress_bar=False).tolist()

        points = [
            models.PointStruct(
                id=str(uuid.uuid5(uuid.NAMESPACE_URL, f"travel|{p['name']}|{p['address'][:20]}")),
                vector=v,
                payload={
                    "doc_id":        f"TRV_{p['name'][:30]}",
                    "domain_name":   DOMAIN_NAME,
                    "source_spec":   p["address"] or None,
                    "creation_year": "2024",
                    "chunk_idx":     0,
                    "text":          t,
                    "place_name":    p["name"],
                    "address":       p["address"],
                    "x_coord":       p["x"],
                    "y_coord":       p["y"],
                    "vis_type":      p["vis_type"],
                    "visit_count":   p["visit_count"],
                },
            )
            for p, v, t in zip(batch, vectors, texts)
        ]
        client.upsert(collection_name=COLLECTION, points=points)
        upsert += len(points)
        print(f"  {upsert}/{total} 업서트 완료", end="\r")

    print(f"\n[done] 여행 데이터 {upsert}개 업서트 완료.")
    count = client.get_collection(COLLECTION).points_count
    print(f"[info] domain_docs 총 포인트 수: {count}")


if __name__ == "__main__":
    main()
