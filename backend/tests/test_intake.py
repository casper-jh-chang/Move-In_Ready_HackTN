import importlib
import subprocess
from pathlib import Path

import pytest

from app import rules as rules_mod
from app.config import BACKEND_DIR
from app.providers import ModelOutputError, parse_analysis
from app.schema import ItemAnalysis, VideoAnalysis

RULES = rules_mod.load_rules(BACKEND_DIR / "rules" / "house2home.json")
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


def test_end_to_end_mock_intake(client, tmp_path):
    vid = tmp_path / "clip.mp4"
    _make_video(vid)
    with vid.open("rb") as fh:
        r = client.post("/api/intake", files={"video": ("sleeper_sofa.mp4", fh, "video/mp4")}, data={"donor_zip": "37206"})
    assert r.status_code == 200, r.text
    intake = r.json()
    assert len(intake["frames"]) == 8 and intake["video_url"].endswith("playback.mp4")
    [item] = intake["items"]
    assert item["ai_outcome"] == "decline" and item["status"] == "declined" and not item["human_verified"]
    assert client.get(item["thumb_url"]).status_code == 200

    with vid.open("rb") as fh:
        r = client.post("/api/intake", files={"video": ("clip.mp4", fh, "video/mp4")},
                        data={"transcript": "Dining table and four chairs, no damage"})
    assert [i["category"] for i in r.json()["items"]] == ["dining_table", "dining_chair"]

    inv = client.get("/api/inventory").json()
    assert len(inv) == 3
    r = client.patch(f"/api/inventory/{item['id']}", json={"status": "needs_review", "reviewer_note": "check in person"})
    assert r.json()["status"] == "needs_review" and r.json()["human_verified"]
    stats = client.get("/api/stats").json()
    assert stats["intakes"] == 2 and stats["est_lbs_diverted"] == 60 + 4 * 12


def test_rejects_non_video(client):
    r = client.post("/api/intake", files={"video": ("notes.txt", b"hello", "text/plain")})
    assert r.status_code == 400
