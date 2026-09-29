"use client";

import React, { useState, useEffect } from "react";
import { useSystem } from "../context/SystemContext";
import { apiRequest, BACKEND_URL, Semester, Classroom, Workload } from "../lib/api";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "./ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "./ui/dialog";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "./ui/select";
import { toast } from "sonner";
import ExportScoreDialog from "./ExportScoreDialog";
import {
  Calendar, Users, Briefcase, CheckCircle2, Clock, XCircle, FileText,
  ExternalLink, File, Search, ChevronRight, Eye, ShieldAlert, Award,
  Sparkles, Filter, CheckSquare, Layers, AlertCircle, ChevronDown, ChevronUp,
  FileSpreadsheet
} from "lucide-react";

export interface OverviewSubmissionGrade {
  score: number;
  comment: string;
  graded_by_name: string;
  graded_at: string;
}

export interface OverviewSubmissionDetail {
  submission_id?: number;
  submitted: boolean;
  submitted_at?: string;
  is_late?: boolean;
  file_path?: string;
  link_url?: string;
  submitted_by_name?: string;
  grade?: OverviewSubmissionGrade;
}

export interface OverviewGroupItem {
  group_id: number;
  group_name: string;
  project_topic: string;
  classroom_id: number;
  classroom_name: string;
  leader_name: string;
  members: string[];
  submitted_count: number;
  total_workloads: number;
  submissions: Record<number, OverviewSubmissionDetail>;
}

