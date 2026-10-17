import { useEffect, useRef, useState } from 'react';
import type { Patient } from '../lib/calculate';

type SpeechResultEvent = { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> };
type BrowserSpeechRecognition = { lang: string; continuous: boolean; interimResults: boolean; onresult: ((event: SpeechResultEvent) => void) | null; onerror: ((event: { error: string }) => void) | null; onend: (() => void) | null; start: () => void; stop: () => void; abort: () => void };
type SpeechWindow = Window & { SpeechRecognition?: new () => BrowserSpeechRecognition; webkitSpeechRecognition?: new () => BrowserSpeechRecognition };

type Message = { role: 'assistant' | 'patient'; text: string };
type Props = { patient: Patient; onPatientChange: (patient: Patient) => void };
const questions = [
  'Welcome to CareDebt. What makes getting to a healthcare appointment difficult for you?',
  'How do you usually get to appointments? Do you have an estimated round-trip transportation cost?',
  'Do you miss paid work for appointments? If so, about how many hours and what is your hourly wage?',
  'Do you need to pay for childcare while attending an appointment?',
  'Thank you. Your answers can update the cost comparison on this page. You can edit every number before using it.'
];
const initial: Message[] = [{ role: 'assistant', text: questions[0] }];

function extractNumbers(text: string, patient: Patient): { next: Patient; updates: string[] } {
  const next = { ...patient };
  const updates: string[] = [];
  const lower = text.toLowerCase();
  const money = (pattern: RegExp) => { const match = lower.match(pattern); return match ? Number(match[1]) : null; };
  const transport = money(/(?:bus|transport|uber|taxi|ride|fare|train)[^\d$]{0,35}\$?(\d+(?:\.\d+)?)/);
  const childcare = money(/(?:childcare|babysit(?:ter|ting)?|daycare)[^\d$]{0,35}\$?(\d+(?:\.\d+)?)/);
  const hours = money(/(?:miss|lose|take off|off work)[^\d]{0,20}(\d+(?:\.\d+)?)\s*hours?/);
  const wage = money(/(?:earn|make|paid|wage)[^\d$]{0,20}\$?(\d+(?:\.\d+)?)\s*(?:an?\s*hour|\/\s*hour|hourly|per hour)/);
  if (transport !== null) { next.transportCost = transport; updates.push(`Transport: $${transport}`); }
  if (childcare !== null) { next.childcareCost = childcare; updates.push(`Childcare: $${childcare}`); }
  if (hours !== null) { next.missedWorkHours = hours; updates.push(`Missed work: ${hours}h`); }
  if (wage !== null) { next.hourlyWage = wage; updates.push(`Hourly wage: $${wage}`); }
  return { next, updates };
}

