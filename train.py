import numpy as np
import requests
from datetime import date, timedelta

# ─────────────────────────────────────────────
#  Config
# ─────────────────────────────────────────────
LAT           = 37.34
LON           = -121.89
DAYS_HISTORY  = 365
MODEL_PATH    = "model.npz"   # saved weights loaded by main.py

# ─────────────────────────────────────────────
#  Fetch real historical data from Open-Meteo
# ─────────────────────────────────────────────
def fetch_history(lat, lon, days):
    end   = date.today() - timedelta(days=1)
    start = end - timedelta(days=days)

    url = (
        "https://archive-api.open-meteo.com/v1/archive"
        f"?latitude={lat}&longitude={lon}"
        f"&start_date={start}&end_date={end}"
        "&daily=temperature_2m_max,temperature_2m_min,windspeed_10m_max,"
        "precipitation_sum,relative_humidity_2m_mean,surface_pressure_mean"
        "&temperature_unit=fahrenheit&wind_speed_unit=mph"
        "&precipitation_unit=inch&timezone=auto"
    )

    print(f"Fetching {days} days of history ({start} → {end})…")
    resp = requests.get(url, timeout=15)
    resp.raise_for_status()
    d = resp.json()["daily"]

    avg_temp = (np.array(d["temperature_2m_max"], dtype=float) +
                np.array(d["temperature_2m_min"], dtype=float)) / 2
    wind     = np.array(d["windspeed_10m_max"],         dtype=float)
    humidity = np.array(d["relative_humidity_2m_mean"], dtype=float)
    pressure = np.array(d["surface_pressure_mean"],     dtype=float)
    precip   = np.array(d["precipitation_sum"],         dtype=float)

    X = np.column_stack([avg_temp[:-1], wind[:-1], humidity[:-1], pressure[:-1], precip[:-1]])
    y = avg_temp[1:]

    mask = ~np.isnan(X).any(axis=1) & ~np.isnan(y)
    return X[mask], y[mask]

# ─────────────────────────────────────────────
#  Load data
# ─────────────────────────────────────────────
X, y = fetch_history(LAT, LON, DAYS_HISTORY)
print(f"Training samples: {len(X)}")

# ─────────────────────────────────────────────
#  Normalize
# ─────────────────────────────────────────────
X_mean = X.mean(axis=0)
X_std  = X.std(axis=0)
X_norm = (X - X_mean) / X_std

# ─────────────────────────────────────────────
#  Train / test split
# ─────────────────────────────────────────────
split   = int(0.8 * len(X_norm))
X_train = X_norm[:split];  y_train = y[:split]
X_test  = X_norm[split:];  y_test  = y[split:]

# ─────────────────────────────────────────────
#  Gradient descent
# ─────────────────────────────────────────────
w  = np.zeros(X_train.shape[1])
b  = 0.0
lr = 0.01
lr_decay   = 0.995
patience   = 300
min_delta  = 1e-6
best_loss  = float("inf")
no_improve = 0

for epoch in range(50_000):
    residuals = y_train - (X_train @ w + b)
    loss      = np.mean(residuals ** 2)

    if best_loss - loss > min_delta:
        best_loss  = loss
        no_improve = 0
    else:
        no_improve += 1
        if no_improve >= patience:
            print(f"Early stopping at epoch {epoch}  (best MSE {best_loss:.4f})")
            break

    w  -= lr * (-2 / len(X_train)) * (X_train.T @ residuals)
    b  -= lr * (-2 / len(X_train)) * residuals.sum()
    lr *= lr_decay

# ─────────────────────────────────────────────
#  Evaluate
# ─────────────────────────────────────────────
rmse = lambda yt, yp: np.sqrt(np.mean((yt - yp) ** 2))
print(f"Train RMSE : {rmse(y_train, X_train @ w + b):.4f} °F")
print(f"Test  RMSE : {rmse(y_test,  X_test  @ w + b):.4f} °F")

# ─────────────────────────────────────────────
#  Save weights  →  loaded by main.py
# ─────────────────────────────────────────────
np.savez(MODEL_PATH, w=w, b=np.array([b]), X_mean=X_mean, X_std=X_std)
print(f"Model saved to {MODEL_PATH}")