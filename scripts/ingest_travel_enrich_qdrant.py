#!/usr/bin/env python3
"""
여행 데이터 추가 인제스트 (SbL 캡션 + GPS 코스 + POI 마스터)

3가지 데이터 소스를 처리합니다:
  1. SbL.zip       – 관광사진 JSON 캡션 → 장소별 자연어 설명
  2. TL/VL_gps + visit_area – 여행 동선 코스 문서
  3. Other.zip     – POI 마스터 (전국 관광지 공식 정보)

사용법:
  python scripts/ingest_travel_enrich_qdrant.py [--qdrant http://localhost:6333]
"""
from __future__ import annotations

import argparse
import csv
import io
import json
import uuid
import zipfile
from collections import defaultdict
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from qdrant_client import QdrantClient, models
from sentence_transformers import SentenceTransformer

# ── 경로 ─────────────────────────────────────────────────────────────────────
BASE       = Path(__file__).parent.parent / "travel" / "3.개방데이터" / "1.데이터"
TL_CSV_ZIP = BASE / "Training"  / "02.라벨링데이터" / "TL_csv.zip"
VL_CSV_ZIP = BASE / "Validation"/ "02.라벨링데이터" / "VL_csv.zip"
TL_GPS_ZIP = BASE / "Training"  / "02.라벨링데이터" / "TL_gps_data.zip"
VL_GPS_ZIP = BASE / "Validation"/ "02.라벨링데이터" / "VL_gps_data.zip"
SBL_ZIP    = BASE / "Sublabel"  / "SbL.zip"
OTHER_ZIP  = BASE / "Other"     / "Other.zip"

COLLECTION  = "domain_docs"
EMBED_MODEL = "paraphrase-multilingual-MiniLM-L12-v2"
VECTOR_SIZE = 384
BATCH_SIZE  = 64
DOMAIN      = "여행"

# 제외 방문지 유형 (집·사무실 등)
SKIP_VIS_TYPES = {"21", "22", "23"}

# ── 공통 유틸 ─────────────────────────────────────────────────────────────────

def _csv_from_zip(zf: zipfile.ZipFile, keyword: str) -> Optional[csv.DictReader]:
    for name in zf.namelist():
        if keyword in name and name.endswith(".csv"):
            raw  = zf.read(name)
            text = raw.decode("utf-8-sig", errors="replace")
            return csv.DictReader(io.StringIO(text))
    return None


def _load_codeb(zf: zipfile.ZipFile) -> Dict[str, Dict[str, str]]:
    reader = _csv_from_zip(zf, "tc_codeb")
    if not reader:
        return {}
    m: Dict[str, Dict[str, str]] = defaultdict(dict)
    for row in reader:
        m[row.get("cd_a","").strip()][row.get("cd_b","").strip()] = row.get("cd_nm","").strip()
    return dict(m)


def _upsert_batch(
    client: QdrantClient,
    encoder: SentenceTransformer,
    records: List[Dict[str, Any]],
    label: str,
) -> None:
    if not records:
        return
    total = len(records)
    for start in range(0, total, BATCH_SIZE):
        batch   = records[start : start + BATCH_SIZE]
        texts   = [r["text"] for r in batch]
        vectors = encoder.encode(texts, show_progress_bar=False).tolist()
        points  = [
            models.PointStruct(
                id      = r["id"],
                vector  = v,
                payload = {k: r[k] for k in r if k not in ("id", "text")},
            )
            for r, v in zip(batch, vectors)
        ]
        client.upsert(collection_name=COLLECTION, points=points)
        end = min(start + BATCH_SIZE, total)
        print(f"  [{label}] {end}/{total} 완료", end="\r")
    print(f"\n  [{label}] {total}개 업서트 완료.")


# ═══════════════════════════════════════════════════════════════
# Phase 1 – SbL 관광사진 캡션
# ═══════════════════════════════════════════════════════════════

