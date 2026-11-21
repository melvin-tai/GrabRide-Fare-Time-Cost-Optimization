"""Trains the fare model from the notebook and saves it for the API.

Usage (from the backend folder):
    python train.py                       # uses ../data/GrabRide_Data.csv
    python train.py --data other.csv

Writes:
    model.pkl             the random forest plus what the API needs to use it
    feature_columns.json  the feature order the model expects
"""

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path

import joblib
import pandas as pd
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_absolute_error
from sklearn.model_selection import train_test_split

HERE = Path(__file__).resolve().parent
DEFAULT_DATA = HERE.parent / "data" / "GrabRide_Data.csv"
TARGET = "fare_standard_RM"
BASE_FEATURES = [
    "minute_of_the_day",
    "day_of_the_week",
    "driver_est_min",
    "distance_km",
    "duration_min",
    "imap_distance_km",
    "imap_duration_min",
    "tolls_true_false",
]


def build_features(df: pd.DataFrame) -> tuple[pd.DataFrame, pd.Series, list[str]]:
    # Formatting and creating new columns.
    df = df.copy()
    df["datetime"] = pd.to_datetime(df["date"] + " " + df["time"], format="%m/%d/%Y %H:%M")
    df["minute_of_the_day"] = df["datetime"].dt.hour * 60 + df["datetime"].dt.minute
    df["day_of_the_week"] = df["datetime"].dt.weekday

    # Creating dummy columns.
    df_encoded = pd.get_dummies(df, columns=["fastest_route", "weather"], drop_first=True)

    features = list(BASE_FEATURES)
    features += [c for c in df_encoded.columns if c.startswith("fastest_route_")]
    features += [c for c in df_encoded.columns if c.startswith("weather_")]

    return df_encoded[features], df_encoded[TARGET], features


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--data", default=str(DEFAULT_DATA), help="path to GrabRide_Data.csv")
    args = parser.parse_args()

    df = pd.read_csv(args.data)
    X, y, features = build_features(df)

    # Constructing the Random Forest Regression model.
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)
    fare_model = RandomForestRegressor(n_estimators=300, max_depth=12, min_samples_leaf=3, random_state=42)
    fare_model.fit(X_train, y_train)

    # Calculating the Mean Absolute Error.
    mae = mean_absolute_error(y_test, fare_model.predict(X_test))

    bundle = {
        "model": fare_model,
        "features": features,
        # predict_for_time() holds every feature except time and weekday at its median.
        "medians": {k: float(v) for k, v in X.median().items()},
        # price_label() thresholds.
        "thresholds": {"low": float(y.quantile(0.33)), "high": float(y.quantile(0.67))},
        "mae": float(mae),
        "rows": int(len(df)),
        "trained_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    }
    joblib.dump(bundle, HERE / "model.pkl")
    (HERE / "feature_columns.json").write_text(json.dumps(features, indent=2) + "\n")

    print(f"Trained on {len(df)} rides.")
    print(f"Fare Prediction MAE: RM {mae:.2f}")
    print(f"Price labels: Cheap <= RM {bundle['thresholds']['low']:.2f} < Average <= RM {bundle['thresholds']['high']:.2f} < Pricey")
    print(f"Saved model.pkl and feature_columns.json to {HERE}")


if __name__ == "__main__":
    main()
