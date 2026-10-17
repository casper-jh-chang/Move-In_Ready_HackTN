import { useCallback, useEffect, useState } from "react";
import { api, Intake, InventoryItem, OUTCOME_LABEL, Status, STATUS_LABEL } from "./api";
import IntakeView from "./IntakeView";

const FILTERS: (Status | "")[] = ["", "needs_review", "pledged", "declined", "in_warehouse", "assigned", "delivered"];

export default function Inventory() {
  const [filter, setFilter] = useState<Status | "">("needs_review");
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [stats, setStats] = useState<Awaited<ReturnType<typeof api.stats>> | null>(null);
  const [open, setOpen] = useState<{ item: InventoryItem; intake: Intake } | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(() => {
    api.inventory(filter || undefined).then(setItems).catch((e) => setError(e.message));
    api.stats().then(setStats).catch(() => undefined);
  }, [filter]);
  useEffect(load, [load]);

  async function show(item: InventoryItem) {
    const intake = await api.getIntake(item.intake_id);
    setNote(item.reviewer_note);
    setOpen({ item, intake: { ...intake, items: intake.items.filter((i) => i.id === item.id) } });
  }

  async function move(status: Status) {
    if (!open) return;
    await api.update(open.item.id, { status, reviewer_note: note });
    setOpen(null);
    load();
  }

  return (
    <section>
      {stats && (
        <div className="stats">
          <div>
            <b>{stats.intakes}</b>
            <span>videos</span>
          </div>
          <div>
            <b>{stats.by_status.needs_review ?? 0}</b>
            <span>to review</span>
          </div>
          <div>
            <b>{(stats.by_status.pledged ?? 0) + (stats.by_status.in_warehouse ?? 0)}</b>
            <span>available</span>
          </div>
          <div>
            <b>{Math.round(stats.est_lbs_diverted)}</b>
            <span>lb kept from landfill</span>
          </div>
        </div>
      )}

      <div className="row wrap">
        {FILTERS.map((f) => (
          <button key={f || "all"} className={filter === f ? "chip active" : "chip"} onClick={() => setFilter(f)}>
            {f ? STATUS_LABEL[f] : "All"}
            {f && stats?.by_status[f] ? ` (${stats.by_status[f]})` : ""}
          </button>
        ))}
      </div>
      {error && <p className="error">{error}</p>}

      <div className="inv-grid">
        {items.map((it) => (
          <button key={it.id} className="inv-card" onClick={() => show(it)}>
            <img src={it.thumb_url} alt="" />
            <div className="inv-meta">
              <strong>{it.title}</strong>
              <span className="small muted">
                {it.quantity > 1 ? `${it.quantity} × ` : ""}
                {it.category.replace(/_/g, " ")} · {it.condition_grade.replace(/_/g, " ")}
              </span>
              <span className="row small">
                <span className={`badge ${it.ai_outcome}`}>AI: {OUTCOME_LABEL[it.ai_outcome]}</span>
                <span className="badge status">{STATUS_LABEL[it.status]}</span>
                {it.human_verified && <span className="badge verified">✓ volunteer</span>}
              </span>
            </div>
          </button>
        ))}
        {items.length === 0 && <p className="muted">Nothing here yet. Record a donation on the Donate tab.</p>}
      </div>

      {open && (
        <div className="drawer" onClick={() => setOpen(null)}>
          <div className="drawer-body" onClick={(e) => e.stopPropagation()}>
            <button className="close" onClick={() => setOpen(null)}>
              ×
            </button>
            <IntakeView intake={open.intake} />
            <div className="card">
              <h3>Volunteer decision</h3>
              <p className="small muted">
                The AI suggested <b>{OUTCOME_LABEL[open.item.ai_outcome]}</b>. You make the final call.
              </p>
              <textarea placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
              <div className="row wrap">
                <button className="primary" onClick={() => move("pledged")}>
                  Accept · schedule pickup
                </button>
                <button onClick={() => move("needs_review")}>Keep in review</button>
                <button className="danger" onClick={() => move("declined")}>
                  Decline
                </button>
                <button onClick={() => move("in_warehouse")}>Mark received</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
