# Function test report

- **Date:** 2026-10-18
- **Tested:** the live site https://163-192-199-117.sslip.io, running the code on `main` / `test/main-noAddFunc` (commit `7d292c8`)
- **Method:** automated API scripts, a real browser (headless Chrome) clicking through the UI, and code checks

## Summary

| Test suite | What it covers | Passed |
|---|---|---|
| Lifecycle API test | All 4 roles and their permissions; donate → approve → pickup → request → deliver; stats; user management | 42 / 43 (the failure is an outdated check, see below) |
| Edge-case probe | Bad input, other users' data, upload limits, rate limits, photo scan, video intake, routes, HTTPS | 38 / 40 (errors #1 and #2) |
| Photo scan + routing API test (run after deploy) | OCI scan in the background, admin re-scan, address geocoding, road routes, privacy | 12 / 12 |
| Video intake API test (run after deploy) | OCI analysis, keyframes, ownership check, submit, no double scan; Whisper with no captions | 9 / 9 (+ Whisper run) |
| UI flow in a real browser | Donor → admin → volunteer → user → admin → volunteer, by clicking | 11 / 12 (the failure is the test, not the app) |
| Every page × 4 roles × desktop and phone width | Layout overflow, console errors, failed network requests | 42 / 42 |
| Python video service unit tests | Rules engine, parsing, mock pipeline | 16 / 16 |
| TypeScript type check | Frontend | ✅ |

| Feature | Status |
|---|---|
| Accounts, roles, permissions | ✅ Works |
| Donations and admin review | ✅ Works (minor validation gap #2) |
| Requests and volunteer tasks | ✅ Works (error #1 only reachable outside the UI) |
| Photo scan (OCI AI Vision + Generative AI) | ✅ Works |
| Video intake (OCI Generative AI + Whisper) | ✅ Works |
| Route planner (road routes, map, navigation) | ✅ Works, but looks weak with demo data (#3) |
| HTTPS, health checks, phone layout | ✅ Works |

**Overall:** every core feature works end to end on the live site. There is one real bug (#1) that users cannot reach from the UI, one minor validation gap (#2), and several risks to manage before the presentation.

---

## Errors

### #1 Missing IDs cause "Server error" (500) instead of a clear message. Severity: medium

| Request | Response |
|---|---|
| `POST /api/requests` with no `furnitureId` | `500 Server error` |
| `POST /api/tasks` with no `volunteerId`, `furnitureId` or `requestId` | `500 Server error` |

- **Cause:** `Number(undefined)` becomes `NaN`, and `NaN` ends up in the SQL query (`Unknown column 'NaN' in 'where clause'`), at `app/server/index.cjs`, lines ~337, 442, 447 and 453.
- **Impact:** the website always sends these IDs, so users can't trigger it from the UI; only hand-made API calls do. The error is also logged on the server as a crash.
- **Fix:** check the ID first, e.g. `const id = Number(x); if (!Number.isInteger(id)) return fail(res, 400, '...')`. This is about 4 lines.

### #2 An unknown pickup area is accepted. Severity: low

- **Example:** `POST /api/furniture` with `location: "Atlantis"` returns `201` and stores the item at the depot's coordinates.
- **Impact:** the UI only offers the dropdown of real areas, so users can't trigger it either. A bad area only distorts the route map.
- **Fix:** reject areas that aren't in `meta.areas`, unless a street address geocoded successfully.

### #3 The route planner shows "0% distance saved" with the demo data. Severity: high for the demo, not a bug

- **Cause:** the seed data gives each volunteer only **one** open task. A one-stop route can't be shorter than a separate trip, so the page shows `36.8 km → 36.8 km, 0%`.
- **Impact:** it looks like the feature does nothing. With 3–4 stops per volunteer it shows real savings; an earlier test showed 21%.
- **Fix:** before the demo, assign 3–4 pickups to one volunteer (see `demo-guide.md`), or add more seed tasks.

### #4 Dependencies have known vulnerabilities. Severity: medium (not urgent for a demo)

`npm audit --omit=dev` reports 5 issues (3 high, 2 moderate):

| Package | Severity | Comes from |
|---|---|---|
| `mysql2` ≤ 3.23.0 | high | direct dependency |
| `path-to-regexp`, `body-parser`, `qs` | high / moderate | Express 4.21.2 |

- **Fix:** run `npm update mysql2 express` and re-run the tests. Not needed before the demo.

### #5 Handled errors are logged like crashes. Severity: low

Expected rejections (a wrong file type, an expired video analysis, an upload that's too large) are printed to the server log with full stack traces, because the error handler logs every error. This makes real problems harder to spot in `journalctl`.

---

## Risks and limitations (not bugs)

| Risk | What happens | What to do |
|---|---|---|
| **Anyone can log in as admin** with the public demo password `demo1234`, and the admin page has **Reset demo data** | A judge or visitor could wipe the demo data during judging | After the demo prep, change the admin password or don't share it. Don't click Reset |
| A video analysis "expires" if the API restarts between analyzing and submitting | The donor sees "This video analysis has expired. Please analyze the video again." | Don't redeploy during the demo |
| A video analysis takes 5–15 s (more for long clips) and shows no progress beyond steps | Too slow to wait on in a 30-second slot | Show an already-submitted video donation (see the demo guide) |
| Live captions while recording only work in Chrome, Edge and Safari | On Firefox there are no live captions, but the server's Whisper transcribes the audio instead | None needed |
| Free public map services (OSRM, Nominatim) allow light use only | Heavy use could slow route loading; the page then falls back to straight lines and says so | Open the route page once before presenting so the result is cached |
| Gemini is disabled in the OCI tenancy | The video service uses keyframes + transcript (Llama 4) instead of sending the whole video | None needed; raise the limit in OCI to use Gemini later |
| Saved videos are never deleted | `~/vision-service/data` on the server grows (the disk is 56% used, 14 GB free) | Clear it after the event |
| Seed donations have no photos | The photo scan only appears on new donations | Submit one with a photo during prep |

## Checked and working

These items were checked specifically:

- **Security:**
  - permissions for all 4 roles (e.g. a donor can't approve, a user can't donate, a volunteer can't complete someone else's task)
  - recipients never see a donor's name or address
  - forged video-analysis IDs are rejected
  - the media path can't be used to reach other files
  - HTTPS redirect and HSTS are on
- **AI features:** the photo scan correctly flagged a real donation listed as a "Dining table" whose photo shows a cabinet: *"Photo scan: looks like 'cabinet', not the listed category"*. Whisper transcribed spoken narration word for word.
- **Upload limits:** a 9 MB photo is rejected (413), as are non-video files, unsupported photo formats, and a 7th photo scan within a minute (429).
- **Certificate:** valid until 2027-01-15 and renews automatically.

## About the failed test checks

| Check | Why it failed | App problem? |
|---|---|---|
| `vision stub 501` | The old test expects the vision feature to be "not implemented"; it now is implemented | No |
| `pickup assigned to Vera` | The browser test read the page before it refreshed over the network. The database shows the pickup was assigned to Vera and completed | No |

## Test data

All test accounts and test donations were removed afterwards. The real donation from another user (item "table") was kept.
