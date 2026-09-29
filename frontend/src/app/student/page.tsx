"use client";

import React, { useState, useEffect } from "react";
import { useSystem } from "../../context/SystemContext";
import Sidebar from "../../components/Sidebar";
import { apiRequest, BACKEND_URL, Group, Workload, Submission, FinalProjectCriteria } from "../../lib/api";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "../../components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "../../components/ui/dialog";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "../../components/ui/select";
import { toast } from "sonner";
import WorkloadOverview from "../../components/WorkloadOverview";
import { 
  Users, ClipboardList, Trophy, Plus, ShieldAlert, X, 
  Send, Link as LinkIcon, FileText, CheckCircle, ExternalLink, Calendar,
  Upload, File, LayoutGrid, Info, ChevronDown, ChevronUp, Eye, Award,
  Folder, Image as ImageIcon, CheckCircle2, ListChecks, HelpCircle
} from "lucide-react";

export default function StudentPage() {
  const { user, settings } = useSystem();
  const [activeTab, setActiveTab] = useState("group");
  
  // Data States
  const [groupData, setGroupData] = useState<{ group: Group; activity_logs: any[]; final_project_submission?: any } | null>(null);
  const [workloads, setWorkloads] = useState<Workload[]>([]);
  const [criteria, setCriteria] = useState<FinalProjectCriteria[]>([]);
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [myGroupStats, setMyGroupStats] = useState<any>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  
  // Workload Detail Modal State
  const [viewDetailWorkload, setViewDetailWorkload] = useState<Workload | null>(null);
  const [openWorkloadDetailDialog, setOpenWorkloadDetailDialog] = useState(false);
  const [expandedWlIds, setExpandedWlIds] = useState<Record<number, boolean>>({});
  
  // Setup Group Form
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupTopic, setNewGroupTopic] = useState("");
  
  // Member additions
  const [classmates, setClassmates] = useState<any[]>([]);
  const [selectedClassmateIds, setSelectedClassmateIds] = useState<number[]>([]);
  const [classrooms, setClassrooms] = useState<any[]>([]);
  const [selectedClassroomId, setSelectedClassroomId] = useState<string>("");
  
  // Submission Form
  const [selectedWorkload, setSelectedWorkload] = useState<Workload | null>(null);
  const [submissionLink, setSubmissionLink] = useState("");
  const [submissionType, setSubmissionType] = useState<"link" | "file">("link");
  const [submissionFile, setSubmissionFile] = useState<File | null>(null);
  const [openSubmitDialog, setOpenSubmitDialog] = useState(false);

  // Final Submission Form
  const [finalLink, setFinalLink] = useState("");
  const [finalType, setFinalType] = useState<"link" | "file">("link");
  const [finalFile, setFinalFile] = useState<File | null>(null);
  const [openFinalDialog, setOpenFinalDialog] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  // Kick member confirmation log
  const [kickTargetId, setKickTargetId] = useState<number | null>(null);
  const [openKickDialog, setOpenKickDialog] = useState(false);
  const [kickReason, setKickReason] = useState("");

  const [loading, setLoading] = useState(false);

  // Filter/Search States
  const [logSearch, setLogSearch] = useState("");
  const [wlSearch, setWlSearch] = useState("");
  const [lbSearch, setLbSearch] = useState("");

  // Pagination States
  const [logPage, setLogPage] = useState(1);
  const [logPageSize, setLogPageSize] = useState(20);
  const [lbPage, setLbPage] = useState(1);
  const [lbPageSize, setLbPageSize] = useState(20);

  const filteredLogs = groupData?.activity_logs ? groupData.activity_logs.filter(log => 
    log.description.toLowerCase().includes(logSearch.toLowerCase()) ||
    (log.action_by?.full_name || "").toLowerCase().includes(logSearch.toLowerCase())
  ) : [];

  const filteredWorkloads = workloads.filter(wl => 
    wl.title.toLowerCase().includes(wlSearch.toLowerCase()) ||
    (wl.description || "").toLowerCase().includes(wlSearch.toLowerCase())
  );

  const filteredLeaderboard = leaderboard.filter(item => 
    item.group_name.toLowerCase().includes(lbSearch.toLowerCase()) ||
    (item.project_topic || "").toLowerCase().includes(lbSearch.toLowerCase()) ||
    (item.classroom_name || "").toLowerCase().includes(lbSearch.toLowerCase())
  );

  // Popup state
  const [showPopup, setShowPopup] = useState(false);

  // Final Project Submission Time Restriction Check
  const finalEnabled = settings["final_project_enabled"] !== "false";
  const finalStartTimeStr = settings["final_project_start_time"] || "";
  const finalEndTimeStr = settings["final_project_end_time"] || "";

  const now = new Date();
  let isNotStarted = false;
  let isExpired = false;

  if (finalStartTimeStr) {
    const startTime = new Date(finalStartTimeStr);
    if (!isNaN(startTime.getTime()) && now < startTime) {
      isNotStarted = true;
    }
  }

  if (finalEndTimeStr) {
    const endTime = new Date(finalEndTimeStr);
    if (!isNaN(endTime.getTime()) && now > endTime) {
      isExpired = true;
    }
  }

  const isFinalOpen = finalEnabled && !isNotStarted && !isExpired;

  const formatThaiDateTime = (dateStr: string) => {
    if (!dateStr) return "";
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleString("th-TH", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    }) + " น.";
  };

  const currentRoomName = classrooms.find(r => r.id.toString() === selectedClassroomId)?.name;

  const studentTabs = [
    { id: "overview", label: "ภาพรวมภาระงาน", icon: <LayoutGrid className="h-4 w-4" /> },
    { id: "group", label: "ข้อมูลกลุ่ม & สมาชิก", icon: <Users className="h-4 w-4" /> },
    { id: "submissions", label: "ส่งงาน", icon: <ClipboardList className="h-4 w-4" /> },
    { id: "final-project", label: "Final Project", icon: <Award className="h-4 w-4" /> },
    { id: "leaderboard", label: "สรุปคะแนน & อันดับ", icon: <Trophy className="h-4 w-4" /> },
  ];

  const fetchStudentData = async () => {
    setLoading(true);
    try {
      // 1. Get My Group
      try {
        const myGroupRes = await apiRequest("/student/groups/my");
        setGroupData(myGroupRes);
        if (myGroupRes?.group?.submissions) {
          setSubmissionLink("");
        }
      } catch (err) {
        setGroupData(null); // No group yet
      }

      // 2. Get Workloads
      const wlRes = await apiRequest<Workload[]>("/admin/workloads");
      setWorkloads(wlRes);

      // 3. Get Dashboard Stats (leaderboard)
      const statsRes = await apiRequest("/dashboard/stats");
      setLeaderboard(statsRes.leaderboard || []);
      setMyGroupStats(statsRes.my_group || null);

      // 4. Get Classrooms
      try {
        const classroomsRes = await apiRequest<any[]>("/student/classrooms");
        setClassrooms(classroomsRes || []);
      } catch (err) {
        console.error("Failed to load classrooms:", err);
      }

      // 5. Get Criteria
      try {
        const critRes = await apiRequest<FinalProjectCriteria[]>("/admin/criteria");
        setCriteria(critRes || []);
      } catch (err) {
        console.error("Failed to load criteria:", err);
      }

    } catch (err: any) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchClassmates = async (classroomId?: string) => {
    try {
      const endpoint = classroomId ? `/student/classmates?classroom_id=${classroomId}` : "/student/classmates";
      const classmatesRes = await apiRequest<any[]>(endpoint);
      setClassmates(classmatesRes || []);
    } catch (err) {
      console.error("Failed to load classmates:", err);
    }
  };

  useEffect(() => {
    if (user?.role === "student") {
      fetchClassmates(selectedClassroomId);
    }
  }, [selectedClassroomId, user]);

  useEffect(() => {
    if (user?.role === "student") {
      fetchStudentData();
      if (user.classroom?.id) {
        setSelectedClassroomId(user.classroom.id.toString());
      }

      // Show popup once
      if (settings["popup_active"] === "true") {
        const closed = sessionStorage.getItem("gpms_popup_closed");
        if (!closed) {
          setShowPopup(true);
        }
      }
    }
  }, [user]);

  useEffect(() => {
    setLogSearch("");
    setWlSearch("");
    setLbSearch("");
    setLogPage(1);
    setLbPage(1);
  }, [activeTab]);

  // Reset page numbers on search term changes
  useEffect(() => { setLogPage(1); }, [logSearch]);
  useEffect(() => { setLbPage(1); }, [lbSearch]);

  // Group creation
  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGroupName || !newGroupTopic) {
      toast.error("กรุณากรอกข้อมูลชื่อกลุ่มและหัวข้องาน");
      return;
    }

    try {
      await apiRequest("/student/groups", "POST", {
        name: newGroupName,
        project_topic: newGroupTopic
      });
      toast.success("จัดตั้งกลุ่มและเสนอหัวข้อสำเร็จ!");
      fetchStudentData();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  // Add member
  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedClassmateIds.length === 0) {
      toast.error("กรุณาเลือกเพื่อนร่วมชั้นอย่างน้อย 1 คน");
      return;
    }

    try {
      await apiRequest("/student/groups/members", "POST", {
        student_ids: selectedClassmateIds
      });
      toast.success("เพิ่มสมาชิกเข้ากลุ่มสำเร็จ!");
      setSelectedClassmateIds([]);
      fetchStudentData();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  // Kick member
  const handleKickMember = async () => {
    if (!kickTargetId) return;
    try {
      // Fiber API requires logging. But wait, in standard REST, we just delete.
      // Wait, our backend endpoint DELETE /api/student/groups/members/:studentId handles removal.
      // To record the log, our backend creates a log. So we can call it.
      await apiRequest(`/student/groups/members/${kickTargetId}`, "DELETE");
      toast.success("ลบสมาชิกออกจากกลุ่มเรียบร้อยแล้ว");
      setOpenKickDialog(false);
      setKickTargetId(null);
      setKickReason("");
      fetchStudentData();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  // Leave group
  const handleLeaveGroup = async () => {
    if (!confirm("คุณยืนยันที่จะออกจากกลุ่มนี้ใช่หรือไม่?")) return;
    try {
      await apiRequest("/student/groups/leave", "POST");
      toast.success("ออกจากกลุ่มเรียบร้อยแล้ว");
      fetchStudentData();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  // Delete group
  const handleDeleteGroup = async () => {
    if (!confirm("คุณยืนยันที่จะลบกลุ่มนี้ใช่หรือไม่? สมาชิกทุกคนจะถูกนำออกจากกลุ่ม และข้อมูลกิจกรรมจะถูกลบทั้งหมด (ไม่สามารถกู้คืนได้)")) return;
    try {
      await apiRequest("/student/groups", "DELETE");
      toast.success("ลบกลุ่มเรียบร้อยแล้ว");
      fetchStudentData();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  // Submit Workload
  const handleWorkloadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedWorkload) return;

    try {
      let filePath = "";
      let linkUrl = "";

      if (submissionType === "file") {
        if (!submissionFile) {
          toast.error("กรุณาเลือกไฟล์ที่จะอัปโหลด");
          return;
        }
        setIsUploading(true);
        const formData = new FormData();
        formData.append("file", submissionFile);
        const uploadRes = await apiRequest("/upload", "POST", formData);
        filePath = uploadRes.url;
      } else {
        linkUrl = submissionLink;
      }

      await apiRequest("/student/submissions/workload", "POST", {
        workload_id: selectedWorkload.id,
        file_path: filePath,
        link_url: linkUrl
      });
      toast.success(`ส่งงาน "${selectedWorkload.title}" สำเร็จ!`);
      setOpenSubmitDialog(false);
      setSubmissionFile(null);
      fetchStudentData();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setIsUploading(false);
    }
  };

  // Submit Final Project
  const handleFinalSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isFinalOpen) {
      if (!finalEnabled) {
        toast.error("ระบบปิดรับการส่ง Final Project ในขณะนี้");
      } else if (isNotStarted) {
        toast.error(`ยังไม่ถึงกำหนดเวลาเปิดรับการส่ง Final Project (เปิดรับตั้งแต่ ${formatThaiDateTime(finalStartTimeStr)})`);
      } else if (isExpired) {
        toast.error(`ระบบปิดรับการส่ง Final Project แล้ว (สิ้นสุดเวลาเมื่อ ${formatThaiDateTime(finalEndTimeStr)})`);
      }
      return;
    }

    try {
      let videoPath = "";
      let videoLink = "";

      if (finalType === "file") {
        if (!finalFile) {
          toast.error("กรุณาเลือกไฟล์ที่จะอัปโหลด");
          return;
        }
        setIsUploading(true);
        const formData = new FormData();
        formData.append("file", finalFile);
        const uploadRes = await apiRequest("/upload", "POST", formData);
        videoPath = uploadRes.url;
      } else {
        videoLink = finalLink;
      }

      await apiRequest("/student/submissions/final", "POST", {
        video_path: videoPath,
        video_link: videoLink
      });
      toast.success("อัปเดตไฟล์ผลงานวิดีโอ Final Project สำเร็จ!");
      setOpenFinalDialog(false);
      setFinalFile(null);
      fetchStudentData();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setIsUploading(false);
    }
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
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mt-6 pt-4 border-t border-slate-100 text-sm text-slate-500">
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

  const isLeader = groupData?.group?.leader_student_id === user?.id;

  return (
    <div className="flex min-h-screen flex-col md:flex-row text-slate-800">
      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} tabs={studentTabs} />

      <div className="flex-1 flex flex-col min-h-screen overflow-x-hidden pb-16 md:pb-8">
        <main className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 mt-8 flex-1">
        {/* Announcement Banner (if active) */}
        {settings["popup_active"] === "true" && (settings["popup_content"] || settings["popup_image"] || settings["popup_link"]) && (
          <div className="mb-6 bg-gradient-to-r from-tu-pink/5 via-primary/5 to-slate-50 border border-primary/20 rounded-2xl p-4 sm:p-5 shadow-sm text-slate-800 relative overflow-hidden">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div className="flex items-start gap-3 flex-1">
                <div className="p-2.5 bg-primary/10 text-primary rounded-xl shrink-0 mt-0.5">
                  <ShieldAlert className="h-5 w-5" />
                </div>
                <div className="space-y-1 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="px-2 py-0.5 text-[10px] font-bold bg-primary text-white rounded-full uppercase tracking-wider">
                      ประกาศจากระบบ / ผู้ดูแล
                    </span>
                    <h4 className="text-sm sm:text-base font-bold text-slate-900">
                      {settings["popup_title"] || "ประกาศสำคัญระบบ GPMS"}
                    </h4>
                  </div>
                  {settings["popup_content"] && (
                    <p className="text-xs sm:text-sm text-slate-600 whitespace-pre-line leading-relaxed">
                      {settings["popup_content"]}
                    </p>
                  )}
                  {settings["popup_link"] && (
                    <div className="pt-1.5">
                      <a 
                        href={settings["popup_link"]} 
                        target="_blank" 
                        rel="noopener noreferrer" 
                        className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline bg-white px-3 py-1.5 rounded-lg border border-primary/20 shadow-sm transition-colors"
                      >
                        <ExternalLink className="h-3.5 w-3.5" /> 
                        <span>เปิดลิงก์ข้อมูลที่แนบไว้ ({settings["popup_link"].length > 45 ? `${settings["popup_link"].slice(0, 45)}...` : settings["popup_link"]})</span>
                      </a>
                    </div>
                  )}
                </div>
              </div>

              {settings["popup_image"] && (
                <div className="shrink-0 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setPreviewImage(settings["popup_image"].startsWith("/uploads/") ? `${BACKEND_URL}${settings["popup_image"]}` : settings["popup_image"])}
                    className="group relative block rounded-xl overflow-hidden border border-slate-200 shadow-sm cursor-pointer hover:opacity-90 transition-opacity"
                    title="คลิกเพื่อดูรูปภาพขนาดใหญ่"
                  >
                    <img 
                      src={settings["popup_image"].startsWith("/uploads/") ? `${BACKEND_URL}${settings["popup_image"]}` : settings["popup_image"]} 
                      alt="Announcement Poster" 
                      className="w-24 sm:w-32 h-20 sm:h-24 object-cover"
                    />
                    <div className="absolute inset-0 bg-black/30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-white text-[10px] font-medium gap-1">
                      <Eye className="h-3.5 w-3.5" /> ดูภาพ
                    </div>
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === "overview" ? (
          <WorkloadOverview />
        ) : loading ? (
          <div className="flex flex-col items-center justify-center py-24">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary"></div>
            <p className="mt-4 text-slate-500 text-sm">กำลังอัปเดตข้อมูล...</p>
          </div>
        ) : (
          <>
            {/* GROUP & MEMBER TAB */}
            {activeTab === "group" && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* 1. Group info or Setup Form */}
                <div className="lg:col-span-2 space-y-6">
                  {!groupData ? (
                    <Card className="bg-white border-slate-100 text-slate-800 shadow-sm rounded-2xl">
                      <CardHeader>
                        <CardTitle className="text-xl font-bold flex items-center gap-2">
                          <Plus className="h-6 w-6 text-primary" /> จัดตั้งกลุ่มและเสนอหัวข้อ
                        </CardTitle>
                        <CardDescription className="text-slate-500 text-xs">คุณยังไม่ได้จัดตั้งกลุ่มในภาคการเรียนนี้ กรุณาสร้างกลุ่มของท่านด้านล่างเพื่อเริ่มการนำส่งภาระงาน</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <form onSubmit={handleCreateGroup} className="space-y-4">
                          <div className="space-y-2">
                            <label className="text-xs font-semibold text-slate-500 uppercase">ชื่อกลุ่มงาน</label>
                            <Input 
                              placeholder="เช่น กลุ่มวิจัย AI ม.6/1"
                              value={newGroupName}
                              onChange={(e) => setNewGroupName(e.target.value)}
                              className="bg-slate-50 border-slate-100"
                            />
                          </div>
                          <div className="space-y-2">
                            <label className="text-xs font-semibold text-slate-500 uppercase">หัวข้องานหลัก (Topic)</label>
                            <Input 
                              placeholder="ระบุหัวข้องาน..."
                              value={newGroupTopic}
                              onChange={(e) => setNewGroupTopic(e.target.value)}
                              className="bg-slate-50 border-slate-100"
                            />
                          </div>
                          <Button type="submit" className="w-full bg-primary hover:bg-primary/90 transition-colors duration-200 font-semibold cursor-pointer">
                            จัดตั้งกลุ่มทันที
                          </Button>
                        </form>
                      </CardContent>
                    </Card>
                  ) : (
                    <Card className="bg-white border-slate-100 text-slate-800 shadow-sm rounded-2xl">
                      <CardHeader className="border-b border-slate-100/80 pb-4">
                        <div className="flex justify-between items-start gap-4">
                          <div>
                            <span className="text-[10px] uppercase tracking-wider font-bold text-primary bg-primary/10 px-2 py-0.5 border border-primary/20 rounded">
                              กลุ่มของฉัน
                            </span>
                            <CardTitle className="text-2xl font-bold mt-2 text-slate-900">
                              {groupData.group.name}
                            </CardTitle>
                            <CardDescription className="text-slate-500 text-sm mt-1">
                              หัวข้องาน: <span className="text-tu-pink font-semibold">{groupData.group.project_topic}</span>
                            </CardDescription>
                          </div>
                          {!isLeader ? (
                            <Button 
                              variant="destructive"
                              size="sm"
                              onClick={handleLeaveGroup}
                              className="cursor-pointer"
                            >
                              ออกจากกลุ่ม
                            </Button>
                          ) : (
                            <Button 
                              variant="destructive"
                              size="sm"
                              onClick={handleDeleteGroup}
                              className="cursor-pointer"
                            >
                              ลบกลุ่ม
                            </Button>
                          )}
                        </div>
                      </CardHeader>
                      <CardContent className="pt-6 space-y-6">
                        {/* Member Management */}
                        <div>
                          <div className="flex justify-between items-center mb-3">
                            <h4 className="text-sm font-bold text-slate-600 flex items-center gap-1.5">
                              <Users className="h-4 w-4" /> สมาชิกในกลุ่ม ({groupData.group.members?.length || 0} คน)
                            </h4>
                            {isLeader && (
                              <span className="text-xs text-slate-500 italic">
                                คุณเป็นหัวหน้ากลุ่ม
                              </span>
                            )}
                          </div>

                          <div className="space-y-2">
                            {groupData.group.members?.map((m) => (
                              <div key={m.id} className="flex items-center justify-between p-3 rounded-lg bg-slate-50/60 border border-slate-200">
                                <div className="flex items-center gap-3">
                                  <div className="h-8 w-8 rounded-full bg-tu-pink/20 text-tu-pink border border-tu-pink/30 flex items-center justify-center font-bold text-xs uppercase">
                                    {m.full_name.substring(0, 2)}
                                  </div>
                                  <div>
                                    <p className="text-sm font-medium">{m.full_name}</p>
                                    <p className="text-xs text-slate-500">ID: {m.id} | {m.email || "ไม่มีอีเมล"}</p>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2">
                                  {m.id === groupData.group.leader_student_id ? (
                                    <span className="text-[10px] bg-amber-50 text-amber-800 px-2 py-0.5 rounded border border-amber-200 font-bold uppercase">หัวหน้า</span>
                                  ) : isLeader ? (
                                    <Button 
                                      variant="ghost" 
                                      size="sm"
                                      onClick={() => {
                                        setKickTargetId(m.id);
                                        setOpenKickDialog(true);
                                      }}
                                      className="text-rose-600 hover:text-rose-700 hover:bg-rose-50 text-xs h-7 px-2 border border-rose-100 hover:border-rose-200"
                                    >
                                      ลบออก
                                    </Button>
                                  ) : null}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Add member form (leader only) */}
                        {isLeader && (
                          <div className="border-t border-slate-100/80 pt-4 space-y-3">
                            <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">ดึงเพื่อนร่วมชั้นเข้ากลุ่ม</h4>
                            
                            <div className="flex flex-col gap-1.5">
                              <label className="text-xs font-semibold text-slate-500">เลือกห้องเรียน</label>
                              <Select
                                value={selectedClassroomId}
                                onValueChange={(val) => {
                                  setSelectedClassroomId(val || "");
                                  setSelectedClassmateIds([]);
                                }}
                              >
                                <SelectTrigger className="w-full bg-slate-50 border-slate-100 text-xs text-slate-700 h-9 rounded-xl">
                                  <SelectValue placeholder="เลือกห้องเรียน...">
                                    {currentRoomName ? `ห้อง ${currentRoomName}` : "เลือกห้องเรียน..."}
                                  </SelectValue>
                                </SelectTrigger>
                                <SelectContent className="bg-white border-slate-100 text-slate-800">
                                  {classrooms.map((room) => (
                                    <SelectItem key={room.id} value={room.id.toString()}>
                                      ห้อง {room.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>

                            <label className="text-xs font-semibold text-slate-500 block pt-1">เลือกนักเรียน (เลือกได้หลายคน)</label>
                            {classmates.filter(c => !c.has_group).length === 0 ? (
                              <p className="text-xs text-slate-400 bg-slate-50 p-3 rounded-xl border border-dashed border-slate-200">ไม่มีเพื่อนร่วมห้องที่ว่างอยู่ (ทุกคนมีกลุ่มแล้ว)</p>
                            ) : (
                              <div className="space-y-3">
                                <div className="max-h-48 overflow-y-auto border border-slate-100 rounded-xl p-3 space-y-2 bg-slate-50/50">
                                  {classmates.filter(c => !c.has_group).map((c) => {
                                    const isSelected = selectedClassmateIds.includes(c.user_id);
                                    return (
                                      <label 
                                        key={c.user_id} 
                                        className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-white border border-transparent hover:border-slate-100 cursor-pointer transition-all duration-150"
                                      >
                                        <input 
                                          type="checkbox"
                                          checked={isSelected}
                                          onChange={(e) => {
                                            if (e.target.checked) {
                                              setSelectedClassmateIds([...selectedClassmateIds, c.user_id]);
                                            } else {
                                              setSelectedClassmateIds(selectedClassmateIds.filter(id => id !== c.user_id));
                                            }
                                          }}
                                          className="rounded border-slate-300 text-primary focus:ring-primary h-4 w-4 accent-pink-600"
                                        />
                                        <div className="text-xs text-slate-700 flex flex-col">
                                          <span className="font-semibold text-slate-800">{c.full_name}</span>
                                          <span className="text-[10px] text-slate-400">รหัสผู้ใช้: {c.username}</span>
                                        </div>
                                      </label>
                                    );
                                  })}
                                </div>
                                <div className="flex justify-between items-center pt-1">
                                  <span className="text-xs text-slate-500 font-medium ml-1">
                                    เลือกแล้ว {selectedClassmateIds.length} คน
                                  </span>
                                  <Button 
                                    onClick={handleAddMember} 
                                    disabled={selectedClassmateIds.length === 0}
                                    className="bg-primary hover:bg-primary/95 text-white rounded-full transition-colors duration-200 cursor-pointer px-4 h-9 text-xs font-semibold shadow-sm shadow-primary/20"
                                  >
                                    ดึงเข้ากลุ่ม
                                  </Button>
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  )}
                </div>

                {/* 2. Group Log list */}
                <div className="lg:col-span-1">
                  <Card className="bg-white border-slate-100 text-slate-800 shadow-sm rounded-2xl h-full">
                    <CardHeader>
                      <CardTitle className="text-sm font-bold uppercase tracking-wider text-slate-500">ประวัติกิจกรรมกลุ่ม (Group Log)</CardTitle>
                    </CardHeader>
                    <CardContent className="pr-2 space-y-4">
                      <div className="mb-3">
                        <Input
                          placeholder="ค้นหาประวัติกิจกรรม..."
                          value={logSearch}
                          onChange={(e) => setLogSearch(e.target.value)}
                          className="bg-slate-50 border-slate-100 text-xs py-1 h-8 text-slate-800"
                        />
                      </div>
                      {(() => {
                        const paginatedLogs = filteredLogs.slice((logPage - 1) * logPageSize, logPage * logPageSize);

                        if (paginatedLogs.length === 0) {
                          return <p className="text-xs text-slate-500 italic text-center py-12">ไม่พบประวัติกิจกรรมที่ค้นหา</p>;
                        }

                        return paginatedLogs.map((log) => (
                          <div key={log.id} className="border-l-2 border-primary/50 pl-3 py-1 space-y-1">
                            <p className="text-xs text-slate-700 leading-relaxed">
                              {log.description}
                            </p>
                            <span className="text-[10px] text-slate-500 block">
                              โดย {log.action_by?.full_name} | {new Date(log.created_at).toLocaleString("th-TH")}
                            </span>
                          </div>
                        ));
                      })()}
                      {renderPagination(logPage, setLogPage, logPageSize, setLogPageSize, filteredLogs.length)}
                    </CardContent>
                  </Card>
                </div>
              </div>
            )}

            {/* SUBMISSIONS TAB (ภาระงานย่อยรายสัปดาห์/เทอม) */}
            {activeTab === "submissions" && (
              <div className="space-y-6">
                {!groupData ? (
                  <div className="text-center py-24 bg-slate-50 border border-slate-200/60 rounded-2xl text-slate-800 shadow-sm">
                    <ShieldAlert className="h-10 w-10 text-amber-500 mx-auto mb-3 animate-pulse" />
                    <h3 className="font-bold text-lg text-slate-800">กรุณาจัดตั้งกลุ่มก่อน</h3>
                    <p className="text-sm text-slate-500 mt-1">นักเรียนต้องมีกลุ่มจึงจะเริ่มนำส่งภาระงานและอัปโหลดงานได้</p>
                  </div>
                ) : (
                  <Card className="bg-white border-slate-100 text-slate-800 shadow-sm rounded-2xl">
                      <CardHeader>
                        <CardTitle className="text-lg font-bold">ความก้าวหน้าและการส่งภาระงานรายเทอม</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="mb-4 max-w-sm">
                          <Input
                            placeholder="ค้นหาภาระงาน..."
                            value={wlSearch}
                            onChange={(e) => setWlSearch(e.target.value)}
                            className="bg-slate-50 border-slate-100 text-slate-800 text-xs py-1 h-9"
                          />
                        </div>
                        <Table>
                          <TableHeader className="border-slate-100">
                            <TableRow className="border-slate-100 hover:bg-slate-50/50">
                              <TableHead className="text-slate-500">ภาระงาน</TableHead>
                              <TableHead className="text-slate-500">กำหนดส่ง</TableHead>
                              <TableHead className="text-slate-500">สถานะการส่ง</TableHead>
                              <TableHead className="text-slate-500">ลิงก์แนบ</TableHead>
                              <TableHead className="text-slate-500">คะแนนที่ได้</TableHead>
                              <TableHead className="text-slate-500 text-right">ส่งงาน</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {filteredWorkloads.map((wl) => {
                              // Find group's submission
                              const sub = groupData.group.submissions?.find(s => s.workload_id === wl.id);
                              
                              return (
                                <TableRow key={wl.id} className="border-slate-100 hover:bg-slate-50/30">
                                  <TableCell className="font-semibold text-slate-700">
                                    <div className="space-y-1">
                                      <button 
                                        type="button"
                                        onClick={() => {
                                          setViewDetailWorkload(wl);
                                          setOpenWorkloadDetailDialog(true);
                                        }}
                                        className="text-left font-bold text-slate-900 hover:text-primary transition-colors flex items-center gap-1.5 cursor-pointer group"
                                      >
                                        <span>{wl.title}</span>
                                        <Info className="h-3.5 w-3.5 text-primary/70 group-hover:text-primary shrink-0" />
                                      </button>
                                      {(() => {
                                        const isExpanded = !!expandedWlIds[wl.id];
                                        const rawDesc = wl.description?.trim();

                                        if (!rawDesc) {
                                          return (
                                            <div className="flex items-center justify-between pt-1">
                                              <p className="text-xs text-slate-400 font-normal italic">
                                                ไม่มีรายละเอียด
                                              </p>
                                              <button
                                                type="button"
                                                onClick={() => {
                                                  setViewDetailWorkload(wl);
                                                  setOpenWorkloadDetailDialog(true);
                                                }}
                                                className="text-[11px] font-semibold text-slate-500 hover:text-slate-700 transition-colors inline-flex items-center gap-1 cursor-pointer"
                                              >
                                                <Eye className="h-3 w-3 text-primary" /> แสดงฉบับเต็ม
                                              </button>
                                            </div>
                                          );
                                        }

                                        const isLong = rawDesc.length > 50 || rawDesc.includes("\n");

                                        return (
                                          <div className="space-y-1">
                                            <p className="text-xs text-slate-600 font-normal whitespace-pre-line leading-relaxed max-w-lg">
                                              {isExpanded || !isLong ? rawDesc : `${rawDesc.slice(0, 50).trim()}...`}
                                            </p>
                                            <div className="flex items-center justify-between pt-0.5 gap-2">
                                              {isLong ? (
                                                <button
                                                  type="button"
                                                  onClick={() =>
                                                    setExpandedWlIds((prev) => ({
                                                      ...prev,
                                                      [wl.id]: !prev[wl.id],
                                                    }))
                                                  }
                                                  className="text-[11px] font-semibold text-primary hover:text-primary/80 transition-colors inline-flex items-center gap-1 cursor-pointer"
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
                                                  setViewDetailWorkload(wl);
                                                  setOpenWorkloadDetailDialog(true);
                                                }}
                                                className="text-[11px] font-semibold text-slate-500 hover:text-slate-700 transition-colors inline-flex items-center gap-1 cursor-pointer"
                                              >
                                                <Eye className="h-3 w-3 text-primary" /> แสดงฉบับเต็ม
                                              </button>
                                            </div>
                                          </div>
                                        );
                                      })()}
                                      {(wl.sample_file_path || wl.sample_link_url) && (
                                        <div className="flex gap-1.5 mt-1 flex-wrap font-normal">
                                          {wl.sample_file_path && (
                                            <a 
                                              href={`${BACKEND_URL}${wl.sample_file_path}`} 
                                              target="_blank" 
                                              rel="noopener noreferrer"
                                              className="inline-flex items-center gap-0.5 text-[9px] bg-slate-100 hover:bg-slate-200 text-slate-600 px-1 py-0.5 rounded transition-colors duration-200"
                                            >
                                              <File className="h-2.5 w-2.5 text-rose-500" /> ไฟล์ตัวอย่าง
                                            </a>
                                          )}
                                          {wl.sample_link_url && (
                                            <a 
                                              href={wl.sample_link_url} 
                                              target="_blank" 
                                              rel="noopener noreferrer"
                                              className="inline-flex items-center gap-0.5 text-[9px] bg-primary/10 hover:bg-primary/20 text-primary px-1 py-0.5 rounded transition-colors duration-200"
                                            >
                                              <LinkIcon className="h-2.5 w-2.5" /> ลิงก์ตัวอย่าง
                                            </a>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  </TableCell>
                                  <TableCell className="text-slate-500 text-xs">
                                    {new Date(wl.deadline).toLocaleString("th-TH")}
                                  </TableCell>
                                  <TableCell>
                                    {sub ? (
                                      <div className="flex flex-col gap-0.5">
                                        <span className="text-xs text-emerald-400 flex items-center gap-1">
                                          <CheckCircle className="h-3 w-3" /> ส่งแล้ว
                                        </span>
                                        {sub.is_late && (
                                          <span className="text-[9px] bg-rose-50 text-rose-700 px-2 py-0.5 border border-rose-200 rounded w-max font-semibold">ส่งเลท</span>
                                        )}
                                      </div>
                                    ) : (
                                      <span className="text-xs text-slate-500 italic">ยังไม่ส่ง</span>
                                    )}
                                  </TableCell>
                                  <TableCell>
                                    {sub?.link_url ? (
                                      <a 
                                        href={sub.link_url} 
                                        target="_blank" 
                                        rel="noopener noreferrer"
                                        className="text-xs text-primary hover:underline flex items-center gap-1"
                                      >
                                        <LinkIcon className="h-3 w-3" /> ลิงก์แนบ
                                      </a>
                                    ) : sub?.file_path ? (
                                      <a 
                                        href={`${BACKEND_URL}${sub.file_path}`} 
                                        target="_blank" 
                                        rel="noopener noreferrer"
                                        className="text-xs text-primary hover:underline flex items-center gap-1"
                                      >
                                        <File className="h-3 w-3" /> ไฟล์แนบ
                                      </a>
                                    ) : (
                                      "-"
                                    )}
                                  </TableCell>
                                  <TableCell className="font-semibold">
                                    {sub?.grade ? (
                                      <div className="flex flex-col">
                                        <span className="text-primary font-bold">{sub.grade.score} / {wl.max_score}</span>
                                        {sub.grade.comment && (
                                          <span className="text-[9px] text-slate-500 font-normal italic max-w-[120px] truncate" title={sub.grade.comment}>
                                            "{sub.grade.comment}"
                                          </span>
                                        )}
                                      </div>
                                    ) : (
                                      <span className="text-xs text-slate-500">-</span>
                                    )}
                                  </TableCell>
                                  <TableCell className="text-right">
                                    <Button
                                      size="sm"
                                      onClick={() => {
                                        setSelectedWorkload(wl);
                                        setSubmissionLink(sub?.link_url || "");
                                        setSubmissionType(sub?.file_path ? "file" : "link");
                                        setSubmissionFile(null);
                                        setOpenSubmitDialog(true);
                                      }}
                                      className="bg-primary hover:bg-primary/90 transition-colors duration-200 cursor-pointer"
                                    >
                                      {sub ? "ส่งใหม่" : "อัปโหลดส่ง"}
                                    </Button>
                                  </TableCell>
                                </TableRow>
                              );
                            })}
                            {filteredWorkloads.length === 0 && (
                              <TableRow>
                                <TableCell colSpan={6} className="text-center py-12 text-slate-500 italic">ไม่พบข้อมูลภาระงานที่ค้นหา</TableCell>
                              </TableRow>
                            )}
                          </TableBody>
                        </Table>
                      </CardContent>
                    </Card>
                )}
              </div>
            )}

            {/* FINAL PROJECT TAB */}
            {activeTab === "final-project" && (
              <div className="space-y-6">
                {!groupData ? (
                  <div className="text-center py-24 bg-slate-50 border border-slate-200/60 rounded-2xl text-slate-800 shadow-sm">
                    <ShieldAlert className="h-10 w-10 text-amber-500 mx-auto mb-3 animate-pulse" />
                    <h3 className="font-bold text-lg text-slate-800">กรุณาจัดตั้งกลุ่มก่อน</h3>
                    <p className="text-sm text-slate-500 mt-1">นักเรียนต้องมีกลุ่มจึงจะเริ่มนำส่ง Final Project ได้</p>
                  </div>
                ) : (
                  <Card className="bg-white border-slate-100 text-slate-800 shadow-sm rounded-2xl">
                      <CardHeader className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-4">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <CardTitle className="text-lg font-bold flex items-center gap-2 text-slate-800">
                              🎓 Final Project Presentation Submission
                            </CardTitle>
                            {!finalEnabled ? (
                              <span className="px-2.5 py-0.5 text-xs font-bold rounded-full bg-rose-100 text-rose-700 border border-rose-200 inline-flex items-center gap-1">
                                🔒 ปิดระบบรับส่ง
                              </span>
                            ) : isNotStarted ? (
                              <span className="px-2.5 py-0.5 text-xs font-bold rounded-full bg-amber-100 text-amber-800 border border-amber-200 inline-flex items-center gap-1">
                                ⏳ ยังไม่ถึงเวลาเปิดรับส่ง
                              </span>
                            ) : isExpired ? (
                              <span className="px-2.5 py-0.5 text-xs font-bold rounded-full bg-rose-100 text-rose-700 border border-rose-200 inline-flex items-center gap-1">
                                ⌛ ปิดรับส่งแล้ว (หมดเวลา)
                              </span>
                            ) : (
                              <span className="px-2.5 py-0.5 text-xs font-bold rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200 inline-flex items-center gap-1">
                                ✅ เปิดรับส่งตามปกติ
                              </span>
                            )}
                          </div>
                          <CardDescription className="text-slate-500 text-xs">
                            อัปเดตไฟล์เล่มและคลิปวิดีโอนำเสนอผลงานเพื่อรับการประเมินจากคณะกรรมการอาจารย์
                            {(finalStartTimeStr || finalEndTimeStr) && (
                              <span className="block mt-1 font-medium text-slate-600">
                                🕒 กำหนดเวลาส่ง: {finalStartTimeStr ? formatThaiDateTime(finalStartTimeStr) : "เปิดรับส่งทันที"} ถึง {finalEndTimeStr ? formatThaiDateTime(finalEndTimeStr) : "ไม่จำกัดวันสิ้นสุด"}
                              </span>
                            )}
                          </CardDescription>
                        </div>
                        <Button 
                          disabled={!isFinalOpen}
                          onClick={() => {
                            if (!isFinalOpen) {
                              if (!finalEnabled) toast.error("ระบบปิดรับการส่ง Final Project ในขณะนี้");
                              else if (isNotStarted) toast.error(`ยังไม่ถึงกำหนดเวลาเปิดส่ง (เริ่มส่งได้ตั้งแต่ ${formatThaiDateTime(finalStartTimeStr)})`);
                              else if (isExpired) toast.error(`หมดเวลาส่ง Final Project แล้ว (สิ้นสุดเมื่อ ${formatThaiDateTime(finalEndTimeStr)})`);
                              return;
                            }
                            setFinalLink(groupData.final_project_submission?.video_link || "");
                            setFinalType(groupData.final_project_submission?.video_path ? "file" : "link");
                            setFinalFile(null);
                            setOpenFinalDialog(true);
                          }}
                          className={`${
                            isFinalOpen 
                              ? "bg-tu-pink hover:bg-tu-pink-hover text-white cursor-pointer" 
                              : "bg-slate-200 text-slate-400 cursor-not-allowed border-slate-300"
                          } font-semibold transition-colors duration-200`}
                        >
                          {groupData.final_project_submission ? "แก้ไขข้อมูลส่งผลงาน" : "ส่งผลงาน Final"}
                        </Button>
                      </CardHeader>
                      <CardContent className="pt-6 space-y-6">
                        {groupData.final_project_submission ? (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-2">
                              {groupData.final_project_submission.video_link ? (
                                <>
                                  <p className="text-xs text-slate-500 font-semibold uppercase flex items-center gap-1.5">
                                    {groupData.final_project_submission.video_link.includes("drive.google.com") || groupData.final_project_submission.video_link.includes("docs.google.com") ? (
                                      <><Folder className="h-3.5 w-3.5 text-emerald-600" /> ลิงก์ Google Drive ผลงาน Final Project</>
                                    ) : groupData.final_project_submission.video_link.includes("youtube.com") || groupData.final_project_submission.video_link.includes("youtu.be") ? (
                                      <>🎬 ลิงก์วิดีโอนำเสนอ Final Project (YouTube)</>
                                    ) : (
                                      <><LinkIcon className="h-3.5 w-3.5 text-primary" /> ลิงก์ผลงาน Final Project</>
                                    )}
                                  </p>
                                  <a 
                                    href={groupData.final_project_submission.video_link} 
                                    target="_blank" 
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1.5 text-primary hover:opacity-90 font-medium text-sm break-all"
                                  >
                                    <ExternalLink className="h-4 w-4 shrink-0" /> {groupData.final_project_submission.video_link}
                                  </a>
                                </>
                              ) : groupData.final_project_submission.video_path ? (
                                <>
                                  <p className="text-xs text-slate-500 font-semibold uppercase">ไฟล์วิดีโอนำเสนอ Final Project</p>
                                  <a 
                                    href={`${BACKEND_URL}${groupData.final_project_submission.video_path}`} 
                                    target="_blank" 
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1.5 text-primary hover:opacity-90 font-medium text-sm break-all"
                                  >
                                    <File className="h-4 w-4" /> ดูไฟล์วิดีโอ
                                  </a>
                                </>
                              ) : null}
                              <span className="text-[10px] text-slate-500 block">อัปเดตล่าสุด: {new Date(groupData.final_project_submission.submitted_at).toLocaleString("th-TH")}</span>
                            </div>
                            
                            <div className="p-4 rounded-xl bg-slate-50 border border-slate-100 flex flex-col justify-center">
                              <p className="text-xs text-slate-500 font-semibold uppercase">คะแนนสรุปจากคณะกรรมการ (เฉลี่ย)</p>
                              <p className="text-3xl font-extrabold text-tu-pink mt-1">
                                {myGroupStats?.final_score > 0 ? `${myGroupStats.final_score.toFixed(2)} คะแนน` : "ยังไม่ได้รับการประเมิน"}
                              </p>
                              <span className="text-[10px] text-slate-500 block mt-1">คำนวณเฉลี่ยอัตโนมัติจากผู้ประเมิน</span>
                            </div>
                          </div>
                        ) : (
                          <div className="text-center py-6 border border-dashed border-slate-200 rounded-xl bg-slate-50/50">
                            <p className="text-sm text-slate-500 italic">ยังไม่มีการนำส่งชิ้นงาน Final Project</p>
                          </div>
                        )}

                        {/* Admin Guidelines & Attachments for Final Project */}
                        {(settings["final_project_description"] || settings["final_project_link_url"] || settings["final_project_attachment_path"]) && (
                          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 space-y-3">
                            <div className="flex items-center gap-2">
                              <Info className="h-4 w-4 text-primary" />
                              <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                                คำชี้แจงและเอกสารอ้างอิง Final Project จากผู้ดูแลระบบ / อาจารย์
                              </h4>
                            </div>

                            {settings["final_project_description"] && (
                              <p className="text-xs text-slate-600 whitespace-pre-line leading-relaxed bg-white p-3 rounded-lg border border-slate-100 shadow-2xs">
                                {settings["final_project_description"]}
                              </p>
                            )}

                            <div className="flex flex-wrap gap-2.5 pt-0.5">
                              {settings["final_project_link_url"] && (
                                <a 
                                  href={settings["final_project_link_url"]} 
                                  target="_blank" 
                                  rel="noopener noreferrer" 
                                  className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 bg-white border border-primary/30 text-primary hover:bg-primary/5 rounded-lg shadow-2xs transition-colors"
                                >
                                  {settings["final_project_link_url"].includes("drive.google.com") || settings["final_project_link_url"].includes("docs.google.com") ? (
                                    <><Folder className="h-3.5 w-3.5 text-emerald-600" /> เปิด Google Drive เอกสาร/แม่แบบ</>
                                  ) : (
                                    <><ExternalLink className="h-3.5 w-3.5" /> เปิดลิงก์ข้อมูลเพิ่มเติม</>
                                  )}
                                </a>
                              )}

                              {settings["final_project_attachment_path"] && (
                                <>
                                  {/\.(jpg|jpeg|png|webp|gif|svg)$/i.test(settings["final_project_attachment_path"]) ? (
                                    <button
                                      type="button"
                                      onClick={() => setPreviewImage(settings["final_project_attachment_path"].startsWith("/uploads/") ? `${BACKEND_URL}${settings["final_project_attachment_path"]}` : settings["final_project_attachment_path"])}
                                      className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 rounded-lg shadow-2xs transition-colors cursor-pointer"
                                    >
                                      <ImageIcon className="h-3.5 w-3.5 text-tu-pink" />
                                      <span>ดูรูปภาพโปสเตอร์ / เกณฑ์ Final Project</span>
                                    </button>
                                  ) : (
                                    <a 
                                      href={settings["final_project_attachment_path"].startsWith("/uploads/") ? `${BACKEND_URL}${settings["final_project_attachment_path"]}` : settings["final_project_attachment_path"]} 
                                      target="_blank" 
                                      rel="noopener noreferrer"
                                      className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 rounded-lg shadow-2xs transition-colors"
                                    >
                                      <File className="h-3.5 w-3.5 text-rose-500" />
                                      <span>ดาวน์โหลดไฟล์เอกสารอ้างอิง ({settings["final_project_attachment_path"].split('/').pop()})</span>
                                    </a>
                                  )}
                                </>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Evaluation Criteria Section */}
                        <div className="border-t border-slate-100 pt-5 space-y-3">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <Award className="h-4 w-4 text-primary" />
                              <h4 className="text-sm font-bold text-slate-800">
                                เกณฑ์การประเมิน Final Project ({criteria.length} รายการ)
                              </h4>
                            </div>
                            <span className="text-xs font-semibold text-primary bg-primary/10 border border-primary/20 px-2.5 py-0.5 rounded-full w-max">
                              น้ำหนักรวม {criteria.reduce((sum, c) => sum + (c.weight || 0), 0)}%
                            </span>
                          </div>

                          {criteria.length > 0 ? (
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                              {criteria.map((crit, idx) => (
                                <div key={crit.id} className="p-3 bg-slate-50 hover:bg-slate-100/70 transition-colors border border-slate-200/80 rounded-xl space-y-1.5">
                                  <div className="flex items-start justify-between gap-2">
                                    <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                                      <span className="h-5 w-5 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[10px] shrink-0 font-black">
                                        {idx + 1}
                                      </span>
                                      {crit.title}
                                    </span>
                                    <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded shrink-0">
                                      {crit.weight}%
                                    </span>
                                  </div>
                                  <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1 border-t border-slate-200/60">
                                    <span>คะแนนเต็มดิบ:</span>
                                    <span className="font-semibold text-slate-700">{crit.max_score} คะแนน</span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-xs text-slate-400 italic py-2">
                              ยังไม่ได้กำหนดเกณฑ์การประเมินสำหรับภาคเรียนนี้
                            </p>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                )}
              </div>
            )}

            {/* LEADERBOARD TAB */}
            {activeTab === "leaderboard" && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Score Summary Card */}
                {myGroupStats && (
                  <Card className="lg:col-span-1 bg-white border-slate-100 text-slate-800 h-max shadow-sm rounded-2xl">
                    <CardHeader>
                      <CardTitle className="text-sm font-bold uppercase tracking-wider text-slate-600">สรุปคะแนนกลุ่มของฉัน</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="flex justify-between items-center border-b border-slate-100 pb-2">
                        <span className="text-slate-500 text-sm">อันดับปัจจุบัน:</span>
                        <span className="text-2xl font-black text-amber-600"># {myGroupStats.rank}</span>
                      </div>
                      <div className="flex justify-between items-center border-b border-slate-100 pb-2">
                        <span className="text-slate-500 text-sm">คะแนนสะสมย่อย:</span>
                        <span className="font-semibold text-slate-800">{myGroupStats.accumulated_score.toFixed(2)} คะแนน</span>
                      </div>
                      <div className="flex justify-between items-center border-b border-slate-100 pb-2">
                        <span className="text-slate-500 text-sm">คะแนนสอบจบ Final:</span>
                        <span className="font-semibold text-slate-800">{myGroupStats.final_score.toFixed(2)} คะแนน</span>
                      </div>
                      <div className="flex justify-between items-center pt-2">
                        <span className="text-slate-600 text-sm font-bold">คะแนนรวมสุทธิ:</span>
                        <span className="text-2xl font-black text-tu-pink">{(myGroupStats.accumulated_score + myGroupStats.final_score).toFixed(2)} คะแนน</span>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Leaderboard list */}
                <div className={myGroupStats ? "lg:col-span-2" : "lg:col-span-3"}>
                  <Card className="bg-white border-slate-100 text-slate-800 shadow-sm rounded-2xl">
                    <CardHeader>
                      <CardTitle className="text-lg font-bold flex items-center gap-1.5">
                        <Trophy className="h-5 w-5 text-amber-400" /> ตารางอันดับคะแนนชั้นเรียน (Leaderboard)
                      </CardTitle>
                      <CardDescription className="text-slate-500 text-xs">จัดอันดับตามคะแนนรวมสะสมรวมกับคะแนนเฉลี่ย Final Project ของคณะกรรมการ</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="mb-4 max-w-sm">
                        <Input
                          placeholder="ค้นหากลุ่ม, ชิ้นงาน/หัวข้อ, หรือห้องเรียน..."
                          value={lbSearch}
                          onChange={(e) => setLbSearch(e.target.value)}
                          className="bg-slate-50 border-slate-100 text-slate-800 text-xs py-1 h-9"
                        />
                      </div>
                      <Table>
                        <TableHeader className="border-slate-100">
                          <TableRow className="border-slate-100 hover:bg-slate-50/50">
                            <TableHead className="text-slate-500 w-16">อันดับ</TableHead>
                            <TableHead className="text-slate-500">ชื่อกลุ่ม</TableHead>
                            <TableHead className="text-slate-500">หัวข้องาน</TableHead>
                            <TableHead className="text-slate-500">ห้องเรียน</TableHead>
                            <TableHead className="text-slate-500 text-right">คะแนนรวม</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {(() => {
                            const paginatedLb = filteredLeaderboard.slice((lbPage - 1) * lbPageSize, lbPage * lbPageSize);

                            if (filteredLeaderboard.length === 0) {
                              return (
                                <TableRow>
                                  <TableCell colSpan={5} className="text-center py-12 text-slate-500 italic">ไม่พบข้อมูลอันดับตามคำค้นหา</TableCell>
                                </TableRow>
                              );
                            }

                            return paginatedLb.map((item) => {
                              const index = leaderboard.findIndex(x => x.group_id === item.group_id);
                              const isMyGroup = groupData?.group?.id === item.group_id;

                              return (
                                <TableRow 
                                  key={item.group_id} 
                                  className={`border-slate-100 hover:bg-slate-50/30 ${
                                    isMyGroup ? "bg-primary/10 border-l-2 border-l-primary font-semibold" : ""
                                  }`}
                                >
                                  <TableCell>
                                    <span className={`h-6 w-6 rounded-full flex items-center justify-center text-xs font-black ${
                                      index === 0 
                                        ? "bg-amber-100 text-amber-800 border border-amber-300" 
                                        : index === 1
                                        ? "bg-slate-100 text-slate-800 border border-slate-300"
                                        : index === 2
                                        ? "bg-amber-100/80 text-amber-900 border border-amber-600/30"
                                        : "bg-slate-50 text-slate-600 border border-slate-200"
                                    }`}>
                                      {index + 1}
                                    </span>
                                  </TableCell>
                                  <TableCell>
                                    <span className={isMyGroup ? "text-primary" : ""}>{item.group_name}</span>
                                  </TableCell>
                                  <TableCell className="max-w-[200px] truncate">{item.project_topic}</TableCell>
                                  <TableCell>{item.classroom_name}</TableCell>
                                  <TableCell className="text-right text-slate-800 font-bold">
                                    {item.total_score.toFixed(2)}
                                  </TableCell>
                                </TableRow>
                              );
                            });
                          })()}
                        </TableBody>
                      </Table>
                      {renderPagination(lbPage, setLbPage, lbPageSize, setLbPageSize, filteredLeaderboard.length)}
                    </CardContent>
                  </Card>
                </div>
              </div>
            )}
          </>
        )}
      </main>

      {/* DIALOGS */}

      {/* Workload Full Detail Dialog */}
      <Dialog open={openWorkloadDetailDialog} onOpenChange={setOpenWorkloadDetailDialog}>
        <DialogContent className="bg-white border-slate-200 text-slate-800 shadow-xl max-w-2xl rounded-2xl p-6 max-h-[90vh] overflow-y-auto">
          {viewDetailWorkload && (
            <div className="space-y-5">
              <DialogHeader className="border-b border-slate-100 pb-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[10px] uppercase tracking-wider font-bold text-primary bg-primary/10 px-2.5 py-1 rounded border border-primary/20">
                    รายละเอียดภาระงาน
                  </span>
                  <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded border border-emerald-200">
                    คะแนนเต็ม {viewDetailWorkload.max_score} คะแนน
                  </span>
                </div>
                <DialogTitle className="text-xl font-bold text-slate-900 mt-2">
                  {viewDetailWorkload.title}
                </DialogTitle>
                <DialogDescription className="text-xs text-slate-500 flex items-center gap-1.5 mt-1">
                  <Calendar className="h-3.5 w-3.5 text-slate-400" />
                  กำหนดส่ง: {new Date(viewDetailWorkload.deadline).toLocaleString("th-TH")}
                </DialogDescription>
              </DialogHeader>

              {/* Workload Description Section */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">คำชี้แจง / รายละเอียดภาระงาน</h4>
                <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-4 text-sm text-slate-700 leading-relaxed whitespace-pre-line min-h-[80px] max-h-[50vh] overflow-y-auto">
                  {viewDetailWorkload.description || "ไม่มีรายละเอียดหรือคำชี้แจงเพิ่มเติม"}
                </div>
              </div>

              {/* Sample Files / Links */}
              {(viewDetailWorkload.sample_file_path || viewDetailWorkload.sample_link_url) && (
                <div className="space-y-2">
                  <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">เอกสารและลิงก์ตัวอย่าง</h4>
                  <div className="flex flex-wrap gap-2">
                    {viewDetailWorkload.sample_file_path && (
                      <a
                        href={`${BACKEND_URL}${viewDetailWorkload.sample_file_path}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs px-3 py-1.5 rounded-lg border border-slate-200 font-medium transition-colors"
                      >
                        <File className="h-4 w-4 text-rose-500" /> ดาวน์โหลดไฟล์ตัวอย่าง
                      </a>
                    )}
                    {viewDetailWorkload.sample_link_url && (
                      <a
                        href={viewDetailWorkload.sample_link_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 bg-primary/10 hover:bg-primary/20 text-primary text-xs px-3 py-1.5 rounded-lg border border-primary/20 font-medium transition-colors"
                      >
                        <LinkIcon className="h-4 w-4" /> เปิดลิงก์ตัวอย่าง
                      </a>
                    )}
                  </div>
                </div>
              )}

              {/* Current Group Submission Info */}
              {groupData?.group && (() => {
                const sub = groupData.group.submissions?.find(s => s.workload_id === viewDetailWorkload.id);
                return (
                  <div className="border-t border-slate-100 pt-4 space-y-2">
                    <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">สถานะการส่งงานของกลุ่ม</h4>
                    {sub ? (
                      <div className="bg-emerald-50/60 border border-emerald-200/80 rounded-xl p-3.5 space-y-2 text-xs">
                        <div className="flex justify-between items-center">
                          <span className="font-bold text-emerald-800 flex items-center gap-1">
                            <CheckCircle className="h-4 w-4 text-emerald-600" /> ส่งเรียบร้อยแล้ว {sub.is_late && "(ส่งเลท)"}
                          </span>
                          <span className="text-slate-500">
                            {new Date(sub.submitted_at).toLocaleString("th-TH")}
                          </span>
                        </div>
                        {sub.grade && (
                          <div className="pt-2 border-t border-emerald-200/60 flex flex-col gap-1">
                            <span className="font-bold text-slate-800">
                              คะแนน: <span className="text-primary">{sub.grade.score} / {viewDetailWorkload.max_score}</span>
                            </span>
                            {sub.grade.comment && (
                              <p className="text-slate-600 italic bg-white p-2 rounded border border-emerald-100">
                                "{sub.grade.comment}"
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800 flex items-center justify-between">
                        <span>กลุ่มของคุณยังไม่ได้ส่งภาระงานนี้</span>
                      </div>
                    )}
                  </div>
                );
              })()}

              <DialogFooter className="border-t border-slate-100 pt-4 gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setOpenWorkloadDetailDialog(false)}
                  className="border-slate-200 text-slate-600"
                >
                  ปิด
                </Button>
                {groupData?.group && (
                  <Button
                    type="button"
                    onClick={() => {
                      const sub = groupData.group.submissions?.find(s => s.workload_id === viewDetailWorkload.id);
                      setSelectedWorkload(viewDetailWorkload);
                      setSubmissionLink(sub?.link_url || "");
                      setSubmissionType(sub?.file_path ? "file" : "link");
                      setSubmissionFile(null);
                      setOpenWorkloadDetailDialog(false);
                      setOpenSubmitDialog(true);
                    }}
                    className="bg-primary hover:bg-primary/90 text-white font-semibold cursor-pointer"
                  >
                    {groupData.group.submissions?.some(s => s.workload_id === viewDetailWorkload.id) ? "แก้ไขการส่งงาน" : "ส่งงานนี้"}
                  </Button>
                )}
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Submit Workload Dialog */}
      <Dialog open={openSubmitDialog} onOpenChange={setOpenSubmitDialog}>
        <DialogContent className="bg-white border-slate-200 text-slate-800 shadow-md rounded-2xl max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>ส่งภาระงาน: {selectedWorkload?.title}</DialogTitle>
            <DialogDescription className="text-xs text-slate-500 pt-1">
              เลือกรูปแบบการส่งงาน: ลิงก์ (Link URL) หรืออัปโหลดไฟล์ (File Upload)
            </DialogDescription>
          </DialogHeader>
          {selectedWorkload?.description && (
            <p className="text-xs text-slate-600 bg-slate-50 p-2.5 rounded-lg border border-slate-100 mt-1 whitespace-pre-line">
              {selectedWorkload.description}
            </p>
          )}
          {(selectedWorkload?.sample_file_path || selectedWorkload?.sample_link_url) && (
            <div className="flex flex-col gap-1.5 p-2.5 bg-slate-50 border border-slate-100 rounded-lg text-xs mt-1">
              <span className="font-semibold text-slate-600 text-[11px]">เอกสารอ้างอิง / ลิงก์ตัวอย่าง:</span>
              <div className="flex flex-wrap gap-2">
                {selectedWorkload.sample_file_path && (
                  <a 
                    href={`${BACKEND_URL}${selectedWorkload.sample_file_path}`} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 px-2 py-1 rounded shadow-sm transition-colors duration-200 font-medium"
                  >
                    <File className="h-3.5 w-3.5 text-rose-500" /> ดาวน์โหลดไฟล์ตัวอย่าง
                  </a>
                )}
                {selectedWorkload.sample_link_url && (
                  <a 
                    href={selectedWorkload.sample_link_url} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 bg-white border border-slate-200 hover:bg-slate-50 text-primary px-2 py-1 rounded shadow-sm transition-colors duration-200 font-medium"
                  >
                    <LinkIcon className="h-3.5 w-3.5" /> เปิดลิงก์ตัวอย่าง
                  </a>
                )}
              </div>
            </div>
          )}
          <form onSubmit={handleWorkloadSubmit} className="space-y-4 pt-2">
            <div className="flex gap-2 p-1 bg-slate-100 rounded-lg">
              <button
                type="button"
                onClick={() => setSubmissionType("link")}
                className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-all ${
                  submissionType === "link"
                    ? "bg-white text-slate-800 shadow-sm"
                    : "text-slate-500 hover:text-slate-800"
                }`}
              >
                ส่งเป็นลิงก์ (Link)
              </button>
              <button
                type="button"
                onClick={() => setSubmissionType("file")}
                className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-all ${
                  submissionType === "file"
                    ? "bg-white text-slate-800 shadow-sm"
                    : "text-slate-500 hover:text-slate-800"
                }`}
              >
                อัปโหลดไฟล์ (File)
              </button>
            </div>

            {submissionType === "link" ? (
              <div className="space-y-2">
                <label className="text-xs text-slate-500 uppercase font-semibold">ลิงก์ส่งงาน (Link URL)</label>
                <Input 
                  placeholder="https://..."
                  value={submissionLink}
                  onChange={(e) => setSubmissionLink(e.target.value)}
                  className="bg-slate-50 border-slate-200"
                  required={submissionType === "link"}
                />
              </div>
            ) : (
              <div className="space-y-2">
                <label className="text-xs text-slate-500 uppercase font-semibold">อัปโหลดไฟล์ (File Upload)</label>
                <div className="border border-dashed border-slate-200 rounded-lg p-6 bg-slate-50/50 hover:bg-slate-50 transition-colors flex flex-col items-center justify-center gap-2 cursor-pointer relative">
                  <Input 
                    type="file"
                    onChange={(e) => setSubmissionFile(e.target.files?.[0] || null)}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    required={submissionType === "file" && !submissionFile}
                  />
                  <Upload className="h-8 w-8 text-slate-400" />
                  <span className="text-xs text-slate-600 font-medium">
                    {submissionFile ? submissionFile.name : "คลิกหรือลากไฟล์เพื่ออัปโหลด"}
                  </span>
                  <span className="text-[10px] text-slate-500">
                    {submissionFile ? `${(submissionFile.size / 1024 / 1024).toFixed(2)} MB` : "รองรับไฟล์ทุกประเภท"}
                  </span>
                </div>
              </div>
            )}

            <DialogFooter className="mt-4">
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => setOpenSubmitDialog(false)} 
                className="border-slate-100 text-slate-500"
                disabled={isUploading}
              >
                ยกเลิก
              </Button>
              <Button 
                type="submit" 
                className="bg-primary hover:bg-primary/90 transition-colors duration-200 cursor-pointer gap-1"
                disabled={isUploading}
              >
                {isUploading ? "กำลังอัปโหลด..." : <><Send className="h-4 w-4" /> ส่งงาน</>}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Submit Final Project Dialog */}
      <Dialog open={openFinalDialog} onOpenChange={setOpenFinalDialog}>
        <DialogContent className="bg-white border-slate-200 text-slate-800 shadow-md rounded-2xl max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>ส่งข้อมูล Final Project</DialogTitle>
            <DialogDescription className="text-xs text-slate-500 pt-1">
              เลือกรูปแบบการส่ง: ลิงก์ (Google Drive / Video URL) หรืออัปโหลดไฟล์วิดีโอ/เอกสาร (File Upload)
            </DialogDescription>
          </DialogHeader>

          {/* Admin guidelines / link reference if available */}
          {(settings["final_project_description"] || settings["final_project_link_url"] || settings["final_project_attachment_path"]) && (
            <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl space-y-2 text-xs">
              <span className="font-semibold text-slate-700 text-[11px] flex items-center gap-1">
                <Info className="h-3.5 w-3.5 text-primary" /> คำชี้แจง / เอกสารอ้างอิงจากอาจารย์:
              </span>
              {settings["final_project_description"] && (
                <p className="text-[11px] text-slate-600 whitespace-pre-line leading-relaxed">
                  {settings["final_project_description"]}
                </p>
              )}
              <div className="flex flex-wrap gap-2 pt-1">
                {settings["final_project_link_url"] && (
                  <a 
                    href={settings["final_project_link_url"]} 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    className="inline-flex items-center gap-1 bg-white border border-primary/30 hover:bg-primary/5 text-primary px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors"
                  >
                    {settings["final_project_link_url"].includes("drive.google.com") || settings["final_project_link_url"].includes("docs.google.com") ? (
                      <><Folder className="h-3 w-3 text-emerald-600" /> เปิด Google Drive แม่แบบ</>
                    ) : (
                      <><ExternalLink className="h-3 w-3" /> เปิดลิงก์ข้อมูล</>
                    )}
                  </a>
                )}
                {settings["final_project_attachment_path"] && (
                  <a 
                    href={settings["final_project_attachment_path"].startsWith("/uploads/") ? `${BACKEND_URL}${settings["final_project_attachment_path"]}` : settings["final_project_attachment_path"]} 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    className="inline-flex items-center gap-1 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors"
                  >
                    <File className="h-3 w-3 text-rose-500" />
                    <span>ดูเอกสาร/รูปภาพอ้างอิง</span>
                  </a>
                )}
              </div>
            </div>
          )}

          <form onSubmit={handleFinalSubmit} className="space-y-4 pt-2">
            <div className="flex gap-2 p-1 bg-slate-100 rounded-lg">
              <button
                type="button"
                onClick={() => setFinalType("link")}
                className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-all flex items-center justify-center gap-1.5 ${
                  finalType === "link"
                    ? "bg-white text-slate-800 shadow-sm"
                    : "text-slate-500 hover:text-slate-800"
                }`}
              >
                <Folder className="h-3.5 w-3.5 text-primary" />
                <span>ส่งเป็นลิงก์ (Link / Google Drive / วิดีโอ)</span>
              </button>
              <button
                type="button"
                onClick={() => setFinalType("file")}
                className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-all flex items-center justify-center gap-1.5 ${
                  finalType === "file"
                    ? "bg-white text-slate-800 shadow-sm"
                    : "text-slate-500 hover:text-slate-800"
                }`}
              >
                <Upload className="h-3.5 w-3.5 text-primary" />
                <span>อัปโหลดไฟล์ (File)</span>
              </button>
            </div>

            {finalType === "link" ? (
              <div className="space-y-2.5">
                <label className="text-xs text-slate-600 uppercase font-semibold flex items-center gap-1">
                  <LinkIcon className="h-3.5 w-3.5 text-primary" /> ลิงก์ส่งผลงาน / Google Drive / วิดีโอ (Link URL)
                </label>
                <Input 
                  placeholder="https://drive.google.com/... หรือ https://youtube.com/..."
                  value={finalLink}
                  onChange={(e) => setFinalLink(e.target.value)}
                  className="bg-slate-50 border-slate-200 text-xs font-mono"
                  required={finalType === "link"}
                />

                {/* Google Drive / YouTube Live Badge */}
                {finalLink && (
                  <div>
                    {finalLink.includes("drive.google.com") || finalLink.includes("docs.google.com") ? (
                      <div className="flex items-center gap-1.5 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1.5 rounded-lg">
                        <Folder className="h-4 w-4 shrink-0 text-emerald-600" />
                        <span>ตรวจพบลิงก์ Google Drive (โฟลเดอร์/เอกสาร)</span>
                      </div>
                    ) : finalLink.includes("youtube.com") || finalLink.includes("youtu.be") ? (
                      <div className="flex items-center gap-1.5 text-xs text-rose-700 bg-rose-50 border border-rose-200 px-2.5 py-1.5 rounded-lg">
                        <span className="font-bold">🎬</span>
                        <span>ตรวจพบลิงก์วิดีโอ YouTube</span>
                      </div>
                    ) : null}
                  </div>
                )}

                {/* Helpful instructions for Google Drive and video */}
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1.5 text-[11px] text-slate-600 leading-relaxed">
                  <p className="font-bold text-slate-700 flex items-center gap-1">
                    <Info className="h-3.5 w-3.5 text-primary shrink-0" /> คำแนะนำการส่งลิงก์:
                  </p>
                  <p>• สามารถส่งเป็นลิงก์โฟลเดอร์หรือไฟล์ <strong>Google Drive</strong>, ลิงก์คลิปวิดีโอ <strong>YouTube</strong>, ลิงก์ <strong>Canva</strong>, <strong>OneDrive</strong> หรือเว็บไซต์ผลงาน</p>
                  <p className="text-amber-700 font-medium bg-amber-50 p-2 rounded-lg border border-amber-200 mt-1">
                    ⚠️ <strong>สำหรับ Google Drive:</strong> โปรดตรวจสอบว่าได้ตั้งค่าสิทธิ์การเข้าถึงเป็น <u>&quot;ทุกคนที่มีลิงก์ (Anyone with the link)&quot;</u> มีสิทธิ์ดู เพื่อให้อาจารย์และคณะกรรมการสามารถเปิดประเมินได้
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <label className="text-xs text-slate-500 uppercase font-semibold">อัปโหลดไฟล์วิดีโอนำเสนอ / เอกสารผลงาน (File Upload)</label>
                <div className="border border-dashed border-slate-200 rounded-lg p-6 bg-slate-50/50 hover:bg-slate-50 transition-colors flex flex-col items-center justify-center gap-2 cursor-pointer relative">
                  <Input 
                    type="file"
                    onChange={(e) => setFinalFile(e.target.files?.[0] || null)}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    required={finalType === "file" && !finalFile}
                  />
                  <Upload className="h-8 w-8 text-slate-400" />
                  <span className="text-xs text-slate-600 font-medium">
                    {finalFile ? finalFile.name : "คลิกหรือลากไฟล์เพื่ออัปโหลด"}
                  </span>
                  <span className="text-[10px] text-slate-500">
                    {finalFile ? `${(finalFile.size / 1024 / 1024).toFixed(2)} MB` : "รองรับไฟล์ทุกประเภท (.mp4, .pdf, .zip, .docx ฯลฯ)"}
                  </span>
                </div>
              </div>
            )}

            {/* Criteria preview in modal */}
            {criteria.length > 0 && (
              <div className="border-t border-slate-100 pt-3">
                <p className="text-[11px] font-bold text-slate-600 mb-1.5 flex items-center gap-1">
                  <Award className="h-3.5 w-3.5 text-primary" /> เกณฑ์การให้คะแนน Final Project ({criteria.length} ข้อ):
                </p>
                <div className="max-h-28 overflow-y-auto space-y-1 pr-1 bg-slate-50 p-2 rounded-lg border border-slate-100">
                  {criteria.map((c) => (
                    <div key={c.id} className="flex justify-between items-center text-[11px] text-slate-600">
                      <span className="truncate pr-2">• {c.title}</span>
                      <span className="font-semibold shrink-0 text-slate-800">{c.max_score} คะแนน ({c.weight}%)</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <DialogFooter className="mt-4">
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => setOpenFinalDialog(false)} 
                className="border-slate-100 text-slate-500"
                disabled={isUploading}
              >
                ยกเลิก
              </Button>
              <Button 
                type="submit" 
                className="bg-primary hover:bg-primary/90 transition-colors duration-200 cursor-pointer gap-1"
                disabled={isUploading}
              >
                {isUploading ? "กำลังอัปโหลด..." : <><Send className="h-4 w-4" /> ส่งผลงาน</>}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Kick Member Dialog */}
      <Dialog open={openKickDialog} onOpenChange={setOpenKickDialog}>
        <DialogContent className="bg-white border-slate-200 text-slate-800 shadow-md rounded-2xl max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>ยืนยันการนำสมาชิกออกจากกลุ่ม</DialogTitle>
            <DialogDescription className="text-xs text-slate-500 pt-1">
              กรุณาระบุเหตุผลการนำเพื่อนออกจากกลุ่ม โดยระบบจะบันทึกสาเหตุนี้ลงใน Log ของกลุ่มเพื่อความโปร่งใส
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <label className="text-xs text-slate-500 uppercase font-semibold">เหตุผลการนำออก (บังคับกรอก)</label>
              <Input 
                placeholder="เช่น ขาดการติดต่อ ไม่ช่วยงานกลุ่ม..."
                value={kickReason}
                onChange={(e) => setKickReason(e.target.value)}
                className="bg-slate-50 border-slate-100"
              />
            </div>
            <DialogFooter className="mt-4">
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => {
                  setOpenKickDialog(false);
                  setKickTargetId(null);
                  setKickReason("");
                }} 
                className="border-slate-100 text-slate-500"
              >
                ยกเลิก
              </Button>
              <Button 
                onClick={handleKickMember} 
                className="bg-rose-600 hover:bg-rose-500"
                disabled={!kickReason}
              >
                ยืนยันการเตะออก
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      {/* Announcement Popup Modal */}
      <Dialog open={showPopup} onOpenChange={setShowPopup}>
        <DialogContent className="bg-white border-slate-200 text-slate-800 shadow-xl max-w-lg rounded-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader className="flex flex-row items-center gap-2.5 border-b border-slate-100 pb-3">
            <div className="p-2 bg-primary/10 text-primary rounded-xl shrink-0">
              <ShieldAlert className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle className="text-base font-bold text-slate-900">
                {settings["popup_title"] || "ประกาศสำคัญระบบ GPMS"}
              </DialogTitle>
            </div>
          </DialogHeader>
          
          <div className="py-2 space-y-3">
            {settings["popup_image"] && (
              <div className="rounded-xl overflow-hidden border border-slate-200 bg-slate-50 flex items-center justify-center max-h-72">
                <img 
                  src={settings["popup_image"].startsWith("/uploads/") ? `${BACKEND_URL}${settings["popup_image"]}` : settings["popup_image"]} 
                  alt="Announcement" 
                  className="w-full h-auto max-h-72 object-contain"
                />
              </div>
            )}

            {settings["popup_content"] && (
              <div className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">
                {settings["popup_content"]}
              </div>
            )}

            {settings["popup_link"] && (
              <div className="pt-2">
                <a 
                  href={settings["popup_link"]} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-3.5 py-2.5 bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 rounded-xl text-xs font-semibold w-full justify-center transition-colors shadow-sm"
                >
                  <ExternalLink className="h-4 w-4" /> 
                  <span>เปิดลิงก์ที่แนบไว้ ({settings["popup_link"].length > 40 ? `${settings["popup_link"].slice(0, 40)}...` : settings["popup_link"]})</span>
                </a>
              </div>
            )}
          </div>

          <DialogFooter className="border-t border-slate-100 pt-3">
            <Button 
              onClick={() => {
                setShowPopup(false);
                sessionStorage.setItem("gpms_popup_closed", "true");
              }}
              className="bg-primary hover:bg-primary/90 text-white font-bold w-full cursor-pointer transition-colors duration-200"
            >
              รับทราบประกาศ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Image Preview Modal */}
      <Dialog open={!!previewImage} onOpenChange={(open) => { if (!open) setPreviewImage(null); }}>
        <DialogContent className="bg-white border-slate-200 text-slate-800 shadow-xl max-w-3xl rounded-2xl p-4">
          <DialogHeader className="border-b border-slate-100 pb-2">
            <DialogTitle className="text-sm font-bold text-slate-700">รูปภาพประกาศ / ประชาสัมพันธ์</DialogTitle>
          </DialogHeader>
          {previewImage && (
            <div className="py-2 flex items-center justify-center">
              <img 
                src={previewImage} 
                alt="Enlarged preview" 
                className="max-h-[75vh] w-auto object-contain rounded-lg"
              />
            </div>
          )}
          <DialogFooter className="pt-2">
            <Button 
              variant="outline" 
              onClick={() => setPreviewImage(null)}
              className="border-slate-200 text-slate-600 text-xs cursor-pointer"
            >
              ปิด
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </div>
    </div>
  );
}
