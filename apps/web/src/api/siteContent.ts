import { apiClient } from "./client";

export type SiteHighlightType = "announcement" | "result" | "gallery";

export interface SiteHighlight {
  id: string;
  type: SiteHighlightType;
  title: string;
  description: string | null;
  imageUrl: string | null;
  meta: Record<string, string> | null;
  isActive: boolean;
  publishedAt: string;
}

export interface SiteHighlightInput {
  type: SiteHighlightType;
  title: string;
  description?: string;
  isActive: boolean;
  meta?: Record<string, string>;
  image?: File;
}

function toFormData(input: SiteHighlightInput): FormData {
  const fd = new FormData();
  fd.append("type", input.type);
  fd.append("title", input.title);
  fd.append("description", input.description ?? "");
  fd.append("isActive", String(input.isActive));
  if (input.meta) fd.append("meta", JSON.stringify(input.meta));
  if (input.image) fd.append("image", input.image);
  return fd;
}

export async function listSiteHighlights(): Promise<SiteHighlight[]> {
  const { data } = await apiClient.get<SiteHighlight[]>("/api/site/admin/highlights");
  return data;
}

export async function createSiteHighlight(input: SiteHighlightInput): Promise<SiteHighlight> {
  const { data } = await apiClient.post<SiteHighlight>("/api/site/admin/highlights", toFormData(input), {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data;
}

export async function updateSiteHighlight(id: string, input: SiteHighlightInput): Promise<SiteHighlight> {
  const { data } = await apiClient.patch<SiteHighlight>(`/api/site/admin/highlights/${id}`, toFormData(input), {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data;
}

export async function deleteSiteHighlight(id: string): Promise<void> {
  await apiClient.delete(`/api/site/admin/highlights/${id}`);
}