export default function WorkloadOverview() {
  const { user } = useSystem();

  // Filters state
  const [selectedSemester, setSelectedSemester] = useState<string>("");
  const [selectedClassroom, setSelectedClassroom] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "completed" | "pending">("all");
  const [openExportDialog, setOpenExportDialog] = useState(false);

  // Data states
  const [semesters, setSemesters] = useState<Semester[]>([]);
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [workloads, setWorkloads] = useState<Workload[]>([]);
  const [groups, setGroups] = useState<OverviewGroupItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Group Detail Modal state
  const [selectedGroup, setSelectedGroup] = useState<OverviewGroupItem | null>(null);
  const [openGroupModal, setOpenGroupModal] = useState(false);

  // Workload Detail Modal & Expanded State
  const [expandedWorkloads, setExpandedWorkloads] = useState<Record<number, boolean>>({});
  const [selectedWorkloadDetail, setSelectedWorkloadDetail] = useState<Workload | null>(null);
  const [openWorkloadModal, setOpenWorkloadModal] = useState(false);

  const toggleExpandWorkload = (id: number) => {
    setExpandedWorkloads((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  // Grading Modal state (for teachers/admins directly grading inside group modal)
  const [selectedSubForGrade, setSelectedSubForGrade] = useState<{
    group_id: number;
    group_name: string;
    workload: Workload;
    submission: OverviewSubmissionDetail;
  } | null>(null);
  const [gradeScore, setGradeScore] = useState("");
  const [gradeComment, setGradeComment] = useState("");
  const [openGradeModal, setOpenGradeModal] = useState(false);
  const [submittingGrade, setSubmittingGrade] = useState(false);

  // Load Semesters on mount
  useEffect(() => {
    const fetchSemesters = async () => {
      try {
        const semRes = await apiRequest<Semester[]>("/admin/semesters");
        setSemesters(semRes || []);
        const active = semRes.find((s) => s.is_active);
        if (active) {
          setSelectedSemester(active.id.toString());
        } else if (semRes.length > 0) {
          setSelectedSemester(semRes[0].id.toString());
        }
      } catch (err) {
        console.error("Failed to fetch semesters:", err);
      }
    };
    fetchSemesters();
  }, []);

  // Load Overview & Classrooms when semester or classroom filter changes
  const fetchOverviewData = async () => {
    setLoading(true);
    try {
      const semQuery = selectedSemester ? `?semester_id=${selectedSemester}` : "";
      
      // Fetch classrooms for filter dropdown
      let clsRes: Classroom[] = [];
      if (user?.role === "teacher") {
        clsRes = await apiRequest<Classroom[]>(`/teacher/classrooms${semQuery}`);
      } else if (user?.role === "student") {
        clsRes = await apiRequest<Classroom[]>(`/student/classrooms${semQuery}`);
      } else {
        clsRes = await apiRequest<Classroom[]>(`/admin/classrooms${semQuery}`);
      }
      setClassrooms(clsRes || []);

      // Fetch overview matrix data
      const clsFilterQuery = selectedClassroom && selectedClassroom !== "all" ? `&classroom_id=${selectedClassroom}` : "";
      const overviewRes = await apiRequest<{
        workloads: Workload[];
        groups: OverviewGroupItem[];
      }>(`/dashboard/workload-overview${semQuery}${clsFilterQuery}`);

      setWorkloads(overviewRes.workloads || []);
      setGroups(overviewRes.groups || []);
    } catch (err: any) {
      toast.error("ดึงข้อมูลภาพรวมไม่สำเร็จ: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedSemester) {
      fetchOverviewData();
    }
  }, [selectedSemester, selectedClassroom]);

  // Handle direct grading submit from teacher/admin inside modal
  const handleGradeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSubForGrade || !selectedSubForGrade.submission.submission_id) return;

    const scoreNum = parseFloat(gradeScore);
    if (scoreNum < 0 || scoreNum > selectedSubForGrade.workload.max_score) {
      toast.error(`คะแนนต้องอยู่ระหว่าง 0 ถึง ${selectedSubForGrade.workload.max_score} คะแนน`);
      return;
    }

    try {
      setSubmittingGrade(true);
      await apiRequest("/teacher/grade/workload", "POST", {
        submission_id: selectedSubForGrade.submission.submission_id,
        score: scoreNum,
        comment: gradeComment,
      });

      toast.success("บันทึกการให้คะแนนเรียบร้อยแล้ว");
      setOpenGradeModal(false);
      setSelectedSubForGrade(null);
      
      // Re-fetch overview data & update selected group modal view
      await fetchOverviewData();
      
      // Update currently open group modal data
      if (selectedGroup) {
        const updatedGroupsRes = await apiRequest<{ groups: OverviewGroupItem[] }>(
          `/dashboard/workload-overview?semester_id=${selectedSemester}${selectedClassroom !== "all" ? `&classroom_id=${selectedClassroom}` : ""}`
        );
        const updatedTargetGroup = updatedGroupsRes.groups?.find((g) => g.group_id === selectedGroup.group_id);
        if (updatedTargetGroup) {
          setSelectedGroup(updatedTargetGroup);
        }
      }
    } catch (err: any) {
      toast.error(err.message || "เกิดข้อผิดพลาดในการบันทึกคะแนน");
    } finally {
      setSubmittingGrade(false);
    }
  };

  // Filter groups
  const filteredGroups = groups.filter((g) => {
    const matchesSearch =
      g.group_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      g.project_topic.toLowerCase().includes(searchQuery.toLowerCase()) ||
      g.classroom_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      g.members.some((m) => m.toLowerCase().includes(searchQuery.toLowerCase()));

    const isCompleted = g.submitted_count === workloads.length && workloads.length > 0;
    const matchesStatus =
      statusFilter === "all" ||
      (statusFilter === "completed" && isCompleted) ||
      (statusFilter === "pending" && !isCompleted);

    return matchesSearch && matchesStatus;
  });

  // Calculate statistics
  const totalWorkloads = workloads.length;
  const totalGroups = groups.length;
  const totalPossibleSubmissions = totalWorkloads * totalGroups;
  const totalActualSubmissions = groups.reduce((acc, g) => acc + g.submitted_count, 0);
  const overallSubmissionRate =
    totalPossibleSubmissions > 0 ? (totalActualSubmissions / totalPossibleSubmissions) * 100 : 0;

  return (
    <div className="space-y-6">
      {/* Header & Controls Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl relative overflow-hidden">
        <div className="absolute -right-10 -bottom-10 w-60 h-60 bg-tu-pink/10 rounded-full blur-3xl pointer-events-none" />
        
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 relative z-10">
          <div>
            <div className="flex items-center gap-2.5 mb-1.5">
              <div className="p-2 rounded-xl bg-tu-pink/10 border border-tu-pink/20 text-tu-pink">
                <CheckSquare className="h-6 w-6" />
              </div>
              <h1 className="text-xl font-bold text-white tracking-tight">
                ภาพรวมภาระงานและการส่งงาน
              </h1>
            </div>
            <p className="text-slate-400 text-xs max-w-2xl leading-relaxed">
              ติดตามสถานะการส่งงานของทุกกลุ่มเรียน ดูภาระงานในภาคเรียน ตรวจสอบรายการส่งงานย่อย 
              และคลิกที่ชื่อกลุ่มเพื่อเรียกดูงานทั้งหมดของกลุ่มนั้นๆ
            </p>
          </div>

          {/* Filters */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Semester selector */}
            <div className="flex items-center gap-1.5 bg-slate-950/70 border border-slate-800 rounded-xl px-3 py-1.5">
              <Calendar className="h-4 w-4 text-tu-pink shrink-0" />
              <span className="text-xs text-slate-400 font-medium">ภาคเรียน:</span>
              <Select value={selectedSemester} onValueChange={(val) => setSelectedSemester(val || "")}>
                <SelectTrigger className="w-[150px] h-7 border-none text-xs font-semibold bg-transparent text-slate-200 focus:ring-0">
                  <SelectValue placeholder="เลือกภาคเรียน" />
                </SelectTrigger>
                <SelectContent className="bg-slate-900 border-slate-800 text-slate-200">
                  {semesters.map((s) => (
                    <SelectItem key={s.id} value={s.id.toString()} className="text-xs focus:bg-slate-800 focus:text-white">
                      เทอม {s.term}/{s.year} {s.is_active ? "(ปัจจุบัน)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Classroom selector */}
            <div className="flex items-center gap-1.5 bg-slate-950/70 border border-slate-800 rounded-xl px-3 py-1.5">
              <Users className="h-4 w-4 text-emerald-400 shrink-0" />
              <span className="text-xs text-slate-400 font-medium">ห้องเรียน:</span>
              <Select value={selectedClassroom} onValueChange={(val) => setSelectedClassroom(val || "all")}>
                <SelectTrigger className="w-[140px] h-7 border-none text-xs font-semibold bg-transparent text-slate-200 focus:ring-0">
                  <SelectValue placeholder="ทุกห้องเรียน" />
                </SelectTrigger>
                <SelectContent className="bg-slate-900 border-slate-800 text-slate-200">
                  <SelectItem value="all" className="text-xs focus:bg-slate-800 focus:text-white">ทุกห้องเรียน</SelectItem>
                  {classrooms.map((c) => (
                    <SelectItem key={c.id} value={c.id.toString()} className="text-xs focus:bg-slate-800 focus:text-white">
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Quick Export Button for Teachers & Admins */}
            {(user?.role === "teacher" || user?.role === "admin") && (
              <Button
                type="button"
                onClick={() => setOpenExportDialog(true)}
                className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs h-9 px-3 gap-1.5 font-semibold rounded-xl transition-all shadow-xs cursor-pointer ml-auto"
              >
                <FileSpreadsheet className="h-4 w-4" />
                <span>ส่งออกคะแนน Excel</span>
              </Button>
            )}
          </div>
        </div>

        {/* Overview Stats Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6 pt-6 border-t border-slate-800/80">
          <div className="bg-slate-950/50 border border-slate-800/80 rounded-xl p-3.5 flex flex-col justify-between">
            <span className="text-[11px] text-slate-400 font-medium">จำนวนภาระงานทั้งหมด</span>
            <div className="flex items-baseline justify-between mt-2">
              <span className="text-2xl font-extrabold text-white">{totalWorkloads}</span>
              <span className="text-[10px] text-slate-400 font-mono">งาน</span>
            </div>
          </div>

          <div className="bg-slate-950/50 border border-slate-800/80 rounded-xl p-3.5 flex flex-col justify-between">
            <span className="text-[11px] text-slate-400 font-medium">จำนวนกลุ่มทั้งหมด</span>
            <div className="flex items-baseline justify-between mt-2">
              <span className="text-2xl font-extrabold text-emerald-400">{totalGroups}</span>
              <span className="text-[10px] text-slate-400 font-mono">กลุ่ม</span>
            </div>
          </div>

          <div className="bg-slate-950/50 border border-slate-800/80 rounded-xl p-3.5 flex flex-col justify-between">
            <span className="text-[11px] text-slate-400 font-medium">ส่งงานเรียบร้อยแล้ว</span>
            <div className="flex items-baseline justify-between mt-2">
              <span className="text-2xl font-extrabold text-tu-pink">{totalActualSubmissions}</span>
              <span className="text-[10px] text-slate-400 font-mono">จาก {totalPossibleSubmissions} ครั้ง</span>
            </div>
          </div>

          <div className="bg-slate-950/50 border border-slate-800/80 rounded-xl p-3.5 flex flex-col justify-between">
            <span className="text-[11px] text-slate-400 font-medium">อัตราการส่งงานภาพรวม</span>
            <div className="flex items-baseline justify-between mt-2">
              <span className="text-2xl font-extrabold text-amber-400">{overallSubmissionRate.toFixed(1)}%</span>
              <div className="w-12 bg-slate-800 h-1.5 rounded-full overflow-hidden self-center">
                <div 
                  className="bg-amber-400 h-full rounded-full transition-all duration-500" 
                  style={{ width: `${Math.min(100, overallSubmissionRate)}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Workloads Info List Banner */}
      <Card className="bg-slate-900 border-slate-800 text-slate-100 shadow-lg rounded-2xl">
        <CardHeader className="pb-3 border-b border-slate-800">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Briefcase className="h-5 w-5 text-tu-pink" />
              <CardTitle className="text-base font-bold text-white">
                รายการภาระงานประจำภาคเรียน ({workloads.length} งาน)
              </CardTitle>
            </div>
            <span className="text-xs text-slate-400">
              รายละเอียดและคำชี้แจงจากอาจารย์
            </span>
          </div>
        </CardHeader>
        <CardContent className="pt-4">
          {workloads.length === 0 ? (
            <div className="text-center py-8 text-slate-500 text-xs italic">
              ยังไม่มีการสร้างภาระงานในภาคเรียนนี้
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {workloads.map((wl, idx) => {
                const subCount = groups.reduce((acc, g) => {
                  return acc + (g.submissions[wl.id]?.submitted ? 1 : 0);
                }, 0);
                const subRate = totalGroups > 0 ? (subCount / totalGroups) * 100 : 0;
                const isExpanded = !!expandedWorkloads[wl.id];

                return (
                  <div
                    key={wl.id}
                    className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-4 flex flex-col justify-between hover:border-slate-700 transition-all"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2 mb-1.5">
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-tu-pink/10 text-tu-pink border border-tu-pink/20 uppercase tracking-wide">
                          ภาระงานที่ {idx + 1}
                        </span>
                        <span className="text-xs font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                          {wl.max_score} คะแนนเต็ม
                        </span>
                      </div>
                      
                      <h3 className="font-bold text-slate-100 text-sm line-clamp-1" title={wl.title}>
                        {wl.title}
                      </h3>
                      
                      {wl.description ? (
                        <div className="mt-1 space-y-1">
                          <p className={`text-xs text-slate-400 leading-relaxed whitespace-pre-line ${!isExpanded ? "line-clamp-2" : ""}`}>
                            {wl.description}
                          </p>
                          <div className="flex items-center justify-between pt-1 gap-2">
                            {wl.description.length > 50 ? (
                              <button
                                type="button"
                                onClick={() => toggleExpandWorkload(wl.id)}
                                className="text-[11px] font-semibold text-tu-pink hover:underline flex items-center gap-1 cursor-pointer"
                              >
                                {isExpanded ? (
                                  <>
                                    <ChevronUp className="h-3 w-3" /> ย่อรายละเอียด
                                  </>
                                ) : (
                                  <>
                                    <ChevronDown className="h-3 w-3" /> ย่อคำชี้แจง (ขยาย)
                                  </>
                                )}
                              </button>
                            ) : (
                              <div />
                            )}
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedWorkloadDetail(wl);
                                setOpenWorkloadModal(true);
                              }}
                              className="text-[11px] font-semibold text-slate-300 hover:text-white bg-slate-900 hover:bg-slate-800 px-2 py-1 rounded-md border border-slate-800 transition-colors flex items-center gap-1 ml-auto cursor-pointer"
                            >
                              <Eye className="h-3 w-3 text-tu-pink" /> แสดงฉบับเต็ม
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="mt-2 flex justify-end">
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedWorkloadDetail(wl);
                              setOpenWorkloadModal(true);
                            }}
                            className="text-[11px] font-semibold text-slate-300 hover:text-white bg-slate-900 hover:bg-slate-800 px-2 py-1 rounded-md border border-slate-800 transition-colors flex items-center gap-1 cursor-pointer"
                          >
                            <Eye className="h-3 w-3 text-tu-pink" /> แสดงฉบับเต็ม
                          </button>
                        </div>
                      )}
                    </div>

                    <div className="mt-4 pt-3 border-t border-slate-800/60 space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-400 flex items-center gap-1 text-[11px]">
                          <Clock className="h-3 w-3 text-amber-400 shrink-0" />
                          กำหนดส่ง:
                        </span>
                        <span className="text-slate-300 text-[11px] font-medium">
                          {new Date(wl.deadline).toLocaleString("th-TH", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit"
                          })}
                        </span>
                      </div>

                      {/* Sample links */}
                      {(wl.sample_file_path || wl.sample_link_url) && (
                        <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                          {wl.sample_file_path && (
                            <a
                              href={`${BACKEND_URL}${wl.sample_file_path}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-[10px] bg-slate-800 hover:bg-slate-700 text-slate-200 px-2 py-0.5 rounded border border-slate-700 transition-colors"
                            >
                              <File className="h-2.5 w-2.5 text-rose-400" /> ไฟล์ตัวอย่าง
                            </a>
                          )}
                          {wl.sample_link_url && (
                            <a
                              href={wl.sample_link_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-[10px] bg-tu-pink/10 hover:bg-tu-pink/20 text-tu-pink px-2 py-0.5 rounded border border-tu-pink/20 transition-colors"
                            >
                              <ExternalLink className="h-2.5 w-2.5" /> ลิงก์ตัวอย่าง
                            </a>
                          )}
                        </div>
                      )}

                      {/* Submission progress */}
                      <div className="space-y-1 pt-1">
                        <div className="flex justify-between items-center text-[10px]">
                          <span className="text-slate-400">กลุ่มที่ส่งแล้ว:</span>
                          <span className="text-slate-200 font-bold">{subCount} / {totalGroups} กลุ่ม ({subRate.toFixed(0)}%)</span>
                        </div>
                        <div className="w-full bg-slate-900 h-1.5 rounded-full overflow-hidden border border-slate-800">
                          <div
                            className="bg-tu-pink h-full rounded-full transition-all duration-300"
                            style={{ width: `${subRate}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Main Group Submissions Matrix Table */}
      <Card className="bg-slate-900 border-slate-800 text-slate-100 shadow-xl rounded-2xl overflow-hidden">
        <CardHeader className="border-b border-slate-800 bg-slate-900/80 p-5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <CardTitle className="text-lg font-bold text-white flex items-center gap-2">
                <span>ตารางสถานะการส่งงานรายกลุ่ม</span>
                <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                  {filteredGroups.length} กลุ่ม
                </span>
              </CardTitle>
              <CardDescription className="text-slate-400 text-xs mt-1">
                คลิกที่แถวของกลุ่มใดก็ได้เพื่อเปิดหน้าต่างดูภาระงานทั้งหมดของกลุ่มนั้นๆ
              </CardDescription>
            </div>

            {/* Controls & Search */}
            <div className="flex items-center gap-3 flex-wrap">
              <div className="relative min-w-[220px]">
                <Search className="h-3.5 w-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <Input
                  placeholder="ค้นหากลุ่ม, งาน, สมาชิก..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="bg-slate-950 border-slate-800 text-slate-100 text-xs pl-8 pr-3 py-1 h-9 rounded-xl focus:border-tu-pink"
                />
              </div>

              {/* Status filter buttons */}
              <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800">
                <button
                  type="button"
                  onClick={() => setStatusFilter("all")}
                  className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                    statusFilter === "all" ? "bg-tu-pink text-white" : "text-slate-400 hover:text-white"
                  }`}
                >
                  ทั้งหมด
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter("completed")}
                  className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                    statusFilter === "completed" ? "bg-emerald-600 text-white" : "text-slate-400 hover:text-white"
                  }`}
                >
                  ส่งครบ
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter("pending")}
                  className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                    statusFilter === "pending" ? "bg-amber-600 text-white" : "text-slate-400 hover:text-white"
                  }`}
                >
                  ยังไม่ครบ
                </button>
              </div>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-tu-pink" />
              <p className="mt-3 text-slate-400 text-xs">กำลังโหลดตารางข้อมูลภาระงาน...</p>
            </div>
          ) : filteredGroups.length === 0 ? (
            <div className="text-center py-16 text-slate-500 text-sm">
              ไม่พบข้อมูลกลุ่มที่ตรงกับเงื่อนไขการค้นหา
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-slate-950/80 border-b border-slate-800">
                  <TableRow className="border-slate-800 hover:bg-transparent">
                    <TableHead className="text-slate-400 text-xs font-bold w-[220px]">กลุ่ม / ห้องเรียน</TableHead>
                    <TableHead className="text-slate-400 text-xs font-bold min-w-[200px]">หัวข้องาน</TableHead>
                    
                    {/* Workload column headers */}
                    {workloads.map((wl, idx) => (
                      <TableHead key={wl.id} className="text-center text-slate-300 text-xs font-bold min-w-[130px] px-2">
                        <div className="flex flex-col items-center">
                          <span className="truncate max-w-[120px]" title={wl.title}>
                            {idx + 1}. {wl.title}
                          </span>
                          <span className="text-[10px] text-slate-400 font-normal">
                            ({wl.max_score} คะแนน)
                          </span>
                        </div>
                      </TableHead>
                    ))}

                    <TableHead className="text-center text-slate-400 text-xs font-bold w-[120px]">ความคืบหน้า</TableHead>
                    <TableHead className="text-right text-slate-400 text-xs font-bold w-[100px] pr-4">จัดการ</TableHead>
                  </TableRow>
                </TableHeader>

                <TableBody className="divide-y divide-slate-800/60">
                  {filteredGroups.map((g) => {
                    const isAllSubmitted = g.submitted_count === workloads.length && workloads.length > 0;

                    return (
                      <TableRow
                        key={g.group_id}
                        onClick={() => {
                          setSelectedGroup(g);
                          setOpenGroupModal(true);
                        }}
                        className="border-slate-800/60 hover:bg-slate-800/40 cursor-pointer transition-colors group"
                      >
                        {/* Group Info */}
                        <TableCell className="py-3.5">
                          <div className="flex flex-col">
                            <span className="font-bold text-slate-100 text-sm group-hover:text-tu-pink transition-colors">
                              {g.group_name}
                            </span>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                                {g.classroom_name}
                              </span>
                              {g.leader_name && (
                                <span className="text-[10px] text-slate-400 truncate max-w-[100px]">
                                  หัวหน้า: {g.leader_name}
                                </span>
                              )}
                            </div>
                          </div>
                        </TableCell>

                        {/* Project Topic */}
                        <TableCell className="py-3.5">
                          <span className="text-xs text-slate-300 font-medium line-clamp-2 leading-relaxed">
                            {g.project_topic || "-"}
                          </span>
                        </TableCell>

                        {/* Workload Status Cells */}
                        {workloads.map((wl) => {
                          const sub = g.submissions[wl.id];
                          const isSubmitted = sub?.submitted;
                          const isLate = sub?.is_late;
                          const hasGrade = sub?.grade;

                          return (
                            <TableCell key={wl.id} className="text-center py-3.5 px-2">
                              {isSubmitted ? (
                                <div className="inline-flex flex-col items-center justify-center p-1.5 rounded-xl bg-slate-950/60 border border-slate-800/80 min-w-[90px] shadow-sm">
                                  {hasGrade ? (
                                    <span className="text-xs font-extrabold text-emerald-400 flex items-center gap-1">
                                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                                      {sub.grade?.score} / {wl.max_score}
                                    </span>
                                  ) : (
                                    <span className={`text-[11px] font-bold flex items-center gap-1 ${isLate ? "text-amber-400" : "text-emerald-400"}`}>
                                      <CheckCircle2 className="h-3.5 w-3.5" />
                                      {isLate ? "ส่งช้า" : "ส่งแล้ว"}
                                    </span>
                                  )}
                                  <span className="text-[9px] text-slate-400 mt-0.5">
                                    {hasGrade ? "ตรวจแล้ว" : "รอตรวจ"}
                                  </span>
                                </div>
                              ) : (
                                <div className="inline-flex flex-col items-center justify-center p-1.5 rounded-xl bg-rose-500/5 border border-rose-500/10 min-w-[90px]">
                                  <span className="text-[11px] font-semibold text-rose-400 flex items-center gap-1">
                                    <XCircle className="h-3.5 w-3.5" />
                                    ยังไม่ส่ง
                                  </span>
                                </div>
                              )}
                            </TableCell>
                          );
                        })}

                        {/* Progress Bar */}
                        <TableCell className="text-center py-3.5">
                          <div className="flex flex-col items-center gap-1">
                            <span className={`text-xs font-bold ${isAllSubmitted ? "text-emerald-400" : "text-slate-300"}`}>
                              {g.submitted_count} / {workloads.length}
                            </span>
                            <div className="w-16 bg-slate-950 h-1.5 rounded-full overflow-hidden border border-slate-800">
                              <div
                                className={`h-full rounded-full transition-all ${
                                  isAllSubmitted ? "bg-emerald-500" : "bg-tu-pink"
                                }`}
                                style={{
                                  width: `${workloads.length > 0 ? (g.submitted_count / workloads.length) * 100 : 0}%`,
                                }}
                              />
                            </div>
                          </div>
                        </TableCell>

                        {/* Action */}
                        <TableCell className="text-right py-3.5 pr-4">
                          <Button
                            type="button"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedGroup(g);
                              setOpenGroupModal(true);
                            }}
                            className="bg-slate-800 hover:bg-tu-pink text-slate-200 hover:text-white border border-slate-700 hover:border-tu-pink rounded-xl text-xs py-1 h-8 transition-all cursor-pointer inline-flex items-center gap-1"
                          >
                            <Eye className="h-3.5 w-3.5" />
                            <span>ดูงาน</span>
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ================= GROUP WORKLOAD DETAILS MODAL ================= */}
      <Dialog open={openGroupModal} onOpenChange={setOpenGroupModal}>
        <DialogContent className="bg-slate-950 border border-slate-800 text-slate-100 max-w-3xl max-h-[90vh] overflow-y-auto rounded-2xl p-6 shadow-2xl z-[100]">
          {selectedGroup && (
            <div className="space-y-6">
              {/* Header Info */}
              <div className="border-b border-slate-800 pb-4">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <div>
                    <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-tu-pink/10 text-tu-pink border border-tu-pink/20 uppercase tracking-wide">
                      {selectedGroup.classroom_name}
                    </span>
                    <h2 className="text-xl font-extrabold text-white mt-1.5">
                      {selectedGroup.group_name}
                    </h2>
                  </div>
                  <div className="text-left sm:text-right">
                    <span className="text-xs text-slate-400">ส่งภาระงานแล้ว:</span>
                    <p className="text-lg font-bold text-emerald-400">
                      {selectedGroup.submitted_count} / {workloads.length} ภาระงาน
                    </p>
                  </div>
                </div>

                {/* Project topic & members */}
                <div className="mt-3 bg-slate-900/80 p-3.5 rounded-xl border border-slate-800 space-y-2 text-xs">
                  <div className="flex items-start gap-2">
                    <span className="text-slate-400 font-medium shrink-0">หัวข้องาน:</span>
                    <span className="text-slate-100 font-semibold">{selectedGroup.project_topic || "ยังไม่ได้ระบุ"}</span>
                  </div>
                  <div className="flex items-start gap-2 pt-1 border-t border-slate-800/60">
                    <span className="text-slate-400 font-medium shrink-0">สมาชิกในกลุ่ม:</span>
                    <div className="flex flex-wrap gap-1.5">
                      {selectedGroup.members.map((m, idx) => (
                        <span key={idx} className="bg-slate-800 text-slate-200 px-2 py-0.5 rounded text-[11px] border border-slate-700">
                          {m} {selectedGroup.leader_name === m ? "👑 (หัวหน้า)" : ""}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Workloads Detailed Breakdown */}
              <div className="space-y-4">
                <h3 className="font-bold text-sm text-slate-200 flex items-center gap-2">
                  <Briefcase className="h-4 w-4 text-tu-pink" />
                  <span>รายการภาระงานทั้งหมดของกลุ่มนี้ ({workloads.length} งาน)</span>
                </h3>

                {workloads.map((wl, idx) => {
                  const sub = selectedGroup.submissions[wl.id];
                  const isSubmitted = sub?.submitted;
                  const isLate = sub?.is_late;
                  const hasGrade = sub?.grade;

                  return (
                    <div
                      key={wl.id}
                      className={`p-4 rounded-xl border transition-all ${
                        isSubmitted
                          ? "bg-slate-900/90 border-slate-800"
                          : "bg-rose-950/10 border-rose-900/30"
                      }`}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-slate-800/60">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                              ภาระงานที่ {idx + 1}
                            </span>
                            <span className="font-bold text-sm text-white">{wl.title}</span>
                          </div>
                          <p className="text-xs text-slate-400 mt-1">
                            กำหนดส่ง: {new Date(wl.deadline).toLocaleString("th-TH")} | คะแนนเต็ม {wl.max_score} คะแนน
                          </p>
                          {wl.description && (
                            <p className="text-xs text-slate-300 mt-2 bg-slate-900/80 p-2.5 rounded-lg border border-slate-800/80 whitespace-pre-line leading-relaxed">
                              {wl.description}
                            </p>
                          )}
                        </div>

                        {/* Status Badge */}
                        <div className="shrink-0">
                          {isSubmitted ? (
                            <span className={`inline-flex items-center gap-1 text-xs font-bold px-3 py-1 rounded-full border ${
                              isLate
                                ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
                                : "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                            }`}>
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              {isLate ? "ส่งช้ากว่ากำหนด" : "ส่งงานแล้ว"}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-xs font-semibold px-3 py-1 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/20">
                              <XCircle className="h-3.5 w-3.5" />
                              ยังไม่ได้ส่ง
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Submission Content or Missing Prompt */}
                      <div className="pt-3 text-xs space-y-3">
                        {isSubmitted ? (
                          <div className="bg-slate-950/70 p-3 rounded-lg border border-slate-800/80 space-y-2">
                            <div className="flex flex-wrap items-center justify-between gap-2 text-slate-400">
                              <span>
                                ส่งเมื่อ: <strong className="text-slate-200">{new Date(sub.submitted_at!).toLocaleString("th-TH")}</strong>
                              </span>
                              {sub.submitted_by_name && (
                                <span>
                                  ผู้ส่งงาน: <strong className="text-slate-200">{sub.submitted_by_name}</strong>
                                </span>
                              )}
                            </div>

                            {/* Attached File/Link */}
                            <div className="flex items-center gap-2 pt-1">
                              <span className="text-slate-400 font-medium">สิ่งที่แนบส่ง:</span>
                              {sub.link_url ? (
                                <a
                                  href={sub.link_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 text-xs text-tu-pink hover:underline font-semibold"
                                >
                                  <ExternalLink className="h-3.5 w-3.5" /> เปิดลิงก์ผลงานที่ส่ง
                                </a>
                              ) : sub.file_path ? (
                                <a
                                  href={`${BACKEND_URL}${sub.file_path}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 text-xs text-tu-pink hover:underline font-semibold"
                                >
                                  <File className="h-3.5 w-3.5 text-rose-400" /> ดาวน์โหลดไฟล์ผลงาน
                                </a>
                              ) : (
                                <span className="text-slate-500 italic">ไม่มีข้อมูลแนบ</span>
                              )}
                            </div>

                            {/* Grade & Comments Card */}
                            <div className="pt-2 border-t border-slate-800/60 mt-2">
                              {hasGrade ? (
                                <div className="bg-emerald-950/20 border border-emerald-900/40 p-3 rounded-lg flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                                  <div>
                                    <div className="flex items-center gap-2">
                                      <Award className="h-4 w-4 text-emerald-400" />
                                      <span className="font-bold text-emerald-400 text-sm">
                                        ได้คะแนน {sub.grade?.score} / {wl.max_score} คะแนน
                                      </span>
                                    </div>
                                    {sub.grade?.comment && (
                                      <p className="text-xs text-slate-300 mt-1 italic">
                                        &quot;{sub.grade.comment}&quot;
                                      </p>
                                    )}
                                    {sub.grade?.graded_by_name && (
                                      <span className="text-[10px] text-slate-400 block mt-1">
                                        ตรวจโดย: {sub.grade.graded_by_name} ({new Date(sub.grade.graded_at).toLocaleDateString("th-TH")})
                                      </span>
                                    )}
                                  </div>

                                  {(user?.role === "teacher" || user?.role === "admin") && (
                                    <Button
                                      type="button"
                                      size="sm"
                                      onClick={() => {
                                        setSelectedSubForGrade({
                                          group_id: selectedGroup.group_id,
                                          group_name: selectedGroup.group_name,
                                          workload: wl,
                                          submission: sub,
                                        });
                                        setGradeScore(sub.grade?.score.toString() || "");
                                        setGradeComment(sub.grade?.comment || "");
                                        setOpenGradeModal(true);
                                      }}
                                      className="bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs py-1 h-8 rounded-lg cursor-pointer shrink-0"
                                    >
                                      แก้ไขคะแนน
                                    </Button>
                                  )}
                                </div>
                              ) : (
                                <div className="flex items-center justify-between gap-2 text-slate-400 bg-amber-500/5 border border-amber-500/10 p-2.5 rounded-lg">
                                  <span className="text-amber-400 flex items-center gap-1.5">
                                    <Clock className="h-3.5 w-3.5" />
                                    งานนี้รอการตรวจและให้คะแนนจากอาจารย์
                                  </span>

                                  {(user?.role === "teacher" || user?.role === "admin") && (
                                    <Button
                                      type="button"
                                      size="sm"
                                      onClick={() => {
                                        setSelectedSubForGrade({
                                          group_id: selectedGroup.group_id,
                                          group_name: selectedGroup.group_name,
                                          workload: wl,
                                          submission: sub,
                                        });
                                        setGradeScore("");
                                        setGradeComment("");
                                        setOpenGradeModal(true);
                                      }}
                                      className="bg-tu-pink hover:bg-tu-pink-hover text-white text-xs py-1 h-8 rounded-lg cursor-pointer shrink-0 shadow-md"
                                    >
                                      ให้คะแนนงานนี้
                                    </Button>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        ) : (
                          <p className="text-slate-400 italic">
                            กลุ่มนี้ยังไม่ได้ดำเนินการส่งภาระงานชิ้นนี้ในระบบ
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Close Action */}
              <div className="flex justify-end pt-4 border-t border-slate-800">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setOpenGroupModal(false)}
                  className="bg-slate-900 text-slate-300 border-slate-800 hover:bg-slate-800 cursor-pointer"
                >
                  ปิดหน้าต่าง
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ================= DIRECT GRADING DIALOG ================= */}
      <Dialog open={openGradeModal} onOpenChange={setOpenGradeModal}>
        <DialogContent className="bg-slate-950 border border-slate-800 text-slate-100 max-w-md rounded-2xl p-6 shadow-2xl z-[101]">
          {selectedSubForGrade && (
            <div>
              <DialogHeader className="pb-3 border-b border-slate-800">
                <DialogTitle className="text-lg font-bold text-white flex items-center gap-2">
                  <CheckSquare className="h-5 w-5 text-tu-pink" />
                  <span>ให้คะแนนภาระงานย่อย</span>
                </DialogTitle>
              </DialogHeader>

              <form onSubmit={handleGradeSubmit} className="space-y-4 pt-4">
                <div className="bg-slate-900 p-3 rounded-xl border border-slate-800 space-y-1 text-xs">
                  <div className="flex justify-between">
                    <span className="text-slate-400">กลุ่ม:</span>
                    <span className="font-bold text-white">{selectedSubForGrade.group_name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">ภาระงาน:</span>
                    <span className="font-bold text-slate-200">{selectedSubForGrade.workload.title}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">คะแนนเต็ม:</span>
                    <span className="font-extrabold text-emerald-400">{selectedSubForGrade.workload.max_score} คะแนน</span>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-300">
                    คะแนนที่ได้ (0 - {selectedSubForGrade.workload.max_score}):
                  </label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    max={selectedSubForGrade.workload.max_score}
                    required
                    value={gradeScore}
                    onChange={(e) => setGradeScore(e.target.value)}
                    placeholder={`เช่น 8.5`}
                    className="bg-slate-900 border-slate-800 text-white focus:border-tu-pink"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-300">
                    ความเห็น / ข้อเสนอแนะเพิ่มเติม:
                  </label>
                  <textarea
                    rows={3}
                    value={gradeComment}
                    onChange={(e) => setGradeComment(e.target.value)}
                    placeholder="เช่น ทำได้ถูกต้องครบถ้วน เนื้อหาดี"
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:border-tu-pink transition-colors"
                  />
                </div>

                <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-800">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setOpenGradeModal(false)}
                    disabled={submittingGrade}
                    className="bg-slate-900 text-slate-400 border-slate-800 hover:bg-slate-800 cursor-pointer"
                  >
                    ยกเลิก
                  </Button>
                  <Button
                    type="submit"
                    disabled={submittingGrade}
                    className="bg-tu-pink hover:bg-tu-pink-hover text-white font-bold cursor-pointer"
                  >
                    {submittingGrade ? "กำลังบันทึก..." : "บันทึกการให้คะแนน"}
                  </Button>
                </div>
              </form>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Workload Full Details Modal */}
      <Dialog open={openWorkloadModal} onOpenChange={setOpenWorkloadModal}>
        <DialogContent className="bg-slate-950 border border-slate-800 text-slate-100 max-w-2xl rounded-2xl p-6 shadow-2xl z-[101] max-h-[90vh] overflow-y-auto">
          {selectedWorkloadDetail && (
            <div className="space-y-5">
              <DialogHeader className="pb-3 border-b border-slate-800">
                <div className="flex items-center justify-between gap-3">
                  <DialogTitle className="text-lg font-bold text-white flex items-center gap-2">
                    <Briefcase className="h-5 w-5 text-tu-pink shrink-0" />
                    <span>{selectedWorkloadDetail.title}</span>
                  </DialogTitle>
                  <span className="text-xs font-bold text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded border border-emerald-500/20 shrink-0">
                    {selectedWorkloadDetail.max_score} คะแนนเต็ม
                  </span>
                </div>
              </DialogHeader>

              <div className="space-y-4 text-xs">
                <div className="flex flex-wrap items-center gap-4 bg-slate-900/80 p-3 rounded-xl border border-slate-800">
                  <div className="flex items-center gap-1.5 text-slate-300">
                    <Clock className="h-4 w-4 text-amber-400 shrink-0" />
                    <span className="text-slate-400">กำหนดส่ง:</span>
                    <strong className="text-white">
                      {new Date(selectedWorkloadDetail.deadline).toLocaleString("th-TH", {
                        day: "numeric",
                        month: "long",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit"
                      })}
                    </strong>
                  </div>
                </div>

                {/* Full Description / Instructions */}
                <div>
                  <h4 className="font-bold text-slate-200 mb-1.5 text-xs flex items-center gap-1.5">
                    <FileText className="h-4 w-4 text-tu-pink" />
                    รายละเอียดและคำชี้แจงฉบับเต็ม
                  </h4>
                  <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 text-slate-300 leading-relaxed whitespace-pre-line text-xs max-h-80 overflow-y-auto">
                    {selectedWorkloadDetail.description || "ไม่มีรายละเอียดเพิ่มเติมสำหรับภาระงานนี้"}
                  </div>
                </div>

                {/* Sample files & links */}
                {(selectedWorkloadDetail.sample_file_path || selectedWorkloadDetail.sample_link_url) && (
                  <div>
                    <h4 className="font-bold text-slate-200 mb-1.5 text-xs">สื่อและเอกสารประกอบตัวอย่าง</h4>
                    <div className="flex flex-wrap gap-2">
                      {selectedWorkloadDetail.sample_file_path && (
                        <a
                          href={`${BACKEND_URL}${selectedWorkloadDetail.sample_file_path}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 text-xs bg-slate-900 hover:bg-slate-800 text-slate-200 px-3 py-1.5 rounded-lg border border-slate-800 transition-colors"
                        >
                          <File className="h-4 w-4 text-rose-400" /> ดาวน์โหลดไฟล์ตัวอย่าง
                        </a>
                      )}
                      {selectedWorkloadDetail.sample_link_url && (
                        <a
                          href={selectedWorkloadDetail.sample_link_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 text-xs bg-tu-pink/10 hover:bg-tu-pink/20 text-tu-pink px-3 py-1.5 rounded-lg border border-tu-pink/20 transition-colors"
                        >
                          <ExternalLink className="h-4 w-4" /> เปิดลิงก์ตัวอย่าง
                        </a>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div className="flex justify-end pt-4 border-t border-slate-800">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setOpenWorkloadModal(false)}
                  className="bg-slate-900 text-slate-300 border-slate-800 hover:bg-slate-800 cursor-pointer"
                >
                  ปิดหน้าต่าง
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Export Score Dialog */}
      <ExportScoreDialog
        open={openExportDialog}
        onOpenChange={setOpenExportDialog}
        semesters={semesters}
        classrooms={classrooms}
        defaultSemesterId={selectedSemester}
        defaultClassroomId={selectedClassroom}
      />
    </div>
  );
}
