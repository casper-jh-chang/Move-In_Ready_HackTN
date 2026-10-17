import { useEffect, useState } from "react";
import { api, Config, Intake } from "./api";
import Capture from "./Capture";
import IntakeView from "./IntakeView";
import Inventory from "./Inventory";

type Tab = "donate" | "inventory";

export default function App() {
  const [tab, setTab] = useState<Tab>("donate");
  const [config, setConfig] = useState<Config | null>(null);
  const [result, setResult] = useState<Intake | null>(null);

  useEffect(() => {
    api.config().then(setConfig).catch(() => setConfig(null));
  }, []);

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          Move-In Ready <span className="muted">· video intake</span>
        </div>
        <nav>
          <button className={tab === "donate" ? "tab active" : "tab"} onClick={() => setTab("donate")}>
            Donate
          </button>
          <button className={tab === "inventory" ? "tab active" : "tab"} onClick={() => setTab("inventory")}>
            Volunteer
          </button>
        </nav>
      </header>

      <main>
        {tab === "donate" &&
          (result ? (
            <>
              <IntakeView intake={result} />
              <div className="row center">
                <button className="primary" onClick={() => setResult(null)}>
                  Record another item
                </button>
              </div>
            </>
          ) : (
            <Capture maxSeconds={config?.max_video_seconds ?? 120} onDone={setResult} />
          ))}
        {tab === "inventory" && <Inventory />}
      </main>

      <footer className="muted small">
        {config ? (
          <>
            AI: {config.provider} · {config.model} · {config.input_mode} mode.
          </>
        ) : (
          <>Backend not reachable.</>
        )}{" "}
        The AI only describes what it sees and hears; fixed rules and a volunteer make every decision. Demo data is
        synthetic.
      </footer>
    </div>
  );
}
