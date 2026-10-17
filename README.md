# CareDebt: Live Interview + Care Navigator

A frontend-only hackathon prototype: webcam/avatar, speech or typing, synthetic hidden-cost calculations, symptom **intake** (not diagnosis), public OpenStreetMap facility lookup, and a printable access plan.

## Run

Requires Node.js 16.20.2 (pinned in `.nvmrc`).

```powershell
cd "E:\Vandy\Fall_2026\Hackathon\caredebt-skeleton"
node -v
npm.cmd install
npm.cmd run dev
```

Open the local URL printed by Vite (usually http://localhost:5173).

## Features

- **Step 1 — Health concern intake:** accepts self-reported symptoms, checks a small set of explicit emergency warning *phrases* and displays conservative safety messaging. This is **not** diagnosis, medical triage, emergency detection, or clinical decision support. It cannot rule out emergencies, and keyword detection misses many presentations.
- **Step 2 — Real location lookup:** enter a city/state (geocoded with OpenStreetMap Nominatim) or explicitly opt in to browser geolocation. Facility search queries public OpenStreetMap Overpass data within 10 km. Results are unverified directory listings, not appointment/insurance/availability data. Public endpoints may be rate limited or temporarily unavailable. External Google Maps and HRSA links are provided as fallbacks.
- **Step 3 — Care access plan:** combines user-provided scenario costs with a chosen facility and checklist; print or save to PDF from the browser.
- **Live Interview:** camera preview, mock avatar, typing and browser speech-to-text, optional text-to-speech. This interview is scripted and not linked to symptom intake. Its extracted numeric costs update Patient B and the plan.

## Privacy and limitations

- No backend, database, accounts, or AI API. Symptom text and profile values are held only in React memory and cleared on refresh.
- City queries or device coordinates go to public mapping services only when searching. Browser speech recognition may transmit audio to the browser vendor's speech service. Webcam stays local and is not uploaded by this app.
- No diagnosis or treatment recommendations. No verification of clinic services, insurance, hours, availability, route duration, or patient eligibility. Do not use this prototype for real emergency decisions.
- The default profiles and costs are synthetic demonstration values.

## Planned next steps

Connect verified provider datasets and transit routing, add accessible appointment contact flows, validated safety pathways and clinician review, then implement a backend with consent/privacy controls before any real patient data collection.
