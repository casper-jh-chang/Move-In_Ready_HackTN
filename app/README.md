# Move-In Ready · ChineseCanFly

HackathonTN 2026 · Track 1: From Surplus to Social Good

A synthetic-data prototype inspired by the public processes of House2Home Nashville. **Not affiliated with House2Home.**

## Run (Node 16.20.2)

```powershell
npm.cmd install
npm.cmd run dev:all
```

Open http://localhost:5173. The Express API runs at http://localhost:3001.

## Implemented

- Donation photo intake, rules-first screening, optional external vision API, and volunteer approval.
- Persistent JSON demo store (server/store.json; gitignored), synthetic seed records, reset endpoint.
- Household furniture packages with quantities, explicit volunteer reservations and release, shortage counts, and **new-bed funding estimates** ($450 bed + $75 bedding, illustrative).
- Inventory status API (pledged, in_stock, allocated, delivered), donation review audit events.
- Two-truck schematic route heuristic and impact dashboard (not actual road routing).

## Not yet implemented

- Authenticated volunteer roles, privacy-compliant live data, Google Forms ingestion, real OCI vision credentials, MySQL HeatWave, OR-Tools/road routing, multilingual messaging.
- Actual purchase of beds, confirmed deliveries, or verified House2Home policy integration.

## API additions

- `GET /api/packages` — furniture packages, shortages, bed funding.
- `POST /api/assignments` — explicit volunteer reservation.
- `POST /api/assignments/:id/release` — undo reservation.
- `POST /api/donations/:id/inventory-status` — inventory lifecycle.

## Collaboration

Use a feature branch and a pull request. Never force-push shared `main`. See `docs/PR-INSTRUCTIONS.md`.
