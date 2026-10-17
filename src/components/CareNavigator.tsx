import { useMemo, useState } from 'react';
import type { Patient } from '../lib/calculate';
import { calculateCareDebt } from '../lib/calculate';

type Place = { id: string; name: string; lat: number; lon: number; address: string; distanceKm: number };
type Coordinates = { lat: number; lon: number };
const urgent = [/chest (pain|pressure|tightness)/i,/can't breathe|cannot breathe|difficulty breathing|shortness of breath/i,/face droop|slurred speech|one.side(d)? weakness|sudden weakness|stroke/i,/severe bleeding|uncontrolled bleeding/i,/suicid|kill myself|hurt myself/i,/unconscious|passed out|seizure/i,/worst headache|sudden severe headache/i,/anaphyla|swollen tongue/i];
const warning = [/fever/i,/vomit/i,/dizz/i,/headache/i,/abdominal pain|stomach pain/i,/infection/i,/cough/i,/pain/i];
function assess(s: string) { if (!s.trim()) return 'empty'; if (urgent.some(r => r.test(s))) return 'urgent'; if (warning.some(r => r.test(s))) return 'review'; return 'unknown'; }
function dist(a: Coordinates,b: Coordinates) { const r=Math.PI/180; const dlat=(a.lat-b.lat)*r, dlon=(a.lon-b.lon)*r; const h=Math.sin(dlat/2)**2+Math.cos(a.lat*r)*Math.cos(b.lat*r)*Math.sin(dlon/2)**2; return 6371*2*Math.asin(Math.min(1,Math.sqrt(h))); }
const money = (n:number) => `$${Math.max(0,n).toFixed(2)}`;
export function CareNavigator({patient}:{patient:Patient}) {
  const [symptoms,setSymptoms]=useState('');
  const [duration,setDuration]=useState('');
  const [city,setCity]=useState('');
  const [coords,setCoords]=useState<Coordinates|null>(null);
  const [placeName,setPlaceName]=useState('');
  const [places,setPlaces]=useState<Place[]>([]);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState('');
  const [searched,setSearched]=useState(false);
  const [selected,setSelected]=useState<string>('');
  const [consent,setConsent]=useState(false);
  const risk=useMemo(()=>assess(symptoms),[symptoms]);
  const costs=calculateCareDebt(patient);
  const chosen=places.find(p=>p.id===selected);
  const q=encodeURIComponent(`${city || placeName} community health center`);
  async function geocode() {
    if (!city.trim()) {setError('Enter a city and state, such as Nashville, TN.');return;}
    setLoading(true);setError('');setPlaces([]);setSelected('');setSearched(false);
    try { const response=await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(city)}`); if(!response.ok) throw new Error('Location search unavailable');
      const data=await response.json() as Array<{lat:string;lon:string;display_name:string}>;
      if(!data.length) throw new Error('Location not found. Try city, state and country.');
      const point={lat:Number(data[0].lat),lon:Number(data[0].lon)};setCoords(point);setPlaceName(data[0].display_name);
      await lookup(point);
    }catch(e){setError(e instanceof Error?e.message:'Location search failed.');}finally{setLoading(false);}
  }
  async function locate() {
    if (!consent) {setError('Check the location permission acknowledgment first.');return;}
    if(!navigator.geolocation){setError('Geolocation unavailable. Enter your city instead.');return;}
    setLoading(true);setError('');setPlaces([]);setSelected('');setSearched(false);
    navigator.geolocation.getCurrentPosition(async pos=>{
      const point={lat:pos.coords.latitude,lon:pos.coords.longitude};setCoords(point);setPlaceName('Current approximate area (device location)');
      try{await lookup(point);}catch(e){setError(e instanceof Error?e.message:'Provider lookup failed.');}finally{setLoading(false);}
    },()=>{setLoading(false);setError('Location denied or unavailable. You can search by city instead.');},{timeout:12000,maximumAge:60000,enableHighAccuracy:false});
  }
  async function lookup(point:Coordinates) {
    setSearched(true);
    const query=`[out:json][timeout:18];(nwr["amenity"="clinic"](around:10000,${point.lat},${point.lon});nwr["healthcare"="clinic"](around:10000,${point.lat},${point.lon});nwr["amenity"="hospital"](around:10000,${point.lat},${point.lon}););out center 35;`;
    const response=await fetch('https://overpass.kumi.systems/api/interpreter',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:`data=${encodeURIComponent(query)}`});
    if(!response.ok) throw new Error('OpenStreetMap provider lookup is temporarily unavailable. Use the map search links below.');
    const data=await response.json() as {elements:Array<{type:string;id:number;lat?:number;lon?:number;center?:Coordinates;tags?:Record<string,string>}>};
    const seen=new Set<string>();
    const list=data.elements.map(el=>{const lat=el.lat??el.center?.lat,lon=el.lon??el.center?.lon;const name=el.tags?.name;if(lat===undefined||lon===undefined||!name)return null;
      const address=[el.tags?.['addr:housenumber'],el.tags?.['addr:street'],el.tags?.['addr:city']].filter(Boolean).join(' ');
      return {id:`${el.type}/${el.id}`,name,lat,lon,address,distanceKm:dist(point,{lat,lon})};
    }).filter((x):x is Place=>x!==null).filter(p=>{const k=p.name.toLowerCase();if(seen.has(k))return false;seen.add(k);return true;}).sort((a,b)=>a.distanceKm-b.distanceKm).slice(0,8);
    setPlaces(list);
  }
  return <section className="navigator card" id="care-navigator">
    <div className="eyebrow">CARE NAVIGATOR / REAL LOCATION SEARCH</div><h2>From symptoms to a practical care plan</h2>
    <p className="navigator-intro">Describe your concern, find nearby listed facilities, and build an access plan. <strong>This is not a diagnosis, medical triage service, or emergency monitor.</strong> Results are informational and must be verified with providers.</p>
    <div className="navigator-grid">
      <div className="navigator-panel"><div className="step-heading"><span>01</span><h3>Health concern intake</h3></div>
        <label htmlFor="symptoms">What symptoms or health concerns would you like to discuss with a clinician?</label>
        <textarea id="symptoms" rows={4} value={symptoms} onChange={e=>setSymptoms(e.target.value)} placeholder="Example: I've had a headache for two days and need an affordable appointment."/>
        <label htmlFor="duration">When did this start? (optional)</label><input id="duration" value={duration} onChange={e=>setDuration(e.target.value)} placeholder="e.g. 2 days ago"/>
        {risk==='urgent'?<div className="risk urgent" role="alert"><strong>Potential emergency warning language detected.</strong><p>If this describes a current emergency, call 911 in the US (or your local emergency number) now. Do not wait for this app or travel to a routine clinic. This keyword alert cannot determine whether an emergency exists.</p></div>:risk==='review'?<div className="risk review"><strong>Medical assessment may be appropriate.</strong><p>We cannot diagnose or determine urgency. Consider contacting a qualified clinician. If symptoms are sudden, severe, or worsening, seek urgent medical attention.</p></div>:risk==='unknown'?<div className="risk review"><strong>Symptoms recorded, not assessed.</strong><p>This prototype cannot rule out emergencies or decide what care you need. Contact a qualified clinician for assessment.</p></div>:<p className="helper">We do not infer a diagnosis from your description. No symptom information is transmitted to the location service.</p>}
      </div>
      <div className="navigator-panel"><div className="step-heading"><span>02</span><h3>Find healthcare locations</h3></div>
        <label htmlFor="city">City and state (no street address needed)</label><div className="location-input"><input id="city" value={city} onChange={e=>setCity(e.target.value)} placeholder="Nashville, TN"/><button type="button" disabled={loading} onClick={geocode}>Search</button></div>
        <label className="consent"><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/> I understand that using device location shares coordinates with OpenStreetMap services for lookup.</label>
        <button className="secondary-btn" type="button" disabled={loading||!consent} onClick={locate}>◎ Use my location (optional)</button>
        {loading&&<p role="status">Searching public OpenStreetMap data…</p>}{error&&<p className="inline-alert" role="alert">{error}</p>}
        {placeName&&<p className="helper">Search center: {placeName}</p>}
        {searched&&<div className="facility-results"><strong>Nearby facilities listed on OpenStreetMap</strong><p className="helper">Directory data may be incomplete or outdated. Distance is straight-line, not travel time. No insurance, pricing, availability, or specialty verification.</p>
          {places.length===0?<p>No facilities returned. Try the external map search below.</p>:places.map(p=><label className={'facility'+(selected===p.id?' active':'')} key={p.id}><input type="radio" name="facility" checked={selected===p.id} onChange={()=>setSelected(p.id)}/><span><strong>{p.name}</strong><small>{p.distanceKm.toFixed(1)} km away · {p.address||'Address not listed'}</small></span><a href={`https://www.openstreetmap.org/?mlat=${p.lat}&mlon=${p.lon}#map=16/${p.lat}/${p.lon}`} target="_blank" rel="noreferrer">Map ↗</a></label>)}
        </div>}
        <a className="external-search" target="_blank" rel="noreferrer" href={`https://www.google.com/maps/search/?api=1&query=${q}`}>Search more clinics on Google Maps ↗</a>
        <p className="helper">For US low-cost community health centers, also check <a href="https://findahealthcenter.hrsa.gov/" target="_blank" rel="noreferrer">HRSA Find a Health Center ↗</a>.</p>
      </div>
    </div>
    <div className="plan-panel"><div className="step-heading"><span>03</span><h3>Your care access plan</h3></div><p className="helper">This is a planning checklist, not a medical recommendation or confirmed appointment.</p>
      <div className="plan-items"><div><b>1 · Describe your concern</b><p>{symptoms.trim()?`Your own description: “${symptoms.trim().slice(0,240)}${symptoms.length>240?'…':''}”${duration?' · Started: '+duration:''}`:'Enter your concern above, or skip this step if you prefer.'}</p></div>
      <div><b>2 · Contact a facility</b><p>{chosen?`Call or check ${chosen.name} to confirm services, appointments, insurance and cost. Directory listing is not verification.`:'Search by city or device location and choose a facility; call to verify eligibility, availability and pricing.'}</p></div>
      <div><b>3 · Plan transport and time</b><p>Current scenario: {patient.travelMinutes} minutes travel + {patient.waitMinutes} minutes waiting; transport {money(patient.transportCost)}. Confirm actual travel routes and hours before visiting.</p></div>
      <div><b>4 · Plan your budget</b><p>Estimated out-of-pocket transport + childcare + lost wages: <strong>{money(costs.totalMoney)}</strong> (transport {money(patient.transportCost)}, childcare {money(patient.childcareCost)}, lost wages {money(costs.lostWages)}). Does not include medical bills.</p></div>
      <div><b>5 · Ask for help</b><p>Ask the facility about financial assistance, language interpretation, telehealth options, and transportation support. Ask about eligibility before relying on a program.</p></div></div>
      <div className="plan-actions"><button type="button" onClick={()=>window.print()}>Print / Save plan as PDF</button>{chosen&&<a target="_blank" rel="noreferrer" href={`https://www.google.com/maps/dir/?api=1&destination=${chosen.lat},${chosen.lon}`}>Directions to selected facility ↗</a>}</div>
      <p className="privacy-note">Privacy: symptom text stays in browser memory in this prototype. A city or device coordinates are sent to public mapping services when you search. No login, database, or medical diagnosis is used. Use fictional information for demos.</p>
    </div>
  </section>;
}
