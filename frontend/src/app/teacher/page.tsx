"use client";

import React, { useState, useEffect } from "react";
import { useSystem } from "../../context/SystemContext";
import Sidebar from "../../components/Sidebar";
import { apiRequest, BACKEND_URL, Classroom, Group, Submission, Workload, FinalProjectSubmission, FinalProjectCriteria, Semester } from "../../lib/api";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "../../components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "../../components/ui/dialog";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "../../components/ui/select";
import { toast } from "sonner";
import WorkloadOverview from "../../components/WorkloadOverview";
import ExportScoreDialog from "../../components/ExportScoreDialog";
import { 
  CheckSquare, Award, Clipboard, Users, ShieldAlert, 
  Download, Printer, AlertTriangle, ExternalLink, FileText, CheckCircle, File,
  Calendar, LayoutGrid, Folder, Link as LinkIcon, FileSpreadsheet
} from "lucide-react";

export default function TeacherPage() {
  const { user } = useSystem();
  const [activeTab, setActiveTab] = useState("overview");

  // Data States
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [finalProjects, setFinalProjects] = useState<FinalProjectSubmission[]>([]);
  const [criteria, setCriteria] = useState<FinalProjectCriteria[]>([]);

  // Report & Dashboard Filter State
  const [selectedSemester, setSelectedSemester] = useState<string>("");
  const [semesters, setSemesters] = useState<Semester[]>([]);
  const [selectedClassroom, setSelectedClassroom] = useState<string>("");
  const [reportData, setReportData] = useState<{ workloads: Workload[]; criteria?: FinalProjectCriteria[]; rows: any[] } | null>(null);
  const [openExportDialog, setOpenExportDialog] = useState(false);

  // Grading Dialog States
  const [selectedSub, setSelectedSub] = useState<Submission | null>(null);
  const [gradeScore, setGradeScore] = useState("");
  const [gradeComment, setGradeComment] = useState("");
  const [openGradeDialog, setOpenGradeDialog] = useState(false);

  // Final Project Grading Dialog States
  const [selectedFinal, setSelectedFinal] = useState<FinalProjectSubmission | null>(null);
  const [finalScores, setFinalScores] = useState<Record<number, { score: string; comment: string }>>({});
  const [openFinalGradingDialog, setOpenFinalGradingDialog] = useState(false);

  const [loading, setLoading] = useState(false);

  // Filter/Search States
  const [gradingSearch, setGradingSearch] = useState("");
  const [finalSearch, setFinalSearch] = useState("");
  const [clsSearch, setClsSearch] = useState("");
  const [grpSearch, setGrpSearch] = useState("");
  const [reportSearch, setReportSearch] = useState("");

  // Pagination States
  const [gradingPage, setGradingPage] = useState(1);
  const [gradingPageSize, setGradingPageSize] = useState(20);
  const [finalPage, setFinalPage] = useState(1);
  const [finalPageSize, setFinalPageSize] = useState(20);
  const [grpPage, setGrpPage] = useState(1);
  const [grpPageSize, setGrpPageSize] = useState(20);
  const [reportPage, setReportPage] = useState(1);
  const [reportPageSize, setReportPageSize] = useState(20);
  const [gradingTypeFilter, setGradingTypeFilter] = useState<"all" | "individual" | "group">("all");

  const filteredSubmissions = submissions.filter(sub => {
    const matchesSearch = 
      (sub.group?.name || "").toLowerCase().includes(gradingSearch.toLowerCase()) ||
      (sub.student?.full_name || "").toLowerCase().includes(gradingSearch.toLowerCase()) ||
      (sub.student?.username || "").toLowerCase().includes(gradingSearch.toLowerCase()) ||
      (sub.submitted_by?.full_name || "").toLowerCase().includes(gradingSearch.toLowerCase()) ||
      (sub.group?.classroom?.name || "").toLowerCase().includes(gradingSearch.toLowerCase()) ||
      (sub.workload?.title || "").toLowerCase().includes(gradingSearch.toLowerCase()) ||
      (sub.grade ? "ตรวจแล้ว" : "รอตรวจ").includes(gradingSearch);

    const matchesClassroom = !selectedClassroom || 
      sub.group?.classroom_id?.toString() === selectedClassroom || 
      sub.group?.classroom?.id?.toString() === selectedClassroom ||
      sub.student?.classroom_id?.toString() === selectedClassroom;

    const isIndiv = !sub.group_id || sub.workload?.type === "individual";
    const matchesType = gradingTypeFilter === "all" ||
      (gradingTypeFilter === "individual" && isIndiv) ||
      (gradingTypeFilter === "group" && !isIndiv);

    return matchesSearch && matchesClassroom && matchesType;
  });

  const filteredFinalProjects = finalProjects.filter(f => {
    const matchesSearch = 
      (f.group?.name || "").toLowerCase().includes(finalSearch.toLowerCase()) ||
      (f.group?.classroom?.name || "").toLowerCase().includes(finalSearch.toLowerCase()) ||
      (f.group?.project_topic || "").toLowerCase().includes(finalSearch.toLowerCase());
    const matchesClassroom = !selectedClassroom || 
      f.group?.classroom_id?.toString() === selectedClassroom || 
      f.group?.classroom?.id?.toString() === selectedClassroom;
    return matchesSearch && matchesClassroom;
  });

  const filteredClassrooms = classrooms.filter(c => 
    c.name.toLowerCase().includes(clsSearch.toLowerCase())
  );

  const filteredGroups = groups.filter(g => {
    const matchesSearch = 
      g.name.toLowerCase().includes(grpSearch.toLowerCase()) ||
      (g.project_topic || "").toLowerCase().includes(grpSearch.toLowerCase()) ||
      (g.classroom?.name || "").toLowerCase().includes(grpSearch.toLowerCase()) ||
      (g.members ? g.members.some(m => m.full_name.toLowerCase().includes(grpSearch.toLowerCase())) : false);
    const matchesClassroom = !selectedClassroom || 
      g.classroom_id?.toString() === selectedClassroom || 
      g.classroom?.id?.toString() === selectedClassroom;
    return matchesSearch && matchesClassroom;
  });

  const filteredReportRows = reportData ? reportData.rows.filter(row => 
    row.group_name.toLowerCase().includes(reportSearch.toLowerCase()) ||
    row.classroom_name.toLowerCase().includes(reportSearch.toLowerCase()) ||
    (row.project_topic || "").toLowerCase().includes(reportSearch.toLowerCase()) ||
    (row.members ? row.members.some((m: string) => m.toLowerCase().includes(reportSearch.toLowerCase())) : false)
  ) : [];

  const teacherTabs = [
    { id: "overview", label: "ภาพรวมการส่งงาน", icon: <LayoutGrid className="h-4 w-4" /> },
    { id: "grading", label: "ตรวจภาระงานย่อย", icon: <CheckSquare className="h-4 w-4" /> },
    { id: "final-grading", label: "ประเมิน Final Project (กรรมการ)", icon: <Award className="h-4 w-4" /> },
    { id: "my-groups", label: "ห้องเรียน & กลุ่มที่ดูแล", icon: <Users className="h-4 w-4" /> },
    { id: "reports", label: "รายงานคะแนน & สรุปผล", icon: <Clipboard className="h-4 w-4" /> },
  ];

  const fetchTeacherData = async () => {
    setLoading(true);
    try {
      const semQuery = selectedSemester ? `?semester_id=${selectedSemester}` : "";
      // Always fetch classrooms for current semester to populate classroom filter
      const clsRes = await apiRequest<Classroom[]>(`/teacher/classrooms${semQuery}`);
      setClassrooms(clsRes || []);

      if (activeTab === "grading") {
        const subRes = await apiRequest<Submission[]>(`/teacher/submissions${semQuery}`);
        setSubmissions(subRes || []);
      } else if (activeTab === "final-grading") {
        const finalRes = await apiRequest<FinalProjectSubmission[]>(`/teacher/final-projects${semQuery}`);
        setFinalProjects(finalRes || []);
        const critRes = await apiRequest<FinalProjectCriteria[]>(`/admin/criteria${semQuery}`);
        setCriteria(critRes || []);
      } else if (activeTab === "my-groups") {
        const grpRes = await apiRequest<Group[]>(`/teacher/groups${semQuery}`);
        setGroups(grpRes || []);
      } else if (activeTab === "reports") {
        fetchReport();
      }
    } catch (err: any) {
      toast.error("ดึงข้อมูลไม่สำเร็จ: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchReport = async () => {
    try {
      let query = "";
      const semQuery = selectedSemester ? `&semester_id=${selectedSemester}` : "";
      if (selectedClassroom) {
        query = `?classroom_id=${selectedClassroom}${semQuery}`;
      } else if (selectedSemester) {
        query = `?semester_id=${selectedSemester}`;
      }
      const repRes = await apiRequest(`/dashboard/report${query}`);
      setReportData(repRes);
    } catch (err: any) {
      console.error(err);
    }
  };

  const fetchSemesters = async () => {
    try {
      const res = await apiRequest<Semester[]>("/admin/semesters");
      setSemesters(res || []);
      const active = res.find(s => s.is_active);
      if (active) {
        setSelectedSemester(active.id.toString());
      } else if (res.length > 0) {
        setSelectedSemester(res[0].id.toString());
      }
    } catch (err) {
      console.error("Failed to load semesters:", err);
    }
  };

  useEffect(() => {
    if (user?.role === "teacher") {
      fetchSemesters();
    }
  }, [user]);

  useEffect(() => {
    if (user?.role === "teacher") {
      fetchTeacherData();
    }
    setGradingSearch("");
    setFinalSearch("");
    setClsSearch("");
    setGrpSearch("");
    setReportSearch("");
    setGradingPage(1);
    setFinalPage(1);
    setGrpPage(1);
    setReportPage(1);
  }, [activeTab, selectedClassroom, selectedSemester]);

  // Reset page numbers on search term changes
  useEffect(() => { setGradingPage(1); }, [gradingSearch]);
  useEffect(() => { setFinalPage(1); }, [finalSearch]);
  useEffect(() => { setGrpPage(1); }, [grpSearch]);
  useEffect(() => { setReportPage(1); }, [reportSearch]);

  // Submit workload grade
  const handleGradeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSub || !gradeScore) return;

    const scoreNum = parseFloat(gradeScore);
    if (scoreNum < 0 || scoreNum > selectedSub.workload!.max_score) {
      toast.error(`คะแนนต้องอยู่ระหว่าง 0 ถึง ${selectedSub.workload!.max_score} คะแนน`);
      return;
    }

    try {
      await apiRequest("/teacher/grade/workload", "POST", {
        submission_id: selectedSub.id,
        score: scoreNum,
        comment: gradeComment
      });
      toast.success("บันทึกการให้คะแนนภาระงานสำเร็จ!");
      setOpenGradeDialog(false);
      setSelectedSub(null);
      setGradeScore("");
      setGradeComment("");
      fetchTeacherData();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  // Submit Final Project committee grade
  const handleFinalGradeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFinal) return;

    // Build payload
    const gradeItems = Object.entries(finalScores).map(([criteriaID, value]) => ({
      criteria_id: parseInt(criteriaID),
      score: parseFloat(value.score || "0"),
      comment: value.comment
    }));

    // Verify all filled
    for (const item of gradeItems) {
      const crit = criteria.find(c => c.id === item.criteria_id);
      if (crit && (item.score < 0 || item.score > crit.max_score)) {
        toast.error(`คะแนนของหัวข้อ "${crit.title}" ต้องไม่เกิน ${crit.max_score}`);
        return;
      }
    }

    try {
      await apiRequest("/teacher/grade/final", "POST", {
        submission_id: selectedFinal.id,
        grades: gradeItems
      });
      toast.success("บันทึกคะแนนประเมิน Final Project สำเร็จ!");
      setOpenFinalGradingDialog(false);
      setSelectedFinal(null);
      setFinalScores({});
      fetchTeacherData();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  // Export to Excel (CSV format with BOM for Thai Excel compatibility)
  const handleExportExcel = () => {
    if (!reportData) return;

    let csvContent = "\uFEFF"; // UTF-8 BOM
    // Header
    const headers = [
      "ชื่อกลุ่ม", "ห้องเรียน", "หัวข้องาน", "สมาชิกกลุ่ม", 
      ...reportData.workloads.map(w => `คะแนน: ${w.title}`),
      "คะแนนสะสมย่อย", "คะแนนเฉลี่ย Final Project", "คะแนนรวมสุทธิ"
    ];
    csvContent += headers.map(h => `"${h}"`).join(",") + "\n";

    // Rows
    reportData.rows.forEach(r => {
      const membersText = r.members ? r.members.join("; ") : "";
      const row = [
        r.group_name,
        r.classroom_name,
        r.project_topic,
        membersText,
        ...r.workload_scores.map((s: number) => s.toString()),
        r.accumulated_score.toFixed(2),
        r.final_project_score.toFixed(2),
        r.total_score.toFixed(2)
      ];
      csvContent += row.map(cell => `"${cell.replace(/"/g, '""')}"`).join(",") + "\n";
    });

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `รายงานคะแนน_GPMS_${new Date().toLocaleDateString("th-TH")}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Export to PDF (Trigger print view of specific element)
  const handlePrintPDF = () => {
    window.print();
  };

  const renderPagination = (
    currentPage: number,
    setCurrentPage: (p: number) => void,
    pageSize: number,
    setPageSize: (s: number) => void,
    totalItems: number
  ) => {
    const totalPages = Math.ceil(totalItems / pageSize) || 1;
    const startItem = (currentPage - 1) * pageSize + 1;
    const endItem = Math.min(currentPage * pageSize, totalItems);

    return (
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mt-6 pt-4 border-t border-slate-100 text-sm text-slate-500 print:hidden">
        <div className="flex items-center gap-2">
          <span>แสดง</span>
          <Select 
            value={pageSize.toString()} 
            onValueChange={(val) => {
              if (val) {
                setPageSize(parseInt(val));
                setCurrentPage(1);
              }
            }}
          >
            <SelectTrigger className="w-16 h-8 bg-slate-50 border-slate-200">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-white border-slate-200 text-slate-800">
              <SelectItem value="20">20</SelectItem>
              <SelectItem value="50">50</SelectItem>
              <SelectItem value="100">100</SelectItem>
            </SelectContent>
          </Select>
          <span>รายการต่อหน้า (แสดง {totalItems > 0 ? `${startItem}-${endItem}` : "0"} จาก {totalItems} รายการ)</span>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
            disabled={currentPage === 1}
            className="h-8 border-slate-200"
          >
            ก่อนหน้า
          </Button>
          <div className="flex items-center gap-1">
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => {
              if (totalPages > 5 && Math.abs(p - currentPage) > 1 && p !== 1 && p !== totalPages) {
                if (p === 2 || p === totalPages - 1) {
                  return <span key={p} className="px-1" style={{ display: 'inline-flex', alignItems: 'center', height: '32px' }}>...</span>;
                }
                return null;
              }
              return (
                <Button
                  key={p}
                  variant={currentPage === p ? "default" : "outline"}
                  size="sm"
                  onClick={() => setCurrentPage(p)}
                  className={`h-8 w-8 p-0 ${currentPage === p ? "bg-primary text-white" : "border-slate-200"}`}
                >
                  {p}
                </Button>
              );
            })}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
            disabled={currentPage === totalPages}
            className="h-8 border-slate-200"
          >
            ถัดไป
          </Button>
        </div>
      </div>
    );
  };

  if (user?.role !== "teacher" && user?.role !== "admin") {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50 text-slate-800">
        <div className="text-center p-8 bg-white border border-slate-200 rounded-2xl shadow-sm text-slate-800 max-w-md">
          <ShieldAlert className="h-12 w-12 text-rose-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold">ไม่มีสิทธิ์เข้าใช้งาน</h2>
          <p className="text-slate-500 mt-2 text-sm">เฉพาะครูผู้สอนหรือผู้ดูแลระบบเท่านั้นที่สามารถตรวจงานและออกรายงานได้</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col md:flex-row text-slate-800 print:bg-white print:text-black print:p-0">
      <div className="print:hidden flex-shrink-0">
        <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} tabs={teacherTabs} />
      </div>

      <div className="flex-1 flex flex-col min-h-screen overflow-x-hidden pb-16 md:pb-8 print:px-0 print:mt-0 print:max-w-full">
        <main className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 mt-8 flex-1 print:px-0 print:mt-0 print:max-w-full">
        {activeTab === "overview" ? (
          <WorkloadOverview />
        ) : (
          <>
            {/* Semester & Classroom Filter Banner */}
            <div className="mb-6 bg-white/70 backdrop-blur border border-slate-100 shadow-sm rounded-lg px-4 py-3 flex flex-wrap items-center justify-between gap-4 print:hidden">
              <div className="flex items-center gap-6 flex-wrap">
                <div className="flex items-center gap-2">
                  <Calendar className="h-5 w-5 text-primary" />
                  <span className="text-sm font-semibold text-slate-600">
                    ภาคเรียน:
                  </span>
                  <Select value={selectedSemester} onValueChange={(val) => setSelectedSemester(val || "")}>
                    <SelectTrigger className="w-[180px] h-9 text-xs border-slate-200 text-slate-800 bg-white">
                      <SelectValue placeholder="เลือกภาคเรียน..." />
                    </SelectTrigger>
                    <SelectContent className="bg-white border-slate-150 text-slate-800">
                      {semesters.map((s) => (
                        <SelectItem key={s.id} value={s.id.toString()} className="text-xs">
                          ภาคเรียนที่ {s.term}/{s.year} {s.is_active ? "(ปัจจุบัน)" : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-primary" />
                  <span className="text-sm font-semibold text-slate-600">
                    ตัวกรองห้องเรียน:
                  </span>
                  <Select value={selectedClassroom} onValueChange={(val) => setSelectedClassroom(val || "")}>
                    <SelectTrigger className="w-[180px] h-9 text-xs border-slate-200 text-slate-800 bg-white">
                      <SelectValue placeholder="ทุกห้องเรียน...">
                        {selectedClassroom ? (classrooms.find(c => c.id.toString() === selectedClassroom)?.name || "ทุกห้องเรียน...") : "ทุกห้องเรียน..."}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent className="bg-white border-slate-200 text-slate-800">
                      <SelectItem value="">ทุกห้องเรียน...</SelectItem>
                      {classrooms.map((c) => (
                        <SelectItem key={c.id} value={c.id.toString()} className="text-xs">
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                {(() => {
                  const active = semesters.find(s => s.id.toString() === selectedSemester);
                  if (active?.is_active) {
                    return (
                      <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-tu-pink/20 text-tu-pink border border-tu-pink/30">
                        ภาคเรียนปัจจุบัน
                      </span>
                    );
                  }
                  return null;
                })()}
              </div>
            </div>

            {loading ? (
              <div className="flex flex-col items-center justify-center py-24 print:hidden">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary"></div>
                <p className="mt-4 text-slate-500 text-sm">กำลังโหลดข้อมูลหลักสำหรับครูผู้สอน...</p>
              </div>
            ) : (
              <>
                {/* GRADING TAB (Workloads) */}
                {activeTab === "grading" && (
              <Card className="bg-white border-slate-100 text-slate-800 shadow-sm rounded-2xl">
                <CardHeader>
                  <CardTitle className="text-lg font-bold">ภาระงานที่ส่งเข้ามา (รอตรวจคะแนน)</CardTitle>
                  <CardDescription className="text-slate-500 text-xs">คุณจะมองเห็นการนำส่งงานเดี่ยวและงานกลุ่มเฉพาะนักเรียนในห้องเรียนที่คุณรับผิดชอบเท่านั้น</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                    <div className="max-w-sm flex-1">
                      <Input
                        placeholder="ค้นหากลุ่ม, นักเรียน, หรือภาระงาน..."
                        value={gradingSearch}
                        onChange={(e) => setGradingSearch(e.target.value)}
                        className="bg-slate-50 border-slate-100 text-slate-800 text-xs py-1 h-9"
                      />
                    </div>
                    <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl text-xs self-start sm:self-auto">
                      <button
                        type="button"
                        onClick={() => setGradingTypeFilter("all")}
                        className={`px-3 py-1 rounded-lg font-semibold transition-all cursor-pointer ${
                          gradingTypeFilter === "all" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-900"
                        }`}
                      >
                        ทั้งหมด ({submissions.length})
                      </button>
                      <button
                        type="button"
                        onClick={() => setGradingTypeFilter("individual")}
                        className={`px-3 py-1 rounded-lg font-semibold transition-all cursor-pointer ${
                          gradingTypeFilter === "individual" ? "bg-white text-blue-700 shadow-sm" : "text-slate-500 hover:text-slate-900"
                        }`}
                      >
                        งานเดี่ยว ({submissions.filter(s => !s.group_id || s.workload?.type === "individual").length})
                      </button>
                      <button
                        type="button"
                        onClick={() => setGradingTypeFilter("group")}
                        className={`px-3 py-1 rounded-lg font-semibold transition-all cursor-pointer ${
                          gradingTypeFilter === "group" ? "bg-white text-emerald-700 shadow-sm" : "text-slate-500 hover:text-slate-900"
                        }`}
                      >
                        งานกลุ่ม ({submissions.filter(s => s.group_id && s.workload?.type !== "individual").length})
                      </button>
                    </div>
                  </div>
                  <Table>
                    <TableHeader className="border-slate-100">
                      <TableRow className="border-slate-100 hover:bg-slate-50/50">
                        <TableHead className="text-slate-500">ผู้ส่งงาน (กลุ่ม/นักเรียน)</TableHead>
                        <TableHead className="text-slate-500">ภาระงาน</TableHead>
                        <TableHead className="text-slate-500">เวลาที่ส่ง</TableHead>
                        <TableHead className="text-slate-500">ลิงก์แนบ</TableHead>
                        <TableHead className="text-slate-500">คะแนนปัจจุบัน</TableHead>
                        <TableHead className="text-slate-500 text-right">เครื่องมือ</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(() => {
                        const paginatedSubs = filteredSubmissions.slice((gradingPage - 1) * gradingPageSize, gradingPage * gradingPageSize);

                        if (filteredSubmissions.length === 0) {
                          return (
                            <TableRow>
                              <TableCell colSpan={6} className="text-center py-12 text-slate-500 italic">ไม่พบภาระงานที่ค้นหา</TableCell>
                            </TableRow>
                          );
                        }

                        return paginatedSubs.map((sub) => {
                          const isIndiv = !sub.group_id || sub.workload?.type === "individual";
                          return (
                          <TableRow key={sub.id} className="border-slate-100 hover:bg-slate-50/30">
                            <TableCell>
                              <div>
                                {sub.group ? (
                                  <>
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                      <span className="font-semibold text-slate-700">{sub.group.name}</span>
                                      <span className="px-1.5 py-0.5 text-[9px] font-bold bg-emerald-100 text-emerald-700 rounded-full border border-emerald-200">
                                        งานกลุ่ม
                                      </span>
                                    </div>
                                    <p className="text-[10px] text-primary mt-0.5 font-medium">
                                      ห้องเรียน {sub.group?.classroom?.name || classrooms.find(c => c.id === sub.group?.classroom_id)?.name || "-"}
                                    </p>
                                  </>
                                ) : (
                                  <>
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                      <span className="font-semibold text-slate-700">{sub.student?.full_name || sub.submitted_by?.full_name || `นักเรียนรหัส ${sub.student_id}`}</span>
                                      <span className="px-1.5 py-0.5 text-[9px] font-bold bg-blue-100 text-blue-700 rounded-full border border-blue-200">
                                        งานเดี่ยว
                                      </span>
                                    </div>
                                    <p className="text-[10px] text-slate-500 mt-0.5 font-medium">
                                      รหัส: {sub.student?.username || "-"}
                                    </p>
                                  </>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              <div>
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="text-slate-700 font-medium">{sub.workload?.title}</span>
                                  {isIndiv ? (
                                    <span className="px-1.5 py-0.2 text-[9px] font-bold bg-blue-100 text-blue-700 rounded">
                                      เดี่ยว
                                    </span>
                                  ) : (
                                    <span className="px-1.5 py-0.2 text-[9px] font-bold bg-emerald-100 text-emerald-700 rounded">
                                      กลุ่ม
                                    </span>
                                  )}
                                </div>
                                <p className="text-[10px] text-slate-500 mt-0.5">คะแนนเต็ม {sub.workload?.max_score} คะแนน</p>
                                {(sub.workload?.sample_file_path || sub.workload?.sample_link_url) && (
                                  <div className="flex gap-1 mt-1 flex-wrap">
                                    {sub.workload.sample_file_path && (
                                      <a 
                                        href={`${BACKEND_URL}${sub.workload.sample_file_path}`} 
                                        target="_blank" 
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-0.5 text-[9px] bg-slate-100 hover:bg-slate-200 text-slate-600 px-1 py-0.5 rounded transition-colors duration-200"
                                      >
                                        <File className="h-2.5 w-2.5 text-rose-500" /> ไฟล์ตัวอย่าง
                                      </a>
                                    )}
                                    {sub.workload.sample_link_url && (
                                      <a 
                                        href={sub.workload.sample_link_url} 
                                        target="_blank" 
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-0.5 text-[9px] bg-primary/10 hover:bg-primary/20 text-primary px-1 py-0.5 rounded transition-colors duration-200"
                                      >
                                        <ExternalLink className="h-2.5 w-2.5" /> ลิงก์ตัวอย่าง
                                      </a>
                                    )}
                                  </div>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="text-xs">
                              <span className="text-slate-500">{new Date(sub.submitted_at).toLocaleString("th-TH")}</span>
                              {sub.is_late && <span className="text-[9px] bg-rose-50 text-rose-700 border border-rose-200 px-2 py-0.5 rounded ml-1 font-semibold">ส่งช้า ⚠️</span>}
                            </TableCell>
                            <TableCell>
                              {sub.link_url ? (
                                <a 
                                  href={sub.link_url} 
                                  target="_blank" 
                                  rel="noopener noreferrer" 
                                  className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                                >
                                  <ExternalLink className="h-3 w-3" /> เปิดลิงก์งาน
                                </a>
                              ) : sub.file_path ? (
                                <a 
                                  href={`${BACKEND_URL}${sub.file_path}`} 
                                  target="_blank" 
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                                >
                                  <File className="h-3 w-3" /> ดาวน์โหลดไฟล์
                                </a>
                              ) : (
                                <span className="text-xs text-slate-500 italic">ไม่มีข้อมูลแนบ</span>
                              )}
                            </TableCell>
                            <TableCell>
                              {sub.grade ? (
                                <span className="text-emerald-400 font-semibold">{sub.grade.score} คะแนน</span>
                              ) : (
                                <span className="text-xs text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">รอตรวจ</span>
                              )}
                            </TableCell>
                            <TableCell className="text-right">
                              <Button
                                size="sm"
                                onClick={() => {
                                  setSelectedSub(sub);
                                  setGradeScore(sub.grade ? sub.grade.score.toString() : "");
                                  setGradeComment(sub.grade ? sub.grade.comment : "");
                                  setOpenGradeDialog(true);
                                }}
                                className="bg-primary hover:bg-primary/90 transition-colors duration-200 cursor-pointer text-xs"
                              >
                                {sub.grade ? "แก้ไขคะแนน" : "ให้คะแนน"}
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      });
                    })()}
                  </TableBody>
                  </Table>
                  {renderPagination(gradingPage, setGradingPage, gradingPageSize, setGradingPageSize, filteredSubmissions.length)}
                </CardContent>
              </Card>
            )}

            {/* FINAL GRADING TAB (Committee) */}
            {activeTab === "final-grading" && (
              <Card className="bg-white border-slate-100 text-slate-800 shadow-sm rounded-2xl">
                <CardHeader>
                  <CardTitle className="text-lg font-bold">ประเมิน Final Project (บทบาทกรรมการ)</CardTitle>
                  <CardDescription className="text-slate-500 text-xs">ครูทุกคนในระบบสามารถประเมินผลงาน Final Project ใดก็ได้ของระดับชั้น โดยระบบจะใช้ค่าเฉลี่ยเป็นเกณฑ์รวมประเมินสะสม</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="mb-4 max-w-sm">
                    <Input
                      placeholder="ค้นหากลุ่ม, ห้องเรียน, หรือชื่อชิ้นงาน..."
                      value={finalSearch}
                      onChange={(e) => setFinalSearch(e.target.value)}
                      className="bg-slate-50 border-slate-100 text-slate-800 text-xs py-1 h-9"
                    />
                  </div>
                  <Table>
                    <TableHeader className="border-slate-100">
                      <TableRow className="border-slate-100 hover:bg-slate-50/50">
                        <TableHead className="text-slate-500">กลุ่ม / ห้อง</TableHead>
                        <TableHead className="text-slate-500">หัวข้องานหลัก (Topic)</TableHead>
                        <TableHead className="text-slate-500">ผลงาน / ลิงก์แนบ</TableHead>
                        <TableHead className="text-slate-500">ประเมินแล้วจากกรรมการ (คน)</TableHead>
                        <TableHead className="text-slate-500 text-right">เครื่องมือประเมิน</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(() => {
                        const paginatedFinals = filteredFinalProjects.slice((finalPage - 1) * finalPageSize, finalPage * finalPageSize);

                        if (filteredFinalProjects.length === 0) {
                          return (
                            <TableRow>
                              <TableCell colSpan={5} className="text-center py-12 text-slate-500 italic">ไม่พบผลงาน Final Project ที่ค้นหา</TableCell>
                            </TableRow>
                          );
                        }

                        return paginatedFinals.map((f) => {
                          const teacherIds = f.grades ? Array.from(new Set(f.grades.map(g => g.teacher_id))) : [];
                          const hasMyGrade = f.grades ? f.grades.some(g => g.teacher_id === user!.id) : false;

                          return (
                            <TableRow key={f.id} className="border-slate-100 hover:bg-slate-50/30">
                              <TableCell>
                                <div>
                                  <span className="font-semibold text-slate-700">{f.group?.name}</span>
                                  <p className="text-[10px] text-primary mt-0.5 font-medium">
                                    ห้องเรียน {f.group?.classroom?.name || classrooms.find(c => c.id === f.group?.classroom_id)?.name || "-"}
                                  </p>
                                </div>
                              </TableCell>
                              <TableCell className="font-medium text-slate-600">{f.group?.project_topic}</TableCell>
                              <TableCell>
                                {f.video_link ? (
                                  <a 
                                    href={f.video_link} 
                                    target="_blank" 
                                    rel="noopener noreferrer" 
                                    className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline font-medium"
                                  >
                                    {f.video_link.includes("drive.google.com") || f.video_link.includes("docs.google.com") ? (
                                      <><Folder className="h-3.5 w-3.5 text-emerald-600 shrink-0" /> เปิด Google Drive</>
                                    ) : f.video_link.includes("youtube.com") || f.video_link.includes("youtu.be") ? (
                                      <><ExternalLink className="h-3.5 w-3.5 text-rose-600 shrink-0" /> ชมคลิป YouTube</>
                                    ) : (
                                      <><ExternalLink className="h-3.5 w-3.5 shrink-0" /> เปิดลิงก์ผลงาน</>
                                    )}
                                  </a>
                                ) : f.video_path ? (
                                  <a 
                                    href={`${BACKEND_URL}${f.video_path}`} 
                                    target="_blank" 
                                    rel="noopener noreferrer" 
                                    className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline font-medium"
                                  >
                                    <File className="h-3.5 w-3.5" /> ดาวน์โหลดไฟล์
                                  </a>
                                ) : (
                                  <span className="text-xs text-slate-500 italic">ไม่มีข้อมูลแนบ</span>
                                )}
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-semibold">{teacherIds.length} คน</span>
                                  {hasMyGrade && (
                                    <span className="text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded font-semibold">คุณประเมินแล้ว</span>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell className="text-right">
                                <Button
                                  size="sm"
                                  onClick={() => {
                                    setSelectedFinal(f);
                                    const existingScores: Record<number, { score: string; comment: string }> = {};
                                    if (f.grades) {
                                      f.grades.forEach(g => {
                                        if (g.teacher_id === user!.id) {
                                          existingScores[g.criteria_id] = {
                                            score: g.score.toString(),
                                            comment: g.comment
                                          };
                                        }
                                      });
                                    }
                                    setFinalScores(existingScores);
                                    setOpenFinalGradingDialog(true);
                                  }}
                                  className="bg-primary hover:bg-primary/90 transition-colors duration-200 cursor-pointer text-xs"
                                >
                                  {hasMyGrade ? "แก้ไขคะแนนกรรมการ" : "บันทึกคะแนนจบ"}
                                </Button>
                              </TableCell>
                            </TableRow>
                          );
                        });
                      })()}
                    </TableBody>
                  </Table>
                  {renderPagination(finalPage, setFinalPage, finalPageSize, setFinalPageSize, filteredFinalProjects.length)}
                </CardContent>
              </Card>
            )}

            {/* MY GROUPS TAB */}
            {activeTab === "my-groups" && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="md:col-span-1 space-y-4">
                  <Card className="bg-white border-slate-100 text-slate-800 shadow-sm rounded-2xl h-max">
                    <CardHeader>
                      <CardTitle className="text-sm font-bold uppercase tracking-wider text-slate-500">ห้องเรียนของฉันที่ดูแล</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      <div className="mb-2">
                        <Input
                          placeholder="ค้นหาห้องเรียน..."
                          value={clsSearch}
                          onChange={(e) => setClsSearch(e.target.value)}
                          className="bg-slate-50 border-slate-100 text-xs py-1 h-8 text-slate-800"
                        />
                      </div>
                      {filteredClassrooms.map(c => (
                        <div key={c.id} className="p-3 bg-slate-50 border border-slate-200 rounded flex justify-between items-center">
                          <span className="font-semibold">{c.name}</span>
                          <span className="text-xs text-primary">เทอม {c.semester?.term}/{c.semester?.year}</span>
                        </div>
                      ))}
                      {filteredClassrooms.length === 0 && (
                        <p className="text-xs text-slate-500 italic">ไม่พบห้องเรียนที่ค้นหา</p>
                      )}
                    </CardContent>
                  </Card>
                </div>

                <div className="md:col-span-2">
                  <Card className="bg-white border-slate-100 text-slate-800 shadow-sm rounded-2xl">
                    <CardHeader>
                      <CardTitle className="text-lg font-bold">กลุ่มนักเรียนที่รับผิดชอบ</CardTitle>
                      <CardDescription className="text-slate-500 text-xs">รายชื่อกลุ่มและหัวข้องานที่แอดมินมอบหมายสิทธิ์ดูแลประจำห้องเรียน</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="mb-4 max-w-sm">
                        <Input
                          placeholder="ค้นหากลุ่ม, งาน, หรือชื่อสมาชิก..."
                          value={grpSearch}
                          onChange={(e) => setGrpSearch(e.target.value)}
                          className="bg-slate-50 border-slate-100 text-slate-800 text-xs py-1 h-9"
                        />
                      </div>
                      <Table>
                        <TableHeader className="border-slate-100">
                          <TableRow className="border-slate-100 hover:bg-slate-50/50">
                            <TableHead className="text-slate-500">ชื่อกลุ่ม</TableHead>
                            <TableHead className="text-slate-500">หัวข้อโปรเจกต์</TableHead>
                            <TableHead className="text-slate-500">ห้องเรียน</TableHead>
                            <TableHead className="text-slate-500">สมาชิกกลุ่ม</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {(() => {
                            const paginatedGroups = filteredGroups.slice((grpPage - 1) * grpPageSize, grpPage * grpPageSize);

                            if (filteredGroups.length === 0) {
                              return (
                                <TableRow>
                                  <TableCell colSpan={4} className="text-center py-12 text-slate-500 italic">ไม่พบข้อมูลกลุ่มงานที่ค้นหา</TableCell>
                                </TableRow>
                              );
                            }

                            return paginatedGroups.map((g) => (
                              <TableRow key={g.id} className="border-slate-100 hover:bg-slate-50/30">
                                <TableCell className="font-semibold text-slate-700">{g.name}</TableCell>
                                <TableCell className="text-slate-700 font-medium">{g.project_topic}</TableCell>
                                <TableCell>{g.classroom?.name || classrooms.find(c => c.id === g.classroom_id)?.name || "-"}</TableCell>
                                <TableCell>
                                  <span className="text-xs text-slate-500">{(g.members ? g.members.map(m => m.full_name) : []).join(", ")}</span>
                                </TableCell>
                              </TableRow>
                            ));
                          })()}
                        </TableBody>
                      </Table>
                      {renderPagination(grpPage, setGrpPage, grpPageSize, setGrpPageSize, filteredGroups.length)}
                    </CardContent>
                  </Card>
                </div>
              </div>
            )}

            {/* REPORTS TAB */}
            {activeTab === "reports" && (
              <div className="space-y-6">
                {/* Filters */}
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex flex-wrap gap-4 items-center print:hidden justify-between">
                  <div className="flex flex-wrap gap-4 items-center w-full sm:w-auto">
                    <div className="w-56 space-y-1.5">
                      <label className="text-xs text-slate-500 font-semibold">ตัวกรองห้องเรียน</label>
                      <Select 
                        value={selectedClassroom} 
                        onValueChange={(val) => {
                          setSelectedClassroom(val || "");
                        }}
                      >
                        <SelectTrigger className="bg-slate-50 border-slate-100">
                          <SelectValue placeholder="ทุกห้องเรียน...">
                            {(val) => classrooms.find(c => c.id.toString() === val)?.name || "ทุกห้องเรียน..."}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent className="bg-white border-slate-200 text-slate-800">
                          <SelectItem value="">ทุกห้องเรียน...</SelectItem>
                          {classrooms.map(c => (
                            <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="w-56 space-y-1.5">
                      <label className="text-xs text-slate-500 font-semibold">ค้นหากลุ่ม / งาน / สมาชิก</label>
                      <Input
                        placeholder="พิมพ์เพื่อค้นหา..."
                        value={reportSearch}
                        onChange={(e) => setReportSearch(e.target.value)}
                        className="bg-slate-50 border-slate-100 text-slate-800 text-xs py-1 h-9"
                      />
                    </div>
                  </div>
 
                  <div className="flex gap-2">
                    <Button 
                      onClick={() => setOpenExportDialog(true)}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white transition-colors duration-200 cursor-pointer gap-1.5 text-xs font-semibold shadow-xs"
                      disabled={!reportData}
                    >
                      <FileSpreadsheet className="h-4 w-4" /> ส่งออกคะแนน (Excel / CSV)
                    </Button>
                    <Button 
                      onClick={handlePrintPDF}
                      variant="outline"
                      className="border-slate-200 hover:bg-slate-100 text-slate-700 transition-colors duration-200 cursor-pointer gap-1 text-xs"
                      disabled={!reportData}
                    >
                      <Printer className="h-4 w-4" /> สั่งพิมพ์รายงาน / PDF
                    </Button>
                  </div>
                </div>
 
                {/* Printable Report Data */}
                {reportData && (
                  <Card className="bg-white border-slate-100 text-slate-800 shadow-sm rounded-2xl print:border-none print:shadow-none print:bg-white print:text-black">
                    <CardHeader className="border-b border-slate-100 pb-4 print:border-b-black print:pb-2">
                      <div className="text-center space-y-1">
                        <CardTitle className="text-xl font-bold tracking-tight print:text-black print:text-lg">รายงานผลคะแนนและการประเมินโครงการ GPMS</CardTitle>
                        <CardDescription className="text-slate-500 text-xs print:text-black">
                          ห้องเรียน: {selectedClassroom ? classrooms.find(c => c.id.toString() === selectedClassroom)?.name : "ทุกห้องเรียน"} | 
                          พิมพ์เมื่อ: {new Date().toLocaleDateString("th-TH")}
                        </CardDescription>
                      </div>
                    </CardHeader>
                    <CardContent className="pt-6 overflow-x-auto">
                      <Table className="print:text-black print:border print:border-black">
                        <TableHeader className="border-slate-100 print:border-black">
                          <TableRow className="border-slate-100 hover:bg-slate-50/50 print:border-black">
                            <TableHead className="text-slate-500 print:text-black">ชื่อกลุ่ม / ห้อง</TableHead>
                            <TableHead className="text-slate-500 print:text-black">หัวข้องานหลัก</TableHead>
                            <TableHead className="text-slate-500 print:text-black">สมาชิกในกลุ่ม</TableHead>
                            {reportData.workloads.map(w => (
                              <TableHead key={w.id} className="text-slate-500 print:text-black text-center">{w.title} ({w.max_score})</TableHead>
                            ))}
                            <TableHead className="text-slate-500 print:text-black text-center font-bold">รวมคะแนนย่อย</TableHead>
                            {reportData.criteria?.map(c => (
                              <TableHead key={c.id} className="text-slate-500 print:text-black text-center">{c.title} ({c.max_score})</TableHead>
                            ))}
                            <TableHead className="text-slate-500 print:text-black text-center font-bold text-amber-600">รวม Final (ไม่ถ่วง)</TableHead>
                            <TableHead className="text-slate-500 print:text-black text-center font-bold text-primary">รวม Final (ถ่วงน้ำหนัก)</TableHead>
                            <TableHead className="text-slate-500 print:text-black text-right font-bold text-tu-pink">คะแนนรวมสุทธิ</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {(() => {
                            const paginatedReportRows = filteredReportRows.slice((reportPage - 1) * reportPageSize, reportPage * reportPageSize);

                            if (filteredReportRows.length === 0) {
                              return (
                                <TableRow>
                                  <TableCell colSpan={7 + (reportData?.workloads?.length || 0) + (reportData?.criteria?.length || 0)} className="text-center py-6 text-slate-500 italic">ไม่พบข้อมูลรายงานที่ค้นหา</TableCell>
                                </TableRow>
                              );
                            }

                            return paginatedReportRows.map((row) => (
                              <TableRow key={row.group_id} className="border-slate-100 hover:bg-slate-50/30 print:border-black">
                                <TableCell className="font-semibold">
                                  <div>
                                    <span>{row.group_name}</span>
                                    <p className="text-[10px] text-slate-500 font-normal mt-0.5 print:text-black">ห้อง {row.classroom_name}</p>
                                  </div>
                                </TableCell>
                                <TableCell className="max-w-[150px] truncate" title={row.project_topic}>{row.project_topic}</TableCell>
                                <TableCell className="text-xs text-slate-500 max-w-[200px] truncate print:text-black" title={row.members?.join(", ")}>
                                  {row.members?.join(", ")}
                                </TableCell>
                                {row.workload_scores.map((score: number, idx: number) => (
                                  <TableCell key={idx} className="text-center">{score}</TableCell>
                                ))}
                                <TableCell className="text-center font-semibold">{row.accumulated_score.toFixed(2)}</TableCell>
                                {row.final_criteria_scores?.map((score: number, idx: number) => (
                                  <TableCell key={idx} className="text-center text-slate-600">{score.toFixed(2)}</TableCell>
                                ))}
                                <TableCell className="text-center font-bold text-amber-600 print:text-black">{(row.final_unweighted_score ?? 0).toFixed(2)}</TableCell>
                                <TableCell className="text-center font-bold text-primary print:text-black">{row.final_project_score.toFixed(2)}</TableCell>
                                <TableCell className="text-right font-black text-tu-pink print:text-black">{row.total_score.toFixed(2)}</TableCell>
                              </TableRow>
                            ));
                          })()}
                        </TableBody>
                      </Table>
                      {renderPagination(reportPage, setReportPage, reportPageSize, setReportPageSize, filteredReportRows.length)}
                    </CardContent>
                  </Card>
                )}
              </div>
            )}
          </>
        )}
        </>
      )}
      </main>

      {/* DIALOGS */}

      {/* Grade Workload Dialog */}
      <Dialog open={openGradeDialog} onOpenChange={setOpenGradeDialog}>
        <DialogContent className="bg-white border-slate-200 text-slate-800 shadow-md rounded-2xl">
          <DialogHeader>
            <DialogTitle>ตรวจงาน: {selectedSub?.workload?.title}</DialogTitle>
            <DialogDescription className="text-xs text-slate-500 pt-1">
              ระบุคะแนนสะสมย่อยและข้อคิดเห็นแนะนำสำหรับ {selectedSub?.group ? `กลุ่ม ${selectedSub.group.name}` : `นักเรียน ${selectedSub?.student?.full_name || selectedSub?.submitted_by?.full_name || ""}`}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleGradeSubmit} className="space-y-4 pt-2">
            <div className="space-y-2">
              <label className="text-xs text-slate-500 uppercase font-semibold">คะแนนที่ได้ (สูงสุด {selectedSub?.workload?.max_score} คะแนน)</label>
              <Input 
                type="number"
                step="0.01"
                placeholder="ระบุคะแนนตัวชิ้นงาน..."
                value={gradeScore}
                onChange={(e) => setGradeScore(e.target.value)}
                className="bg-slate-50 border-slate-200"
                required
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs text-slate-500 uppercase font-semibold">ความเห็น/คอมเมนต์ข้อเสนอแนะ</label>
              <Input 
                placeholder="พิมพ์สิ่งที่ต้องปรับปรุง..."
                value={gradeComment}
                onChange={(e) => setGradeComment(e.target.value)}
                className="bg-slate-50 border-slate-200"
              />
            </div>
            <DialogFooter className="mt-4">
              <Button type="button" variant="outline" onClick={() => setOpenGradeDialog(false)} className="border-slate-100 text-slate-500">ยกเลิก</Button>
              <Button type="submit" className="bg-primary hover:bg-primary/90 transition-colors duration-200 cursor-pointer">บันทึกผลคะแนน</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Grade Final Project Dialog (Committee) */}
      <Dialog open={openFinalGradingDialog} onOpenChange={setOpenFinalGradingDialog}>
        <DialogContent className="bg-white border-slate-200 text-slate-800 shadow-md rounded-2xl max-w-lg">
          <DialogHeader>
            <DialogTitle>ประเมิน Final Project: {selectedFinal?.group?.name}</DialogTitle>
            <DialogDescription className="text-xs text-slate-500 pt-1">
              หัวข้องาน: <span className="text-primary font-semibold">{selectedFinal?.group?.project_topic}</span>
            </DialogDescription>
          </DialogHeader>

          {/* Submission Attachment Button */}
          {selectedFinal && (selectedFinal.video_link || selectedFinal.video_path) && (
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between gap-3 text-xs">
              <span className="text-slate-600 font-medium">ผลงานที่ส่งเข้ามา:</span>
              {selectedFinal.video_link ? (
                <a 
                  href={selectedFinal.video_link} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary text-white hover:bg-primary/90 rounded-lg text-xs font-semibold shadow-sm transition-colors"
                >
                  {selectedFinal.video_link.includes("drive.google.com") || selectedFinal.video_link.includes("docs.google.com") ? (
                    <><Folder className="h-3.5 w-3.5" /> เปิด Google Drive ผลงาน</>
                  ) : (
                    <><ExternalLink className="h-3.5 w-3.5" /> เปิดลิงก์ผลงาน / วิดีโอ</>
                  )}
                </a>
              ) : selectedFinal.video_path ? (
                <a 
                  href={`${BACKEND_URL}${selectedFinal.video_path}`} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary text-white hover:bg-primary/90 rounded-lg text-xs font-semibold shadow-sm transition-colors"
                >
                  <File className="h-3.5 w-3.5" /> ดูไฟล์ที่ส่ง
                </a>
              ) : null}
            </div>
          )}

          <form onSubmit={handleFinalGradeSubmit} className="space-y-4 pt-2 max-h-96 overflow-y-auto pr-2">
            {criteria.map((crit) => {
              const currentVal = finalScores[crit.id] || { score: "", comment: "" };

              return (
                <div key={crit.id} className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-xs text-slate-600">{crit.title} (ถ่วงน้ำหนัก {crit.weight}%)</span>
                    <span className="text-[10px] text-slate-500">คะแนนเต็มดิบ {crit.max_score}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="col-span-1">
                      <Input 
                        type="number"
                        step="0.01"
                        placeholder="คะแนน..."
                        value={currentVal.score}
                        onChange={(e) => setFinalScores({
                          ...finalScores,
                          [crit.id]: { ...currentVal, score: e.target.value }
                        })}
                        className="bg-white border-slate-200 text-slate-800 text-xs"
                        required
                      />
                    </div>
                    <div className="col-span-2">
                      <Input 
                        placeholder="ข้อแนะนำสั้น..."
                        value={currentVal.comment}
                        onChange={(e) => setFinalScores({
                          ...finalScores,
                          [crit.id]: { ...currentVal, comment: e.target.value }
                        })}
                        className="bg-white border-slate-200 text-slate-800 text-xs"
                      />
                    </div>
                  </div>
                </div>
              );
            })}

            {criteria.length === 0 && (
              <p className="text-xs text-slate-500 italic text-center py-6">ไม่พบเกณฑ์การให้คะแนนในระบบ กรุณาติดต่อแอดมิน</p>
            )}

            <DialogFooter className="mt-4">
              <Button type="button" variant="outline" onClick={() => setOpenFinalGradingDialog(false)} className="border-slate-100 text-slate-500">ยกเลิก</Button>
              <Button type="submit" className="bg-primary hover:bg-primary/90 transition-colors duration-200 cursor-pointer" disabled={criteria.length === 0}>บันทึกสิทธิ์คณะกรรมการ</Button>
            </DialogFooter>
          </form>
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
        reportData={reportData}
      />
      </div>
    </div>
  );
}
