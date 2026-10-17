import { useEffect, useRef, useState } from "react";
import { api, Intake } from "./api";

// Shown one after another while recording, so donors cover every side and say the useful things.
const GUIDE = [
  { until: 6, text: "Front: show the whole item and say what it is." },
  { until: 14, text: "Walk slowly around the left side." },
  { until: 22, text: "Back of the item." },
  { until: 30, text: "Right side." },
  { until: 40, text: "Close-ups: seat cushions (lift one), drawers, any marks, labels." },
  { until: Infinity, text: "Say: how old it is, any damage, pets or smoking at home, your floor and elevator." },
];
const SAY_CHECKLIST = ["What it is", "Age", "Any damage or stains", "Pets / smoking", "Size (if known)", "Floor & elevator"];
const LANGS = [
  { code: "en-US", label: "English" },
  { code: "es-US", label: "Español" },
  { code: "zh-CN", label: "中文" },
];
const STEPS = ["Uploading video", "Picking sharp frames", "AI watching & listening", "Checking donation rules", "Adding to inventory"];

// Minimal typing for the Web Speech API (Chrome, Edge, Safari).
interface SpeechRec {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: unknown) => void) | null;
  start(): void;
  stop(): void;
}
const SpeechRecognitionCtor: (new () => SpeechRec) | undefined =
  (window as unknown as Record<string, new () => SpeechRec>).SpeechRecognition ??
  (window as unknown as Record<string, new () => SpeechRec>).webkitSpeechRecognition;

function pickMime(): string {
  const options = ["video/mp4;codecs=avc1,mp4a", "video/mp4", "video/webm;codecs=vp9,opus", "video/webm"];
  return options.find((m) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(m)) ?? "";
}

