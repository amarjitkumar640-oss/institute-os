import { apiClient } from "./client";

export interface LatestRelease {
  versionName: string;
  versionCode: number;
  changelog:   string | null;
  downloadUrl: string;
}

export async function getLatestReleaseBySlug(slug: string): Promise<LatestRelease> {
  const { data } = await apiClient.get<LatestRelease>(`/api/app-releases/slug/${slug}/latest`);
  return data;
}
