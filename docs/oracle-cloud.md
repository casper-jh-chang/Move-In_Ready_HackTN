# How Move-In Ready uses Oracle Cloud (OCI)

Move-In Ready runs entirely on Oracle Cloud Infrastructure in the **us-chicago-1** region. This page explains each OCI service the project uses, how the code talks to it, how to set it up, and how to troubleshoot it.

| OCI service | What it does for us | Code |
|---|---|---|
| [Generative AI](#1-oci-generative-ai) | Reads donation photos and walk-around videos: item type, condition, defects, sleeper-sofa check | `app/server/photo-scan.cjs`, `vision-service/app/providers.py` |
| [AI Vision](#2-oci-ai-vision) | Object detection and image labels on donation photos | `app/server/photo-scan.cjs` |
| [MySQL HeatWave](#3-mysql-heatwave) | The database: users, furniture (stored under each donor), requests, volunteer tasks | `app/server/db.cjs`, `app/server/schema.sql` |
| [Compute](#4-compute-the-web-server) | One Oracle Linux 9 VM that serves the website, the API and the video service | `app/deploy.sh` |
| [Networking + Resource Manager](#5-networking-and-resource-manager) | VCN, public and private subnets; the Terraform stack that created the VM and the database | (OCI console) |

The AI only **describes** what it sees. An admin makes every accept/reject decision.

## Architecture

```
 Browser (donor / admin / volunteer / user)
    │  HTTPS  https://163-192-199-117.sslip.io   (Let's Encrypt certificate)
    ▼
 ┌──────────────────── OCI Compute VM "webserver" (Oracle Linux 9, public subnet) ────────────────────┐
 │  Apache httpd :443  ── reverse proxy ──►  Node/Express API + React build :3001  (systemd: move-in-ready) │
 │                                              │        │                    │                          │
 │                                              │        │ photo scan         │ video intake             │
 │                                              │        ▼                    ▼                          │
 │                                              │   signed REST calls    FastAPI :8000  (systemd: vision-service)
 │                                              │   (server/oci.cjs)     ffmpeg keyframes, faster-whisper,  │
 │                                              │        │               rules engine, OCI Python SDK       │
 └──────────────────────────────────────────────┼────────┼────────────────────┼──────────────────────────┘
                     MySQL protocol (private)   │        │                    │
                                                ▼        ▼                    ▼
                          MySQL HeatWave      OCI AI Vision            OCI Generative AI
                          10.0.1.24:3306      analyzeImage             chat: meta.llama-4-maverick-17b-128e-instruct-fp8
                          (private subnet)
```

Not Oracle: road routing (OSRM), geocoding (Nominatim), map tiles (OpenStreetMap) and the "Navigate" links (Google Maps URLs). These are free public services; see `app/README.md`.

---

## Authentication: one API key for everything

Both the Node API and the Python video service sign in to OCI with the same **API-key profile** in `~/.oci/config` on the server:

```ini
[DEFAULT]
user=ocid1.user.oc1..<your user>
fingerprint=<key fingerprint>
tenancy=ocid1.tenancy.oc1..<your tenancy>
region=us-chicago-1
key_file=~/.oci/<private key>.pem
```

How each side uses it:

- **Node** (`app/server/oci.cjs`) reads the profile and signs each REST request itself, using OCI's [HTTP Signature](https://docs.oracle.com/en-us/iaas/Content/API/Concepts/signingrequests.htm) scheme (RSA-SHA256). It signs `(request-target)`, `date` and `host`, plus `x-content-sha256`, `content-type` and `content-length` for POSTs. No OCI SDK is needed, and it works on Node 16.
- **Python** (`vision-service/app/providers.py`) uses the official `oci` SDK: `oci.config.from_file()` and `GenerativeAiInferenceClient`.
- **Compartment:** both default to the tenancy (root compartment). Set `OCI_COMPARTMENT_ID` to use another one.

### Setting it up

1. **Create the key.** In the OCI console, open **Profile → My profile → API keys → Add API key**. Download the private key and copy the config snippet the console shows.
2. **Install it on the server.** Save the snippet as `~/.oci/config` and set `key_file` to the key's path. Then run `chmod 600 ~/.oci/config ~/.oci/*.pem`.
3. **Grant access.** The user's group needs a policy that allows it to use the AI services:
   ```
   allow group <group> to use generative-ai-family in tenancy
   allow group <group> to use ai-service-vision-family in tenancy
   ```
4. **Check it.** `curl -s localhost:3001/api/health` should show `"visionConfigured": true`, and `curl -s localhost:8000/health` should show `"provider": "oci"`.

**Never commit** `~/.oci/config` or the `.pem` key. `.gitignore` already excludes `.env` files and the video data folder.

> **Hardening (recommended before real use):** today the server holds a personal user's API key. Better options:
> - Create a dedicated OCI user whose group has only the two policies above.
> - Or switch to **instance principals**: put the VM in a dynamic group and grant the policies to that group. The server then needs no stored key. The Python SDK supports this with `oci.auth.signers.InstancePrincipalsSecurityTokenSigner()`; the Node signer would need a small change.

---

## 1. OCI Generative AI

- **Endpoint:** `https://inference.generativeai.us-chicago-1.oci.oraclecloud.com`, `POST /20231130/actions/chat`
- **Model:** `meta.llama-4-maverick-17b-128e-instruct-fp8`, called on demand (`servingMode.servingType = ON_DEMAND`)
- **Request format:** `GENERIC`, with text and image content in one user message

Why Llama 4 Maverick:
- It is multimodal: it accepts several images in one request. We send 8 video keyframes at once.
- It is fast: about 1–2 s for one photo and 4–6 s for 8 frames.
- It returns clean JSON when asked.
- Our tenancy has `gemini-2-5-flash-chat-tokens-per-minute-count = 0`, so Google Gemini calls fail with **429** until the limit is raised (Console → Governance → Limits, Quotas and Usage → Generative AI).

To list the chat models your tenancy can call:

```bash
node -e "const o=require('./app/server/oci.cjs');o.call('generativeai','/20231130/models?compartmentId='+o.config().compartment+'&capability=CHAT').then(r=>console.log(r.items.map(m=>m.displayName).join('\n')))"
```

### 1a. Photo scan (one photo, `app/server/photo-scan.cjs`)

When a donor submits a donation with a photo, the API saves the item, replies right away and scans the photo in the background:

1. **OCI AI Vision** labels the photo (see section 2).
2. **Generative AI** receives:
   - the photo, as a base64 data URL
   - the donor's name, category and notes for the item
   - the detected labels
   - a prompt that asks only for what is visible: item type, condition (Like new / Good / Fair / Poor / Unclear), stains, tears, broken or missing parts, mold, pet damage, and a 1–2 sentence summary
   
   The model is told to ignore text inside the image and to answer in JSON only.
3. **The result is stored** in `furniture.vision_result`:
   ```json
   {"status": "done", "category": "Dining table", "matchesCategory": true, "visibleCondition": "Good",
    "visibleIssues": ["minor scratch on top"], "summary": "Table appears to be in good condition...",
    "recommendation": "review", "labels": [{"name": "Table", "confidence": 99}], "model": "meta.llama-4-...",
    "scannedAt": "..."}
   ```
4. **The admin sees it** in two places:
   - **Description:** the summary is shown under the donation's description.
   - **Flags:** a wrong category, fair/poor/unclear condition, or a suggested rejection is added to the item's flags.

   The approval dialog also pre-selects the condition the scan saw.

Endpoints:

| Endpoint | Who | What |
|---|---|---|
| `POST /api/furniture` | Donor | Saves the donation and starts the background scan (`vision_result.status = "scanning"`) |
| `POST /api/vision/photo` | Donor, admin | Preview scan from the donation form; nothing is stored. Limited to 6 per user per minute |
| `POST /api/furniture/:id/scan` | Admin | Re-scan a donation's photo |

Settings (in `app/.env`):

| Setting | Effect |
|---|---|
| `OCI_VISION_MODEL` | Change the model |
| `OCI_VISION_DISABLED=1` | Turn photo scanning off |
| `OCI_CONFIG_FILE`, `OCI_PROFILE`, `OCI_COMPARTMENT_ID` | Override the OCI profile and compartment |

### 1b. Video intake (walk-around video, `vision-service/`)

A donor records or uploads a 30–60 second video and talks about the item. The Python service then:

1. Uses **ffmpeg** to split the video into 8 equal segments and keep the sharpest frame from each.
2. Uses the transcript the browser recorded with live captions. If there is none, **faster-whisper** transcribes the audio on the server (this step is not OCI).
3. Sends the 8 frames and the transcript to **Generative AI** in one chat request. The prompt includes the full JSON schema, and the model only extracts facts:
   - each item's type, quantity, condition grade and score
   - defects, with severity, location, evidence (seen or said) and timestamp
   - whether a sofa is a sleeper sofa, and which sides were shown
   - household context: pets, smoking, floor, elevator
   - places where the narration and the video disagree
4. A deterministic **rules engine** (`vision-service/rules/house2home.json`) turns those facts into **accept**, **review** or **decline**. Every outcome names the rule that caused it.
5. The donor reviews the suggested items and submits them. The Node API re-reads the result from the service and checks that it belongs to that donor before storing it in `furniture.vision_result` (`source: "video"`). The browser cannot inject a verdict.

The server's `vision-service/.env`:

```ini
VISION_PROVIDER=oci
INPUT_MODE=frames            # "video" mode needs Gemini, which this tenancy has disabled
OCI_MODEL_ID=meta.llama-4-maverick-17b-128e-instruct-fp8
OCI_GENAI_ENDPOINT=https://inference.generativeai.us-chicago-1.oci.oraclecloud.com
TRANSCRIBE_PROVIDER=local    # faster-whisper on the VM
WHISPER_MODEL_SIZE=small
```

`INPUT_MODE=video` (the whole clip with audio in one request) works once a video-capable model such as `google.gemini-2.5-flash` is enabled. Mock and local (Ollama) modes for development are described in [video-intake.md](video-intake.md).

Measured on the server, for a 12-second test clip:
- with captions: about 5 s
- with Whisper transcription: about 13 s, the first time (which includes downloading the Whisper model)

---

## 2. OCI AI Vision

- **Endpoint:** `https://vision.aiservice.us-chicago-1.oci.oraclecloud.com`, `POST /20220125/actions/analyzeImage`
- **Features:** `IMAGE_CLASSIFICATION` and `OBJECT_DETECTION`, up to 8 results each
- **Input:** the photo inline as base64 (`image.source = "INLINE"`)

The labels the model is at least 60% sure of (e.g. "Table 99%", "Chair 81%") are:
- shown to the admin under "Detected"
- passed to the Generative AI prompt as a hint

This takes about 1.3 s. If AI Vision fails, the photo scan continues with Generative AI alone and records a warning.

---

## 3. MySQL HeatWave

- **Database system:** created by the Resource Manager stack, with a HeatWave cluster, in the **private subnet** at `10.0.1.24:3306`. It cannot be reached from the internet; only the web server VM connects to it.
- **Database and user:** database `furnishflow`, app user `movein`, which has privileges on that database only. The admin user is not used by the app.
- **Connection:** the Node API connects with `mysql2` using `MYSQL_*` in `~/move-in-ready/.env` on the server. That file has mode 600 and is never committed.
- **Schema:** on startup, the API applies `app/server/schema.sql` (all `CREATE ... IF NOT EXISTS`) and the small column migrations in `app/server/db.cjs`, so redeploys update the schema automatically.
- **Donors:** furniture is stored under its donor (`furniture.donor_id`, required). The `donor_furniture` view lists each donor with their items.

Connecting by hand from the VM:

```bash
mysqlsh --sql -u movein -h 10.0.1.24 --database=furnishflow
```

Creating the database and app user once (as the HeatWave admin; this needs the admin password, which you supply):

```sql
CREATE DATABASE IF NOT EXISTS furnishflow CHARACTER SET utf8mb4;
CREATE USER IF NOT EXISTS 'movein'@'%' IDENTIFIED BY '<strong password>';
GRANT ALL PRIVILEGES ON furnishflow.* TO 'movein'@'%';
```

HeatWave's password policy requires mixed case, digits and a special character.

The admin page **Reset demo data** (`POST /api/admin/reset`) drops the app's tables, recreates them and reseeds them.

---

## 4. Compute: the web server

- **VM:** Oracle Linux 9 in the public subnet, public IP `163.192.199.117`. SSH in with `ssh -i webserver.pem opc@163.192.199.117`.
- **Website:** `https://163-192-199-117.sslip.io`. sslip.io resolves that name to the IP, which lets Let's Encrypt issue a free certificate without a purchased domain.
- **Certificate:** issued by certbot (webroot method). The `certbot-renew.timer` renews it automatically.
- **Services:**

| Unit | Runs | Listens on |
|---|---|---|
| `httpd` | Apache. Redirects HTTP to HTTPS, serves TLS, reverse-proxies to the app. Uploads up to 220 MB (`LimitRequestBody`); `ProxyTimeout 900` for slow video analysis | 80, 443 |
| `move-in-ready` | `node server/index.cjs` in `~/move-in-ready` (API + built React app) | 127.0.0.1:3001 |
| `vision-service` | `python3.12 -m uvicorn app.main:app` in `~/vision-service` (packages in `.venv`) | 127.0.0.1:8000 |

- **Supporting tools:**
  - ffmpeg 7: a static build in `/usr/local/bin`, because Oracle Linux 9's repositories don't include ffmpeg.
  - Node 16.20.
  - Python 3.12, with the service's packages in a venv at `~/vision-service/.venv`.
- **SELinux notes:**
  - `httpd_can_network_connect` is on, so Apache can proxy to the local ports.
  - systemd may not execute binaries under a home directory (`user_home_t`). That's why `vision-service` runs the system `/usr/bin/python3.12` with `PYTHONPATH` pointing at the venv's site-packages, rather than `.venv/bin/python`.

### Deploying an update

From your computer:

```bash
cd app && ./deploy.sh        # KEY=~/Downloads/webserver.pem SERVER=opc@163.192.199.117 by default
```

It runs these steps:
1. builds the frontend
2. uploads `app/` and `vision-service/`
3. runs `npm ci` and `pip install`
4. restarts both services
5. prints both health checks

It never touches:
- the server's `.env` files
- `~/.oci`
- the database
- `~/vision-service/data` (saved videos and frames)

Useful commands on the server:

```bash
systemctl status move-in-ready vision-service
sudo journalctl -u vision-service -f
curl -s localhost:3001/api/health; curl -s localhost:8000/health
```

---

## 5. Networking and Resource Manager

The VM, VCN and HeatWave database were created with an **OCI Resource Manager** (Terraform) stack. Its outputs are `webserver_public_ip` and `heatwave_private_ip`.

| Subnet | Holds | Reachable from the internet |
|---|---|---|
| Public | Web server VM | Ports 22, 80, 443 |
| Private | MySQL HeatWave | No; only from inside the VCN |

The video service (port 8000) and the Node API (port 3001) listen on `127.0.0.1` only. Everything from outside goes through Apache over HTTPS.

---

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `429 ... tenancy limit ... is set to 0` | That model is disabled for the tenancy. Use another model or request a limit increase |
| `401 NotAuthenticated` | Wrong `fingerprint`/`key_file`, or the server clock is off. Check that `openssl rsa -in key.pem -pubout -outform DER \| openssl md5 -c` matches the fingerprint |
| `404 NotAuthorizedOrNotFound` | Missing IAM policy, wrong compartment, or the model isn't offered in the region |
| `/api/health` shows `visionConfigured: false` | `~/.oci/config` is missing, or its `key_file` still says `<path to your private keyfile>` |
| The video modal says the service isn't running | `sudo systemctl status vision-service`; `/api/vision/status` shows the error |
| `missingTools: ["ffmpeg"]` | Install ffmpeg (see section 4) |
| Upload fails with 413 | The video is bigger than Apache's `LimitRequestBody` or `MAX_UPLOAD_MB` (200 MB) |

## Cost and limits

- **Generative AI** (on-demand) and **AI Vision** are billed per use. Each photo scan is 1 AI Vision call plus 1 chat call. Each video is 1 chat call with 8 images.
- **Usage caps:** donors can run 6 preview scans per minute. Videos are capped at 120 s and 200 MB.
- **Video storage:** analyses are kept in `~/vision-service/data/media` on the VM. Delete old folders there to free space. Moving them to OCI Object Storage is a natural next step.