def load_sbl_captions(zf: zipfile.ZipFile) -> Dict[str, Dict[str, Any]]:
    """JSON 파일만 읽어 장소명별 캡션 집계. JPG 는 건너뜀."""
    places: Dict[str, Dict[str, Any]] = {}
    json_names = [n for n in zf.namelist() if n.endswith(".json")]
    print(f"  SbL JSON 파일: {len(json_names)}개")

    for name in json_names:
        try:
            raw = zf.read(name)
            # UTF-8 BOM 처리
            text = raw.decode("utf-8-sig", errors="replace")
            data = json.loads(text)
        except Exception:
            continue

        img     = data.get("images", {})
        caption = data.get("caption", {})

        area_nm = (img.get("VISIT_AREA_NM") or "").strip()
        cap_txt = (caption.get("IMG_CAPTION") or "").strip()
        landmark= (img.get("LANDMARK") or "").strip()
        x       = str(img.get("PHOTO_FILE_X_COORD") or "").strip()
        y       = str(img.get("PHOTO_FILE_Y_COORD") or "").strip()

        if not area_nm or not cap_txt:
            continue

        key = area_nm
        if key not in places:
            places[key] = {
                "name":     area_nm,
                "landmark": landmark,
                "x": x, "y": y,
                "captions": [],
            }
        places[key]["captions"].append(cap_txt)
        if not places[key]["x"] and x:
            places[key]["x"] = x
            places[key]["y"] = y
        if not places[key]["landmark"] and landmark:
            places[key]["landmark"] = landmark

    return places


def build_caption_records(places: Dict[str, Dict[str, Any]]) -> List[Dict[str, Any]]:
    records = []
    for key, p in places.items():
        caps      = p["captions"]
        cap_block = " / ".join(caps[:8])           # 최대 8개 캡션

        text = f"관광지명: {p['name']}\n"
        if p["landmark"]:
            text += f"랜드마크: {p['landmark']}\n"
        if p["x"] and p["y"]:
            text += f"위치(경도/위도): {p['x']}, {p['y']}\n"
        text += f"사진 장면 설명: {cap_block}\n"
        text += f"등록 사진 수: {len(caps)}장"

        records.append({
            "id":          str(uuid.uuid5(uuid.NAMESPACE_URL, f"sbl|{key}")),
            "text":        text,
            "doc_id":      f"SBL_{p['name'][:30]}",
            "domain_name": DOMAIN,
            "source_spec": f"사진캡션 {len(caps)}건",
            "creation_year": "2024",
            "chunk_idx":   0,
            "place_name":  p["name"],
            "address":     "",
            "x_coord":     p["x"],
            "y_coord":     p["y"],
            "vis_type":    "관광사진 캡션",
            "visit_count": len(caps),
        })
    return records


# ═══════════════════════════════════════════════════════════════
# Phase 2 – 여행 코스 (visit_area 방문 순서)
# ═══════════════════════════════════════════════════════════════

def load_visit_sequences(
    zf: zipfile.ZipFile,
    code_map: Dict[str, Dict[str, str]],
) -> Dict[str, List[Dict[str, Any]]]:
    """TRAVEL_ID → 방문지 순서 리스트."""
    reader = _csv_from_zip(zf, "tn_visit_area_info")
    if not reader:
        return {}

    vis_map = code_map.get("VIS", {})
    seq: Dict[str, List[Dict]] = defaultdict(list)

    for row in reader:
        vis_type = (row.get("VISIT_AREA_TYPE_CD") or "").strip()
        if vis_type in SKIP_VIS_TYPES:
            continue
        area_nm = (row.get("VISIT_AREA_NM") or "").strip()
        poi_nm  = (row.get("POI_NM") or "").strip()
        name    = poi_nm or area_nm
        if not name:
            continue

        travel_id = (row.get("TRAVEL_ID") or "").strip()
        try:
            order = int(row.get("VISIT_ORDER") or 0)
        except ValueError:
            order = 0

        addr = (row.get("ROAD_NM_ADDR") or row.get("LOTNO_ADDR") or "").strip()
        city = addr.split()[0] if addr else ""

        seq[travel_id].append({
            "order":   order,
            "name":    name,
            "city":    city,
            "type":    vis_map.get(vis_type, ""),
            "start":   (row.get("VISIT_START_YMD") or "").strip(),
        })

    # 정렬
    for tid in seq:
        seq[tid].sort(key=lambda x: x["order"])

    return dict(seq)


