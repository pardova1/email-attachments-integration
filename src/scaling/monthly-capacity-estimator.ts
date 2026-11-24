export interface MonthlyCapacityInput {
  customers: number;
  transfersPerCustomer: number;
  averageFileGB: number;
  averageDownloads: number;
  averageRetentionHours: number;
  storageCostPerGBMonth: number;
  egressCostPerGB: number;
  fixedMonthlyCost: number;
}

export function estimateMonthlyCapacity(input: MonthlyCapacityInput) {
  for (const value of Object.values(input)) {
    if (!Number.isFinite(value) || value < 0) throw new Error("INVALID_CAPACITY_INPUT");
  }
  const transfers = input.customers * input.transfersPerCustomer;
  const uploadedGB = transfers * input.averageFileGB;
  const downloadedGB = uploadedGB * input.averageDownloads;
  const averageStoredGB = uploadedGB * input.averageRetentionHours / 730;
  const estimatedMonthlyCost = input.fixedMonthlyCost +
    averageStoredGB * input.storageCostPerGBMonth +
    downloadedGB * input.egressCostPerGB;
  if (![transfers, uploadedGB, downloadedGB, averageStoredGB, estimatedMonthlyCost].every(Number.isFinite)) {
    throw new Error("CAPACITY_ESTIMATE_OVERFLOW");
  }
  return { transfers, uploadedGB, downloadedGB, averageStoredGB, estimatedMonthlyCost };
}
