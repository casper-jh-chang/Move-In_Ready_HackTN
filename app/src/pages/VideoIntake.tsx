import {useEffect, useRef, useState} from 'react';
import {AlertTriangle, ArrowRight, Circle, RotateCcw, Sparkles, Square, Upload, Video} from 'lucide-react';
import {request, upload, useApp, useLoad} from '../api';
import {Modal} from '../ui';
import type {AiOutcome, Defect, DefectFrame, RuleHit, VideoAnalysis, VisionResult, VisionStatus} from '../types';

// Shown one after another while recording, so donors cover every side and say the useful things.
const GUIDE = [
    {until: 6, text: 'Front: show the whole item and say what it is.'},
    {until: 14, text: 'Walk slowly around the left side.'},
    {until: 22, text: 'Back of the item.'},
    {until: 30, text: 'Right side.'},
    {until: 40, text: 'Close-ups: lift a seat cushion, open drawers, show any marks or labels.'},
    {until: Infinity, text: 'Say how old it is, any damage, pets or smoking at home, your floor and elevator.'}
];
const SAY = ['What it is', 'Age', 'Damage or stains', 'Pets / smoking', 'Size', 'Floor & elevator'];
const LANGS = [{code: 'en-US', label: 'English'}, {code: 'es-US', label: 'Español'}, {code: 'zh-CN', label: '中文'}];
const STEPS = ['Uploading video', 'Picking sharp frames', 'AI watching & listening', 'Checking donation rules'];

export const OUTCOME_TEXT: Record<AiOutcome, string> = {accept: 'AI: Accept', review: 'AI: Needs review', decline: 'AI: Decline'};
const OUTCOME_BADGE: Record<AiOutcome, string> = {accept: 'approved', review: 'pending', decline: 'rejected'};

// Minimal typing for the Web Speech API (Chrome, Edge, Safari).
interface SpeechRec {
    lang: string, continuous: boolean, interimResults: boolean,
    onresult: ((e: { resultIndex: number, results: ArrayLike<{ isFinal: boolean, 0: { transcript: string } }> }) => void) | null,
    onend: (() => void) | null, onerror: ((e: unknown) => void) | null,
    start(): void, stop(): void
}
const w = window as unknown as Record<string, new () => SpeechRec>;
const SpeechRecognition: (new () => SpeechRec) | undefined = w.SpeechRecognition ?? w.webkitSpeechRecognition;

const pickMime = () => ['video/mp4;codecs=avc1,mp4a', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm']
    .find(m => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m)) ?? '';

export function OutcomeBadge({outcome}: { outcome: AiOutcome }) {
    return <span className={'badge ' + OUTCOME_BADGE[outcome]}><Sparkles size={10}/> {OUTCOME_TEXT[outcome]}</span>
}

export function RuleHits({hits}: { hits: RuleHit[] }) {
    return <div className="ai-hits">{hits.map((h, i) => <p key={i} className={'ai-hit ' + h.outcome}>
        <code>{h.rule_id}</code> {h.reason}
        {h.alternative && <small>Try instead: {h.alternative}</small>}
    </p>)}</div>
}

export function DefectList({defects, frames, onSeek}: { defects: Defect[], frames: DefectFrame[], onSeek?: (t: number) => void }) {
    if (!defects.length) return null;
    return <div className="ai-defects">{defects.map((d, k) => {
        const fr = frames.find(f => f.defectIndex === k);
        return <button type="button" key={k} className="ai-defect" onClick={() => d.timestamp_s != null && onSeek?.(d.timestamp_s)}>
            {fr && <img src={fr.url} alt=""/>}
            <span><b className={'sev ' + d.severity}>{d.severity}</b> {d.type.replace(/_/g, ' ')}{d.location && ` · ${d.location}`}
                <small>{d.evidence === 'both' ? 'seen & mentioned' : d.evidence === 'spoken' ? 'mentioned' : 'seen'}{d.timestamp_s != null && ` at ${d.timestamp_s.toFixed(1)}s`}</small></span>
        </button>
    })}</div>
}