def _load_travel_info(zf: zipfile.ZipFile) -> Dict[str, Dict[str, str]]:
    """TRAVEL_ID → {mvmn_nm(이동수단), travel_persona, purpose}"""
    reader = _csv_from_zip(zf, "tn_travel_")
    if not reader:
        return {}
    info: Dict[str, Dict[str, str]] = {}
    for row in reader:
        tid = (row.get("TRAVEL_ID") or "").strip()
        info[tid] = {
            "mvmn":    (row.get("MVMN_NM") or "").strip(),
            "persona": (row.get("TRAVEL_PERSONA") or "").strip(),
        }
    return info


def build_route_records(
    sequences: Dict[str, List[Dict]],
    travel_info: Dict[str, Dict[str, str]],
) -> List[Dict[str, Any]]:
    records = []
    for tid, stops in sequences.items():
        real_stops = [s for s in stops if s["name"] not in ("집","사무실","회사","학교")]
        if len(real_stops) < 2:
            continue

        ti      = travel_info.get(tid, {})
        mvmn    = ti.get("mvmn", "")
        persona = ti.get("persona", "")

        route_str = " → ".join(s["name"] for s in real_stops)
        cities    = list(dict.fromkeys(s["city"] for s in real_stops if s["city"]))
        city_str  = ", ".join(cities[:3])
        start_dt  = real_stops[0].get("start", "")[:10] if real_stops else ""
        types     = list(dict.fromkeys(s["type"] for s in real_stops if s["type"]))

        text  = f"여행 코스: {route_str}\n"
        if city_str:
            text += f"여행 지역: {city_str}\n"
        if types:
            text += f"방문지 유형: {', '.join(types[:4])}\n"
        if mvmn:
            text += f"주요 이동수단: {mvmn}\n"
        if persona:
            text += f"여행자 유형: {persona}\n"
        if start_dt:
            text += f"여행 일자: {start_dt}\n"
        text += f"방문지 수: {len(real_stops)}곳"

        records.append({
            "id":          str(uuid.uuid5(uuid.NAMESPACE_URL, f"route|{tid}")),
            "text":        text,
            "doc_id":      f"ROUTE_{tid}",
            "domain_name": DOMAIN,
            "source_spec": city_str or None,
            "creation_year": start_dt[:4] if start_dt else "2023",
            "chunk_idx":   0,
            "place_name":  route_str[:60],
            "address":     city_str,
            "x_coord":     "",
            "y_coord":     "",
            "vis_type":    "여행 코스",
            "visit_count": len(real_stops),
            "mvmn":        mvmn,
            "persona":     persona,
        })
    return records


# ═══════════════════════════════════════════════════════════════
# Phase 3 – POI 마스터 (스트리밍)
# ═══════════════════════════════════════════════════════════════

# POI 분류 대분류 코드 (관광 관련 포함)
TOURIST_LCLASS = {
    "관광지", "음식점", "숙박", "쇼핑", "문화시설",
    "레저", "스포츠", "자연", "역사", "공원",
}

def load_poi_master(zf: zipfile.ZipFile, limit: int = 50_000) -> List[Dict[str, Any]]:
    """POI 마스터에서 주소·좌표가 있는 POI 스트리밍 로드."""
    reader = _csv_from_zip(zf, "tn_poi_master")
    if not reader:
        return []

    pois = []
    for row in reader:
        poi_nm = (row.get("POI_NM") or "").strip()
        addr   = (row.get("ROAD_NM_ADDR") or row.get("LOTNO_ADDR") or "").strip()
        x      = (row.get("X_COORD") or "").strip()
        y      = (row.get("Y_COORD") or "").strip()

        if not poi_nm or not addr or not x:
            continue

        lclass = (row.get("ASORT_LCLASDC") or "").strip()
        mclass = (row.get("ASORT_MLSFCDC") or "").strip()
        sclass = (row.get("ASORT_SDASDC") or "").strip()

        pois.append({
            "poi_id": (row.get("POI_ID") or "").strip(),
            "name":   poi_nm,
            "addr":   addr,
            "x":      x,
            "y":      y,
            "lclass": lclass,
            "mclass": mclass,
            "sclass": sclass,
        })

        if len(pois) >= limit:
            break

    return pois


