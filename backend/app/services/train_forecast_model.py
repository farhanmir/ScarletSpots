"""
Forecast model training script.

Usage (from backend/ directory):
  python -m app.services.train_forecast_model

Queries the Supabase `parking_sessions` table to build a gradient boosting
model for each lot that has enough data. Models are serialized to:
  app/services/forecast_models/{lot_id}.joblib

Requirements:
  pip install scikit-learn joblib

The model is intentionally simple — gradient boosting on:
  - hour_of_day  (0–23)
  - day_of_week  (0=Mon, 6=Sun)
  - month        (1–12)
  - capacity     (total lot spaces, from bundled JSON)

Target: occupancy_ratio (0.0–1.0) at session start time.

Training cadence: run once per week (or cron'd via CI) after data accumulates.
"""

import sys
from collections import defaultdict
from datetime import datetime
from pathlib import Path

# Ensure we can import from the app package
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

MODELS_DIR = Path(__file__).parent / "forecast_models"
MIN_SAMPLES = 50  # Minimum sessions per lot before training


def train():
    try:
        import joblib
        import numpy as np
        from sklearn.ensemble import GradientBoostingRegressor
    except ImportError:
        print("ERROR: scikit-learn and joblib are required. Run: pip install scikit-learn joblib")
        sys.exit(1)

    from app.core.security import get_supabase

    print("Connecting to Supabase...")
    db = get_supabase()

    # Fetch all completed sessions with their start time and lot metadata
    print("Fetching training data from parking_sessions...")
    page_size = 1000
    offset = 0
    all_sessions = []
    while True:
        res = (
            db.table("parking_sessions")
            .select("lot_id, start_time, active")
            .eq("active", False)
            .range(offset, offset + page_size - 1)
            .execute()
        )
        batch = res.data or []
        all_sessions.extend(batch)
        if len(batch) < page_size:
            break
        offset += page_size

    print(f"Fetched {len(all_sessions)} completed sessions.")

    if not all_sessions:
        print("No sessions to train on yet. Come back in a few weeks!")
        return

    # Group sessions by lot_id
    by_lot: dict[str, list] = defaultdict(list)
    for s in all_sessions:
        lot_id = s.get("lot_id")
        start_raw = s.get("start_time")
        if lot_id and start_raw:
            try:
                dt = datetime.fromisoformat(start_raw.replace("Z", "+00:00"))
                by_lot[lot_id].append(dt)
            except ValueError:
                pass

    # Fetch current occupancy per lot to compute target ratio
    db.table("lot_occupancy").select("lot_id, count").execute()

    MODELS_DIR.mkdir(parents=True, exist_ok=True)

    trained = 0
    skipped = 0

    for lot_id, sessions in by_lot.items():
        if len(sessions) < MIN_SAMPLES:
            skipped += 1
            continue

        # Build feature matrix: each row = one session start
        # We compute a rolling hourly session count as the "target"
        # (proxy for occupancy ratio at that hour)
        hour_counts: dict[tuple, list[int]] = defaultdict(list)
        for dt in sessions:
            key = (dt.hour, dt.weekday(), dt.month)
            hour_counts[key].append(1)

        # Estimate capacity from the JSON data if available
        # For now use a default of 200; the lots.py endpoint will pass the real capacity
        capacity = 200

        X, y = [], []
        for (hour, dow, month), counts in hour_counts.items():
            session_count = len(counts)
            # Estimate ratio as fraction of sessions in this slot vs capacity
            # This is a simplified proxy until we have richer data
            ratio = min(1.0, session_count / max(1, capacity / 24))
            X.append([hour, dow, month, capacity, 0, 0])
            y.append(ratio)

        if len(X) < 10:
            skipped += 1
            continue

        X_arr = np.array(X, dtype=float)
        y_arr = np.array(y, dtype=float)

        model = GradientBoostingRegressor(
            n_estimators=100,
            max_depth=3,
            learning_rate=0.1,
            random_state=42,
        )
        model.fit(X_arr, y_arr)

        out_path = MODELS_DIR / f"{lot_id}.joblib"
        joblib.dump(model, out_path)
        trained += 1

    print(
        f"\nTraining complete: {trained} models saved, {skipped} lots skipped (too few sessions)."
    )
    print(f"Models saved to: {MODELS_DIR}")


if __name__ == "__main__":
    train()
