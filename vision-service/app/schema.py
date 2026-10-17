"""Data shapes shared by the pipeline, the rules engine, the API and the model prompt.

The model only *describes* what it sees and hears (ItemAnalysis). Whether an item is
accepted is decided afterwards by the deterministic rules engine (Decision), so every
decline can cite a concrete rule and a volunteer can always override it.
"""

from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field, field_validator

Category = Literal[
    "sofa", "loveseat", "sleeper_sofa", "sectional", "armchair", "chair", "ottoman",
    "coffee_table", "end_table", "nightstand", "bookshelf", "desk", "dresser", "wardrobe",
    "dining_table", "dining_chair", "lamp", "wall_art", "mirror", "clock", "rug",
    "bed_frame", "mattress", "headboard", "bedding", "tv_stand", "tv", "electronics",
    "large_appliance", "small_appliance", "cookware", "dishes", "utensils", "towels",
    "curtains", "clothing", "medical", "other",
]
CATEGORIES: tuple[str, ...] = Category.__args__  # type: ignore[attr-defined]

Room = Literal["living_room", "bedroom", "kitchen", "dining", "bathroom", "other"]
View = Literal["front", "back", "left", "right", "top", "underside", "cushions", "close_up", "label"]
VIEWS: tuple[str, ...] = View.__args__  # type: ignore[attr-defined]


class Dimensions(BaseModel):
    width_in: Optional[float] = None
    depth_in: Optional[float] = None
    height_in: Optional[float] = None
    # spoken: the donor said it; estimated: inferred from the video; unknown: no basis
    source: Literal["spoken", "estimated", "unknown"] = "unknown"


class Defect(BaseModel):
    type: Literal[
        "stain", "tear", "scratch", "dent", "broken", "missing_part", "wobbly", "pet_damage",
        "pet_hair", "odor", "water_damage", "mold", "pests", "sagging", "fading", "other",
    ] = "other"
    severity: Literal["minor", "moderate", "severe"] = "minor"
    location: str = ""
    # visual: seen in the video; spoken: donor mentioned it; both: seen and mentioned
    evidence: Literal["visual", "spoken", "both"] = "visual"
    timestamp_s: Optional[float] = None
    note: str = ""


class ItemAnalysis(BaseModel):
    title: str = Field(description="Short listing title, e.g. 'Gray 3-seat fabric sofa'")
    category: Category = "other"
    room: Room = "other"
    quantity: int = 1
    material: str = ""
    color: str = ""
    style: str = ""
    brand: str = ""
    age_years: Optional[float] = None
    dimensions: Dimensions = Field(default_factory=Dimensions)

    condition_grade: Literal["like_new", "good", "fair", "poor"] = "good"
    condition_score: int = Field(3, ge=1, le=5, description="5 = like new, 1 = unusable")
    defects: list[Defect] = Field(default_factory=list)
    needs_repair: bool = False
    is_sleeper: Optional[bool] = None
    is_new_in_package: Optional[bool] = None
    views_covered: list[View] = Field(default_factory=list)

    best_view_s: Optional[float] = Field(None, description="Timestamp of the clearest full view")
    evidence: str = Field("", description="Why the model believes the category/condition")
    confidence: float = Field(0.5, ge=0, le=1)

    @field_validator("category", mode="before")
    @classmethod
    def _norm_category(cls, v: object) -> object:
        if isinstance(v, str):
            v = v.strip().lower().replace(" ", "_").replace("-", "_")
            if v not in CATEGORIES:
                return "other"
        return v

    @field_validator("views_covered", mode="before")
    @classmethod
    def _norm_views(cls, v: object) -> object:
        if isinstance(v, list):
            return [x.strip().lower() for x in v if isinstance(x, str) and x.strip().lower() in VIEWS]
        return v

    @field_validator("confidence", mode="before")
    @classmethod
    def _clamp_conf(cls, v: object) -> object:
        if isinstance(v, (int, float)):
            return min(max(float(v), 0.0), 1.0)
        return v


class DonorContext(BaseModel):
    """Facts from the narration that apply to the whole donation, not one item."""

    pets_in_home: Optional[bool] = None
    smoking_home: Optional[bool] = None
    floor: Optional[int] = None
    elevator: Optional[bool] = None
    disassembly_needed: Optional[bool] = None
    pickup_window: str = ""
    other_notes: str = ""


class VideoAnalysis(BaseModel):
    items: list[ItemAnalysis] = Field(default_factory=list)
    donor_context: DonorContext = Field(default_factory=DonorContext)
    transcript: str = Field("", description="What the donor said, as heard by the model")
    narration_language: str = ""
    narration_summary: str = ""
    inconsistencies: list[str] = Field(
        default_factory=list, description="Places where what was said disagrees with what is shown"
    )
    retake_suggestions: list[str] = Field(default_factory=list)


class RuleHit(BaseModel):
    rule_id: str
    outcome: Literal["accept", "decline", "review"]
    reason: str
    alternative: str = ""


class Decision(BaseModel):
    outcome: Literal["accept", "decline", "review"]
    hits: list[RuleHit] = Field(default_factory=list)
    est_weight_lbs: float = 0
