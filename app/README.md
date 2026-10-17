# Move-In Ready · ChineseCanFly

HackathonTN 2026 · Track 1: From Surplus to Social Good

A synthetic-data prototype inspired by the public processes of House2Home Nashville. **Not affiliated with House2Home.**

React + TypeScript + Vite frontend, Express API, MySQL storage, Oracle Cloud AI photo scanning, and road route planning on OpenStreetMap.

## Roles

| Role | How the account is created | What they can do |
|---|---|---|
| **Donor** | Self sign-up | Donate furniture (stored under their account), track each item, withdraw items still pending review |
| **User** (recipient) | Self sign-up | Browse approved, unreserved furniture; send requests; cancel their requests; track delivery |
| **Volunteer** | Created by an admin | See assigned pickups/deliveries, mark them complete, see their own route |
| **Admin** | Seeded, or created by another admin | Approve/reject donations, approve/reject requests, assign volunteers to pickups and deliveries, manage users and roles, see all routes |

The server enforces every rule (`requireRole` in `server/auth.cjs`); the frontend only hides what a role can't use.

### Item lifecycle

1. Donor submits an item → `furniture.status = pending`
2. Admin approves → `approved`, `inventory_status = pledged` (still at the donor)
3. Admin assigns a **pickup** volunteer → volunteer marks it picked up → `in_stock`
4. User requests the item → admin approves the request (other pending requests for it are declined)
5. Admin assigns a **delivery** volunteer → volunteer marks it delivered → item `delivered`, request `fulfilled`

## Database setup (MySQL 8.0+ / mysqlsh)

Create the database and an app user once (as a MySQL admin):

```bash
mysqlsh --sql -u root -h 127.0.0.1 -e "
CREATE DATABASE IF NOT EXISTS furnishflow CHARACTER SET utf8mb4;
CREATE USER IF NOT EXISTS 'movein'@'%' IDENTIFIED BY 'change-me';
GRANT ALL PRIVILEGES ON furnishflow.* TO 'movein'@'%';"
```

