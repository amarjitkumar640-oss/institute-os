import { apiClient } from "./client";

export interface StaffCenterAssignment {
  // A staff member can hold more than one role at once at the same center.
  roles:  ("admin" | "teacher" | "frontdesk")[];
  center: { id: string; name: string };
}

export interface StaffMember {
  id:                string;
  fullName:          string;
  email:             string;
  phone:             string;
  photoUrl:          string | null;
  roles:             ("admin" | "teacher" | "frontdesk")[];
  isActive:          boolean;
  createdAt:         string;
  centerAssignments: StaffCenterAssignment[];
  linkedFaculty?:    { id: string } | null; // Faculty profile this login is linked to, if any
}

export interface CreateStaffInput {
  fullName: string;
  email:    string;
  phone:    string;
  roles:    ("admin" | "teacher" | "frontdesk")[];
  password: string;
}

export interface UpdateStaffInput {
  fullName?: string;
  phone?:    string;
  roles?:    ("admin" | "teacher" | "frontdesk")[];
  isActive?: boolean;
}

export async function fetchAllStaffDetailed(): Promise<StaffMember[]> {
  const { data } = await apiClient.get<StaffMember[]>("/staff");
  return data;
}

export async function createStaffMember(input: CreateStaffInput): Promise<StaffMember> {
  const { data } = await apiClient.post<StaffMember>("/staff", input);
  return data;
}

export async function updateStaffMember(id: string, input: UpdateStaffInput): Promise<StaffMember> {
  const { data } = await apiClient.patch<StaffMember>(`/staff/${id}`, input);
  return data;
}

export async function resetStaffPassword(id: string, password: string): Promise<void> {
  await apiClient.post(`/staff/${id}/reset-password`, { password });
}

// Self-service only — always the logged-in staff member's own photo, never
// someone else's (see POST/DELETE /staff/me/photo on the API side).
export async function uploadMyPhoto(
  uri: string,
  mimeType: string = "image/jpeg",
): Promise<{ ok: true; photoUrl: string } | { ok: false; error: string }> {
  try {
    const formData = new FormData();
    const filename = uri.split("/").pop() ?? "photo.jpg";
    (formData as any).append("photo", { uri, name: filename, type: mimeType } as any);
    const { data } = await apiClient.post<{ photoUrl: string }>("/staff/me/photo", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return { ok: true, photoUrl: data.photoUrl };
  } catch (err: any) {
    return { ok: false, error: err?.response?.data?.error ?? "Upload failed" };
  }
}

export async function deleteMyPhoto(): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await apiClient.delete("/staff/me/photo");
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err?.response?.data?.error ?? "Could not remove photo" };
  }
}
