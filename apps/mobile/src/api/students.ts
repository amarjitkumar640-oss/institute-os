import { apiClient } from "./client";

export type Gender          = "male" | "female";
export type Qualification   = "class10" | "class12" | "graduation" | "post_graduation";
export type CoursePreference = "ssc" | "banking" | "railway" | "foundation" | "others";
export type DurationPref    = "3months" | "6months" | "1year";
export type BatchTiming     = "morning" | "midday" | "evening";
export type PaymentMode     = "cash" | "online";

export interface StudentItem {
  id:                 string;
  studentCode:        string;
  fullName:           string;
  phone:              string;
  email:              string | null;
  dob:                string | null;
  address:            string | null;
  guardianPhone:      string | null;
  aadhaar:            string | null;
  gender:             Gender | null;
  fatherName:         string | null;
  motherName:         string | null;
  guardianOccupation: string | null;
  guardianEmail:      string | null;
  qualification:      Qualification | null;
  passYear:           string | null;
  board:              string | null;
  whatsapp:           string | null;
  courseId:           string | null;
  course?:            { name: string } | null;
  coursePreference:   CoursePreference | null;
  durationPreference: DurationPref | null;
  preferredTiming:    BatchTiming | null;
  paymentMode:        PaymentMode | null;
  amountPaid:         string | null;
  photoUrl?:          string | null;
  createdAt:          string;
  centerId?:          string | null;
  center?:            { id: string; name: string } | null;
  activeEnrollment?:  { id: string; batchId: string; batchName: string } | null;
}

export interface AdmitStudentPayload {
  fullName:           string;
  phone:              string;
  email?:             string | null;
  dob:                string;
  address:            string;
  aadhaar:            string;
  gender:             Gender;
  fatherName?:        string | null;
  motherName?:        string | null;
  guardianOccupation?: string | null;
  guardianEmail?:     string | null;
  guardianPhone?:     string | null;
  qualification?:     Qualification | null;
  passYear?:          string | null;
  board?:             string | null;
  whatsapp?:          string | null;
  courseId?:          string | null;
  coursePreference?:  CoursePreference | null;
  durationPreference?: DurationPref | null;
  batchId?:           string | null;
  preferredTiming?:   BatchTiming | null;
  paymentMode?:       PaymentMode | null;
  amountPaid?:        number | null;
  // Ad-hoc discount for THIS student only, set at admission time — takes
  // priority over both the batch's "first N" offer and the course's
  // standing discount when provided. Leave undefined for automatic.
  discountAmount?:    number | null;
  discountReason?:    string | null;
  tcAcknowledged?:    boolean;
  centerId?:          string; // only needed when the session has no center pinned
  applicationId?:     string; // set when carried through from a self-service AdmissionApplication
}

export interface AdmitStudentResult {
  student:    StudentItem;
  enrollment: { id: string; batchId: string } | null;
}

export type AdmitStudentResponse =
  | { ok: true; result: AdmitStudentResult }
  | { ok: false; batchFull: true; message: string }
  | { ok: false; error: string };

// dob/address/aadhaar/gender are required (non-nullable) on AdmitStudentPayload
// so a new admission can't skip them, but editing an existing student must
// still be able to explicitly clear a previously-set value — re-widen just
// these 4 back to nullable for the update path.
export type UpdateStudentPayload = Partial<Omit<AdmitStudentPayload, "batchId" | "dob" | "address" | "aadhaar" | "gender">> & {
  dob?:     string | null;
  address?: string | null;
  aadhaar?: string | null;
  gender?:  Gender | null;
};

export async function listStudents(params?: { batchId?: string; centerId?: string }): Promise<StudentItem[]> {
  const { data } = await apiClient.get<StudentItem[]>("/students", { params });
  return data;
}

export async function updateStudent(id: string, payload: UpdateStudentPayload): Promise<{ ok: true; student: StudentItem } | { ok: false; error: string }> {
  try {
    const { data } = await apiClient.patch<StudentItem>(`/students/${id}`, payload);
    return { ok: true, student: data };
  } catch (err: any) {
    return { ok: false, error: err?.response?.data?.error ?? "Update failed" };
  }
}

export async function uploadStudentPhoto(
  id: string,
  uri: string,
  mimeType: string = "image/jpeg",
): Promise<{ ok: true; student: StudentItem } | { ok: false; error: string }> {
  try {
    const formData = new FormData();
    const filename = uri.split("/").pop() ?? "photo.jpg";
    (formData as any).append("photo", { uri, name: filename, type: mimeType } as any);
    const { data } = await apiClient.post<StudentItem>(`/students/${id}/photo`, formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return { ok: true, student: data };
  } catch (err: any) {
    return { ok: false, error: err?.response?.data?.error ?? "Upload failed" };
  }
}

export async function deleteStudentPhoto(
  id: string,
): Promise<{ ok: true; student: StudentItem } | { ok: false; error: string }> {
  try {
    const { data } = await apiClient.delete<StudentItem>(`/students/${id}/photo`);
    return { ok: true, student: data };
  } catch (err: any) {
    return { ok: false, error: err?.response?.data?.error ?? "Could not remove photo" };
  }
}

export async function admitStudent(payload: AdmitStudentPayload): Promise<AdmitStudentResponse> {
  try {
    const { data } = await apiClient.post<AdmitStudentResult>("/students/admit", payload);
    return { ok: true, result: data };
  } catch (err: any) {
    const d = err?.response?.data;
    if (err?.response?.status === 409 && d?.batchFull) {
      return { ok: false, batchFull: true, message: d.message };
    }
    return { ok: false, error: d?.error ?? "Unknown error" };
  }
}
