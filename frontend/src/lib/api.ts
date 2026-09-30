const getBackendUrl = (): string => {
  return process.env.NEXT_PUBLIC_API_URL || "";
};

export const BACKEND_URL = getBackendUrl();
export const API_BASE = BACKEND_URL ? `${BACKEND_URL}/api` : "/api";


export interface User {
  id: number;
  username: string;
  full_name: string;
  email: string;
  role: "admin" | "teacher" | "student";
  classroom_id?: number;
  classroom_name?: string;
  classroom?: Classroom;
  group?: Group;
}

export interface Semester {
  id: number;
  year: number;
  term: number;
  is_active: boolean;
}

export interface Classroom {
  id: number;
  name: string;
  semester_id: number;
  semester?: Semester;
  teachers?: User[];
}

export interface Workload {
  id: number;
  semester_id: number;
  title: string;
  description: string;
  deadline: string;
  max_score: number;
  sample_file_path?: string;
  sample_link_url?: string;
  type?: "individual" | "group";
  is_open?: boolean;
  allow_late?: boolean;
}

export interface Submission {
  id: number;
  workload_id: number;
  workload?: Workload;
  group_id?: number | null;
  group?: Group;
  student_id?: number;
  student?: User;
  submitted_by_id: number;
  submitted_by?: User;
  file_path: string;
  link_url: string;
  submitted_at: string;
  is_late: boolean;
  grade?: {
    id: number;
    submission_id: number;
    graded_by_id: number;
    score: number;
    comment: string;
    graded_at: string;
  };
}

export interface Group {
  id: number;
  name: string;
  project_topic: string;
  leader_student_id: number;
  leader_student?: User;
  classroom_id: number;
  classroom?: Classroom;
  semester_id: number;
  members?: User[];
  submissions?: Submission[];
  created_at: string;
}

export interface GroupActivityLog {
  id: number;
  group_id: number;
  action_by_id: number;
  action_by?: User;
  action_type: string;
  description: string;
  created_at: string;
}

export interface FinalProjectCriteria {
  id: number;
  semester_id: number;
  title: string;
  max_score: number;
  weight: number;
}

export interface FinalProjectGrade {
  id: number;
  final_project_submission_id: number;
  criteria_id: number;
  criteria?: FinalProjectCriteria;
  teacher_id: number;
  teacher?: User;
  score: number;
  comment: string;
  graded_at: string;
}

export interface FinalProjectSubmission {
  id: number;
  group_id: number;
  group?: Group;
  video_path: string;
  video_link: string;
  submitted_by_id: number;
  submitted_by?: User;
  submitted_at: string;
  grades?: FinalProjectGrade[];
}

export function getToken(): string | null {
  if (typeof window !== "undefined") {
    return localStorage.getItem("gpms_token");
  }
  return null;
}

export function setToken(token: string) {
  if (typeof window !== "undefined") {
    localStorage.setItem("gpms_token", token);
  }
}

export function clearAuth() {
  if (typeof window !== "undefined") {
    localStorage.removeItem("gpms_token");
    localStorage.removeItem("gpms_user");
  }
}

export async function apiRequest<T = any>(
  endpoint: string,
  method: "GET" | "POST" | "PUT" | "DELETE" = "GET",
  body?: any
): Promise<T> {
  const token = getToken();
  const headers: HeadersInit = {};

  if (!(body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
  }

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    method,
    headers,
    body: body instanceof FormData ? body : (body ? JSON.stringify(body) : undefined),
  });

  if (!response.ok) {
    let errMsg = "An error occurred";
    try {
      const errData = await response.json();
      errMsg = errData.error || errMsg;
    } catch {
      errMsg = response.statusText || errMsg;
    }
    throw new Error(errMsg);
  }

  return response.json();
}

export async function fetchSystemSettings(): Promise<Record<string, string>> {
  const response = await fetch(`${API_BASE}/settings`);
  if (!response.ok) return {};
  return response.json();
}

export async function apiDownloadFile(endpoint: string, defaultFilename: string): Promise<void> {
  const token = getToken();
  const headers: HeadersInit = {};
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    method: "GET",
    headers,
  });

  if (!response.ok) {
    let errMsg = "ไม่สามารถดาวน์โหลดไฟล์ได้";
    try {
      const errData = await response.json();
      errMsg = errData.error || errMsg;
    } catch {
      errMsg = response.statusText || errMsg;
    }
    throw new Error(errMsg);
  }

  let filename = defaultFilename;
  const disposition = response.headers.get("Content-Disposition");
  if (disposition && disposition.includes("filename=")) {
    const filenameMatch = disposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
    if (filenameMatch && filenameMatch[1]) {
      filename = filenameMatch[1].replace(/['"]/g, "");
    }
  }

  const blob = await response.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}

