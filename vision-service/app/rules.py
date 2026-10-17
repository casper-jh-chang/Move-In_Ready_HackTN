"""Deterministic accept / decline / review rules.

The model never makes the call. It extracts facts; this module turns facts into a
decision and records every rule that fired, so the donor and the volunteer can see
exactly why. Rules live in a JSON file so another furniture bank can swap in its own.
"""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

from .schema import Decision, DonorContext, ItemAnalysis, RuleHit, VideoAnalysis

_RANK = {"accept": 0, "review": 1, "decline": 2}


@lru_cache
def load_rules(path: Path) -> dict:
    return json.loads(Path(path).read_text())


def evaluate(item: ItemAnalysis, video: VideoAnalysis, rules: dict) -> Decision:
    hits: list[RuleHit] = []
    hits += _category_hits(item, rules)
    hits += _condition_hits(item, rules)
    hits += _household_hits(item, video.donor_context, rules)
    hits += _evidence_hits(item, video, rules)

    outcome = max((h.outcome for h in hits), key=_RANK.__getitem__, default="accept")
    if outcome == "accept":
        hits.append(RuleHit(rule_id="OK", outcome="accept", reason="Category is accepted and no blocking defects were found."))
    weight = rules["est_weight_lbs"].get(item.category, rules["est_weight_lbs"]["other"]) * max(item.quantity, 1)
    return Decision(outcome=outcome, hits=hits, est_weight_lbs=weight)


def _category_hits(item: ItemAnalysis, rules: dict) -> list[RuleHit]:
    hits = []
    rule = rules["category_rules"].get(item.category)
    if rule and not (item.category == "bedding" and item.is_new_in_package):
        hits.append(RuleHit(**rule))
    if item.category in ("sofa", "loveseat", "sectional") and item.is_sleeper is None:
        hits.append(RuleHit(
            rule_id="CHK-SLEEPER", outcome="review",
            reason="Could not confirm this is not a sleeper sofa; show the seat with cushions removed or say so in the video.",
        ))
    if item.is_sleeper and item.category != "sleeper_sofa":
        hits.append(RuleHit(**rules["category_rules"]["sleeper_sofa"]))
    return hits


def _condition_hits(item: ItemAnalysis, rules: dict) -> list[RuleHit]:
    hits = []
    dd = rules["decline_defects"]
    for d in item.defects:
        where = f" ({d.location})" if d.location else ""
        if (
            d.type in dd["any_severity"]
            or (d.type in dd["moderate_or_worse"] and d.severity in ("moderate", "severe"))
            or (d.type in dd["severe"] and d.severity == "severe")
        ):
            hits.append(RuleHit(
                rule_id=f"DEF-{d.type.upper()}", outcome="decline",
                reason=f"{d.severity.capitalize()} {d.type.replace('_', ' ')}{where}: items must be free of damage, stains and pet damage.",
                alternative="Habitat for Humanity ReStore may take items that need light repair.",
            ))
        elif d.type == "stain" and item.category in rules["upholstered"]:
            hits.append(RuleHit(
                rule_id="DEF-STAIN-MINOR", outcome="review",
                reason=f"Minor stain on upholstery{where}; a volunteer checks whether it cleans out.",
            ))
    if item.needs_repair:
        hits.append(RuleHit(
            rule_id="DEF-REPAIR", outcome="decline",
            reason="Item needs repair or reupholstering before it can be used.",
            alternative="Habitat for Humanity ReStore may take items that need light repair.",
        ))
    if item.condition_grade == "poor" or item.condition_score <= 1:
        hits.append(RuleHit(rule_id="DEF-POOR", outcome="decline", reason="Overall condition is too worn to furnish a home with dignity."))
    return hits


def _household_hits(item: ItemAnalysis, ctx: DonorContext, rules: dict) -> list[RuleHit]:
    hits = []
    if item.category in rules["upholstered"]:
        if ctx.smoking_home:
            hits.append(RuleHit(rule_id="HH-SMOKE", outcome="review", reason="Upholstered item from a smoking home; check for odor at pickup."))
        if ctx.pets_in_home:
            hits.append(RuleHit(rule_id="HH-PETS", outcome="review", reason="Upholstered item from a home with pets; check for hair and pet damage at pickup."))
    return hits


def _evidence_hits(item: ItemAnalysis, video: VideoAnalysis, rules: dict) -> list[RuleHit]:
    hits = []
    if item.confidence < rules["min_confidence"]:
        hits.append(RuleHit(rule_id="EV-CONF", outcome="review", reason=f"Model confidence is low ({item.confidence:.0%})."))
    if len(set(item.views_covered)) < rules["min_views"]:
        hits.append(RuleHit(
            rule_id="EV-VIEWS", outcome="review",
            reason=f"Only {len(set(item.views_covered))} side(s) shown; walk all the way around the item.",
        ))
    if video.inconsistencies:
        hits.append(RuleHit(
            rule_id="EV-CONFLICT", outcome="review",
            reason="Narration and video disagree: " + "; ".join(video.inconsistencies),
        ))
    return hits