// Admin view of what the AI found for a donated item.
export function VisionPanel({v, compact}: { v: VisionResult, compact?: boolean }) {
    const video = useRef<HTMLVideoElement>(null);
    const seek = (t: number) => {
        if (!video.current) return;
        video.current.currentTime = t;
        video.current.play();
    };
    if (compact) return <div className="ai-compact">
        <OutcomeBadge outcome={v.outcome}/>
        <span>{v.conditionGrade.replace('_', ' ')} · {v.conditionScore}/5 · {Math.round(v.confidence * 100)}% sure</span>
        {v.hits.filter(h => h.outcome !== 'accept').slice(0, 2).map((h, i) => <small key={i}><AlertTriangle size={11}/> {h.reason}</small>)}
    </div>;
    return <div className="ai-panel">
        <div className="ai-panel-head"><strong><Sparkles size={14}/> AI video intake</strong><OutcomeBadge outcome={v.outcome}/></div>
        <video ref={video} src={v.videoUrl} controls playsInline preload="metadata"/>
        <RuleHits hits={v.hits}/>
        <p className="hint">Condition {v.conditionGrade.replace('_', ' ')} ({v.conditionScore}/5)
            {v.isSleeper != null && ` · sleeper sofa: ${v.isSleeper ? 'yes' : 'no'}`} · sides shown: {v.viewsCovered.join(', ') || 'none'}
            · confidence {Math.round(v.confidence * 100)}%</p>
        <DefectList defects={v.defects} frames={v.defectFrames} onSeek={seek}/>
        {v.evidence && <p className="hint">Why: {v.evidence}</p>}
        {v.transcript && <details><summary className="hint">What the donor said</summary><p className="hint">{v.transcript}</p></details>}
        <small className="hint">The AI only describes the video; rules suggest an outcome and you make the decision. {v.provider}</small>
    </div>
}

type Pick = { include: boolean, name: string, category: string };

