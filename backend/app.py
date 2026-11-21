"""Fare prediction API for the GrabRide Fare Optimizer website.

Run (from the backend folder):
    python train.py          # trains on ../data/GrabRide_Data.csv and writes model.pkl
    uvicorn app:app --reload

Then set FARE_API in docs/app.js to the server's address (e.g. http://127.0.0.1:8000).

Endpoints (all GET):
    /health                                   is the model loaded
    /model-info                               MAE, price label thresholds, assumed trip values
    /predict?date=2025-12-04&time=06:45       predicted fare for one time
    /recommend?date=2025-12-04&current_time=06:45
                                              cheapest time from now until 08:00
    /predict-window?date=2025-12-04           every 5-minute slot from 06:30 to 08:00
"""

import re
from datetime import date as Date
from pathlib import Path

import joblib
import pandas as pd
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

HERE = Path(__file__).resolve().parent

WINDOW_START = 6 * 60 + 30  # 06:30
WINDOW_END = 8 * 60         # 08:00
STEP = 5

app = FastAPI(title="GrabRide Fare Optimizer API", version="1.0.0")

# The website is static (GitHub Pages or a local file), so allow any origin. Read-only API.
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["GET"], allow_headers=["*"])


def load_bundle() -> dict | None:
    # model.pkl is produced by this project's own train.py. joblib can run code when
    # loading, so never replace it with a file from somewhere you don't trust.
    try:
        return joblib.load(HERE / "model.pkl")
    except Exception:
        return None


BUNDLE = load_bundle()


def require_model() -> dict:
    if BUNDLE is None:
        raise HTTPException(503, "No trained model found. Run `python train.py` in the backend folder, then restart the server.")
    return BUNDLE


def parse_date(value: str) -> Date:
    try:
        return Date.fromisoformat(value)
    except ValueError:
        raise HTTPException(422, f"'{value}' isn't a valid date. Use YYYY-MM-DD, e.g. 2025-12-04.")


def parse_time(value: str) -> int:
    m = re.fullmatch(r"(\d{1,2}):(\d{2})", value.strip())
    if not m or int(m[1]) > 23 or int(m[2]) > 59:
        raise HTTPException(422, f"'{value}' isn't a valid time. Use HH:MM, e.g. 06:45.")
    return int(m[1]) * 60 + int(m[2])


def fmt_time(minutes: int) -> str:
    return f"{minutes // 60:02d}:{minutes % 60:02d}"


def price_label(price: float, thresholds: dict) -> str:
    if price <= thresholds["low"]:
        return "Cheap"
    if price <= thresholds["high"]:
        return "Average"
    return "Pricey"


def predict_minutes(day: Date, minutes: list[int]) -> list[float]:
    """predict_for_time() from the notebook, batched: median trip, varying time and weekday."""
    bundle = require_model()
    rows = []
    for m in minutes:
        row = dict(bundle["medians"])
        row["minute_of_the_day"] = m
        row["day_of_the_week"] = day.weekday()
        rows.append(row)
    X = pd.DataFrame(rows, columns=bundle["features"])
    return [round(float(p), 2) for p in bundle["model"].predict(X)]


@app.get("/health")
def health():
    return {"status": "ok", "model_loaded": BUNDLE is not None}


@app.get("/model-info")
def model_info():
    bundle = require_model()
    return {
        "mae_RM": round(bundle["mae"], 2),
        "price_thresholds_RM": {k: round(v, 2) for k, v in bundle["thresholds"].items()},
        "assumed_trip": bundle["medians"],
        "features": bundle["features"],
        "rows_trained_on": bundle.get("rows"),
        "trained_at": bundle.get("trained_at"),
    }


@app.get("/predict")
def predict(date: str = Query(..., description="YYYY-MM-DD"), time: str = Query(..., description="HH:MM")):
    bundle = require_model()
    day, minute = parse_date(date), parse_time(time)
    price = predict_minutes(day, [minute])[0]
    return {
        "date": day.isoformat(),
        "time": fmt_time(minute),
        "predicted_price_RM": price,
        "price_label": price_label(price, bundle["thresholds"]),
        "mae_RM": round(bundle["mae"], 2),
    }


@app.get("/recommend")
def recommend(date: str = Query(..., description="YYYY-MM-DD"), current_time: str = Query(..., description="HH:MM")):
    """recommend_booking_time() from the notebook: cheapest 5-minute slot from now until 08:00."""
    bundle = require_model()
    day, start = parse_date(date), parse_time(current_time)
    if start > WINDOW_END:
        return {"message": "No valid recommendation window remaining. Please select a time manually."}

    minutes = list(range(start, WINDOW_END + 1, STEP))
    prices = predict_minutes(day, minutes)
    best = min(range(len(prices)), key=prices.__getitem__)  # earliest on ties, like idxmin()
    return {
        "recommended_time": fmt_time(minutes[best]),
        "expected_price_RM": prices[best],
        "price_label": price_label(prices[best], bundle["thresholds"]),
        "all_predictions": [{"time": fmt_time(m), "price": p} for m, p in zip(minutes, prices)],
    }


@app.get("/predict-window")
def predict_window(date: str = Query(..., description="YYYY-MM-DD")):
    """Every slot from 06:30 to 08:00, in the shape the website expects."""
    day = parse_date(date)
    minutes = list(range(WINDOW_START, WINDOW_END + 1, STEP))
    return [{"time": fmt_time(m), "price": p} for m, p in zip(minutes, predict_minutes(day, minutes))]
