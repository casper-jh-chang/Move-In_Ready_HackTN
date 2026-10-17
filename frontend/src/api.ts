export type Outcome = "accept" | "decline" | "review";
export type Status = "pledged" | "needs_review" | "declined" | "in_warehouse" | "assigned" | "delivered";

export interface Defect {
  type: string;
  severity: "minor" | "moderate" | "severe";
  location: string;
  evidence: "visual" | "spoken" | "both";
  timestamp_s: number | null;
  note: string;
}

export interface ItemAnalysis {
  title: string;
  category: string;
  room: string;
  quantity: number;
  material: string;
  color: string;
  style: string;
  brand: string;
  age_years: number | null;
  dimensions: { width_in: number | null; depth_in: number | null; height_in: number | null; source: string };
  condition_grade: "like_new" | "good" | "fair" | "poor";
  condition_score: number;
  defects: Defect[];
  needs_repair: boolean;
  is_sleeper: boolean | null;
  views_covered: string[];
  best_view_s: number | null;
  evidence: string;
  confidence: number;
}

export interface RuleHit {
  rule_id: string;
  outcome: Outcome;
  reason: string;
  alternative: string;
}

export interface InventoryItem {
  id: string;
  intake_id: string;
  created_at: string;
  title: string;
  category: string;
  room: string;
  quantity: number;
  condition_grade: string;
  ai_outcome: Outcome;
  status: Status;
  human_verified: boolean;
  reviewer_note: string;
  est_weight_lbs: number;
  thumb_url: string;
  item: ItemAnalysis;
  decision: { outcome: Outcome; hits: RuleHit[]; est_weight_lbs: number };
  defect_frames: { defect_index: number; t: number; url: string }[];
}

export interface Intake {
  id: string;
  created_at: string;
  donor_name: string;
  donor_zip: string;
  provider: string;
  mode: string;
  duration: number;
  transcript: string;
  video_url: string;
  frames: { url: string; t: number }[];
  analysis: {
    narration_summary: string;
    narration_language: string;
    inconsistencies: string[];
    retake_suggestions: string[];
    donor_context: Record<string, unknown>;
  };
  items: InventoryItem[];
}

export interface Config {
  provider: string;
  model: string;
  input_mode: string;
  max_video_seconds: number;
  missing_tools: string[];
  statuses: Status[];
}

async function json<T>(r: Response): Promise<T> {
  if (!r.ok) {
    let msg = `${r.status} ${r.statusText}`;
    try {
      msg = (await r.json()).detail ?? msg;
    } catch {
      /* not JSON */
    }
    throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
  }
  return r.json();
}

export const api = {
  config: () => fetch("/api/config").then((r) => json<Config>(r)),
  intake: (form: FormData) => fetch("/api/intake", { method: "POST", body: form }).then((r) => json<Intake>(r)),
  getIntake: (id: string) => fetch(`/api/intake/${id}`).then((r) => json<Intake>(r)),
  inventory: (status?: string) =>
    fetch(`/api/inventory${status ? `?status=${status}` : ""}`).then((r) => json<InventoryItem[]>(r)),
  stats: () =>
    fetch("/api/stats").then((r) =>
      json<{ by_status: Record<string, number>; est_lbs_diverted: number; intakes: number }>(r),
    ),
  update: (id: string, body: Partial<Pick<InventoryItem, "status" | "reviewer_note" | "title" | "human_verified">>) =>
    fetch(`/api/inventory/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then((r) => json<InventoryItem>(r)),
};

export const STATUS_LABEL: Record<Status, string> = {
  pledged: "Pledged",
  needs_review: "Needs review",
  declined: "Declined",
  in_warehouse: "In warehouse",
  assigned: "Assigned",
  delivered: "Delivered",
};

export const OUTCOME_LABEL: Record<Outcome, string> = {
  accept: "Accept",
  decline: "Decline",
  review: "Needs human review",
};

export const pretty = (s: string) => s.replace(/_/g, " ");
