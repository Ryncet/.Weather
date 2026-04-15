# .Weather
🌦️ Weather Dashboard API + Frontend

A full-stack weather application featuring real-time forecasts, air quality data, historical climate analysis, and a lightweight machine learning temperature prediction model.

Built with FastAPI + Open-Meteo + NumPy + vanilla frontend.

🚀 Features
🌤️ Weather System
Real-time current weather data
7-day detailed forecast
Hourly weather breakdown
Weather condition icons (WMO standard mapping)
🌫️ Air Quality & Environment
US AQI index (Air Quality Index)
PM2.5 & PM10 readings
Pollen tracking (grass, ragweed, birch)
⚠️ Smart Weather Alerts

Automatically generated alerts for:

Heat index warnings 🥵
Wind chill warnings 🥶
UV risk levels ☀️
Severe storms ⛈️
🤖 Machine Learning Prediction
Linear regression model trained on historical weather data
Uses:
Temperature
Wind speed
Humidity
Pressure
Precipitation
Outputs predicted average temperature

Model stored as:

model.npz
📊 Historical Weather Analysis
Fetches up to 5 years of historical climate data
Computes seasonal averages for comparison
Used for “climate normal” comparisons in UI
🔐 Authentication System
User registration + login (token-based auth)
Password hashing with HMAC-SHA256
Optional security question recovery system
30-day session token expiration
☁️ Cloud-Synced Locations
Save multiple locations per user
Sync across devices
Local fallback storage support
🧠 Tech Stack
Backend
FastAPI
NumPy
Requests
HMAC authentication system
LRU caching for API optimization
APIs
Open-Meteo Weather API
Open-Meteo Air Quality API
Open-Meteo Archive API
Frontend
Vanilla HTML/CSS/JS
Chart.js (for graphs)
Fully themed UI system (20+ themes)
Particle background effects
📡 API Endpoints
🌤️ Weather
GET /weather?lat=&lon=
GET /forecast?lat=&lon=
GET /predict?lat=&lon=
🌫️ Air Quality
GET /airquality?lat=&lon=
📊 Historical Data
GET /historical?lat=&lon=
👤 Authentication
POST /auth/register
POST /auth/login
GET  /auth/me
🔑 Password Reset
GET  /auth/reset-question?username=
POST /auth/reset-verify
POST /auth/reset-password
📍 Saved Locations
GET  /locations
POST /locations
🧪 How to Run
1. Install dependencies
pip install fastapi uvicorn numpy requests
2. Train ML model (optional but recommended)
python train.py
3. Start server
uvicorn main:app --reload
4. Open in browser
http://localhost:8000
📁 Project Structure
/static            → frontend (HTML/CSS/JS)
/model.npz         → trained ML model
/users.json        → stored user accounts
/sessions.json     → saved locations
main.py            → FastAPI backend
train.py           → ML training script
facts.py           → weather fun facts module
⚡ Highlights
Fully offline-capable frontend (except API calls)
Real-time weather + environmental intelligence
Custom ML prediction layer on top of NWP data
Secure authentication with password recovery
Highly modular backend design
Multi-theme UI system (20+ themes)
🧠 Notes
Uses Open-Meteo “best_match” model for forecasting
ML model is supplemental (not primary forecast source)
Data is cached to reduce API load
Designed for extensibility (easy to add new weather features)
📌 Future Ideas
Radar map overlay
Storm tracking visualization
Push notifications for alerts
Better ML model (LSTM / time-series)
Mobile app wrapper