export function VideoIntake({onClose, onSaved}: { onClose: () => void, onSaved: () => void }) {
    const {user, meta, setError, notify} = useApp();
    const {data: status} = useLoad<VisionStatus>('/vision/status');
    const maxSeconds = status?.maxVideoSeconds ?? 120;

    const [mode, setMode] = useState<'record' | 'upload'>('record');
    const [lang, setLang] = useState('en-US');
    const [stream, setStream] = useState<MediaStream | null>(null);
    const [recording, setRecording] = useState(false);
    const [elapsed, setElapsed] = useState(0);
    const [clip, setClip] = useState<{ blob: Blob, name: string, url: string } | null>(null);
    const [finalText, setFinalText] = useState(''), [interim, setInterim] = useState('');
    const [busy, setBusy] = useState(false), [step, setStep] = useState(0);
    const [result, setResult] = useState<VideoAnalysis | null>(null);
    const [picks, setPicks] = useState<Pick[]>([]);
    const [location, setLocation] = useState(user.area || meta.areas[0]);

    const live = useRef<HTMLVideoElement>(null), player = useRef<HTMLVideoElement>(null);
    const recorder = useRef<MediaRecorder | null>(null), speech = useRef<SpeechRec | null>(null);
    const listening = useRef(false), timer = useRef<number>(), streamRef = useRef<MediaStream | null>(null);
    streamRef.current = stream;

    useEffect(() => () => {
        listening.current = false;
        speech.current?.stop();
        window.clearInterval(timer.current);
        if (recorder.current?.state === 'recording') recorder.current.stop();
        streamRef.current?.getTracks().forEach(t => t.stop());
    }, []);
    useEffect(() => {
        if (live.current && stream) live.current.srcObject = stream;
    }, [stream, recording]);
    useEffect(() => {
        if (recording && elapsed >= maxSeconds) stop();
    }, [elapsed, recording, maxSeconds]); // eslint-disable-line react-hooks/exhaustive-deps

    const openCamera = async () => {
        try {
            setStream(await navigator.mediaDevices.getUserMedia({
                video: {facingMode: {ideal: 'environment'}, width: {ideal: 1280}, height: {ideal: 720}}, audio: true
            }));
        } catch (e) {
            setError(`Camera unavailable (${(e as Error).message}). You can upload a video instead.`);
            setMode('upload');
        }
    };

    const startSpeech = () => {
        if (!SpeechRecognition) return;
        const rec = new SpeechRecognition();
        Object.assign(rec, {lang, continuous: true, interimResults: true});
        rec.onresult = e => {
            let fin = '', tmp = '';
            for (let i = e.resultIndex; i < e.results.length; i++) {
                const r = e.results[i];
                if (r.isFinal) fin += r[0].transcript + ' ';
                else tmp += r[0].transcript;
            }
            if (fin) setFinalText(t => t + fin);
            setInterim(tmp);
        };
        // Chrome ends recognition after a silence; restart while still recording.
        rec.onend = () => listening.current && rec.start();
        rec.onerror = () => undefined;
        speech.current = rec;
        listening.current = true;
        rec.start();
    };

    const start = () => {
        if (!stream) return;
        const mime = pickMime();
        const rec = new MediaRecorder(stream, mime ? {mimeType: mime, videoBitsPerSecond: 2_500_000} : undefined);
        const chunks: Blob[] = [];
        rec.ondataavailable = e => e.data.size && chunks.push(e.data);
        rec.onstop = () => {
            const type = rec.mimeType || mime || 'video/webm';
            const blob = new Blob(chunks, {type});
            setClip({blob, name: 'donation.' + (type.includes('mp4') ? 'mp4' : 'webm'), url: URL.createObjectURL(blob)});
        };
        rec.start(1000);
        recorder.current = rec;
        setFinalText('');
        setInterim('');
        setElapsed(0);
        setRecording(true);
        const t0 = Date.now();
        timer.current = window.setInterval(() => setElapsed((Date.now() - t0) / 1000), 250);
        startSpeech();
    };

    const stop = () => {
        listening.current = false;
        speech.current?.stop();
        window.clearInterval(timer.current);
        recorder.current?.stop();
        setRecording(false);
        stream?.getTracks().forEach(t => t.stop());
        setStream(null);
    };

    const retake = () => {
        if (clip) URL.revokeObjectURL(clip.url);
        setClip(null);
        setResult(null);
        setFinalText('');
        setInterim('');
    };

    const analyze = async () => {
        if (!clip) return;
        setBusy(true);
        setStep(0);
        const ticker = window.setInterval(() => setStep(s => Math.min(s + 1, STEPS.length - 1)), 4000);
        try {
            const form = new FormData();
            form.append('video', clip.blob, clip.name);
            form.append('transcript', (finalText + ' ' + interim).trim());
            const r = await upload<VideoAnalysis>('/vision/video', form);
            setResult(r);
            setPicks(r.items.map(i => ({include: i.decision.outcome !== 'decline', name: i.suggested.name, category: i.suggested.category})));
        } catch (e) {
            setError((e as Error).message);
        } finally {
            window.clearInterval(ticker);
            setBusy(false);
        }
    };

    const submit = async () => {
        if (!result) return;
        const chosen = result.items.filter((_, i) => picks[i]?.include);
        if (!chosen.length) return setError('Select at least one item to donate');
        setBusy(true);
        try {
            for (const it of chosen) {
                const p = picks[it.index];
                await request('/furniture', 'POST', {
                    ...it.suggested, photo: undefined, name: p.name, category: p.category, location,
                    vision: {intakeId: result.id, itemIndex: it.index}
                });
            }
            notify(`${chosen.length} item${chosen.length > 1 ? 's' : ''} submitted. An admin will review ${chosen.length > 1 ? 'them' : 'it'} soon.`);
            onSaved();
            onClose();
        } catch (e) {
            setError((e as Error).message);
        } finally {
            setBusy(false);
        }
    };

    const seek = (t: number) => {
        if (!player.current) return;
        player.current.currentTime = t;
        player.current.play();
    };
    const guide = GUIDE.find(g => elapsed < g.until)!;
    const setPick = (i: number, patch: Partial<Pick>) => setPicks(ps => ps.map((p, j) => j === i ? {...p, ...patch} : p));

    return <Modal eyebrow="AI VIDEO INTAKE" title={result ? `${result.items.length} item${result.items.length === 1 ? '' : 's'} found` : 'Donate with one short video'}
                  description={result ? 'Check the details, untick anything you don\'t want to donate, then submit. An admin makes the final decision.'
                      : 'Walk slowly around the item and talk about it. 30–60 seconds is plenty, and one video can show several items.'}
                  onClose={onClose} onSubmit={submit}>
        {status && !status.available && <div className="error"><AlertTriangle size={16}/> {status.error}</div>}
        {!!status?.missingTools?.length && <div className="error"><AlertTriangle size={16}/>
            The video service can't find {status.missingTools.join(' and ')}. Install ffmpeg and restart it.</div>}

        {!clip && <>
            <div className="filter-row video-modes">
                <div className="segmented">
                    <button type="button" className={mode === 'record' ? 'active' : ''} onClick={() => setMode('record')}><Video size={14}/> Record now</button>
                    <button type="button" className={mode === 'upload' ? 'active' : ''} onClick={() => setMode('upload')}><Upload size={14}/> Upload a video</button>
                </div>
                <label className="hint lang-pick">I'll speak <select value={lang} disabled={recording} onChange={e => setLang(e.target.value)}>
                    {LANGS.map(l => <option key={l.code} value={l.code}>{l.label}</option>)}</select></label>
            </div>
            {mode === 'record' ? <>
                <div className="viewfinder">
                    {stream ? <>
                        <video ref={live} autoPlay muted playsInline/>
                        {recording && <>
                            <span className="rec-badge"><Circle size={9} fill="currentColor"/> {Math.floor(elapsed)}s / {maxSeconds}s</span>
                            <div className="guide">{guide.text}</div>
                            <div className="live-caption">{finalText.slice(-160)}<i>{interim}</i></div>
                        </>}
                    </> : <button type="button" className="primary" onClick={openCamera}><Video size={16}/> Turn on camera</button>}
                </div>
                <div className="say-list"><b>Try to mention:</b>{SAY.map(s => <span key={s}>{s}</span>)}</div>
                {stream && <div className="record-actions">{recording
                    ? <button type="button" className="primary danger" onClick={stop}><Square size={14} fill="currentColor"/> Stop</button>
                    : <button type="button" className="primary" onClick={start}><Circle size={14} fill="currentColor"/> Start recording</button>}</div>}
                {!SpeechRecognition && <p className="hint">Live captions aren't supported in this browser; the AI still listens to the video's audio.</p>}
            </> : <label className="photo-upload">
                <input type="file" accept="video/*" capture="environment" onChange={e => {
                    const f = e.target.files?.[0];
                    if (f) setClip({blob: f, name: f.name, url: URL.createObjectURL(f)});
                }}/>
                <Upload size={24}/><strong>Choose or record a video</strong><small>MP4, MOV or WebM · up to {maxSeconds} seconds</small>
            </label>}
        </>}

        {clip && !result && <>
            <video className="clip-preview" src={clip.url} controls playsInline/>
            {(finalText || interim) && <label className="full-label">What we heard (you can fix it)
                <textarea rows={3} value={(finalText + interim).trim()} onChange={e => {
                    setFinalText(e.target.value);
                    setInterim('');
                }}/></label>}
            {busy && <ol className="ai-progress">{STEPS.map((s, i) => <li key={s} className={i < step ? 'done' : i === step ? 'now' : ''}>{s}</li>)}</ol>}
            <div className="modal-actions">
                <button type="button" className="secondary" onClick={retake} disabled={busy}><RotateCcw size={15}/> Retake</button>
                <button type="button" className="primary" onClick={analyze} disabled={busy}><Sparkles size={15}/> {busy ? 'Analyzing…' : 'Analyze video'}</button>
            </div>
        </>}

        {result && <>
            <video ref={player} className="clip-preview" src={result.videoUrl} controls playsInline preload="metadata"/>
            {result.summary && <p className="hint">{result.summary}</p>}
            {!!result.retakeSuggestions.length && <div className="review-note">For a faster answer, please add: {result.retakeSuggestions.join(' ')}</div>}
            {!result.items.length && <div className="review-note">We couldn't identify any furniture. Try again with the whole item in view.</div>}
            {result.items.map((it, i) => <div key={i} className={'ai-item ' + it.decision.outcome}>
                <img src={it.photoUrl} alt=""/>
                <div>
                    <div className="ai-item-head">
                        <label className="ai-include"><input type="checkbox" checked={picks[i]?.include ?? false} onChange={e => setPick(i, {include: e.target.checked})}/> Donate</label>
                        <OutcomeBadge outcome={it.decision.outcome}/>
                    </div>
                    <div className="form-grid">
                        <label>Item name<input value={picks[i]?.name ?? ''} maxLength={100} onChange={e => setPick(i, {name: e.target.value})}/></label>
                        <label>Category<select value={picks[i]?.category} onChange={e => setPick(i, {category: e.target.value})}>
                            {meta.categories.map(c => <option key={c}>{c}</option>)}</select></label>
                    </div>
                    <p className="hint">{it.item.condition_grade.replace('_', ' ')} ({it.item.condition_score}/5) · {it.suggested.dimensions || 'size not given'} · ~{it.suggested.weight} kg
                        · {Math.round(it.item.confidence * 100)}% sure</p>
                    <RuleHits hits={it.decision.hits}/>
                    <DefectList defects={it.item.defects} frames={it.defectFrames} onSeek={seek}/>
                </div>
            </div>)}
            <div className="form-grid single">
                <label>Pickup area *<select value={location} onChange={e => setLocation(e.target.value)}>
                    {meta.areas.map(a => <option key={a}>{a}</option>)}</select></label>
            </div>
            <div className="modal-actions">
                <button type="button" className="secondary" onClick={retake} disabled={busy}><RotateCcw size={15}/> New video</button>
                <button className="primary" type="submit" disabled={busy || !picks.some(p => p.include)}>
                    Submit {picks.filter(p => p.include).length} for review <ArrowRight size={16}/></button>
            </div>
        </>}
    </Modal>
}

export const hasVideo = (v: unknown): v is VisionResult => !!v && (v as VisionResult).source === 'video';
