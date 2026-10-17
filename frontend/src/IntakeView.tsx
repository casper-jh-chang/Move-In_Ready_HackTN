import { useRef } from "react";
import { Intake, InventoryItem, OUTCOME_LABEL, pretty } from "./api";

const ALL_VIEWS = ["front", "left", "back", "right", "top", "underside", "cushions", "close_up", "label"];

export default function IntakeView({ intake }: { intake: Intake }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const seek = (t: number | null) => {
    if (t == null || !videoRef.current) return;
    videoRef.current.currentTime = t;
    videoRef.current.play();
  };
  const a = intake.analysis;

  return (
    <section className="intake">
      <div className="card">
        <div className="intake-head">
          <video ref={videoRef} src={intake.video_url} controls playsInline />
          <div>
            <h2>
              {intake.items.length} item{intake.items.length === 1 ? "" : "s"} found
            </h2>
            {a.narration_summary && <p>{a.narration_summary}</p>}
            {intake.transcript && (
              <details>
                <summary className="small">Transcript</summary>
                <p className="small muted">{intake.transcript}</p>
              </details>
            )}
            <div className="filmstrip">
              {intake.frames.map((f) => (
                <img key={f.url} src={f.url} title={`${f.t.toFixed(1)}s`} onClick={() => seek(f.t)} alt="" />
              ))}
            </div>
            {a.retake_suggestions?.length > 0 && (
              <div className="notice">
                <strong>To get a faster answer, please add:</strong>
                <ul>
                  {a.retake_suggestions.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      </div>

      {intake.items.length === 0 && (
        <div className="card">
          <p>We couldn't identify any furniture in this video. Try again with the whole item in view.</p>
        </div>
      )}
      {intake.items.map((it) => (
        <ItemCard key={it.id} it={it} onSeek={seek} />
      ))}
    </section>
  );
}

export function ItemCard({ it, onSeek }: { it: InventoryItem; onSeek?: (t: number | null) => void }) {
  const x = it.item;
  const dims = [x.dimensions.width_in, x.dimensions.depth_in, x.dimensions.height_in];
  const facts: [string, string][] = [
    ["Category", pretty(x.category)],
    ["Room", pretty(x.room)],
    ["Quantity", String(x.quantity)],
    ["Material", x.material],
    ["Color", x.color],
    ["Brand", x.brand],
    ["Age", x.age_years != null ? `${x.age_years} yr` : ""],
    [
      "Size (W×D×H)",
      dims.some((d) => d != null) ? `${dims.map((d) => d ?? "?").join(" × ")} in (${x.dimensions.source})` : "",
    ],
    ["Condition", `${pretty(x.condition_grade)} · ${x.condition_score}/5`],
    ["Sleeper sofa", x.is_sleeper == null ? "" : x.is_sleeper ? "yes" : "no"],
    ["Est. weight", `${it.est_weight_lbs} lb`],
  ];

  return (
    <article className={`card item ${it.ai_outcome}`}>
      <img className="thumb" src={it.thumb_url} alt={x.title} onClick={() => onSeek?.(x.best_view_s)} />
      <div className="item-body">
        <div className="item-title">
          <h3>{x.title}</h3>
          <span className={`badge ${it.ai_outcome}`}>{OUTCOME_LABEL[it.ai_outcome]}</span>
        </div>
        <ul className="hits">
          {it.decision.hits.map((h, i) => (
            <li key={i} className={h.outcome}>
              <code>{h.rule_id}</code> {h.reason}
              {h.alternative && <div className="small muted">Try instead: {h.alternative}</div>}
            </li>
          ))}
        </ul>
        <dl className="facts">
          {facts
            .filter(([, v]) => v)
            .map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
        </dl>
        {x.defects.length > 0 && (
          <div className="defects">
            <strong className="small">Defects</strong>
            {x.defects.map((d, k) => {
              const fr = it.defect_frames.find((f) => f.defect_index === k);
              return (
                <div key={k} className="defect" onClick={() => onSeek?.(d.timestamp_s)}>
                  {fr && <img src={fr.url} alt="" />}
                  <div>
                    <span className={`sev ${d.severity}`}>{d.severity}</span> {pretty(d.type)}
                    {d.location && ` · ${d.location}`}
                    <div className="small muted">
                      {d.evidence === "both" ? "seen & mentioned" : d.evidence === "spoken" ? "mentioned" : "seen"}
                      {d.timestamp_s != null && ` at ${d.timestamp_s.toFixed(1)}s`}
                      {d.note && ` · ${d.note}`}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <div className="views">
          {ALL_VIEWS.map((v) => (
            <span key={v} className={x.views_covered.includes(v) ? "pill on" : "pill"}>
              {pretty(v)}
            </span>
          ))}
          <span className="small muted">AI confidence {(x.confidence * 100).toFixed(0)}%</span>
        </div>
        {x.evidence && <p className="small muted">Why: {x.evidence}</p>}
      </div>
    </article>
  );
}
