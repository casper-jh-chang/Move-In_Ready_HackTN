# Move-In Ready *(working name)*

English | [中文](README.zh-CN.md)

**HackathonTN 2026 · Track 1: From Surplus to Social Good · Team ChineseCanFly**

Move-In Ready gets usable furniture from people who are moving out to neighbors who are moving in after homelessness, instead of to the landfill. It is built around the real workflow of **[House2Home Nashville](https://www.house2homenashville.org/)**, a volunteer-run furniture bank, and uses **OCI Generative AI** to take the slowest manual steps off volunteers' plates. A human always makes the final call.

> Status: we picked this topic on 2026-10-17. The first module, video pre-screening with automatic inventory entry, is built and runs locally (see [docs/video-intake.md](docs/video-intake.md)). The rest of this page is still the plan. All data in this project is synthetic. We are not affiliated with House2Home and use no real client or donor information.

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

## What we're building

### MVP (must-have)

1. **Video pre-screening** *(built)*. A donor records one short walk-around video and describes the item out loud. An OCI GenAI multimodal model watches and listens, identifies the category, estimates the size, and looks for stains, damage, or pet hair. It checks each item against House2Home's accept/decline rules and returns **Accept**, **Decline (with reason)**, or **Needs human review**. Declined items get a suggestion for where else to take them (for example, large appliances → Habitat ReStore).
2. **Automatic inventory.** Each accepted item becomes an inventory card with category, room, size, condition, photo, location, and status (*pledged → in warehouse → assigned → delivered*).
3. **Household matching.** An LLM turns a caseworker referral (checkboxes plus free-text notes like *"client uses a wheelchair, third floor, no elevator"*) into structured needs. The system then assembles a **household kit** from stock and pledged items and flags what's missing. A missing bed → "use cash fund". Missing small items → "add to this month's Amazon wishlist".
4. **Volunteer dashboard.** Review queue, inventory, kits, and gaps in one place.

### Stretch goals

5. **Batched pickup & delivery routes.** Group nearby pickups and deliveries into daily truck routes, so the occasional "neighborhood pickup day" becomes a normal feature. Routing uses a standard optimizer such as OR-Tools. The LLM only writes the plain-language run sheet for drivers.
6. **Impact report.** Pounds diverted from the landfill (estimated by category), households furnished, and children served. OCI GenAI turns these numbers into stories House2Home can share with funders, helping them raise money for beds.
7. **Status updates.** "Received / Kit complete / Delivery on <date>" notifications for caseworkers, in multiple languages.

### Demo storyline

1. A caseworker refers a single mom with two kids who moves in next week.
2. Three donors upload photos. The AI declines one item because it's a sleeper sofa and explains why.
3. The system assembles her household kit. It's short two beds, so it flags the bed fund.
4. One click generates a batched Saturday route.
5. The impact panel updates: households furnished, pounds kept out of the landfill.

---

## Responsible AI

- **Humans decide.** AI only does the first pass on donations and drafts suggestions. Volunteers approve every accept or decline and every kit.
- **No AI for priority.** The order in which households are served follows transparent, configurable rules (move-in date, household size, time waiting), never a model's judgment.
- **Explainable outputs.** Every decline cites the specific rule it violates, so donors and volunteers can see why.
- **Privacy by design.** Donors and clients never see each other's information. Client addresses and household details are visible only to the staff who need them. The demo uses synthetic data only.
- **Low barrier.** Caseworkers and donors can keep their familiar form-based flow. The intelligence runs behind it, so partner organizations don't have to learn a new tool.

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
- **Configurable per organization.** Rules, item categories, and service area are settings, not code.
- **Every city has furniture banks.** The same workflow applies to furniture banks across the U.S. and to large surplus sources such as campus move-out, hotels, and offices.

---

## Tech stack

| Layer | Choice |
|---|---|
| Frontend | React + TypeScript + Vite |
| Backend | Express API + Python FastAPI video service, on an OCI Compute VM (Oracle Linux 9) |
| AI | OCI Generative AI (Llama 4 Maverick, multimodal) and OCI AI Vision; local Whisper for speech |
| Routing | OSRM road routing + OpenStreetMap (Leaflet map), Nominatim geocoding |
| Data | MySQL HeatWave on OCI (synthetic demo data) |

How every Oracle Cloud piece is used and configured: [docs/oracle-cloud.md](docs/oracle-cloud.md).

## Running locally

Requires Node 16.20+, MySQL 8, Python 3.11+ and ffmpeg. The default `mock` AI provider needs no cloud account.

The app lives in `app/` (React + Express + MySQL; setup in [app/README.md](app/README.md)). The AI video intake runs as a separate Python service in `vision-service/`:

```bash
cd vision-service && pip install -r requirements.txt && cp .env.example .env
cd ../app && npm install && cp .env.example .env && npm run db:init
npm run dev:video     # vision service :8000 + API :3001 + web :5173
```

Tests: `cd vision-service && python -m pytest -q`. Local models, OCI setup and the rule table are in [docs/video-intake.md](docs/video-intake.md).

---

## Open questions for House2Home

We're contacting the House2Home team ([outreach draft](docs/h2h-outreach-email.md)) to check our assumptions:

1. What's the biggest bottleneck: drivers and trucks, warehouse space, or donations that don't fit?
2. How often does a pickup turn out to be unusable?
3. How many referrals arrive each month, and how many go unfilled?
4. How do they decide whom to serve first today?
5. Do they want a new tool, or Google Forms with something smarter behind it?

## Repository layout

```
docs/
  hackathon-info.md         Track descriptions and judging themes
  needs-research.md         Local needs research (Nashville)
  house2home-analysis.md    Deep dive on House2Home's workflow
  h2h-outreach-email.md     Outreach email draft
  video-intake.md           Video pre-screening: design, rules, setup (in Chinese)
  oracle-cloud.md           How OCI is used: GenAI, AI Vision, MySQL HeatWave, Compute, setup
app/                        Web app: React frontend, Express API, MySQL (donors, admins, volunteers, recipients)
  src/pages/VideoIntake.tsx Record/upload a walk-around video, review AI results, submit
  server/vision.cjs         Streams videos to the vision service, stores its verdict
  server/photo-scan.cjs     Single-photo scan: OCI AI Vision + OCI Generative AI
  server/oci.cjs            Signs OCI REST requests with the ~/.oci/config API key
  server/geo.cjs            Geocoding (Nominatim) and road routing (OSRM)
vision-service/
  app/                      FastAPI: ffmpeg keyframes, multimodal model (mock/Ollama/OCI), rules engine
  rules/house2home.json     Accept/decline rules, alternatives, weight estimates
```
