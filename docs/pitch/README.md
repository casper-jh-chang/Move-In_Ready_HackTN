# Technical pitch (2 minutes)

Open `slides.html` in a browser. Keys: ← → to move, **N** for speaker notes (the script for each slide), **F** for fullscreen. To export a PDF, print the page from Chrome (landscape, no margins).

| Time | Slide | Point |
|---|---|---|
| 0:00–0:15 | Architecture | Everything runs on OCI: Compute, MySQL HeatWave, AI Vision, Generative AI |
| 0:15–0:45 | Photo scan | AI Vision labels → Generative AI condition report → admin flags, with fallback |
| 0:45–1:15 | Video intake | ffmpeg keyframes + narration → one Generative AI call → deterministic rules |
| 1:15–1:35 | Engineering | Hand-signed OCI requests, async scanning, verdicts re-read by the server |
| 1:35–1:55 | Data + deploy | HeatWave in a private subnet, Resource Manager stack, `deploy.sh` |
| 1:55–2:00 | Takeaway | AI describes, rules decide, humans approve |

Slides 8–20 are an appendix with every OCI-related code excerpt (`oci-code/`). Regenerate them after code changes with `python docs/pitch/render_code.py` (needs Pygments and Pillow; macOS fonts).

Production video intake uses frames mode with Llama 4 Maverick (the tenancy's Gemini quota is 0), so don't present whole-video Gemini as live. Timings come from `docs/oracle-cloud.md`.