export default function Capture({ maxSeconds, onDone }: { maxSeconds: number; onDone: (i: Intake) => void }) {
  const [mode, setMode] = useState<"record" | "upload">("record");
  const [lang, setLang] = useState("en-US");
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [clip, setClip] = useState<{ blob: Blob; name: string; url: string } | null>(null);
  const [finalText, setFinalText] = useState("");
  const [interim, setInterim] = useState("");
  const [donorName, setDonorName] = useState("");
  const [donorZip, setDonorZip] = useState("");
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState(0);
  const [error, setError] = useState("");

  const liveRef = useRef<HTMLVideoElement>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const speechRef = useRef<SpeechRec | null>(null);
  const keepListening = useRef(false);
  const timer = useRef<number>();
  const streamRef = useRef<MediaStream | null>(null);
  streamRef.current = stream;

  useEffect(() => () => stopEverything(), []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (liveRef.current && stream) liveRef.current.srcObject = stream;
  }, [stream, recording]);

  useEffect(() => {
    if (recording && elapsed >= maxSeconds) stopRecording();
  }, [elapsed, recording, maxSeconds]); // eslint-disable-line react-hooks/exhaustive-deps

  async function openCamera() {
    setError("");
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: true,
      });
      setStream(s);
    } catch (e) {
      setError(`Camera unavailable (${(e as Error).message}). You can upload a video instead.`);
      setMode("upload");
    }
  }

  function stopEverything() {
    keepListening.current = false;
    speechRef.current?.stop();
    window.clearInterval(timer.current);
    if (recRef.current?.state === "recording") recRef.current.stop();
    streamRef.current?.getTracks().forEach((t) => t.stop());
  }

  function startSpeech() {
    if (!SpeechRecognitionCtor) return;
    const rec = new SpeechRecognitionCtor();
    rec.lang = lang;
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (e) => {
      let fin = "";
      let tmp = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) fin += r[0].transcript + " ";
        else tmp += r[0].transcript;
      }
      if (fin) setFinalText((t) => t + fin);
      setInterim(tmp);
    };
    // Chrome ends recognition after silences; restart while we are still recording.
    rec.onend = () => keepListening.current && rec.start();
    rec.onerror = () => undefined;
    speechRef.current = rec;
    keepListening.current = true;
    rec.start();
  }

  function startRecording() {
    if (!stream) return;
    const mime = pickMime();
    const rec = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: 2_500_000 } : undefined);
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    rec.onstop = () => {
      const type = rec.mimeType || mime || "video/webm";
      const blob = new Blob(chunks, { type });
      const ext = type.includes("mp4") ? "mp4" : "webm";
      setClip({ blob, name: `donation.${ext}`, url: URL.createObjectURL(blob) });
    };
    rec.start(1000);
    recRef.current = rec;
    setFinalText("");
    setInterim("");
    setElapsed(0);
    setRecording(true);
    const started = Date.now();
    timer.current = window.setInterval(() => setElapsed((Date.now() - started) / 1000), 250);
    startSpeech();
  }

  function stopRecording() {
    keepListening.current = false;
    speechRef.current?.stop();
    window.clearInterval(timer.current);
    recRef.current?.stop();
    setRecording(false);
    stream?.getTracks().forEach((t) => t.stop());
    setStream(null);
  }

  function onFile(f: File | undefined) {
    if (!f) return;
    setClip({ blob: f, name: f.name, url: URL.createObjectURL(f) });
  }

  async function submit() {
    if (!clip) return;
    setBusy(true);
    setError("");
    setStep(0);
    const ticker = window.setInterval(() => setStep((s) => Math.min(s + 1, STEPS.length - 1)), 4000);
    try {
      const form = new FormData();
      form.append("video", clip.blob, clip.name);
      form.append("transcript", (finalText + " " + interim).trim());
      form.append("donor_name", donorName);
      form.append("donor_zip", donorZip);
      onDone(await api.intake(form));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      window.clearInterval(ticker);
      setBusy(false);
    }
  }

  function reset() {
    if (clip) URL.revokeObjectURL(clip.url);
    setClip(null);
    setFinalText("");
    setInterim("");
  }

  const guide = GUIDE.find((g) => elapsed < g.until)!;

  return (
    <section className="card capture">
      <h1>Donate furniture with one short video</h1>
      <p className="muted">
        Walk slowly around the item and talk about it, like you would to a friend. 30–60 seconds is plenty. One video
        can show several items.
      </p>

      {!clip && (
        <div className="row">
          <button className={mode === "record" ? "chip active" : "chip"} onClick={() => setMode("record")}>
            Record now
          </button>
          <button className={mode === "upload" ? "chip active" : "chip"} onClick={() => setMode("upload")}>
            Upload a video
          </button>
          <label className="small muted push-right">
            I'll speak{" "}
            <select value={lang} onChange={(e) => setLang(e.target.value)} disabled={recording}>
              {LANGS.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      {!clip && mode === "record" && (
        <div className="recorder">
          {stream ? (
            <div className="viewfinder">
              <video ref={liveRef} autoPlay muted playsInline />
              {recording && (
                <>
                  <div className="rec-badge">
                    ● {Math.floor(elapsed)}s / {maxSeconds}s
                  </div>
                  <div className="guide">{guide.text}</div>
                  <div className="live-caption">
                    {finalText.slice(-160)}
                    <span className="muted">{interim}</span>
                  </div>
                </>
              )}
            </div>
          ) : (
            <div className="viewfinder placeholder">
              <button className="primary" onClick={openCamera}>
                Turn on camera
              </button>
            </div>
          )}
          <div className="say-list">
            <strong>Try to mention:</strong>
            {SAY_CHECKLIST.map((s) => (
              <span key={s} className="pill">
                {s}
              </span>
            ))}
          </div>
          {stream && (
            <div className="row center">
              {recording ? (
                <button className="danger big" onClick={stopRecording}>
                  ■ Stop
                </button>
              ) : (
                <button className="primary big" onClick={startRecording}>
                  ● Start recording
                </button>
              )}
            </div>
          )}
          {!SpeechRecognitionCtor && (
            <p className="small muted">
              Live captions aren't supported in this browser; the AI will still listen to the video's audio.
            </p>
          )}
        </div>
      )}

      {!clip && mode === "upload" && (
        <label className="dropzone">
          <input type="file" accept="video/*" capture="environment" onChange={(e) => onFile(e.target.files?.[0])} />
          <span>Choose or record a video</span>
          <span className="small muted">MP4, MOV or WebM, up to {maxSeconds} seconds</span>
        </label>
      )}

      {clip && (
        <div className="preview">
          <video src={clip.url} controls playsInline />
          {(finalText || interim) && (
            <div className="transcript">
              <div className="small muted">What we heard (you can fix it):</div>
              <textarea value={(finalText + interim).trim()} onChange={(e) => {
                  setFinalText(e.target.value);
                  setInterim("");
                }} rows={3} />
            </div>
          )}
          <div className="grid2">
            <label>
              Your name <span className="muted">(optional)</span>
              <input value={donorName} onChange={(e) => setDonorName(e.target.value)} />
            </label>
            <label>
              ZIP code
              <input value={donorZip} onChange={(e) => setDonorZip(e.target.value)} inputMode="numeric" maxLength={5} />
            </label>
          </div>
          {busy ? (
            <ol className="progress">
              {STEPS.map((s, i) => (
                <li key={s} className={i < step ? "done" : i === step ? "now" : ""}>
                  {s}
                </li>
              ))}
            </ol>
          ) : (
            <div className="row center">
              <button onClick={reset}>Retake</button>
              <button className="primary big" onClick={submit}>
                Analyze my donation
              </button>
            </div>
          )}
        </div>
      )}

      {error && <p className="error">{error}</p>}
    </section>
  );
}
