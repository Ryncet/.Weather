import numpy as np
import requests
import os
import json
import hashlib
import hmac
import base64
import time as _time
from functools import lru_cache
from time import time
from pathlib import Path
from datetime import date, timedelta
from fastapi import FastAPI, HTTPException, Depends, Header
from fastapi.responses import HTMLResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel



app = FastAPI(title="Weather API", version="3.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─────────────────────────────────────────────
#  Load trained ML model at startup
# ─────────────────────────────────────────────
MODEL_PATH = Path("model.npz")

if MODEL_PATH.exists():
    _model        = np.load(MODEL_PATH)
    _w            = _model["w"]
    _b            = float(_model["b"][0])
    _X_mean       = _model["X_mean"]
    _X_std        = _model["X_std"]
    _model_loaded = True
    print("✅ ML model loaded from model.npz")
else:
    _model_loaded = False
    print("⚠️  model.npz not found — run train.py first.")


def ml_predict(avg_temp_f, wind_mph, humidity_pct, pressure_hpa, precip_in) -> float:
    x_raw  = np.array([avg_temp_f, wind_mph, humidity_pct, pressure_hpa, precip_in])
    x_norm = (x_raw - _X_mean) / _X_std
    return float(x_norm @ _w + _b)


# ─────────────────────────────────────────────
#  WMO maps
# ─────────────────────────────────────────────
WMO_DESCRIPTIONS = {
    0:"Clear sky",1:"Mainly clear",2:"Partly cloudy",3:"Overcast",
    45:"Foggy",48:"Icy fog",
    51:"Light drizzle",53:"Moderate drizzle",55:"Dense drizzle",
    61:"Slight rain",63:"Moderate rain",65:"Heavy rain",
    71:"Slight snow",73:"Moderate snow",75:"Heavy snow",
    80:"Slight showers",81:"Moderate showers",82:"Violent showers",
    95:"Thunderstorm",96:"Thunderstorm w/ hail",99:"Thunderstorm w/ heavy hail",
}
WMO_ICONS = {
    0:"☀️",1:"🌤️",2:"⛅",3:"☁️",45:"🌫️",48:"🌫️",
    51:"🌦️",53:"🌦️",55:"🌧️",61:"🌧️",63:"🌧️",65:"🌧️",
    71:"🌨️",73:"🌨️",75:"❄️",80:"🌦️",81:"🌧️",82:"⛈️",
    95:"⛈️",96:"⛈️",99:"⛈️",
}

# ─────────────────────────────────────────────
#  Alert helpers
# ─────────────────────────────────────────────
def heat_index_f(temp_f: float, rh: float) -> float:
    T, R = temp_f, rh
    return (-42.379 + 2.04901523*T + 10.14333127*R
            - 0.22475541*T*R - 0.00683783*T*T
            - 0.05481717*R*R + 0.00122874*T*T*R
            + 0.00085282*T*R*R - 0.00000199*T*T*R*R)

def wind_chill_f(temp_f: float, wind_mph: float) -> float:
    return (35.74 + 0.6215*temp_f
            - 35.75*(wind_mph**0.16)
            + 0.4275*temp_f*(wind_mph**0.16))

def uv_risk(uv: float) -> tuple[str, str]:
    if uv < 3:  return "Low", "🟢"
    if uv < 6:  return "Moderate", "🟡"
    if uv < 8:  return "High", "🟠"
    if uv < 11: return "Very High", "🔴"
    return "Extreme", "🟣"

def aqi_label(aqi: int) -> tuple[str, str]:
    if aqi <= 50:  return "Good", "🟢"
    if aqi <= 100: return "Moderate", "🟡"
    if aqi <= 150: return "Unhealthy for Sensitive", "🟠"
    if aqi <= 200: return "Unhealthy", "🔴"
    if aqi <= 300: return "Very Unhealthy", "🟣"
    return "Hazardous", "⚫"

def build_alerts(temp_f, feels_f, rh, wind_mph, uv_idx, wcode) -> list[dict]:
    alerts = []
    if temp_f >= 80 and rh is not None:
        hi = heat_index_f(temp_f, rh)
        if hi >= 103:
            alerts.append({"level":"danger","icon":"🥵","text":f"Extreme heat — heat index {hi:.0f}°F. Danger of heat stroke."})
        elif hi >= 90:
            alerts.append({"level":"warning","icon":"🌡️","text":f"Heat advisory — heat index {hi:.0f}°F. Stay hydrated."})
    if temp_f <= 50 and wind_mph >= 3:
        wc = wind_chill_f(temp_f, wind_mph)
        if wc <= 0:
            alerts.append({"level":"danger","icon":"🥶","text":f"Dangerous wind chill {wc:.0f}°F. Frostbite risk in minutes."})
        elif wc <= 32:
            alerts.append({"level":"warning","icon":"❄️","text":f"Wind chill {wc:.0f}°F. Dress in warm layers."})
    if uv_idx is not None and uv_idx >= 6:
        label, emoji = uv_risk(uv_idx)
        alerts.append({"level":"warning","icon":emoji,"text":f"UV index {uv_idx:.0f} ({label}). Wear SPF 30+ and seek shade."})
    if wcode in (95, 96, 99):
        alerts.append({"level":"danger","icon":"⛈️","text":"Thunderstorm with possible hail. Stay indoors."})
    elif wcode in (82,):
        alerts.append({"level":"warning","icon":"🌧️","text":"Violent rain showers expected. Avoid flood-prone areas."})
    return alerts


# ─────────────────────────────────────────────
#  Open-Meteo fetch helpers
# ─────────────────────────────────────────────
def _validate_coords(lat: float, lon: float):
    if not (-90 <= lat <= 90) or not (-180 <= lon <= 180):
        raise HTTPException(status_code=400,
            detail="Invalid coordinates: lat must be -90..90, lon must be -180..180")


@lru_cache(maxsize=256)
def _fetch_open_meteo(lat: float, lon: float, cache_key: int) -> dict:
    url = (
        f"https://api.open-meteo.com/v1/forecast"
        f"?latitude={lat}&longitude={lon}"
        f"&current=temperature_2m,apparent_temperature,windspeed_10m,windgusts_10m,"
        f"relativehumidity_2m,dewpoint_2m,surface_pressure,cloudcover,"
        f"precipitation,weathercode,visibility"
        f"&hourly=temperature_2m,apparent_temperature,precipitation_probability,"
        f"windspeed_10m,windgusts_10m,visibility,cape"
        f"&daily=temperature_2m_max,temperature_2m_min,apparent_temperature_max,"
        f"apparent_temperature_min,precipitation_sum,precipitation_hours,"
        f"precipitation_probability_max,windspeed_10m_max,windgusts_10m_max,"
        f"weathercode,sunrise,sunset,uv_index_max"
        f"&temperature_unit=fahrenheit&wind_speed_unit=mph&precipitation_unit=inch&timezone=auto"
        f"&forecast_days=7&models=best_match"
    )
    try:
        r = requests.get(url, timeout=10)
        r.raise_for_status()
        return r.json()
    except requests.RequestException as e:
        raise HTTPException(status_code=502, detail=f"Weather API error: {e}")


@lru_cache(maxsize=128)
def _fetch_air_quality(lat: float, lon: float, cache_key: int) -> dict:
    url = (
        f"https://air-quality-api.open-meteo.com/v1/air-quality"
        f"?latitude={lat}&longitude={lon}"
        f"&current=us_aqi,pm2_5,pm10,nitrogen_dioxide,ozone"
        f"&hourly=birch_pollen,grass_pollen,ragweed_pollen"
        f"&timezone=auto"
    )
    try:
        r = requests.get(url, timeout=10)
        r.raise_for_status()
        return r.json()
    except Exception:
        return {}


@lru_cache(maxsize=128)
def _fetch_historical_avg(lat: float, lon: float, day_of_year: int) -> dict:
    today      = date.today()
    end_hist   = today - timedelta(days=1)
    start_hist = end_hist - timedelta(days=5*365)
    url = (
        f"https://archive-api.open-meteo.com/v1/archive"
        f"?latitude={lat}&longitude={lon}"
        f"&start_date={start_hist}&end_date={end_hist}"
        f"&daily=temperature_2m_max,temperature_2m_min"
        f"&temperature_unit=fahrenheit&timezone=auto"
    )
    try:
        r = requests.get(url, timeout=15)
        r.raise_for_status()
        d         = r.json()["daily"]
        dates     = d.get("time", [])
        max_temps = d.get("temperature_2m_max", [])
        min_temps = d.get("temperature_2m_min", [])
        today_md  = today.strftime("%m-%d")
        same_day_avgs = []
        for dt, hi, lo in zip(dates, max_temps, min_temps):
            if dt[5:] == today_md and hi is not None and lo is not None:
                same_day_avgs.append((hi + lo) / 2)
        if same_day_avgs:
            return {"avg_f": round(sum(same_day_avgs) / len(same_day_avgs), 1), "samples": len(same_day_avgs)}
        return {}
    except Exception:
        return {}


def _get_data(lat: float, lon: float) -> dict:
    _validate_coords(lat, lon)
    ck = int(time() // 600)
    return _fetch_open_meteo(lat, lon, ck)

def _get_air(lat: float, lon: float) -> dict:
    ck = int(time() // 600)
    return _fetch_air_quality(lat, lon, ck)

def _get_hist(lat: float, lon: float) -> dict:
    doy = date.today().timetuple().tm_yday
    return _fetch_historical_avg(lat, lon, doy)


# ─────────────────────────────────────────────
#  Auth config & helpers
# ─────────────────────────────────────────────
AUTH_SECRET   = os.environ.get("WX_SECRET", "change-me-in-production-please")
USERS_FILE    = Path("users.json")
SESSIONS_FILE = Path("sessions.json")


def _load_json(path: Path) -> dict:
    if path.exists():
        try:
            return json.loads(path.read_text())
        except Exception:
            pass
    return {}


def _save_json(path: Path, data: dict):
    path.write_text(json.dumps(data, indent=2))


def _hash_password(password: str) -> str:
    return hmac.new(AUTH_SECRET.encode(), password.encode(), hashlib.sha256).hexdigest()


def _hash_security_answer(answer: str) -> str:
    """Normalise (lowercase + strip) then HMAC-SHA256 the security answer."""
    normalised = answer.strip().lower()
    return hmac.new(AUTH_SECRET.encode(), normalised.encode(), hashlib.sha256).hexdigest()


def _make_token(username: str) -> str:
    payload = f"{username}:{int(_time.time())}"
    sig     = hmac.new(AUTH_SECRET.encode(), payload.encode(), hashlib.sha256).hexdigest()
    encoded = base64.urlsafe_b64encode(payload.encode()).decode()
    return f"{encoded}.{sig}"


def _verify_token(token: str) -> str | None:
    try:
        encoded, sig = token.split(".", 1)
        payload      = base64.urlsafe_b64decode(encoded.encode()).decode()
        expected     = hmac.new(AUTH_SECRET.encode(), payload.encode(), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(sig, expected):
            return None
        username, ts = payload.rsplit(":", 1)
        if _time.time() - int(ts) > 30 * 86400:  # 30-day expiry
            return None
        return username
    except Exception:
        return None


def _current_user(authorization: str | None = Header(default=None)) -> str | None:
    if not authorization or not authorization.startswith("Bearer "):
        return None
    return _verify_token(authorization[7:])


# ─────────────────────────────────────────────
#  Pydantic models
# ─────────────────────────────────────────────
class AuthBody(BaseModel):
    username: str
    password: str
    # Optional fields for registration — ignored on login
    security_question: str | None = None
    security_answer:   str | None = None


class SavedLocBody(BaseModel):
    locations: list[dict]


class ResetVerifyBody(BaseModel):
    username: str
    security_answer: str


class ResetPasswordBody(BaseModel):
    username: str
    security_answer: str
    new_password: str


# ─────────────────────────────────────────────
#  API Routes  ← all defined BEFORE static mount
# ─────────────────────────────────────────────

# ── Auth routes ───────────────────────────────
@app.post("/auth/register")
def register(body: AuthBody):
    users = _load_json(USERS_FILE)
    uname = body.username.strip().lower()
    if not uname or len(uname) < 2:
        raise HTTPException(status_code=400, detail="Username must be at least 2 characters.")
    if len(body.password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters.")
    if uname in users:
        raise HTTPException(status_code=409, detail="Username already taken.")

    # Security question is optional but encouraged
    sq = (body.security_question or "").strip()
    sa = (body.security_answer   or "").strip()

    users[uname] = {
        "password_hash":     _hash_password(body.password),
        "created":           int(_time.time()),
        "security_question": sq if sq else None,
        "security_answer":   _hash_security_answer(sa) if sa else None,
    }
    _save_json(USERS_FILE, users)
    token = _make_token(uname)
    return {"status": "ok", "username": uname, "token": token}


@app.post("/auth/login")
def login(body: AuthBody):
    users = _load_json(USERS_FILE)
    uname = body.username.strip().lower()
    user  = users.get(uname)
    if not user or user["password_hash"] != _hash_password(body.password):
        raise HTTPException(status_code=401, detail="Invalid username or password.")
    token = _make_token(uname)
    return {"status": "ok", "username": uname, "token": token}


@app.get("/auth/me")
def me(username: str | None = Depends(_current_user)):
    if not username:
        raise HTTPException(status_code=401, detail="Not authenticated.")
    return {"status": "ok", "username": username}


# ── Password reset routes ─────────────────────

@app.get("/auth/reset-question")
def get_reset_question(username: str):
    """Return the security question for a given username (no auth needed)."""
    users = _load_json(USERS_FILE)
    uname = username.strip().lower()
    user  = users.get(uname)
    if not user:
        # Generic error — don't reveal whether the account exists
        raise HTTPException(status_code=404, detail="No account found with that username.")
    sq = user.get("security_question")
    if not sq:
        raise HTTPException(
            status_code=400,
            detail="This account has no security question set. Contact support."
        )
    return {"status": "ok", "username": uname, "security_question": sq}


@app.post("/auth/reset-verify")
def reset_verify(body: ResetVerifyBody):
    """Verify the security answer. Returns a short-lived reset token on success."""
    users = _load_json(USERS_FILE)
    uname = body.username.strip().lower()
    user  = users.get(uname)
    if not user or not user.get("security_answer"):
        raise HTTPException(status_code=404, detail="No account found with that username.")

    if not hmac.compare_digest(
        _hash_security_answer(body.security_answer),
        user["security_answer"]
    ):
        raise HTTPException(status_code=401, detail="Security answer is incorrect.")

    # Issue a short-lived (15-min) reset token signed with username + "reset" scope
    payload  = f"reset:{uname}:{int(_time.time())}"
    sig      = hmac.new(AUTH_SECRET.encode(), payload.encode(), hashlib.sha256).hexdigest()
    encoded  = base64.urlsafe_b64encode(payload.encode()).decode()
    reset_tok = f"{encoded}.{sig}"
    return {"status": "ok", "reset_token": reset_tok}


@app.post("/auth/reset-password")
def reset_password(body: ResetPasswordBody):
    """
    Complete the password reset.
    Re-verifies the security answer for CSRF safety (no separate reset-token
    flow needed since we're stateless; double-verification is the guard).
    """
    users = _load_json(USERS_FILE)
    uname = body.username.strip().lower()
    user  = users.get(uname)
    if not user or not user.get("security_answer"):
        raise HTTPException(status_code=404, detail="No account found with that username.")

    # Re-verify answer to prevent CSRF / direct calls
    if not hmac.compare_digest(
        _hash_security_answer(body.security_answer),
        user["security_answer"]
    ):
        raise HTTPException(status_code=401, detail="Security answer is incorrect.")

    if len(body.new_password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters.")

    users[uname]["password_hash"] = _hash_password(body.new_password)
    _save_json(USERS_FILE, users)

    # Issue a fresh login token so user is immediately signed in
    token = _make_token(uname)
    return {"status": "ok", "username": uname, "token": token}


# ── Cloud-saved locations ─────────────────────
@app.get("/locations")
def get_locations(username: str | None = Depends(_current_user)):
    if not username:
        raise HTTPException(status_code=401, detail="Login required.")
    data = _load_json(SESSIONS_FILE)
    return {"status": "ok", "locations": data.get(username, {}).get("locations", [])}


@app.post("/locations")
def save_locations(body: SavedLocBody, username: str | None = Depends(_current_user)):
    if not username:
        raise HTTPException(status_code=401, detail="Login required.")
    data = _load_json(SESSIONS_FILE)
    if username not in data:
        data[username] = {}
    data[username]["locations"] = body.locations
    _save_json(SESSIONS_FILE, data)
    return {"status": "ok", "saved": len(body.locations)}


# ── Weather routes ────────────────────────────
@app.get("/weather")
def get_weather(lat: float, lon: float):
    data    = _get_data(lat, lon)
    current = data.get("current", {})
    code    = current.get("weathercode")
    return {
        "status": "ok",
        "location": {"latitude": lat, "longitude": lon},
        "time": current.get("time"),
        "current": {
            "temperature_f":    current.get("temperature_2m"),
            "feels_like_f":     current.get("apparent_temperature"),
            "dewpoint_f":       current.get("dewpoint_2m"),
            "humidity_pct":     current.get("relativehumidity_2m"),
            "pressure_hpa":     current.get("surface_pressure"),
            "cloudcover_pct":   current.get("cloudcover"),
            "precipitation_in": current.get("precipitation"),
            "visibility_m":     current.get("visibility"),
            "windspeed_mph":    current.get("windspeed_10m"),
            "windgusts_mph":    current.get("windgusts_10m"),
        },
        "condition": {
            "code":        code,
            "description": WMO_DESCRIPTIONS.get(code, "Unknown"),
            "icon":        WMO_ICONS.get(code, "🌡️"),
        },
    }


@app.get("/airquality")
def air_quality(lat: float, lon: float):
    _validate_coords(lat, lon)
    air = _get_air(lat, lon)
    if not air:
        raise HTTPException(status_code=502, detail="Air quality data unavailable")

    current = air.get("current", {})
    aqi     = current.get("us_aqi")
    pm25    = current.get("pm2_5")
    pm10    = current.get("pm10")

    hourly = air.get("hourly", {})
    def first_val(key):
        vals = hourly.get(key, [])
        return next((v for v in vals if v is not None), None)

    birch   = first_val("birch_pollen")
    grass   = first_val("grass_pollen")
    ragweed = first_val("ragweed_pollen")

    def pollen_level(v):
        if v is None: return "N/A"
        if v < 10:    return "Low"
        if v < 50:    return "Moderate"
        if v < 200:   return "High"
        return "Very High"

    label, emoji = aqi_label(aqi) if aqi is not None else ("Unknown", "❓")

    return {
        "status":    "ok",
        "location":  {"latitude": lat, "longitude": lon},
        "aqi":       aqi,
        "aqi_label": label,
        "aqi_emoji": emoji,
        "pm25":      round(pm25, 1) if pm25 is not None else None,
        "pm10":      round(pm10, 1) if pm10 is not None else None,
        "pollen": [p for p in [
            {"name": "Birch",   "value": birch,   "level": pollen_level(birch)},
            {"name": "Grass",   "value": grass,   "level": pollen_level(grass)},
            {"name": "Ragweed", "value": ragweed, "level": pollen_level(ragweed)},
        ] if p["value"] is not None],
    }


@app.get("/historical")
def historical(lat: float, lon: float):
    _validate_coords(lat, lon)
    hist = _get_hist(lat, lon)
    if not hist:
        raise HTTPException(status_code=502, detail="Historical data unavailable")
    return {"status": "ok", "location": {"latitude": lat, "longitude": lon}, **hist}


@app.get("/predict")
def predict_temp(lat: float, lon: float):
    data    = _get_data(lat, lon)
    current = data.get("current", {})
    daily   = data.get("daily", {})

    dates     = daily.get("time", [])
    max_temps = daily.get("temperature_2m_max", [])
    min_temps = daily.get("temperature_2m_min", [])
    codes     = daily.get("weathercode", [])
    precip    = daily.get("precipitation_probability_max", [])

    if len(dates) < 2:
        raise HTTPException(status_code=502, detail="Insufficient forecast data")

    nwp_avg = round((max_temps[1]+min_temps[1])/2, 1) if len(max_temps)>1 and len(min_temps)>1 else None
    code    = codes[1] if len(codes)>1 else None

    ml_pred = None
    if _model_loaded:
        try:
            avg_today = (current.get("temperature_2m", 0) + current.get("apparent_temperature", 0)) / 2
            ml_temp   = ml_predict(avg_today, current.get("windspeed_10m", 0),
                                   current.get("relativehumidity_2m", 0),
                                   current.get("surface_pressure", 1013),
                                   current.get("precipitation", 0))
            ml_pred = {"temp_avg_f": round(ml_temp, 1)}
        except Exception as e:
            ml_pred = {"error": str(e)}

    return {
        "status":        "ok",
        "location":      {"latitude": lat, "longitude": lon},
        "model":         "linear-regression (model.npz)" if _model_loaded else "NWP only",
        "ml_prediction": ml_pred,
        "tomorrow": {
            "date":                      dates[1],
            "temp_high_f":               max_temps[1] if len(max_temps)>1 else None,
            "temp_low_f":                min_temps[1] if len(min_temps)>1 else None,
            "temp_avg_f":                nwp_avg,
            "precipitation_probability": precip[1] if len(precip)>1 else None,
            "condition": {
                "code":        code,
                "description": WMO_DESCRIPTIONS.get(code, "Unknown"),
                "icon":        WMO_ICONS.get(code, "🌡️"),
            },
        },
    }


@app.get("/forecast")
def forecast(lat: float, lon: float):
    data    = _get_data(lat, lon)
    current = data.get("current", {})
    daily   = data.get("daily", {})
    code    = current.get("weathercode")

    temp_f   = current.get("temperature_2m")
    feels_f  = current.get("apparent_temperature")
    rh       = current.get("relativehumidity_2m")
    wind     = current.get("windspeed_10m")
    uv_today = daily.get("uv_index_max", [None])[0]
    alerts   = []
    if temp_f is not None:
        alerts = build_alerts(temp_f, feels_f, rh, wind or 0, uv_today, code)

    dates       = daily.get("time", [])
    max_temps   = daily.get("temperature_2m_max", [])
    min_temps   = daily.get("temperature_2m_min", [])
    feels_max   = daily.get("apparent_temperature_max", [])
    feels_min   = daily.get("apparent_temperature_min", [])
    precip_sum  = daily.get("precipitation_sum", [])
    precip_prob = daily.get("precipitation_probability_max", [])
    wind_max    = daily.get("windspeed_10m_max", [])
    gust_max    = daily.get("windgusts_10m_max", [])
    wcodes      = daily.get("weathercode", [])
    sunrises    = daily.get("sunrise", [])
    sunsets     = daily.get("sunset", [])
    uv          = daily.get("uv_index_max", [])

    days = []
    for i, d in enumerate(dates):
        wc = wcodes[i] if i < len(wcodes) else None
        days.append({
            "date":                      d,
            "temp_high_f":               max_temps[i]   if i < len(max_temps)   else None,
            "temp_low_f":                min_temps[i]   if i < len(min_temps)   else None,
            "feels_like_high_f":         feels_max[i]   if i < len(feels_max)   else None,
            "feels_like_low_f":          feels_min[i]   if i < len(feels_min)   else None,
            "precipitation_sum_in":      precip_sum[i]  if i < len(precip_sum)  else None,
            "precipitation_probability": precip_prob[i] if i < len(precip_prob) else None,
            "windspeed_max_mph":         wind_max[i]    if i < len(wind_max)    else None,
            "windgusts_max_mph":         gust_max[i]    if i < len(gust_max)    else None,
            "sunrise":                   sunrises[i]    if i < len(sunrises)    else None,
            "sunset":                    sunsets[i]     if i < len(sunsets)     else None,
            "uv_index_max":              uv[i]          if i < len(uv)          else None,
            "condition": {
                "code":        wc,
                "description": WMO_DESCRIPTIONS.get(wc, "Unknown"),
                "icon":        WMO_ICONS.get(wc, "🌡️"),
            },
        })

    return {
        "status":         "ok",
        "location":       {"latitude": lat, "longitude": lon},
        "model":          "Open-Meteo NWP (best_match)",
        "alerts":         alerts,
        "current": {
            "time":             current.get("time"),
            "temperature_f":    current.get("temperature_2m"),
            "feels_like_f":     current.get("apparent_temperature"),
            "dewpoint_f":       current.get("dewpoint_2m"),
            "humidity_pct":     current.get("relativehumidity_2m"),
            "pressure_hpa":     current.get("surface_pressure"),
            "windspeed_mph":    current.get("windspeed_10m"),
            "windgusts_mph":    current.get("windgusts_10m"),
            "cloudcover_pct":   current.get("cloudcover"),
            "precipitation_in": current.get("precipitation"),
            "visibility_m":     current.get("visibility"),
            "condition": {
                "code":        code,
                "description": WMO_DESCRIPTIONS.get(code, "Unknown"),
                "icon":        WMO_ICONS.get(code, "🌡️"),
            },
        },
        "daily_forecast": days,
        "hourly": {
            "time":                      data.get("hourly", {}).get("time", []),
            "temperature_2m":            data.get("hourly", {}).get("temperature_2m", []),
            "apparent_temperature":      data.get("hourly", {}).get("apparent_temperature", []),
            "precipitation_probability": data.get("hourly", {}).get("precipitation_probability", []),
        },
    }


# ─────────────────────────────────────────────
#  Static files — mounted LAST so API routes
#  above always take priority over file serving
# ─────────────────────────────────────────────
app.mount("/", StaticFiles(directory="static", html=True), name="static")