Copy `.env.example` to `.env` and set `MYSQL_*` (use the server's IP for `MYSQL_HOST` if MySQL runs on another machine). Then create the tables and demo data:

```bash
npm run db:init      # creates tables + demo data (only seeds an empty database)
npm run db:reset     # drops the app tables, recreates them and reseeds
```

The API also applies `server/schema.sql` on startup, so tables are created automatically. To apply the schema by hand instead:

```bash
mysqlsh --sql -u movein -h 127.0.0.1 --database=furnishflow -f server/schema.sql
```

### Tables

- `users`: every account, with `role` (`admin`, `volunteer`, `donor`, `user`); passwords are scrypt-hashed; optional `address` (geocoded into `lat`/`lng`)
- `sessions`: sign-in tokens (stored as SHA-256 hashes, expire after 7 days)
- `furniture`: donated items; **`donor_id` (required) links each item to its donor**; `pickup_address`, `lat`/`lng`, `geo_precise`; `vision_result` (OCI photo scan JSON)
- `requests`: a user asking for a furniture item
- `tasks`: pickup/delivery jobs assigned to volunteers
- `activity_log`: audit trail shown on admin/volunteer dashboards
- View `donor_furniture`: each donor with the furniture stored under them

## Run (Node 16.20.2+)

```bash
npm install
npm run dev:all
```

Open http://localhost:5173. The Express API runs at http://localhost:3001.

### Demo accounts (password `demo1234`)

| Role | Email |
|---|---|
| Admin | admin@demo.org |
| Volunteer | volunteer1@demo.org, volunteer2@demo.org |
| Donor | donor1@demo.org, donor2@demo.org, donor3@demo.org |
| User | user1@demo.org, user2@demo.org |

## Photo scan (Oracle Cloud AI)

For everything OCI-related in one place, see `../docs/oracle-cloud.md`.

When a donor uploads a photo, the server scans it with two OCI services (`server/photo-scan.cjs`):

1. **OCI AI Vision** (`analyzeImage`): image classification and object detection ("Table 99%", "Chair 81%")
2. **OCI Generative AI**, using the multimodal model `meta.llama-4-maverick-17b-128e-instruct-fp8`: the item type, visible condition (Like new / Good / Fair / Poor / Unclear), visible issues and a one-line summary

How the result is used:

- It is stored in `furniture.vision_result` and shown under the donation's description on every card and in the admin approval dialog.
- Any mismatched category, fair/poor condition or suggested rejection is added to the item's flags.
- The approval dialog pre-selects the condition the scan saw.
- The scan never approves or rejects anything. An admin always decides.

The scan runs in the background after submission, so the item shows "Scanning…" for a few seconds. Donors can also preview it with **AI photo check** in the form (`POST /api/vision/photo`) (rate-limited to 6 per minute), and admins can **Re-scan photo**.

### Setup

1. Create an API key for an OCI user (Console → My profile → API keys) and save the config the console shows to `~/.oci/config` on the machine running the API.
2. Set `key_file` in that config to the downloaded private key, and `chmod 600` both files.
3. Give the user's group access to the AI services, e.g.:
   ```
   allow group <group> to use ai-service-vision-family in tenancy
   allow group <group> to use generative-ai-family in tenancy
   ```
4. Optional overrides go in `.env`: `OCI_CONFIG_FILE`, `OCI_PROFILE`, `OCI_COMPARTMENT_ID` (defaults to the tenancy), `OCI_VISION_MODEL`, and `OCI_VISION_DISABLED=1` to turn scanning off.

Requests are signed in `server/oci.cjs` with OCI's HTTP Signature scheme, so no OCI SDK is needed. Without a valid config, `visionConfigured` is `false` in `/api/health` and the scan buttons are disabled.

## Route planning (OpenStreetMap + OSRM)

- **Addresses:** donors (per donation or in their profile) and recipients (profile) can enter a street address. It is geocoded with OpenStreetMap Nominatim, limited to the Nashville area. Without an address, or if the address isn't found, the neighborhood center is used.
- **Routes:** `GET /api/routes` builds one round trip per volunteer: depot → open pickups and deliveries → depot. OSRM's `trip` service picks the shortest driving order on real roads and returns the distance, drive time, per-stop legs and the road geometry. The "separate round trips" baseline uses road distances from OSRM's `table` service.
- **Map:** the frontend draws the routes with Leaflet on OpenStreetMap tiles. **Navigate** (per route) and **Directions** (per task) open Google Maps for turn-by-turn directions; no API key is needed.
- **Fallback:** if the routing service is unreachable, the API falls back to straight-line nearest-neighbor estimates and says so.
- **Privacy:** recipients never see a donor's name, street address or exact location. Only admins and the assigned volunteer see addresses.

The public Nominatim and OSRM servers allow light use only (about 1 request per second); results are cached and requests are throttled. For heavier use, run your own instances and set `GEOCODER_URL` / `OSRM_URL`.

## AI video intake

Donors can record (or upload) a 30–60 second walk-around video and describe the item out loud. Entry points: **Donate with a video** on *My donations*, and **AI video intake** inside the regular donation form.

- The Python service in `../vision-service` picks sharp keyframes with ffmpeg, asks a multimodal model what it sees and hears (category, condition, defects with timestamps, sleeper-sofa check, sides shown), and applies the acceptance rules in `vision-service/rules/house2home.json`. The model only describes; the rules suggest accept / review / decline with the rule that fired.
- `server/vision.cjs` streams the upload to that service and pre-fills one donation per item found. The donor edits and submits; items are saved as `pending` with the AI verdict in `furniture.vision_result`. The server re-reads the verdict from the service (and checks it belongs to that donor) instead of trusting the browser.
- Admins see the AI verdict on each card and, in Approve/Reject, the video, the rule reasons and defect frames that jump to the right second. A rejection is pre-filled with the rule reason. **An admin still makes every decision.**

Run it (needs Python 3.11+ and ffmpeg):

```bash
cd ../vision-service && pip install -r requirements.txt && cp .env.example .env
cd ../app && npm run dev:video     # vision service + API + Vite together
```

`VISION_PROVIDER=mock` (default) returns canned results with no model; `ollama` runs a local vision model; `oci` uses OCI Generative AI. Details: `../docs/video-intake.md`. If the service is down, the rest of the app keeps working and the video modal says how to start it.

## API overview

| Endpoint | Who |
|---|---|
| `POST /api/auth/register`, `POST /api/auth/login` | Public (register: donor/user only) |
| `GET/PATCH /api/auth/me`, `POST /api/auth/logout`, `GET /api/stats`, `GET /api/impact` | Any signed-in user |
| `POST /api/furniture`, `GET /api/furniture/mine`, `DELETE /api/furniture/:id` | Donor |
| `POST /api/vision/photo` (photo scan preview), `POST /api/screen` | Donor, admin |
| `GET /api/vision/status`, `POST /api/vision/video`, `GET /api/vision/media/*` (video intake) | Signed in / donor / public (random ids) |
| `GET /api/furniture/available`, `POST /api/requests`, `GET /api/requests/mine`, `POST /api/requests/:id/cancel` | User |
| `GET /api/vision/status` | Any signed-in user |
| `POST /api/vision/video` (multipart: `video`, `transcript`) | Donor |
| `GET /api/vision/media/*` | Public (random 128-bit ids; frames and video for `<img>`/`<video>`) |
| `GET /api/tasks/mine`, `POST /api/tasks/:id/complete` | Volunteer (admin can also complete) |
| `GET /api/routes`, `GET /api/activity` | Admin, volunteer |
| `GET /api/furniture`, `POST /api/furniture/:id/review`, `POST /api/furniture/:id/scan`, `GET /api/donors/:id/furniture` | Admin |
| `GET /api/requests`, `POST /api/requests/:id/decide` | Admin |
| `GET/POST /api/tasks`, `POST /api/tasks/:id/cancel` | Admin |
| `GET/POST /api/users`, `PATCH /api/users/:id`, `POST /api/admin/reset` | Admin |

## Not yet implemented

- Google Forms ingestion, truck capacity / time windows in routing, multilingual messaging, password reset/change, email notifications.

## Collaboration

Use a feature branch and a pull request. Never force-push shared `main`. See `docs/PR-INSTRUCTIONS.md`.
