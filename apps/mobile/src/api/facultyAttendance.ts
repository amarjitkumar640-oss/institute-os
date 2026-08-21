import { apiClient } from "./client";
import type { AttendanceStatus } from "./classSchedule";

export interface FacultyAttendanceRow {
  facultyId:    string;
  fullName:     string;
  employeeCode: string;
  status:       AttendanceStatus | null;
}

export interface FacultyAttendanceResponse {
  date:   string; // "YYYY-MM-DD"
  roster: FacultyAttendanceRow[];
}

export async function getFacultyAttendance(date?: string): Promise<FacultyAttendanceResponse> {
  const { data } = await apiClient.get<FacultyAttendanceResponse>(
    "/faculty/attendance",
    { params: date ? { date } : undefined },
  );
  return data;
}

export async function setFacultyAttendance(
  date: string,
  marks: { facultyId: string; status: AttendanceStatus }[],
): Promise<FacultyAttendanceResponse> {
  const { data } = await apiClient.put<FacultyAttendanceResponse>(
    "/faculty/attendance",
    { date, marks },
  );
  return data;
}
