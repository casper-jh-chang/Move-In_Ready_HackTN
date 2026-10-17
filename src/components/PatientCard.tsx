import type { Patient } from '../lib/calculate';
import { calculateCareDebt } from '../lib/calculate';

type Props = { patient: Patient; onChange: (patient: Patient) => void };
const fields: { key: keyof Omit<Patient, 'name'>; label: string; unit: string }[] = [
  { key: 'travelMinutes', label: 'Travel time', unit: 'min' },
  { key: 'waitMinutes', label: 'Waiting time', unit: 'min' },
  { key: 'transportCost', label: 'Transportation cost', unit: '$' },
  { key: 'missedWorkHours', label: 'Missed work', unit: 'hrs' },
  { key: 'hourlyWage', label: 'Hourly wage', unit: '$/hr' },
  { key: 'childcareCost', label: 'Childcare cost', unit: '$' }
];
export function PatientCard({ patient, onChange }: Props) {
  const cost = calculateCareDebt(patient);
  return <section className="card">
    <div className="eyebrow">PATIENT SCENARIO</div>
    <h2>{patient.name}</h2>
    <div className="fields">{fields.map(field => <label key={field.key}>
      <span>{field.label}</span><div className="field"><input aria-label={`${patient.name} ${field.label}`} type="number" min="0" step="any" value={patient[field.key]} onChange={e => onChange({ ...patient, [field.key]: Math.max(0, Number(e.target.value) || 0) })}/><small>{field.unit}</small></div>
    </label>)}</div>
    <div className="result"><span>Hidden financial cost</span><strong>${cost.totalMoney.toFixed(2)}</strong><small>{cost.totalMinutes} minutes of travel + waiting</small></div>
  </section>;
}