def build_poi_records(pois: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    records = []
    for p in pois:
        cat_parts = [c for c in (p["lclass"], p["mclass"], p["sclass"]) if c]
        cat_str   = " > ".join(cat_parts) if cat_parts else "정보 없음"

        city = p["addr"].split()[0] if p["addr"] else ""

        text  = f"관광지명: {p['name']}\n"
        text += f"주소: {p['addr']}\n"
        if p["x"] and p["y"]:
            text += f"위치(경도/위도): {p['x']}, {p['y']}\n"
        if cat_str != "정보 없음":
            text += f"분류: {cat_str}\n"
        if city:
            text += f"지역: {city}"

        records.append({
            "id":          str(uuid.uuid5(uuid.NAMESPACE_URL, f"poi|{p['poi_id'] or p['name']}")),
            "text":        text,
            "doc_id":      f"POI_{p['name'][:30]}",
            "domain_name": DOMAIN,
            "source_spec": p["addr"] or None,
            "creation_year": "2024",
            "chunk_idx":   0,
            "place_name":  p["name"],
            "address":     p["addr"],
            "x_coord":     p["x"],
            "y_coord":     p["y"],
            "vis_type":    cat_str,
            "visit_count": 0,
            "poi_id":      p["poi_id"],
        })
    return records


# ═══════════════════════════════════════════════════════════════
# main
# ═══════════════════════════════════════════════════════════════

def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--qdrant",    default="http://localhost:6333")
    parser.add_argument("--poi-limit", type=int, default=50_000,
                        help="POI 마스터 최대 로드 건수 (기본 50000)")
    args = parser.parse_args()

    print(f"[info] Qdrant: {args.qdrant}  |  모델: {EMBED_MODEL}")
    print("[info] 임베딩 모델 로드 중...")
    encoder = SentenceTransformer(EMBED_MODEL)
    client  = QdrantClient(url=args.qdrant)

    existing = {c.name for c in client.get_collections().collections}
    if COLLECTION not in existing:
        client.create_collection(
            collection_name=COLLECTION,
            vectors_config=models.VectorParams(size=VECTOR_SIZE, distance=models.Distance.COSINE),
        )

    # ── Phase 1: SbL 캡션 ────────────────────────────────────────────────────
    print("\n[Phase 1] SbL 관광사진 캡션 처리 중...")
    if SBL_ZIP.exists():
        with zipfile.ZipFile(SBL_ZIP) as zf:
            sbl_places = load_sbl_captions(zf)
        cap_records = build_caption_records(sbl_places)
        print(f"  장소별 캡션: {len(cap_records)}개 장소")
        _upsert_batch(client, encoder, cap_records, "SbL캡션")
    else:
        print("  [skip] SbL.zip 없음")

    # ── Phase 2: 여행 코스 ───────────────────────────────────────────────────
    print("\n[Phase 2] 여행 코스 문서 생성 중...")
    all_sequences: Dict[str, List[Dict]] = {}
    all_travel_info: Dict[str, Dict] = {}

    for zip_path, label in [(TL_CSV_ZIP, "TL"), (VL_CSV_ZIP, "VL")]:
        if not zip_path.exists():
            continue
        with zipfile.ZipFile(zip_path) as zf:
            code_map = _load_codeb(zf)
            seqs     = load_visit_sequences(zf, code_map)
            tinfo    = _load_travel_info(zf)
        print(f"  [{label}] 여행 {len(seqs)}건, 여행자 정보 {len(tinfo)}건")
        all_sequences.update(seqs)
        all_travel_info.update(tinfo)

    route_records = build_route_records(all_sequences, all_travel_info)
    print(f"  총 여행 코스: {len(route_records)}개")
    _upsert_batch(client, encoder, route_records, "여행코스")

    # ── Phase 3: POI 마스터 ──────────────────────────────────────────────────
    print(f"\n[Phase 3] POI 마스터 처리 중... (최대 {args.poi_limit:,}건)")
    if OTHER_ZIP.exists():
        with zipfile.ZipFile(OTHER_ZIP) as zf:
            pois = load_poi_master(zf, limit=args.poi_limit)
        print(f"  POI 로드: {len(pois):,}개")
        poi_records = build_poi_records(pois)
        _upsert_batch(client, encoder, poi_records, "POI마스터")
    else:
        print("  [skip] Other.zip 없음")

    # ── 최종 확인 ─────────────────────────────────────────────────────────────
    count = client.get_collection(COLLECTION).points_count
    print(f"\n[done] domain_docs 총 포인트 수: {count:,}")


if __name__ == "__main__":
    main()
