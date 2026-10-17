export type Patient = {
  name: string;
  travelMinutes: number;
  waitMinutes: number;
  transportCost: number;
  missedWorkHours: number;
  hourlyWage: number;
  childcareCost: number;
};

export function calculateCareDebt(patient: Patient) {
  const lostWages = patient.missedWorkHours * patient.hourlyWage;
  const totalMoney = patient.transportCost + lostWages + patient.childcareCost;
  const totalMinutes = patient.travelMinutes + patient.waitMinutes;
  return { lostWages, totalMoney, totalMinutes };
}

export const initialPatients: [Patient, Patient] = [
  { name: 'Patient A', travelMinutes: 15, waitMinutes: 20, transportCost: 5, missedWorkHours: 0, hourlyWage: 20, childcareCost: 0 },
  { name: 'Patient B', travelMinutes: 90, waitMinutes: 45, transportCost: 12, missedWorkHours: 5, hourlyWage: 13, childcareCost: 30 }
];
