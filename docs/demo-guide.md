# 30-second demo guide

**Goal:** in 30 seconds, show the three things that make Move-In Ready different:

1. **AI screens donations:** a photo or video becomes a condition report for the admin
2. **A human decides:** the admin sees the evidence and approves
3. **Smart pickup routes:** real road routes on a map, with the distance saved

Don't show sign-up, profiles, stats or the recipient pages. There isn't time.

Site: **https://163-192-199-117.sslip.io**. Every demo account uses the password `demo1234`.

---

## The 30-second run

| Time | Screen | Do | Say |
|---|---|---|---|
| 0–8 s | **Donor** window, donation form already filled in with a photo | Click **Submit for review**. The card shows "Scanning…" and then the AI summary (about 3 s) | "A donor uploads a photo. Oracle Cloud AI checks the condition and writes it into the listing." |
| 8–18 s | **Admin** window → **Donation review** | Point at the photo-scan box and the flag (e.g. *"looks like a cabinet, not the listed category"*). Click **Approve** on the prepared **video** donation; the video panel shows rule reasons and defect frames | "Admins see the AI's evidence: the condition, defects and House2Home's rules. The AI never decides; the admin does." |
| 18–30 s | **Admin** → **Route planner** | Point at the road route on the map and the **% saved**. Optionally click **Navigate** (opens Google Maps) | "Approved pickups become one road route per volunteer, which saves driving and gets furniture into homes faster." |

The full script, about 75 words, read at a natural pace:

> "A donor uploads a photo, and Oracle Cloud AI checks its condition and writes it into the listing. Admins see the evidence: the condition, the defects, House2Home's rules, even the donor's walk-around video. But a human always makes the call. Then approved pickups become one road route per volunteer on a real map, which saves driving and gets furniture into new homes faster."

If time is cut to 15 s, show only the admin **Donation review** card and then the **Route planner**.

---

## Setup (do this the day before, then re-check 10 minutes before)

### 1. Two separate browser windows (one per account)

The site remembers one login per browser, so normal tabs share the same account. Use:

- **Window A, normal Chrome:** log in as `admin@demo.org`. Open **Donation review**.
- **Window B, Chrome Incognito (or Safari):** log in as `donor1@demo.org`. Open **My donations**.

Zoom both to 110–125% so the room can read them, and close other tabs and bookmarks.

### 2. Make the route planner show real savings

With the demo data, each volunteer has only one stop, so the page shows **0% saved**. Give one volunteer several stops (about 2 minutes, in Window A):

1. **Donation review → Pending:** approve *Six-drawer dresser* and *Walnut nightstand*.
2. **Donation review → Approved:** click **Assign pickup** on *Twin bed frame*, *Six-drawer dresser* and *Walnut nightstand*. Pick **Victor Volunteer** each time.
3. Open **Route planner**. Victor should have 4 stops and the "Distance saved" figure should be well above 0%.

   If it's still low, assign more pickups to Victor. Pickups in different areas save more than ones close to the depot.

### 3. Prepare one video donation (for the admin step)

1. On your phone, open the site and log in as `donor2@demo.org`.
2. Go to **My donations → Donate with a video**.
3. Record 20–30 s walking around a real chair or table. Say what it is, its age, any damage, and "no pets". Show at least 3 sides.
4. Wait for the result (about 10 s), then **Submit**.
5. Check that it appears under **Donation review** with an **AI:** badge.

Don't approve it. It needs to stay **Pending** so you can open the Approve dialog live.

### 4. Pre-fill the photo donation (for the live step)

In Window B:

1. Click **Donate an item**.
2. Fill in the name and category. Pick a category that doesn't match the photo (e.g. a dresser photo listed as "Dining table") so the AI flag is visible.
3. Upload a clear photo (JPG/PNG, under 3 MB).
4. **Leave the form open, without submitting.** On stage you only click **Submit for review**.

### 5. Ten minutes before

- Open https://163-192-199-117.sslip.io/api/health. It should show `"ok": true` and `"visionConfigured": true`.
- Open **Route planner** once so the route is loaded and cached.
- Check that the admin window is still logged in. If not, log in again.

---

## Backup plan (if the internet or the AI is slow)

- **Record a screen video of the 30-second run the day before** and have it ready to play.
- **The scan stays on "Scanning…":** move on to the admin window and show the prepared items. Those were scanned earlier.
- **The map doesn't load:** the route list on the right still shows the stop order, distances and minutes.

## Don'ts

- Don't click **Reset demo data** (Admin → Users & roles). It wipes everything you prepared.
- Don't redeploy or restart the server on the day; it cancels in-progress video analyses.
- Don't put the admin password on a slide. Anyone with it can change the demo data.
- Don't wait on a live video analysis; it takes 5–15 s. Use the prepared one.

## If a judge asks

| Question | Answer |
|---|---|
| "What does Oracle do here?" | OCI Generative AI (Llama 4 Maverick) reads photos and videos, OCI AI Vision detects objects, the data is in MySQL HeatWave, and everything runs on an OCI Compute VM. See `docs/oracle-cloud.md` |
| "Can the AI reject donations?" | No. It describes, House2Home's rules suggest an outcome, and an admin decides |
| "How are routes calculated?" | Real road distances (OSRM/OpenStreetMap), with the shortest stop order per volunteer, starting and ending at the depot |
