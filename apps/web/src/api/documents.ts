import { apiClient } from "./client";

export interface DocumentType {
  id: string;
  key: string;
  label: string;
  sortOrder: number;
  isActive: boolean;
}

export interface StudentDocument {
  id: string;
  documentTypeId: string;
  key: string;
  label: string;
  fileUrl: string;
  uploadedAt: string;
}

export async function listDocumentTypes(): Promise<DocumentType[]> {
  const { data } = await apiClient.get<DocumentType[]>("/api/document-types");
  return data;
}

export async function listStudentDocuments(studentId: string): Promise<StudentDocument[]> {
  const { data } = await apiClient.get<StudentDocument[]>(`/api/students/${studentId}/documents`);
  return data;
}

export async function uploadStudentDocument(
  studentId: string,
  documentTypeId: string,
  file: File,
): Promise<StudentDocument> {
  const formData = new FormData();
  formData.append("document", file);
  const { data } = await apiClient.post<StudentDocument>(
    `/api/students/${studentId}/documents/${documentTypeId}`,
    formData,
    { headers: { "Content-Type": "multipart/form-data" } },
  );
  return data;
}

export async function deleteStudentDocument(studentId: string, documentTypeId: string): Promise<void> {
  await apiClient.delete(`/api/students/${studentId}/documents/${documentTypeId}`);
}
