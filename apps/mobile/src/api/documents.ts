import { apiClient } from "./client";

export interface DocumentType {
  id:        string;
  key:       string;
  label:     string;
  sortOrder: number;
  isActive:  boolean;
}

export interface StudentDocument {
  id:             string;
  documentTypeId: string;
  key:            string;
  label:          string;
  fileUrl:        string;
  uploadedAt:     string;
}

export async function listDocumentTypes(): Promise<DocumentType[]> {
  const { data } = await apiClient.get<DocumentType[]>("/document-types");
  return data;
}

export async function listStudentDocuments(studentId: string): Promise<StudentDocument[]> {
  const { data } = await apiClient.get<StudentDocument[]>(`/students/${studentId}/documents`);
  return data;
}

export async function uploadStudentDocument(
  studentId: string,
  documentTypeId: string,
  uri: string,
  mimeType: string = "image/jpeg",
): Promise<{ ok: true; document: StudentDocument } | { ok: false; error: string }> {
  try {
    const formData = new FormData();
    const filename = uri.split("/").pop() ?? "document.jpg";
    (formData as any).append("document", { uri, name: filename, type: mimeType } as any);
    const { data } = await apiClient.post<StudentDocument>(
      `/students/${studentId}/documents/${documentTypeId}`,
      formData,
      { headers: { "Content-Type": "multipart/form-data" } },
    );
    return { ok: true, document: data };
  } catch (err: any) {
    return { ok: false, error: err?.response?.data?.error ?? "Upload failed" };
  }
}

export async function deleteStudentDocument(
  studentId: string,
  documentTypeId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await apiClient.delete(`/students/${studentId}/documents/${documentTypeId}`);
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err?.response?.data?.error ?? "Could not remove document" };
  }
}
