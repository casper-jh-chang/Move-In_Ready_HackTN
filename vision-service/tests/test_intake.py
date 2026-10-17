import importlib
import subprocess
from pathlib import Path

import pytest

from app import rules as rules_mod
from app.config import SERVICE_DIR
from app.providers import ModelOutputError, parse_analysis
from app.schema import ItemAnalysis, VideoAnalysis

RULES = rules_mod.load_rules(SERVICE_DIR / "rules" / "house2home.json")
GOOD_VIEWS = ["front", "back", "left", "right", "cushions"]


def decide(item: dict, **video) -> tuple[str, set[str]]:
    va = VideoAnalysis.model_validate({"items": [item], **video})
    d = rules_mod.evaluate(va.items[0], va, RULES)
    return d.outcome, {h.rule_id for h in d.hits}


def test_clean_sofa_is_accepted():
    outcome, ids = decide({"title": "sofa", "category": "sofa", "is_sleeper": False, "views_covered": GOOD_VIEWS, "confidence": 0.9})
    assert outcome == "accept" and ids == {"OK"}


def test_sleeper_is_declined_even_if_labelled_sofa():
    outcome, ids = decide({"title": "sofa", "category": "sofa", "is_sleeper": True, "views_covered": GOOD_VIEWS, "confidence": 0.9})
    assert outcome == "decline" and "CAT-SLEEPER" in ids


def test_unknown_sleeper_status_needs_review():
    outcome, ids = decide({"title": "sofa", "category": "sofa", "views_covered": GOOD_VIEWS, "confidence": 0.9})
    assert outcome == "review" and "CHK-SLEEPER" in ids


def test_moderate_stain_declines_minor_stain_on_upholstery_reviews():
    base = {"title": "chair", "category": "armchair", "views_covered": GOOD_VIEWS, "confidence": 0.9}
    assert decide({**base, "defects": [{"type": "stain", "severity": "moderate"}]})[0] == "decline"
    assert decide({**base, "defects": [{"type": "stain", "severity": "minor"}]}) == ("review", {"DEF-STAIN-MINOR"})


def test_minor_scratch_on_wood_is_fine():
    outcome, _ = decide({"title": "dresser", "category": "dresser", "views_covered": GOOD_VIEWS, "confidence": 0.9,
                         "defects": [{"type": "scratch", "severity": "minor"}]})
    assert outcome == "accept"


def test_used_mattress_declined_with_alternative():
    va = VideoAnalysis.model_validate({"items": [{"title": "m", "category": "mattress", "views_covered": GOOD_VIEWS, "confidence": 1}]})
    d = rules_mod.evaluate(va.items[0], va, RULES)
    assert d.outcome == "decline" and d.hits[0].alternative


def test_new_bedding_in_package_is_ok():
    item = {"title": "sheets", "category": "bedding", "is_new_in_package": True, "views_covered": GOOD_VIEWS, "confidence": 0.9}
    assert decide(item)[0] == "accept"


def test_evidence_gaps_and_conflicts_go_to_review():
    item = {"title": "table", "category": "coffee_table", "views_covered": ["front"], "confidence": 0.4}
    outcome, ids = decide(item, inconsistencies=["donor says no scratches; scratch visible at 4s"])
    assert outcome == "review" and {"EV-CONF", "EV-VIEWS", "EV-CONFLICT"} <= ids


def test_smoking_home_flags_upholstery_only():
    ctx = {"donor_context": {"smoking_home": True}}
    assert "HH-SMOKE" in decide({"title": "s", "category": "sofa", "is_sleeper": False, "views_covered": GOOD_VIEWS, "confidence": 0.9}, **ctx)[1]
    assert decide({"title": "t", "category": "end_table", "views_covered": GOOD_VIEWS, "confidence": 0.9}, **ctx)[0] == "accept"


def test_parse_tolerates_fences_and_unknown_values():
    text = 'Sure!\n```json\n{"items":[{"title":"X","category":"Coffee Table","views_covered":["front","sideways"],"confidence":1.7}]}\n```'
    a = parse_analysis(text)
    item: ItemAnalysis = a.items[0]
    assert item.category == "coffee_table" and item.views_covered == ["front"] and item.confidence == 1.0
    assert parse_analysis('{"items":[{"title":"Y","category":"spaceship"}]}').items[0].category == "other"
    with pytest.raises(ModelOutputError):
        parse_analysis("no json here")


def _make_video(path: Path, seconds: int = 6) -> None:
    subprocess.run([
        "ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", f"testsrc=size=640x360:rate=24:duration={seconds}",
        "-f", "lavfi", "-i", f"sine=frequency=440:duration={seconds}", "-shortest",
        "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", str(path),
    ], check=True)


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("DATA_DIR", str(tmp_path / "data"))
    monkeypatch.setenv("VISION_PROVIDER", "mock")
    import app.config, app.main
    importlib.reload(app.config)
    importlib.reload(app.main)
    from fastapi.testclient import TestClient
    return TestClient(app.main.app)


