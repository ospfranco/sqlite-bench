import type { Failure, Sample, Summary } from "./types";

export function summarize(samples: Sample[], failures: Failure[]): Summary[] {
  const representatives = new Map(samples.map((sample) => [`${sample.library}/${sample.caseId}`, sample]));
  return [...representatives].flatMap(([key, representative]) => {
    const values = samples.filter((sample) => `${sample.library}/${sample.caseId}` === key).map((sample) => sample.ms);
    if (failures.some((failure) => `${failure.library}/${failure.caseId}` === key)) return [];
    if (values.length === 0 || values.some((value) => !Number.isFinite(value) || value < 0)) return [];
    const sorted = [...values].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    return [{
      library: representative.library,
      caseId: representative.caseId,
      medianMs: sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2,
      minMs: sorted[0], maxMs: sorted[sorted.length - 1], samples: values,
    }];
  });
}