export function LiveInterview({ patient, onPatientChange }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraOn, setCameraOn] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [messages, setMessages] = useState<Message[]>(initial);
  const [draft, setDraft] = useState('');
  const [step, setStep] = useState(0);
  const [speaking, setSpeaking] = useState(false);
  const [lastUpdate, setLastUpdate] = useState('');
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const [listening, setListening] = useState(false);
  const [speechError, setSpeechError] = useState('');
  const [speechSupported] = useState(() => typeof window !== 'undefined' && Boolean((window as SpeechWindow).SpeechRecognition || (window as SpeechWindow).webkitSpeechRecognition));
  const draftBaseRef = useRef('');
  const finalTranscriptRef = useRef('');

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }, [messages]);
  useEffect(() => () => { streamRef.current?.getTracks().forEach(track => track.stop()); recognitionRef.current?.abort(); window.speechSynthesis?.cancel(); }, []);
  useEffect(() => { if (videoRef.current && streamRef.current) videoRef.current.srcObject = streamRef.current; }, [cameraOn]);

  async function toggleCamera() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop()); streamRef.current = null;
      if (videoRef.current) videoRef.current.srcObject = null;
      setCameraOn(false); return;
    }
    if (!navigator.mediaDevices?.getUserMedia) { setCameraError('Camera access requires localhost or HTTPS and a supported browser.'); return; }
    try {
      setCameraError('');
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
      setCameraOn(true);
    } catch { setCameraError('Camera unavailable or permission denied. You can continue with text.'); }
  }
  function say(text: string) {
    if (!voiceEnabled || !('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.96;
    utterance.onstart = () => setSpeaking(true);
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);
    window.speechSynthesis.speak(utterance);
  }
  function stopListening() {
    recognitionRef.current?.stop();
    setListening(false);
  }
  function toggleListening() {
    if (listening) { stopListening(); return; }
    const SpeechRecognition = (window as SpeechWindow).SpeechRecognition || (window as SpeechWindow).webkitSpeechRecognition;
    if (!SpeechRecognition) { setSpeechError('Speech recognition is unavailable in this browser. You can still type your answer.'); return; }
    recognitionRef.current?.abort();
    const recognition = new SpeechRecognition();
    recognitionRef.current = recognition;
    recognition.lang = 'en-US';
    recognition.continuous = true;
    recognition.interimResults = true;
    draftBaseRef.current = draft.trim() ? draft.trim() + ' ' : '';
    finalTranscriptRef.current = '';
    setSpeechError('');
    recognition.onresult = (event) => {
      let finalText = finalTranscriptRef.current;
      let interimText = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) finalText += result[0].transcript.trim() + ' ';
      }
      // Rebuild from all final results to avoid duplicates when browsers resend results.
      finalText = '';
      for (let i = 0; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) finalText += result[0].transcript.trim() + ' ';
        else interimText += result[0].transcript;
      }
      finalTranscriptRef.current = finalText;
      setDraft((draftBaseRef.current + finalText + interimText).trim());
    };
    recognition.onerror = (event) => {
      if (event.error !== 'aborted' && event.error !== 'no-speech') {
        setSpeechError(event.error === 'not-allowed' ? 'Microphone permission denied. Allow microphone access in your browser settings.' : `Speech recognition error: ${event.error}. You can type instead.`);
      }
      setListening(false);
    };
    recognition.onend = () => { setListening(false); if (recognitionRef.current === recognition) recognitionRef.current = null; };
    try { recognition.start(); setListening(true); }
    catch { setSpeechError('Could not start microphone recognition. Please try again or type.'); setListening(false); }
  }
  function send() {
    if (listening) stopListening();
    const text = draft.trim();
    if (!text) return;
    const { next, updates } = extractNumbers(text, patient);
    if (updates.length) onPatientChange(next);
    setLastUpdate(updates.length ? updates.join(' · ') : 'No numerical costs extracted; you can edit the patient profile below.');
    const nextStep = Math.min(step + 1, questions.length - 1);
    const response = questions[nextStep];
    setMessages(prev => [...prev, { role: 'patient', text }, { role: 'assistant', text: response }]);
    setStep(nextStep); setDraft(''); say(response);
  }
  function reset() {
    recognitionRef.current?.abort(); recognitionRef.current = null; setListening(false); setSpeechError('');
    setMessages(initial); setStep(0); setDraft(''); setLastUpdate('');
    window.speechSynthesis?.cancel(); setSpeaking(false);
  }
  return <section className="interview card" id="live-interview" aria-labelledby="interview-title">
    <div className="interview-heading"><div><div className="eyebrow">LIVE INTERVIEW / MOCK AI</div><h2 id="interview-title">Tell your story. See the hidden cost.</h2><p>Speak or type your answers. Your camera preview stays local; no video is uploaded or recorded by this app.</p></div><span className="mock-pill">● MOCK CONVERSATION</span></div>
    <div className="video-grid">
      <div className="video-tile patient-tile"><div className="tile-top"><span className="live-dot"/> YOU <span className="tile-status">{cameraOn ? 'CAMERA ON' : 'CAMERA OFF'}</span></div>
        <video ref={videoRef} autoPlay playsInline muted className={cameraOn ? 'webcam active' : 'webcam'} aria-label="Your camera preview" />
        {!cameraOn && <div className="camera-placeholder"><div className="camera-icon">◎</div><strong>Your camera preview</strong><span>Optional · Camera is off</span></div>}
        <div className="tile-footer"><span>Patient view</span><button type="button" onClick={toggleCamera}>{cameraOn ? 'Turn camera off' : 'Enable camera'}</button></div>
      </div>
      <div className="video-tile avatar-tile"><div className="tile-top"><span className="live-dot"/> CAREDEBT GUIDE <span className="tile-status">DEMO</span></div>
        <div className={'avatar-scene' + (speaking ? ' is-speaking' : '')}><div className="avatar-halo"/><div className="avatar-head"><div className="avatar-eyes"><i/><i/></div><div className="avatar-mouth"/></div><div className="avatar-body"/><div className="avatar-caption">{speaking ? 'Speaking…' : 'Ready to listen'}</div></div>
        <div className="tile-footer"><span>Animated AI avatar</span><span className="avatar-tag">SIMULATED</span></div>
      </div>
    </div>
    {cameraError && <p className="inline-alert" role="alert">{cameraError}</p>}
    <div className="interview-bottom"><div className="conversation"><div className="conversation-title"><strong>Conversation</strong><span>Step {Math.min(step + 1, questions.length)} / {questions.length}</span></div>
      <div className="messages" aria-live="polite">{messages.map((message, index) => <div key={index} className={'message ' + message.role}><span>{message.role === 'assistant' ? 'CareDebt Guide' : 'You'}</span><p>{message.text}</p></div>)}<div ref={bottomRef}/></div>
      <form className="composer" onSubmit={event => { event.preventDefault(); send(); }}>
        <label htmlFor="interview-answer" className="sr-only">Your answer</label>
        <input id="interview-answer" value={draft} onChange={event => { if (listening) stopListening(); setDraft(event.target.value); }} placeholder="Type or use the mic (e.g. bus costs $12)…" />
        <button className={'mic-button' + (listening ? ' listening' : '')} type="button" onClick={toggleListening} disabled={!speechSupported} aria-pressed={listening} title={speechSupported ? (listening ? 'Stop listening' : 'Start speaking') : 'Speech recognition unavailable in this browser'}>{listening ? '■ Stop' : '🎙 Talk'}</button>
        <button type="submit" disabled={!draft.trim()}>Send ↗</button>
      </form>
      <div className="speech-status" role="status" aria-live="polite">{listening ? '● Listening… Speak naturally, then press Stop or Send.' : speechSupported ? 'Type or press Talk. Review the transcript before sending.' : 'Speech recognition is not supported here. Try Chrome or Edge, or type instead.'}</div>
      {speechError && <p className="inline-alert" role="alert">{speechError}</p>}
      <div className="interview-tools"><label><input type="checkbox" checked={voiceEnabled} onChange={event => setVoiceEnabled(event.target.checked)}/> Read AI replies aloud</label><button type="button" onClick={reset}>Restart conversation</button></div>
    </div><aside className="interview-notes"><div className="eyebrow">LIVE PROFILE UPDATES</div><h3>From story to numbers</h3><p>Mock extraction recognizes a few explicit costs in typed answers and updates <b>Patient B</b> below.</p><div className="profile-metrics"><div><span>Transport</span><strong>${patient.transportCost}</strong></div><div><span>Missed work</span><strong>{patient.missedWorkHours}h</strong></div><div><span>Hourly wage</span><strong>${patient.hourlyWage}</strong></div><div><span>Childcare</span><strong>${patient.childcareCost}</strong></div></div><div className="extraction-note" aria-live="polite">{lastUpdate || 'Try: “The bus costs $18 and childcare costs $40.”'}</div><p className="privacy-note">Microphone transcription uses your browser’s speech service and may send audio to its provider. No audio or video is stored by this app. No real AI API or database yet. Use fictional patient information.</p></aside></div>
  </section>;
}
