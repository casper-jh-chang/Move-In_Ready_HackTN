# Move-In Ready *(working name)*

English | [中文](README.zh-CN.md)

**HackathonTN 2026 · Track 1: From Surplus to Social Good · Team ChineseCanFly**

Move-In Ready gets usable furniture from people who are moving out to neighbors who are moving in after homelessness, instead of to the landfill. It is built around the real workflow of **[House2Home Nashville](https://www.house2homenashville.org/)**, a volunteer-run furniture bank, and uses **OCI Generative AI** to take the slowest manual steps off volunteers' plates. A human always makes the final call.

**Live demo:** https://163-192-199-117.sslip.io (demo accounts below, password `demo1234`)

> Status (2026-10-18): a working prototype that runs end to end on Oracle Cloud. Donors submit furniture with a photo or a walk-around video, OCI AI screens it, an admin approves it, volunteers pick it up and deliver it on road-optimized routes, and recipients request what they need. See [What's built](#whats-built) and the [roadmap](#roadmap). All data in this project is synthetic. We are not affiliated with House2Home and use no real client or donor information.

---

## The problem

**Nashville is running out of landfill.** Most of Davidson County's household waste goes to the Middle Point landfill, which is projected to fill up around 2028–2029. Nashville has no curbside bulk pickup, so furniture left behind after a move usually ends up with a junk hauler and then in the landfill.

**Meanwhile, people leaving homelessness move into empty apartments.** House2Home gives them a new bed and gently used furniture for free. Caseworkers from more than 100 partner agencies refer clients. The whole operation runs on Google Forms, Google Docs, two box trucks, and a warehouse that is open three hours a week.

Based on House2Home's public website and forms, we see these bottlenecks:

| Pain point | What happens today |
|---|---|
| **Slow pickups** | Donors have to give at least 2 weeks' notice, and the wait is often 2–4 weeks. People moving out can't wait that long. |
| **Manual screening** | Donors list furniture as free text and email photos separately. A volunteer checks each item against a detailed accept/decline list. |
| **Wasted trips** | Stains, sleeper sofas, or items that need repair are often found only after the truck arrives *(our inference; to be confirmed)*. |
| **Matching in someone's head** | Referrals and warehouse stock live in separate Google Docs and depend on a few key volunteers. |
| **Drivers are the constraint** | The same volunteers do both pickups and deliveries, and routes aren't batched. |
| **No visibility** | Caseworkers can't see whether or when a referral will be filled. |
| **Beds cost money** | Used beds aren't accepted, so every bed (~$400–500 plus ~$75 for bedding) has to be bought with donated cash. |

Full analysis (in Chinese): [docs/house2home-analysis.md](docs/house2home-analysis.md) · Background research: [docs/needs-research.md](docs/needs-research.md)

---

## What's built

| Feature | What it does | Pain point it targets |
|---|---|---|
| **Photo scan** | When a donor submits a photo, **OCI AI Vision** detects objects and **OCI Generative AI** (Llama 4 Maverick) writes a condition report: item type, condition, visible issues, and whether it matches the listed category. The results show up as flags on the admin's review card. | Manual screening |
| **Video intake** | A donor records or uploads a 30–60 second walk-around video and describes the item out loud. ffmpeg picks 8 sharp keyframes, the narration comes from live captions or Whisper, and one Generative AI call lists every item with its defects (with timestamps), a sleeper-sofa check and the sides shown. A **deterministic rules engine** ([`house2home.json`](vision-service/rules/house2home.json)) turns those facts into **accept**, **review** or **decline**, names the rule that fired, and suggests where declined items can go instead (for example, Habitat for Humanity ReStore). One video can produce several pre-filled donations. | Manual screening, wasted trips |
| **Admin review** | Admins see the photo scan or video verdict, the video itself, the rule reasons and defect frames that jump to the right second. A rejection is pre-filled with the rule's reason. | Manual screening |
| **Inventory lifecycle** | Every item is tracked from *pending → approved (pledged, still at the donor) → in stock → delivered*, and stored under the donor who gave it. | Matching in someone's head |
| **Requests** | Recipients browse approved furniture and request items. Admins approve one request per item, and the other requests for it are declined automatically. | No visibility |
| **Volunteer tasks + route planner** | Admins assign pickups and deliveries. Each volunteer's stops become one round trip on real roads (OSRM), shown on a map with the distance saved compared with separate trips and a "Navigate" link. Donors can give a street address, which is geocoded for an exact stop. | Drivers are the constraint |
| **Impact page** | Kilograms delivered and in the pipeline, households served, active donors and volunteers, trips completed. | Funding (beds) |

There are four roles: **donor**, **user** (recipient), **volunteer** and **admin**. The server enforces every permission. Details: [app/README.md](app/README.md).

### Demo accounts (password `demo1234`)

| Role | Email |
|---|---|
| Admin | admin@demo.org |
| Volunteer | volunteer1@demo.org, volunteer2@demo.org |
| Donor | donor1@demo.org, donor2@demo.org, donor3@demo.org |
| User (recipient) | user1@demo.org, user2@demo.org |

A 30-second demo script and setup checklist: [docs/demo-guide.md](docs/demo-guide.md).

---

## Roadmap

Not built yet, in rough priority order:

1. **Caseworker referrals and household kits.** An LLM turns a caseworker referral (checkboxes plus notes like *"client uses a wheelchair, third floor, no elevator"*) into structured needs, then assembles a **household kit** from stock and pledged items and flags gaps. A missing bed → "use the bed fund". Missing small items → "add to this month's wishlist". Today, recipients request items one at a time.
2. **Smarter routing.** Truck capacity and time windows (for example with OR-Tools), batching pickups and deliveries into a "neighborhood pickup day", and a plain-language run sheet for drivers.
3. **Status updates.** "Received / Kit complete / Delivery on <date>" notifications for caseworkers and donors, by email and in several languages.
4. **Impact stories.** OCI Generative AI turns the impact numbers into short stories House2Home can share with funders to raise money for beds.
5. **Keep the familiar forms.** Ingest House2Home's existing Google Forms so partner agencies don't have to learn a new tool.
6. **Operations.** Password reset, instance-principal auth on OCI instead of a stored API key, video storage in OCI Object Storage.

---

## Responsible AI

- **Humans decide.** The AI only describes what it sees. The rules engine suggests a verdict, and an admin approves or rejects every donation. Nothing is approved automatically.
- **Explainable outputs.** Every video verdict names the rule that caused it, with the defect frames as evidence, so donors and volunteers can see why.
- **The AI can't hand out verdicts on its own.** The photo-scan prompt tells the model to ignore text written inside the image. The server re-reads each video verdict from the vision service and checks that it belongs to the donor who submitted it, so a browser can't inject one.
- **No AI for priority.** The order in which households are served follows transparent rules, never a model's judgment.
- **Privacy by design.** Donors and recipients never see each other's information. Addresses are visible only to the staff who need them. The database sits in a private subnet, and the demo uses synthetic data only.
- **Low barrier.** Donors can record a video and talk instead of filling out a long form. On the roadmap: keeping the Google Forms that partner agencies already use.

---

## Measuring success

- Days from donor submission to pickup
- Share of pickups that turn out to be unusable (target: close to 0)
- Volunteer minutes spent screening each donation
- Items per truck run
- Households fully furnished; referrals left unfilled
- Pounds diverted from the landfill

---

## Path to adoption and scale

- **Pilot with House2Home.** Their accept/decline rules are explicit and well documented, which makes them a good fit for automated pre-screening.
- **Configurable per organization.** Accept/decline rules, alternatives and weight estimates live in one JSON file ([`house2home.json`](vision-service/rules/house2home.json)), not in code. The AI model is a setting too.
- **Every city has furniture banks.** The same workflow applies to furniture banks across the U.S. and to large surplus sources such as campus move-out, hotels, and offices.

---

## Tech stack

| Layer | Choice |
|---|---|
| Frontend | React + TypeScript + Vite, Leaflet maps |
| Backend | Express API (Node) + Python FastAPI video service, on an OCI Compute VM (Oracle Linux 9) behind Apache with HTTPS |
| AI | OCI Generative AI (Llama 4 Maverick, multimodal) and OCI AI Vision; Whisper for speech. For development: a `mock` provider or a local model with Ollama |
| Routing | OSRM road routing + OpenStreetMap (Leaflet map), Nominatim geocoding |
| Data | MySQL HeatWave on OCI, in a private subnet (synthetic demo data) |
| Infrastructure | OCI Resource Manager (Terraform) stack; `app/deploy.sh` for redeploys |

```
Browser ──HTTPS──► Apache ──► Express API ──────────► MySQL HeatWave (private subnet)
                                  │   └─ photo scan ──► OCI AI Vision + OCI Generative AI
                                  └─► FastAPI vision service ──► OCI Generative AI
                                      (ffmpeg, Whisper, rules engine)
```

How every Oracle Cloud piece is used and configured: [docs/oracle-cloud.md](docs/oracle-cloud.md).

## Running locally

Requires Node 16.20+, MySQL 8, Python 3.11+ and ffmpeg. The default `mock` AI provider needs no cloud account.

The app lives in `app/` (React + Express + MySQL; setup in [app/README.md](app/README.md)). The AI video intake runs as a separate Python service in `vision-service/`:

```bash
cd vision-service && pip install -r requirements.txt && cp .env.example .env
cd ../app && npm install && cp .env.example .env && npm run db:init
npm run dev:video     # vision service :8000 + API :3001 + web :5173
```

Then open http://localhost:5173 and sign in with a [demo account](#demo-accounts-password-demo1234).

Choosing the AI:

| Setting | Where | Options |
|---|---|---|
| `VISION_PROVIDER` | `vision-service/.env` | `mock` (default, canned answers), `ollama` (local model such as `qwen2.5vl:7b`), `oci` |
| `INPUT_MODE` | `vision-service/.env` | `frames` (keyframes + transcript; used in production) or `video` (whole clip, needs a video model such as Gemini) |
| `OCI_*` | `app/.env`, `vision-service/.env` | Photo scan and OCI provider; both read `~/.oci/config` |

Local models, OCI setup and the rule table: [docs/video-intake.md](docs/video-intake.md). Running on Ollama takes several minutes per video on a laptop; OCI takes about 5 seconds for a 12-second clip.

## Testing

- `cd vision-service && python -m pytest -q`: rules engine, model-output parsing, mock pipeline
- `cd app && npx tsc --noEmit`: frontend type check
- [docs/test-report.md](docs/test-report.md): end-to-end results on the live site (all 4 roles, permissions, photo scan, video intake, routes, phone layout) and the known issues

## Known limitations

- **The AI can be wrong.** In our tests, a vision model sometimes claimed it had seen sides of an item the video never showed, or called an upholstered armchair a plain chair. That's why the rules engine leans toward **review** and an admin makes every decision.
- **The route planner needs several stops per volunteer to show savings.** With the seed data, each volunteer has one task, so it shows 0% saved.
- **Whole-video mode is off in production.** Our tenancy's Gemini quota is 0, so the live site uses keyframes and Llama 4 Maverick.
- Road routing and geocoding use the free public OSRM and Nominatim servers, which are rate-limited. The planner falls back to straight-line distances when OSRM is unavailable.

---

## Open questions for House2Home

We're contacting the House2Home team ([outreach draft](docs/h2h-outreach-email.md)) to check our assumptions:

1. What's the biggest bottleneck: drivers and trucks, warehouse space, or donations that don't fit?
2. How often does a pickup turn out to be unusable?
3. How many referrals arrive each month, and how many go unfilled?
4. How do they decide whom to serve first today?
5. Do they want a new tool, or Google Forms with something smarter behind it?

## Team

**ChineseCanFly:** Jiaheng Chang · Yuchen Xie · Guanchen Du · Yinhong Cui · Jiaxiao Dong

## Repository layout

```
docs/
  hackathon-info.md         Track descriptions and judging themes
  needs-research.md         Local needs research (Nashville)
  house2home-analysis.md    Deep dive on House2Home's workflow
  h2h-outreach-email.md     Outreach email draft
  video-intake.md           Video pre-screening: design, rules, setup (in Chinese)
  oracle-cloud.md           How OCI is used: GenAI, AI Vision, MySQL HeatWave, Compute, setup
  test-report.md            Function test results and known errors (live site)
  demo-guide.md             30-second presentation plan and setup checklist
app/                        Web app: React frontend, Express API, MySQL (donors, admins, volunteers, recipients)
  src/pages/                One page per role (Donor, Admin, Volunteer, Recipient) + VideoIntake
  server/index.cjs          API routes and permissions
  server/vision.cjs         Streams videos to the vision service, stores its verdict
  server/photo-scan.cjs     Single-photo scan: OCI AI Vision + OCI Generative AI
  server/oci.cjs            Signs OCI REST requests with the ~/.oci/config API key
  server/geo.cjs            Geocoding (Nominatim) and road routing (OSRM)
  server/schema.sql         MySQL tables; db.cjs applies it and the migrations on startup
  deploy.sh                 Build and redeploy to the OCI Compute VM
vision-service/
  app/                      FastAPI: ffmpeg keyframes, multimodal model (mock/Ollama/OCI), rules engine
  rules/house2home.json     Accept/decline rules, alternatives, weight estimates
  tests/                    pytest suite
```
