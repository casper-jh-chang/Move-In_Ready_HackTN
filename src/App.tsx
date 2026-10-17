import { useState } from 'react';
import { PatientCard } from './components/PatientCard';
import { LiveInterview } from './components/LiveInterview';
import { CareNavigator } from './components/CareNavigator';
import { calculateCareDebt, initialPatients, type Patient } from './lib/calculate';
import './style.css';

export default function App() {
  const [patients, setPatients] = useState<[Patient, Patient]>(initialPatients);
  const [intervention, setIntervention] = useState<'none' | 'transport' | 'childcare'>('none');
  const adjusted = patients.map(p => ({ ...p, transportCost: intervention === 'transport' ? 0 : p.transportCost, childcareCost: intervention === 'childcare' ? 0 : p.childcareCost }));
  const costs = adjusted.map(calculateCareDebt);
  const gap = Math.abs(costs[1].totalMoney - costs[0].totalMoney);
  function update(index: 0 | 1, patient: Patient) { setPatients(prev => prev.map((p, i) => i === index ? patient : p) as [Patient, Patient]); }
  return <main>
    <header><div className="brand"><span className="brand-mark">✳</span> CareDebt <span className="tag">PROTOTYPE</span></div><span className="header-right">Health access, made visible</span></header>
    <div className="container">
      <section className="hero"><div className="eyebrow">HEALTH EQUITY / EXPERIMENT 01</div><h1>Same appointment.<br/><em>Different cost.</em></h1><p>Healthcare has a hidden price: the time, wages, and resources people sacrifice just to get care. Compare two patient journeys and see the gap.</p></section>
      <CareNavigator patient={patients[1]}/><LiveInterview patient={patients[1]} onPatientChange={p => update(1, p)}/><div className="cards"><PatientCard patient={patients[0]} onChange={p => update(0, p)}/><PatientCard patient={patients[1]} onChange={p => update(1, p)}/></div>
      <section className="insights card"><div className="eyebrow">THE ACCESS GAP</div><div className="summary"><div><h2>${gap.toFixed(2)}</h2><p>Difference in hidden financial costs</p></div><div className="chart" aria-label="Financial cost comparison">{costs.map((c,i) => <div className="bar-row" key={i}><span>{patients[i].name}</span><div className="track"><div className={'bar bar-'+i} style={{width: `${c.totalMoney === 0 ? 0 : Math.max(3, c.totalMoney / Math.max(1, ...costs.map(x => x.totalMoney)) * 100)}%`}}/></div><b>${c.totalMoney.toFixed(0)}</b></div>)}</div></div></section>
      <section className="card experiment"><div><div className="eyebrow">WHAT-IF SIMULATOR</div><h2>What if the community could help?</h2><p>Test a hypothetical support program. All values are illustrative, not clinical or real-world predictions.</p></div><div className="actions"><button className={intervention === 'none' ? 'selected' : ''} onClick={() => setIntervention('none')}>Baseline</button><button className={intervention === 'transport' ? 'selected' : ''} onClick={() => setIntervention('transport')}>Free transport</button><button className={intervention === 'childcare' ? 'selected' : ''} onClick={() => setIntervention('childcare')}>Free childcare</button></div></section>
      <footer>Built for a healthcare access hackathon · Synthetic scenarios only · Mock interview · Live public map lookup · No diagnosis or AI API</footer>
    </div>
  </main>;
}
