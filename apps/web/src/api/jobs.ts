import { apiClient } from "./client";

export type JobRunStatus = "running" | "success" | "failure";

export interface JobRun {
  id: string;
  jobKey: string;
  status: JobRunStatus;
  trigger: "scheduler" | "manual";
  startedAt: string;
  finishedAt: string | null;
  errorMessage: string | null;
  resultSummary: Record<string, number | string> | null;
}

export interface Job {
  key: string;
  label: string;
  description: string;
  intervalMinutes: number;
  isEnabled: boolean;
  lastRun: JobRun | null;
  recentRuns: JobRun[];
}

export async function listJobs(): Promise<Job[]> {
  const { data } = await apiClient.get<Job[]>("/api/jobs");
  return data;
}

export async function runJobNow(key: string): Promise<{ run: JobRun; result: Record<string, number | string> }> {
  const { data } = await apiClient.post(`/api/jobs/${key}/run`);
  return data;
}

export async function updateJob(
  key: string,
  payload: { intervalMinutes?: number; isEnabled?: boolean },
): Promise<{ key: string; intervalMinutes: number; isEnabled: boolean }> {
  const { data } = await apiClient.patch(`/api/jobs/${key}`, payload);
  return data;
}
