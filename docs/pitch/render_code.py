"""Render the OCI code excerpts in oci-code/ (real line numbers, untouched code). Usage: python docs/pitch/render_code.py"""
import io
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont
from pygments import highlight
from pygments.formatters import ImageFormatter
from pygments.lexers import get_lexer_for_filename

ROOT = Path(__file__).resolve().parents[2]
OUT = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).resolve().parent / "oci-code"
FONT = "/System/Library/Fonts/Menlo.ttc"  # macOS; used for the title bar

# (output name, file, first line, last line, lines to highlight, caption)
SHOTS = [
    ("01_oci-request-signing", "app/server/oci.cjs", 45, 66, [62, 63, 64],
     "OCI REST client: HTTP Signature (RSA-SHA256) signed by hand, no SDK"),
    ("02_oci-api-key-profile", "app/server/oci.cjs", 1, 43, [32, 39],
     "One API-key profile (~/.oci/config) shared by every OCI call"),
    ("03_oci-ai-vision", "app/server/photo-scan.cjs", 23, 34, [24, 27],
     "OCI AI Vision: analyzeImage (classification + object detection)"),
    ("04_oci-genai-photo-prompt", "app/server/photo-scan.cjs", 36, 46, [39, 46],
     "Prompt for the photo scan: describe only, JSON out, injection-guarded"),
    ("05_oci-genai-photo-chat", "app/server/photo-scan.cjs", 48, 69, [49, 51, 57],
     "OCI Generative AI: multimodal chat (Llama 4 Maverick) on the photo"),
    ("06_photo-scan-pipeline", "app/server/photo-scan.cjs", 73, 110, [79, 83, 94],
     "Vision → GenAI pipeline with graceful fallback; results become admin flags"),
    ("07_api-async-scan", "app/server/index.cjs", 296, 306, [297, 306],
     "Donation submit: scan runs after the response, item shows \"scanning\""),
    ("08_api-scan-endpoints", "app/server/index.cjs", 627, 659, [634, 649],
     "Background scan job + preview endpoint, rate-limited per user"),
    ("09_oci-genai-video-sdk", "vision-service/app/providers.py", 83, 138, [94, 111, 112, 128, 133],
     "Video intake: OCI Python SDK sends 8 keyframes + transcript in one chat call"),
    ("10_oci-genai-video-config", "vision-service/app/config.py", 33, 48, [37, 48],
     "Model is config: frames mode + Llama 4 today; whole-video Gemini when quota allows"),
    ("11_mysql-heatwave", "app/server/db.cjs", 7, 16, [8, 15],
     "MySQL HeatWave (private subnet) via a mysql2 connection pool"),
    ("12_heatwave-migrations", "app/server/db.cjs", 35, 64, [59, 60, 61, 62],
     "Schema + column migrations applied on every start, so redeploys are safe"),
    ("13_deploy-oci-compute", "app/deploy.sh", 1, 33, [20, 28],
     "One-command deploy to the OCI Compute VM (systemd services)"),
]

BG_TOP, BG_BOTTOM = (38, 52, 98), (120, 52, 110)  # gradient behind the window
WIN = (40, 44, 52)                                # one-dark background
PAD, RADIUS, BAR = 56, 14, 44


def gradient(w, h):
    img = Image.new("RGB", (w, h))
    d = ImageDraw.Draw(img)
    for y in range(h):
        t = y / max(1, h - 1)
        d.line([(0, y), (w, y)], fill=tuple(int(a + (b - a) * t) for a, b in zip(BG_TOP, BG_BOTTOM)))
    return img


def render(name, rel, start, end, hl, caption):
    path = ROOT / rel
    lines = path.read_text(encoding="utf-8").splitlines()
    code = "\n".join(lines[start - 1:end]) + "\n"
    fmt = ImageFormatter(
        style="one-dark", font_name="Menlo", font_size=22, line_numbers=True, line_number_start=start,
        line_number_bg=WIN, line_number_fg="#5c6370", line_number_separator=False, line_pad=6,
        hl_lines=[h - start + 1 for h in hl], hl_color="#3e4a5e", image_pad=18,
    )
    code_img = Image.open(io.BytesIO(highlight(code, get_lexer_for_filename(rel), fmt)))

    title_font = ImageFont.truetype(FONT, 20)
    cap_font = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 26)
    win_w = max(code_img.width + 24, 900)
    win_h = BAR + code_img.height + 12
    W, H = win_w + PAD * 2, win_h + PAD * 2 + 50

    canvas = gradient(W, H)
    # drop shadow
    shadow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(shadow).rounded_rectangle([PAD + 6, PAD + 60, PAD + win_w + 6, PAD + 50 + win_h + 10], RADIUS, fill=(0, 0, 0, 90))
    canvas.paste(shadow, (0, 0), shadow)
    d = ImageDraw.Draw(canvas)
    d.text((PAD, 18), caption, font=cap_font, fill=(255, 255, 255))
    top = PAD + 50
    d.rounded_rectangle([PAD, top, PAD + win_w, top + win_h], RADIUS, fill=WIN)
    for i, c in enumerate([(255, 95, 86), (255, 189, 46), (39, 201, 63)]):
        cx, cy = PAD + 24 + i * 24, top + BAR // 2
        d.ellipse([cx - 7, cy - 7, cx + 7, cy + 7], fill=c)
    label = f"{rel}  ·  lines {start}–{end}"
    tw = d.textlength(label, font=title_font)
    d.text((PAD + (win_w - tw) / 2, top + 11), label, font=title_font, fill=(171, 178, 191))
    canvas.paste(code_img, (PAD + 12, top + BAR))
    canvas.save(OUT / f"{name}.png")
    print(f"{name}.png  {W}x{H}")


OUT.mkdir(parents=True, exist_ok=True)
for shot in SHOTS:
    render(*shot)
