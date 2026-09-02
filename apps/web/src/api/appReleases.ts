import { apiClient } from "./client";

export interface LatestRelease {
  versionName: string;
  versionCode: number;
  changelog:   string | null;
  downloadUrl: string;
}

export type AppReleaseAudience = "staff" | "student";

export async function getLatestReleaseBySlug(slug: string, audience: AppReleaseAudience): Promise<LatestRelease> {
  const { data } = await apiClient.get<LatestRelease>(`/api/app-releases/slug/${slug}/latest`, { params: { audience } });
  return data;
}