def test_end_to_end_mock_analysis(client, tmp_path):
    vid = tmp_path / "clip.mp4"
    _make_video(vid)
    with vid.open("rb") as fh:
        r = client.post("/analyze", files={"video": ("sleeper_sofa.mp4", fh, "video/mp4")})
    assert r.status_code == 200, r.text
    res = r.json()
    assert len(res["id"]) == 32 and len(res["frames"]) == 8 and res["videoUrl"].endswith("playback.mp4")
    [item] = res["items"]
    assert item["decision"]["outcome"] == "decline" and item["item"]["category"] == "sleeper_sofa"
    assert item["photo"].startswith("data:image/jpeg;base64,")
    assert client.get(item["photoUrl"]).status_code == 200

    # The Node app re-reads the saved result by id when the donor submits.
    assert client.get(f"/intake/{res['id']}").json()["items"][0]["decision"] == item["decision"]
    assert client.get("/intake/../../etc").status_code == 404
    assert client.get("/intake/" + "0" * 32).status_code == 404

    with vid.open("rb") as fh:
        r = client.post("/analyze", files={"video": ("clip.mp4", fh, "video/mp4")},
                        data={"transcript": "Dining table and four chairs, no damage"})
    items = r.json()["items"]
    assert [i["item"]["category"] for i in items] == ["dining_table", "dining_chair"]
    assert [i["decision"]["est_weight_lbs"] for i in items] == [60, 48]


def test_rejects_non_video(client):
    r = client.post("/analyze", files={"video": ("notes.txt", b"hello", "text/plain")})
    assert r.status_code == 400


def test_health_reports_provider(client):
    h = client.get("/health").json()
    assert h["provider"] == "mock" and h["missingTools"] == []


def test_ollama_provider_request_and_schema_fallback(tmp_path, monkeypatch):
    import httpx
    from PIL import Image

    from app.config import Settings
    from app.providers import ModelInput, OllamaProvider
    from app.video import Frame

    frames = []
    for i in range(3):
        p = tmp_path / f"f{i}.jpg"
        Image.new("RGB", (1600, 1200), "gray").save(p)
        frames.append(Frame(p, float(i)))

    calls = []
    reply = '{"items":[{"title":"Gray sofa","category":"sofa","is_sleeper":false,"views_covered":["front","back","left"],"confidence":0.8}]}'

    def fake_post(url, json, timeout):
        calls.append({"url": url, "format": json["format"], "images": json["messages"][1]["images"]})
        req = httpx.Request("POST", url)
        if isinstance(json["format"], dict):  # pretend this Ollama build rejects schema formats
            return httpx.Response(400, json={"error": "invalid format"}, request=req)
        return httpx.Response(200, json={"message": {"content": reply}}, request=req)

    monkeypatch.setattr(httpx, "post", fake_post)
    s = Settings()
    s.ollama_image_px = 512
    out = OllamaProvider(s).analyze(ModelInput(mode="frames", frames=frames, duration=3, transcript="a gray sofa"))

    assert out.items[0].category == "sofa"
    assert calls[0]["url"].endswith("/api/chat") and isinstance(calls[0]["format"], dict)
    assert calls[1]["format"] == "json" and len(calls[1]["images"]) == 3
    import base64, io
    with Image.open(io.BytesIO(base64.b64decode(calls[1]["images"][0]))) as im:
        assert max(im.size) == 512


def test_ollama_not_running_gives_clear_error(monkeypatch, tmp_path):
    import httpx
    from PIL import Image

    from app.config import Settings
    from app.providers import ModelInput, OllamaProvider
    from app.video import Frame

    p = tmp_path / "f.jpg"
    Image.new("RGB", (100, 100)).save(p)

    def refuse(*a, **k):
        raise httpx.ConnectError("refused")

    monkeypatch.setattr(httpx, "post", refuse)
    with pytest.raises(RuntimeError, match="ollama serve"):
        OllamaProvider(Settings()).analyze(ModelInput(mode="frames", frames=[Frame(p, 0)], duration=1))


def test_missing_ffmpeg_gives_install_hint(monkeypatch, tmp_path):
    import subprocess as sp

    from app import video

    def not_found(*a, **k):
        raise FileNotFoundError(2, "No such file or directory", "ffprobe")

    monkeypatch.setattr(sp, "run", not_found)
    with pytest.raises(video.VideoError, match="brew install ffmpeg"):
        video.probe(tmp_path / "x.mp4")
