"use client";

import React, { useState, useEffect } from "react";
import { useSystem } from "../../context/SystemContext";
import Sidebar from "../../components/Sidebar";
import { apiRequest, getToken, API_BASE, Semester, Classroom, User, Workload, FinalProjectCriteria, BACKEND_URL } from "../../lib/api";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Textarea } from "../../components/ui/textarea";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "../../components/ui/select";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "../../components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../../components/ui/dialog";
import { toast } from "sonner";
import WorkloadOverview from "../../components/WorkloadOverview";
import ExportScoreDialog from "../../components/ExportScoreDialog";
import { 
  Calendar, Layers, Users, User as UserIcon, Briefcase, Award, Settings, 
  Plus, Edit, Trash, Upload, Check, X, ShieldAlert, Download, FileSpreadsheet, LayoutGrid,
  Image as ImageIcon, Link as LinkIcon, ExternalLink, Printer
} from "lucide-react";

export default function AdminPage() {
  const { user, settings, updateLocalSettings } = useSystem();
  const [activeTab, setActiveTab] = useState("overview");
  const [selectedSemester, setSelectedSemester] = useState<string>("");
  
  // Data States
  const [semesters, setSemesters] = useState<Semester[]>([]);
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [teachers, setTeachers] = useState<User[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [workloads, setWorkloads] = useState<Workload[]>([]);
  const [criteria, setCriteria] = useState<FinalProjectCriteria[]>([]);
  const [sysConfig, setSysConfig] = useState<Record<string, string>>({});

  // Loading
  const [loadingData, setLoadingData] = useState(false);

  // Filter/Search States
  const [semSearch, setSemSearch] = useState("");
  const [classSearch, setClassSearch] = useState("");
  const [userSearch, setUserSearch] = useState("");
  const [wlSearch, setWlSearch] = useState("");
  const [critSearch, setCritSearch] = useState("");
  const [selectedClassroomFilter, setSelectedClassroomFilter] = useState<string>("all");

  // Pagination States
  const [semPage, setSemPage] = useState(1);
  const [semPageSize, setSemPageSize] = useState(20);
  const [classPage, setClassPage] = useState(1);
  const [classPageSize, setClassPageSize] = useState(20);
  const [userPage, setUserPage] = useState(1);
  const [userPageSize, setUserPageSize] = useState(20);
  const [wlPage, setWlPage] = useState(1);
  const [wlPageSize, setWlPageSize] = useState(20);
  const [critPage, setCritPage] = useState(1);
  const [critPageSize, setCritPageSize] = useState(20);

  // Reports & Export State
  const [reportData, setReportData] = useState<{ workloads: Workload[]; criteria?: FinalProjectCriteria[]; rows: any[] } | null>(null);
  const [reportSearch, setReportSearch] = useState("");
  const [reportClassroom, setReportClassroom] = useState<string>("all");
  const [reportPage, setReportPage] = useState(1);
  const [reportPageSize, setReportPageSize] = useState(20);
  const [openExportDialog, setOpenExportDialog] = useState(false);

  // Dialog States
  const [openSemDialog, setOpenSemDialog] = useState(false);
  const [openClassDialog, setOpenClassDialog] = useState(false);
  const [openAssignTeacherDialog, setOpenAssignTeacherDialog] = useState(false);
  const [openUserDialog, setOpenUserDialog] = useState(false);
  const [openImportUserDialog, setOpenImportUserDialog] = useState(false);
  const [openWorkloadDialog, setOpenWorkloadDialog] = useState(false);
  const [openCriteriaDialog, setOpenCriteriaDialog] = useState(false);

  // Selected for Edit
  const [editingSem, setEditingSem] = useState<Semester | null>(null);
  const [editingClassroom, setEditingClassroom] = useState<Classroom | null>(null);
  const [assigningClassroom, setAssigningClassroom] = useState<Classroom | null>(null);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [editingWorkload, setEditingWorkload] = useState<Workload | null>(null);
  const [editingCriteria, setEditingCriteria] = useState<FinalProjectCriteria | null>(null);

  // Form States
  // 1. Sem
  const [semForm, setSemForm] = useState({ year: 2569, term: 1, is_active: false });
  // 2. Class
  const [classForm, setClassForm] = useState({ name: "", semester_id: 0 });
  const [selectedTeacherIDs, setSelectedTeacherIDs] = useState<number[]>([]);
  // 3. User
  const [userForm, setUserForm] = useState({ username: "", password: "", full_name: "", email: "", role: "student" as any, classroom_id: 0 });
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importingUsers, setImportingUsers] = useState(false);
  // 4. Workload
  const [workloadForm, setWorkloadForm] = useState({ 
    title: "", 
    description: "", 
    deadline: "", 
    max_score: 10, 
    semester_id: 0,
    sample_file_path: "",
    sample_link_url: "",
    type: "group" as "individual" | "group"
  });
  const [uploadingSampleFile, setUploadingSampleFile] = useState(false);
  // 5. Criteria
  const [criteriaForm, setCriteriaForm] = useState({ title: "", max_score: 10, weight: 10, semester_id: 0 });
  // 6. Config
  const [configForm, setConfigForm] = useState<Record<string, string>>({});
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingFavicon, setUploadingFavicon] = useState(false);
  const [uploadingPopupImage, setUploadingPopupImage] = useState(false);
  const [uploadingFinalAttachment, setUploadingFinalAttachment] = useState(false);

  // Tabs layout
  const adminTabs = [
    { id: "overview", label: "ภาพรวมการส่งงาน", icon: <LayoutGrid className="h-4 w-4" /> },
    { id: "reports", label: "รายงานคะแนน & ส่งออก", icon: <FileSpreadsheet className="h-4 w-4" /> },
    { id: "semesters", label: "จัดการเทอม", icon: <Calendar className="h-4 w-4" /> },
    { id: "classrooms", label: "จัดการห้องเรียน", icon: <Layers className="h-4 w-4" /> },
    { id: "users", label: "จัดการผู้ใช้", icon: <Users className="h-4 w-4" /> },
    { id: "workloads", label: "จัดการภาระงาน", icon: <Briefcase className="h-4 w-4" /> },
    { id: "criteria", label: "เกณฑ์ประเมิน", icon: <Award className="h-4 w-4" /> },
    { id: "settings", label: "ตั้งค่าระบบ", icon: <Settings className="h-4 w-4" /> },
  ];

  // Fetch initial data based on active tab
  const fetchData = async () => {
    setLoadingData(true);
    try {
      const semQuery = selectedSemester ? `?semester_id=${selectedSemester}` : "";
      if (activeTab === "semesters") {
        const res = await apiRequest<Semester[]>("/admin/semesters");
        setSemesters(res);
      } else if (activeTab === "classrooms") {
        const resClass = await apiRequest<Classroom[]>(`/admin/classrooms${semQuery}`);
        setClassrooms(resClass);
        const resSem = await apiRequest<Semester[]>("/admin/semesters");
        setSemesters(resSem);
        const resTeach = await apiRequest<User[]>("/admin/users?role=teacher");
        setTeachers(resTeach);
      } else if (activeTab === "users") {
        const resUsers = await apiRequest<User[]>("/admin/users");
        setUsers(resUsers);
        const resClass = await apiRequest<Classroom[]>(`/admin/classrooms${semQuery}`);
        setClassrooms(resClass);
      } else if (activeTab === "workloads") {
        const res = await apiRequest<Workload[]>(`/admin/workloads${semQuery}`);
        setWorkloads(res);
        const resSem = await apiRequest<Semester[]>("/admin/semesters");
        setSemesters(resSem);
      } else if (activeTab === "criteria") {
        const res = await apiRequest<FinalProjectCriteria[]>(`/admin/criteria${semQuery}`);
        setCriteria(res);
        const resSem = await apiRequest<Semester[]>("/admin/semesters");
        setSemesters(resSem);
      } else if (activeTab === "reports") {
        const resSem = await apiRequest<Semester[]>("/admin/semesters");
        setSemesters(resSem);
        const resClass = await apiRequest<Classroom[]>(`/admin/classrooms${semQuery}`);
        setClassrooms(resClass);
        await fetchReport();
      } else if (activeTab === "settings") {
        const res = await apiRequest<Record<string, string>>("/admin/settings");
        setSysConfig(res);
        setConfigForm(res);
      }
    } catch (err: any) {
      toast.error("ดึงข้อมูลไม่สำเร็จ: " + err.message);
    } finally {
      setLoadingData(false);
    }
  };

  const fetchReport = async () => {
    try {
      const sem = selectedSemester || "";
      let query = "";
      if (reportClassroom && reportClassroom !== "all") {
        query = `?classroom_id=${reportClassroom}${sem ? `&semester_id=${sem}` : ""}`;
      } else if (sem) {
        query = `?semester_id=${sem}`;
      }
      const res = await apiRequest(`/dashboard/report${query}`);
      setReportData(res);
    } catch (err: any) {
      console.error("Failed to load report:", err);
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
    } catch (err: any) {
      console.error("Failed to load semesters:", err);
    }
  };

  useEffect(() => {
    if (user?.role === "admin") {
      fetchSemesters();
    }
  }, [user]);

  useEffect(() => {
    if (user?.role === "admin") {
      fetchData();
    }
    setSemSearch("");
    setClassSearch("");
    setUserSearch("");
    setWlSearch("");
    setCritSearch("");
    setSelectedClassroomFilter("all");
    setReportSearch("");
    setReportClassroom("all");
    setReportPage(1);
    setSemPage(1);
    setClassPage(1);
    setUserPage(1);
    setWlPage(1);
    setCritPage(1);
  }, [activeTab, selectedSemester]);

  // Reset pages on search/filter changes
  useEffect(() => {
    setSemPage(1);
  }, [semSearch]);

  useEffect(() => {
    setClassPage(1);
  }, [classSearch]);

  useEffect(() => {
    setUserPage(1);
  }, [userSearch, selectedClassroomFilter]);

  useEffect(() => {
    setWlPage(1);
  }, [wlSearch]);

  useEffect(() => {
    setCritPage(1);
  }, [critSearch]);

  useEffect(() => {
    setReportPage(1);
  }, [reportSearch]);

  useEffect(() => {
    if (activeTab === "reports") {
      fetchReport();
    }
  }, [reportClassroom]);

  // SEMESTER FUNCTIONS
  const handleSemSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingSem) {
        await apiRequest(`/admin/semesters/${editingSem.id}`, "PUT", semForm);
        toast.success("แก้ไขปีการศึกษาสำเร็จ");
      } else {
        await apiRequest("/admin/semesters", "POST", semForm);
        toast.success("สร้างปีการศึกษาสำเร็จ");
      }
      setOpenSemDialog(false);
      setEditingSem(null);
      fetchData();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleSemDelete = async (id: number) => {
    if (!confirm("คุณต้องการลบปีการศึกษานี้ใช่หรือไม่? (การลบห้องเรียนและกลุ่มงานที่เชื่อมโยงอาจเกิดขึ้น)")) return;
    try {
      await apiRequest(`/admin/semesters/${id}`, "DELETE");
      toast.success("ลบปีการศึกษาสำเร็จ");
      fetchData();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  // CLASSROOM FUNCTIONS
  const handleClassSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (classForm.semester_id === 0) {
        const active = semesters.find(s => s.is_active);
        if (active) classForm.semester_id = active.id;
      }
      
      if (editingClassroom) {
        await apiRequest(`/admin/classrooms/${editingClassroom.id}`, "PUT", classForm);
        toast.success("แก้ไขห้องเรียนสำเร็จ");
      } else {
        await apiRequest("/admin/classrooms", "POST", classForm);
        toast.success("สร้างห้องเรียนสำเร็จ");
      }
      setOpenClassDialog(false);
      setEditingClassroom(null);
      fetchData();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleAssignTeacherSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assigningClassroom) return;
    try {
      await apiRequest(`/admin/classrooms/${assigningClassroom.id}/teachers`, "POST", {
        teacher_ids: selectedTeacherIDs
      });
      toast.success("มอบหมายอาจารย์สอนประจำห้องสำเร็จ");
      setOpenAssignTeacherDialog(false);
      setAssigningClassroom(null);
      fetchData();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleClassDelete = async (id: number) => {
    if (!confirm("คุณต้องการลบห้องเรียนนี้ใช่หรือไม่?")) return;
    try {
      await apiRequest(`/admin/classrooms/${id}`, "DELETE");
      toast.success("ลบห้องเรียนสำเร็จ");
      fetchData();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  // USER FUNCTIONS
  const handleUserSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingUser) {
        await apiRequest(`/admin/users/${editingUser.id}`, "PUT", {
          full_name: userForm.full_name,
          email: userForm.email,
          password: userForm.password,
          classroom_id: userForm.classroom_id
        });
        toast.success("แก้ไขข้อมูลผู้ใช้สำเร็จ");
      } else {
        await apiRequest("/admin/users", "POST", userForm);
        toast.success("สร้างผู้ใช้งานใหม่สำเร็จ");
      }
      setOpenUserDialog(false);
      setEditingUser(null);
      fetchData();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleDownloadTemplate = async () => {
    try {
      const token = getToken();
      const response = await fetch(`${API_BASE}/admin/users/import/template`, {
        headers: {
          "Authorization": `Bearer ${token}`
        }
      });
      if (!response.ok) throw new Error("ดาวน์โหลดเทมเพลตไม่สำเร็จ");
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "user_import_template.xlsx";
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleImportUsersSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!importFile) {
      toast.error("กรุณาเลือกไฟล์ Excel สำหรับนำเข้าข้อมูล");
      return;
    }
    if (importingUsers) return;

    try {
      setImportingUsers(true);
      const formData = new FormData();
      formData.append("file", importFile);

      const res = await apiRequest("/admin/users/import", "POST", formData);
      toast.success(`นำเข้าผู้ใช้สำเร็จจำนวน ${res.imported} บัญชี`);
      setOpenImportUserDialog(false);
      setImportFile(null);
      fetchData();
    } catch (err: any) {
      toast.error("นำเข้าข้อมูลผู้ใช้ล้มเหลว: " + err.message);
    } finally {
      setImportingUsers(false);
    }
  };

  const handleUserDelete = async (id: number) => {
    if (!confirm("คุณต้องการลบผู้ใช้งานนี้ใช่หรือไม่?")) return;
    try {
      await apiRequest(`/admin/users/${id}`, "DELETE");
      toast.success("ลบผู้ใช้สำเร็จ");
      fetchData();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  // WORKLOAD FUNCTIONS
  const handleWorkloadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const active = semesters.find(s => s.is_active);
      const formPayload = {
        ...workloadForm,
        deadline: new Date(workloadForm.deadline).toISOString(),
        semester_id: active ? active.id : 0
      };

      if (editingWorkload) {
        await apiRequest(`/admin/workloads/${editingWorkload.id}`, "PUT", formPayload);
        toast.success("แก้ไขภาระงานสำเร็จ");
      } else {
        await apiRequest("/admin/workloads", "POST", formPayload);
        toast.success("สร้างภาระงานสำเร็จ");
      }
      setOpenWorkloadDialog(false);
      setEditingWorkload(null);
      fetchData();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleWorkloadDelete = async (id: number) => {
    if (!confirm("ต้องการลบภาระงานนี้ใช่หรือไม่? สมาชิกที่ส่งไฟล์เข้ามาระบบจะลบข้อมูลออกทั้งหมด")) return;
    try {
      await apiRequest(`/admin/workloads/${id}`, "DELETE");
      toast.success("ลบภาระงานสำเร็จ");
      fetchData();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleSampleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingSampleFile(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await apiRequest<{ url: string; filename: string }>("/upload", "POST", formData);
      setWorkloadForm(prev => ({ ...prev, sample_file_path: res.url }));
      toast.success("อัปโหลดไฟล์ตัวอย่างสำเร็จ");
    } catch (err: any) {
      toast.error("อัปโหลดไฟล์ตัวอย่างล้มเหลว: " + err.message);
    } finally {
      setUploadingSampleFile(false);
    }
  };

  const handleClearSampleFile = () => {
    setWorkloadForm(prev => ({ ...prev, sample_file_path: "" }));
  };

  // CRITERIA FUNCTIONS
  const handleCriteriaSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const active = semesters.find(s => s.is_active);
      const formPayload = {
        ...criteriaForm,
        semester_id: active ? active.id : 0
      };

      if (editingCriteria) {
        await apiRequest(`/admin/criteria/${editingCriteria.id}`, "PUT", formPayload);
        toast.success("แก้ไขเกณฑ์คะแนนสำเร็จ");
      } else {
        await apiRequest("/admin/criteria", "POST", formPayload);
        toast.success("สร้างเกณฑ์คะแนนสำเร็จ");
      }
      setOpenCriteriaDialog(false);
      setEditingCriteria(null);
      fetchData();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleCriteriaDelete = async (id: number) => {
    if (!confirm("ต้องการลบเกณฑ์คะแนน Final Project ข้อนี้ใช่หรือไม่?")) return;
    try {
      await apiRequest(`/admin/criteria/${id}`, "DELETE");
      toast.success("ลบเกณฑ์สำเร็จ");
      fetchData();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  // CONFIG SYSTEM SETTINGS FUNCTIONS
  const handleConfigSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiRequest("/admin/settings", "PUT", configForm);
      toast.success("บันทึกการตั้งค่าระบบเรียบร้อยแล้ว");
      updateLocalSettings(configForm);
      fetchData();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    if (!file.type.startsWith("image/")) {
      toast.error("กรุณาเลือกไฟล์รูปภาพเท่านั้น");
      return;
    }

    setUploadingLogo(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await apiRequest("/upload", "POST", formData);
      setConfigForm(prev => ({ ...prev, logo_path: res.url }));
      toast.success("อัปโหลดโลโก้สำเร็จ (อย่าลืมคลิกบันทึกการตั้งค่า)");
    } catch (err: any) {
      toast.error("อัปโหลดโลโก้ล้มเหลว: " + err.message);
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleFaviconUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const isValidType = file.type.startsWith("image/") || file.name.endsWith(".ico");
    if (!isValidType) {
      toast.error("กรุณาเลือกไฟล์รูปภาพหรือไฟล์ .ico เท่านั้น");
      return;
    }

    setUploadingFavicon(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await apiRequest("/upload", "POST", formData);
      setConfigForm(prev => ({ ...prev, favicon_path: res.url }));
      toast.success("อัปโหลด Favicon สำเร็จ (อย่าลืมคลิกบันทึกการตั้งค่า)");
    } catch (err: any) {
      toast.error("อัปโหลด Favicon ล้มเหลว: " + err.message);
    } finally {
      setUploadingFavicon(false);
    }
  };

  const handleRemoveLogo = () => {
    setConfigForm(prev => ({ ...prev, logo_path: "" }));
  };

  const handleRemoveFavicon = () => {
    setConfigForm(prev => ({ ...prev, favicon_path: "" }));
  };

  const handlePopupImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("กรุณาเลือกไฟล์รูปภาพเท่านั้น");
      return;
    }

    setUploadingPopupImage(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await apiRequest<{ url: string; filename: string }>("/upload", "POST", formData);
      setConfigForm(prev => ({ ...prev, popup_image: res.url }));
      toast.success("อัปโหลดรูปภาพประกาศสำเร็จ (อย่าลืมคลิกบันทึกการตั้งค่า)");
    } catch (err: any) {
      toast.error("อัปโหลดรูปภาพประกาศล้มเหลว: " + err.message);
    } finally {
      setUploadingPopupImage(false);
    }
  };

  const handleRemovePopupImage = () => {
    setConfigForm(prev => ({ ...prev, popup_image: "" }));
  };

  const handleFinalAttachmentUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingFinalAttachment(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await apiRequest<{ url: string; filename: string }>("/upload", "POST", formData);
      setConfigForm(prev => ({ ...prev, final_project_attachment_path: res.url }));
      toast.success("อัปโหลดไฟล์/รูปภาพ Final Project สำเร็จ (อย่าลืมคลิกบันทึกการตั้งค่า)");
    } catch (err: any) {
      toast.error("อัปโหลดไฟล์ Final Project ล้มเหลว: " + err.message);
    } finally {
      setUploadingFinalAttachment(false);
    }
  };

  const handleRemoveFinalAttachment = () => {
    setConfigForm(prev => ({ ...prev, final_project_attachment_path: "" }));
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

  if (user?.role !== "admin") {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50 text-slate-800">
        <div className="text-center p-8 bg-white border border-slate-200 rounded-2xl shadow-sm text-slate-800 max-w-md">
          <ShieldAlert className="h-12 w-12 text-rose-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold">ไม่มีสิทธิ์เข้าใช้งาน</h2>
          <p className="text-slate-500 mt-2 text-sm">เฉพาะผู้ดูแลระบบเท่านั้นที่สามารถเข้าถึงหน้านี้ได้</p>
        </div>
      </div>
    );
  }

  const activeSem = semesters.find(s => s.is_active);
  const currentViewingSem = semesters.find(s => s.id.toString() === selectedSemester) || activeSem;

  return (
    <div className="flex min-h-screen flex-col md:flex-row text-slate-800">
      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} tabs={adminTabs} />

      <div className="flex-1 flex flex-col min-h-screen overflow-x-hidden pb-16 md:pb-8">
        <main className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 mt-8 flex-1">
        {activeTab === "overview" ? (
          <WorkloadOverview />
        ) : (
          <>
            {/* Active Semester & Filter Banner */}
            <div className="mb-6 bg-white/70 backdrop-blur border border-slate-100 shadow-sm rounded-lg px-4 py-3 flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <Calendar className="h-5 w-5 text-primary" />
                <span className="text-sm font-semibold text-slate-600">
              ภาคเรียนที่กำลังใช้งาน:{" "}
              {activeSem ? (
                <span className="text-primary font-bold">
                  ภาคเรียนที่ {activeSem.term}/{activeSem.year}
                </span>
              ) : (
                <span className="text-rose-450 font-bold">ไม่ได้เปิดใช้ภาคเรียน</span>
              )}
            </span>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-xs font-semibold text-slate-600">
              ปีการศึกษา/ภาคเรียนที่เลือกดู:
            </span>
            <Select value={selectedSemester} onValueChange={(val) => setSelectedSemester(val || "")}>
              <SelectTrigger className="w-[180px] h-8 text-xs border-slate-200 text-slate-800">
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
            {currentViewingSem?.is_active && (
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-tu-pink/20 text-tu-pink border border-tu-pink/30">
                Active Status
              </span>
            )}
          </div>
        </div>

        {/* Tab Content */}
        {loadingData ? (
          <div className="flex flex-col items-center justify-center py-24">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary"></div>
            <p className="mt-4 text-slate-500 text-sm">กำลังดาวน์โหลดข้อมูล...</p>
          </div>
        ) : (
          <>
            {/* REPORTS TAB */}
            {activeTab === "reports" && (
              <div className="space-y-6">
                {/* Filters */}
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex flex-wrap gap-4 items-center print:hidden justify-between">
                  <div className="flex flex-wrap gap-4 items-center w-full sm:w-auto">
                    <div className="w-56 space-y-1.5">
                      <label className="text-xs text-slate-500 font-semibold">ตัวกรองห้องเรียน</label>
                      <Select 
                        value={reportClassroom} 
                        onValueChange={(val) => {
                          setReportClassroom(val || "all");
                        }}
                      >
                        <SelectTrigger className="bg-white border-slate-200 text-xs">
                          <SelectValue placeholder="ทุกห้องเรียน...">
                            {reportClassroom === "all" ? "ทุกห้องเรียน..." : classrooms.find(c => c.id.toString() === reportClassroom)?.name || "ทุกห้องเรียน..."}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent className="bg-white border-slate-200 text-slate-800">
                          <SelectItem value="all">ทุกห้องเรียน...</SelectItem>
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
                        className="bg-white border-slate-200 text-slate-800 text-xs py-1 h-9"
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
                      onClick={() => window.print()}
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
                          ห้องเรียน: {reportClassroom !== "all" ? classrooms.find(c => c.id.toString() === reportClassroom)?.name : "ทุกห้องเรียน"} | 
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
                            const filteredReportRows = reportData ? reportData.rows.filter(row => 
                              row.group_name.toLowerCase().includes(reportSearch.toLowerCase()) ||
                              row.classroom_name.toLowerCase().includes(reportSearch.toLowerCase()) ||
                              (row.project_topic || "").toLowerCase().includes(reportSearch.toLowerCase()) ||
                              (row.members ? row.members.some((m: string) => m.toLowerCase().includes(reportSearch.toLowerCase())) : false)
                            ) : [];
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
                      {(() => {
                        const filteredReportRows = reportData ? reportData.rows.filter(row => 
                          row.group_name.toLowerCase().includes(reportSearch.toLowerCase()) ||
                          row.classroom_name.toLowerCase().includes(reportSearch.toLowerCase()) ||
                          (row.project_topic || "").toLowerCase().includes(reportSearch.toLowerCase()) ||
                          (row.members ? row.members.some((m: string) => m.toLowerCase().includes(reportSearch.toLowerCase())) : false)
                        ) : [];
                        return renderPagination(reportPage, setReportPage, reportPageSize, setReportPageSize, filteredReportRows.length);
                      })()}
                    </CardContent>
                  </Card>
                )}
              </div>
            )}

            {/* SEMESTERS TAB */}
            {activeTab === "semesters" && (
              <Card className="bg-white border-slate-100 text-slate-800 shadow-sm rounded-2xl">
                <CardHeader className="flex flex-row items-center justify-between border-b border-slate-100 pb-4">
                  <div>
                    <CardTitle className="text-lg font-bold">ตั้งค่าปีการศึกษาและภาคเรียน</CardTitle>
                    <CardDescription className="text-slate-500 text-xs">ระบุช่วงเวลาภาคเรียนปัจจุบันที่เปิดให้นักเรียนส่งงาน</CardDescription>
                  </div>
                  <Button 
                    onClick={() => {
                      setEditingSem(null);
                      setSemForm({ year: 2569, term: 1, is_active: false });
                      setOpenSemDialog(true);
                    }}
                    className="bg-primary hover:bg-primary/90 text-white gap-1 transition-colors duration-200 cursor-pointer"
                  >
                    <Plus className="h-4 w-4" /> สร้างภาคเรียน
                  </Button>
                </CardHeader>
                <CardContent className="pt-6">
                  <div className="mb-4 max-w-sm">
                    <Input
                      placeholder="ค้นหาปีการศึกษา หรือภาคเรียน..."
                      value={semSearch}
                      onChange={(e) => setSemSearch(e.target.value)}
                      className="bg-slate-50 border-slate-100 text-slate-800"
                    />
                  </div>
                  <Table>
                    <TableHeader className="border-slate-100">
                      <TableRow className="border-slate-100 hover:bg-slate-50/50">
                        <TableHead className="text-slate-500">ปีการศึกษา</TableHead>
                        <TableHead className="text-slate-500">ภาคเรียน</TableHead>
                        <TableHead className="text-slate-500">สถานะเปิดใช้งาน</TableHead>
                        <TableHead className="text-slate-500 text-right">เครื่องมือ</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(() => {
                        const filteredSems = semesters.filter(sem => 
                          sem.year.toString().includes(semSearch) || 
                          `ภาคเรียนที่ ${sem.term}`.toLowerCase().includes(semSearch.toLowerCase())
                        );
                        const paginatedSems = filteredSems.slice((semPage - 1) * semPageSize, semPage * semPageSize);

                        if (filteredSems.length === 0) {
                          return (
                            <TableRow>
                              <TableCell colSpan={4} className="text-center py-6 text-slate-500 italic">ไม่พบข้อมูลปีการศึกษา</TableCell>
                            </TableRow>
                          );
                        }

                        return paginatedSems.map((sem) => (
                          <TableRow key={sem.id} className="border-slate-100 hover:bg-slate-50/30">
                            <TableCell className="font-semibold">{sem.year}</TableCell>
                            <TableCell>ภาคเรียนที่ {sem.term}</TableCell>
                            <TableCell>
                              {sem.is_active ? (
                                <span className="text-xs bg-emerald-50 text-emerald-700 px-2.5 py-0.5 rounded-full border border-emerald-200 font-semibold">ใช้งานอยู่</span>
                              ) : (
                                <span className="text-xs bg-slate-800 text-slate-500 px-2 py-0.5 rounded-full border border-slate-700">ปิดการทำงาน</span>
                              )}
                            </TableCell>
                            <TableCell className="text-right flex items-center justify-end gap-2">
                              <Button 
                                variant="outline" 
                                size="sm"
                                onClick={() => {
                                  setEditingSem(sem);
                                  setSemForm({ year: sem.year, term: sem.term, is_active: sem.is_active });
                                  setOpenSemDialog(true);
                                }}
                                className="border-slate-100 hover:bg-slate-800 text-slate-600"
                              >
                                <Edit className="h-3.5 w-3.5" />
                              </Button>
                              <Button 
                                variant="destructive" 
                                size="sm"
                                onClick={() => handleSemDelete(sem.id)}
                              >
                                <Trash className="h-3.5 w-3.5" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ));
                      })()}
                    </TableBody>
                  </Table>
                  {(() => {
                    const filteredSems = semesters.filter(sem => 
                      sem.year.toString().includes(semSearch) || 
                      `ภาคเรียนที่ ${sem.term}`.toLowerCase().includes(semSearch.toLowerCase())
                    );
                    return renderPagination(semPage, setSemPage, semPageSize, setSemPageSize, filteredSems.length);
                  })()}
                </CardContent>
              </Card>
            )}

            {/* CLASSROOMS TAB */}
            {activeTab === "classrooms" && (
              <Card className="bg-white border-slate-100 text-slate-800 shadow-sm rounded-2xl">
                <CardHeader className="flex flex-row items-center justify-between border-b border-slate-100 pb-4">
                  <div>
                    <CardTitle className="text-lg font-bold">ห้องเรียนในภาคการเรียนนี้</CardTitle>
                    <CardDescription className="text-slate-500 text-xs">สร้างห้องเรียนและมอบหมายผู้ดูแลเพื่อตรวจงานกลุ่มที่สังกัดในห้อง</CardDescription>
                  </div>
                  <Button 
                    onClick={() => {
                      setEditingClassroom(null);
                      setClassForm({ name: "", semester_id: currentViewingSem ? currentViewingSem.id : 0 });
                      setOpenClassDialog(true);
                    }}
                    className="bg-primary hover:bg-primary/90 text-white gap-1 transition-colors duration-200 cursor-pointer"
                  >
                    <Plus className="h-4 w-4" /> สร้างห้องเรียน
                  </Button>
                </CardHeader>
                <CardContent className="pt-6">
                  <div className="mb-4 max-w-sm">
                    <Input
                      placeholder="ค้นหาห้องเรียน หรืออาจารย์ประจำชั้น..."
                      value={classSearch}
                      onChange={(e) => setClassSearch(e.target.value)}
                      className="bg-slate-50 border-slate-100 text-slate-800"
                    />
                  </div>
                  <Table>
                    <TableHeader className="border-slate-100">
                      <TableRow className="border-slate-100 hover:bg-slate-50/50">
                        <TableHead className="text-slate-500">ห้องเรียน</TableHead>
                        <TableHead className="text-slate-500">ปีการศึกษา/ภาคเรียน</TableHead>
                        <TableHead className="text-slate-500">อาจารย์ผู้สอนประจำห้อง</TableHead>
                        <TableHead className="text-slate-500 text-right">เครื่องมือ</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(() => {
                        const filteredClasses = classrooms.filter(cls => 
                          cls.name.toLowerCase().includes(classSearch.toLowerCase()) ||
                          (cls.semester ? `เทอม ${cls.semester.term}/${cls.semester.year}` : "").toLowerCase().includes(classSearch.toLowerCase()) ||
                          (cls.teachers && cls.teachers.some(t => t.full_name.toLowerCase().includes(classSearch.toLowerCase())))
                        );
                        const paginatedClasses = filteredClasses.slice((classPage - 1) * classPageSize, classPage * classPageSize);

                        if (filteredClasses.length === 0) {
                          return (
                            <TableRow>
                              <TableCell colSpan={4} className="text-center py-6 text-slate-500 italic">ไม่พบข้อมูลห้องเรียน</TableCell>
                            </TableRow>
                          );
                        }

                        return paginatedClasses.map((cls) => (
                          <TableRow key={cls.id} className="border-slate-100 hover:bg-slate-50/30">
                            <TableCell className="font-semibold text-primary">{cls.name}</TableCell>
                            <TableCell>
                              {cls.semester ? `เทอม ${cls.semester.term}/${cls.semester.year}` : "ไม่ระบุ"}
                            </TableCell>
                            <TableCell>
                              {cls.teachers && cls.teachers.length > 0 ? (
                                <div className="flex flex-wrap gap-1.5">
                                  {cls.teachers.map((t) => (
                                    <span key={t.id} className="text-xs bg-slate-800 text-slate-600 border border-slate-700 px-2 py-0.5 rounded">
                                      {t.full_name}
                                    </span>
                                  ))}
                                </div>
                              ) : (
                                <span className="text-xs text-slate-500 italic">ไม่มีผู้รับผิดชอบ</span>
                              )}
                            </TableCell>
                            <TableCell className="text-right flex items-center justify-end gap-2">
                              <Button 
                                variant="outline" 
                                size="sm"
                                onClick={() => {
                                  setAssigningClassroom(cls);
                                  setSelectedTeacherIDs(cls.teachers ? cls.teachers.map(t => t.id) : []);
                                  setOpenAssignTeacherDialog(true);
                                }}
                                className="border-slate-205 text-xs text-primary hover:bg-slate-100 hover:text-primary"
                              >
                                มอบหมายครู
                              </Button>
                              <Button 
                                variant="outline" 
                                size="sm"
                                onClick={() => {
                                  setEditingClassroom(cls);
                                  setClassForm({ name: cls.name, semester_id: cls.semester_id });
                                  setOpenClassDialog(true);
                                }}
                                className="border-slate-200 text-xs text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                              >
                                <Edit className="h-3.5 w-3.5" />
                              </Button>
                              <Button 
                                variant="destructive" 
                                size="sm"
                                onClick={() => handleClassDelete(cls.id)}
                              >
                                <Trash className="h-3.5 w-3.5" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ));
                      })()}
                    </TableBody>
                  </Table>
                  {(() => {
                    const filteredClasses = classrooms.filter(cls => 
                      cls.name.toLowerCase().includes(classSearch.toLowerCase()) ||
                      (cls.semester ? `เทอม ${cls.semester.term}/${cls.semester.year}` : "").toLowerCase().includes(classSearch.toLowerCase()) ||
                      (cls.teachers && cls.teachers.some(t => t.full_name.toLowerCase().includes(classSearch.toLowerCase())))
                    );
                    return renderPagination(classPage, setClassPage, classPageSize, setClassPageSize, filteredClasses.length);
                  })()}
                </CardContent>
              </Card>
            )}

            {/* USERS TAB */}
            {activeTab === "users" && (
              <Card className="bg-white border-slate-100 text-slate-800 shadow-sm rounded-2xl">
                <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 pb-4 gap-4">
                  <div>
                    <CardTitle className="text-lg font-bold">รายชื่อผู้ใช้งานระบบ</CardTitle>
                    <CardDescription className="text-slate-500 text-xs">จัดการบัญชีผู้ใช้ระบบ (อาจารย์ แอดมิน หรือนักเรียน)</CardDescription>
                  </div>
                  <div className="flex gap-2">
                    <Button 
                      onClick={() => {
                        setImportFile(null);
                        setOpenImportUserDialog(true);
                      }}
                      variant="outline"
                      className="border-slate-200 hover:bg-slate-100 text-slate-700 gap-1"
                    >
                      <FileSpreadsheet className="h-4 w-4 text-emerald-600" /> นำเข้าแบบกลุ่ม (Excel)
                    </Button>
                    <Button 
                      onClick={() => {
                        setEditingUser(null);
                        setUserForm({ username: "", password: "", full_name: "", email: "", role: "student", classroom_id: classrooms[0]?.id || 0 });
                        setOpenUserDialog(true);
                      }}
                      className="bg-primary hover:bg-primary/90 text-white gap-1 transition-colors duration-200 cursor-pointer"
                    >
                      <Plus className="h-4 w-4" /> เพิ่มผู้ใช้เดี่ยว
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="pt-6">
                  <div className="mb-4 flex flex-col sm:flex-row gap-4 max-w-xl">
                    <div className="flex-1">
                      <Input
                        placeholder="ค้นหาชื่อผู้ใช้, ชื่อ-นามสกุล, สิทธิ์, อีเมล..."
                        value={userSearch}
                        onChange={(e) => setUserSearch(e.target.value)}
                        className="bg-slate-50 border-slate-100 text-slate-800"
                      />
                    </div>
                    <div className="w-48">
                      <Select 
                        value={selectedClassroomFilter} 
                        onValueChange={(val) => setSelectedClassroomFilter(val || "all")}
                      >
                        <SelectTrigger className="bg-slate-50 border-slate-100">
                          <SelectValue placeholder="กรองตามห้องเรียน...">
                            {(val) => val === "all" ? "ทุกห้องเรียน" : classrooms.find(c => c.id.toString() === val)?.name || val}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent className="bg-white border-slate-200 text-slate-800">
                          <SelectItem value="all">ทุกห้องเรียน</SelectItem>
                          {classrooms.map(c => (
                            <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <Table>
                    <TableHeader className="border-slate-100">
                      <TableRow className="border-slate-100 hover:bg-slate-50/50">
                        <TableHead className="text-slate-500">Username</TableHead>
                        <TableHead className="text-slate-500">ชื่อ-นามสกุล</TableHead>
                        <TableHead className="text-slate-500">สิทธิ์ระบบ (Role)</TableHead>
                        <TableHead className="text-slate-500">ห้องเรียน</TableHead>
                        <TableHead className="text-slate-500">อีเมล</TableHead>
                        <TableHead className="text-slate-500 text-right">เครื่องมือ</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(() => {
                        const filteredUsers = users.filter(u => {
                          const matchesSearch = u.username.toLowerCase().includes(userSearch.toLowerCase()) ||
                            u.full_name.toLowerCase().includes(userSearch.toLowerCase()) ||
                            u.role.toLowerCase().includes(userSearch.toLowerCase()) ||
                            (u.email || "").toLowerCase().includes(userSearch.toLowerCase());

                          const matchesClassroom = selectedClassroomFilter === "all" || 
                            (u.role === "student" && u.classroom_id === parseInt(selectedClassroomFilter));

                          return matchesSearch && matchesClassroom;
                        });
                        const paginatedUsers = filteredUsers.slice((userPage - 1) * userPageSize, userPage * userPageSize);

                        if (filteredUsers.length === 0) {
                          return (
                            <TableRow>
                              <TableCell colSpan={6} className="text-center py-6 text-slate-500 italic">ไม่พบข้อมูลผู้ใช้งาน</TableCell>
                            </TableRow>
                          );
                        }

                        return paginatedUsers.map((u) => (
                          <TableRow key={u.id} className="border-slate-100 hover:bg-slate-50/30">
                            <TableCell className="font-semibold text-slate-600">{u.username}</TableCell>
                            <TableCell>{u.full_name}</TableCell>
                            <TableCell>
                              <span className={`text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded ${
                                u.role === "admin" 
                                  ? "bg-rose-50 text-rose-700 border border-rose-200"
                                  : u.role === "teacher"
                                  ? "bg-cyan-50 text-cyan-700 border border-cyan-200"
                                  : "bg-blue-50 text-blue-700 border border-blue-200"
                              }`}>
                                {u.role}
                              </span>
                            </TableCell>
                            <TableCell className="text-slate-500 text-sm">{u.classroom_name || "-"}</TableCell>
                            <TableCell className="text-slate-500 text-sm">{u.email || "-"}</TableCell>
                            <TableCell className="text-right flex items-center justify-end gap-2">
                              <Button 
                                variant="outline" 
                                size="sm"
                                onClick={() => {
                                  setEditingUser(u);
                                  setUserForm({
                                    username: u.username,
                                    password: "",
                                    full_name: u.full_name,
                                    email: u.email,
                                    role: u.role,
                                    classroom_id: u.classroom_id || 0
                                  });
                                  setOpenUserDialog(true);
                                }}
                                className="border-slate-100 hover:bg-slate-800 text-slate-600"
                              >
                                <Edit className="h-3.5 w-3.5" />
                              </Button>
                              <Button 
                                variant="destructive" 
                                size="sm"
                                onClick={() => handleUserDelete(u.id)}
                              >
                                <Trash className="h-3.5 w-3.5" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ));
                      })()}
                    </TableBody>
                  </Table>
                  {(() => {
                    const filteredUsers = users.filter(u => {
                      const matchesSearch = u.username.toLowerCase().includes(userSearch.toLowerCase()) ||
                        u.full_name.toLowerCase().includes(userSearch.toLowerCase()) ||
                        u.role.toLowerCase().includes(userSearch.toLowerCase()) ||
                        (u.email || "").toLowerCase().includes(userSearch.toLowerCase());

                      const matchesClassroom = selectedClassroomFilter === "all" || 
                        (u.role === "student" && u.classroom_id === parseInt(selectedClassroomFilter));

                      return matchesSearch && matchesClassroom;
                    });
                    return renderPagination(userPage, setUserPage, userPageSize, setUserPageSize, filteredUsers.length);
                  })()}
                </CardContent>
              </Card>
            )}

            {/* WORKLOADS TAB */}
            {activeTab === "workloads" && (
              <Card className="bg-white border-slate-100 text-slate-800 shadow-sm rounded-2xl">
                <CardHeader className="flex flex-row items-center justify-between border-b border-slate-100 pb-4">
                  <div>
                    <CardTitle className="text-lg font-bold">จัดมอบหมายภาระงานประจำภาคการเรียน</CardTitle>
                    <CardDescription className="text-slate-500 text-xs">มอบหมายภาระงานย่อยที่มีกำหนดเวลาส่ง และคะแนนสะสมย่อย</CardDescription>
                  </div>
                  <Button 
                    onClick={() => {
                      setEditingWorkload(null);
                      setWorkloadForm({ 
                        title: "", 
                        description: "", 
                        deadline: "", 
                        max_score: 10, 
                        semester_id: currentViewingSem ? currentViewingSem.id : 0,
                        sample_file_path: "",
                        sample_link_url: "",
                        type: "group"
                      });
                      setOpenWorkloadDialog(true);
                    }}
                    className="bg-primary hover:bg-primary/90 text-white gap-1 transition-colors duration-200 cursor-pointer"
                  >
                    <Plus className="h-4 w-4" /> สร้างภาระงาน
                  </Button>
                </CardHeader>
                <CardContent className="pt-6">
                  <div className="mb-4 max-w-sm">
                    <Input
                      placeholder="ค้นหาหัวข้อ หรือคำอธิบายภาระงาน..."
                      value={wlSearch}
                      onChange={(e) => setWlSearch(e.target.value)}
                      className="bg-slate-50 border-slate-100 text-slate-800"
                    />
                  </div>
                  <Table>
                    <TableHeader className="border-slate-100">
                      <TableRow className="border-slate-100 hover:bg-slate-50/50">
                        <TableHead className="text-slate-500">หัวข้อภาระงาน</TableHead>
                        <TableHead className="text-slate-500">คำอธิบาย</TableHead>
                        <TableHead className="text-slate-500">กำหนดส่ง (Deadline)</TableHead>
                        <TableHead className="text-slate-500">คะแนนเต็ม</TableHead>
                        <TableHead className="text-slate-500 text-right">เครื่องมือ</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(() => {
                        const filteredWorkloads = workloads.filter(wl => 
                          wl.title.toLowerCase().includes(wlSearch.toLowerCase()) ||
                          (wl.description || "").toLowerCase().includes(wlSearch.toLowerCase()) ||
                          wl.max_score.toString().includes(wlSearch)
                        );
                        const paginatedWorkloads = filteredWorkloads.slice((wlPage - 1) * wlPageSize, wlPage * wlPageSize);

                        if (filteredWorkloads.length === 0) {
                          return (
                            <TableRow>
                              <TableCell colSpan={5} className="text-center py-6 text-slate-500 italic">ไม่พบข้อมูลภาระงาน</TableCell>
                            </TableRow>
                          );
                        }

                        return paginatedWorkloads.map((wl) => (
                          <TableRow key={wl.id} className="border-slate-100 hover:bg-slate-50/30">
                            <TableCell className="font-semibold text-slate-700">
                              <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                  <span>{wl.title}</span>
                                  {wl.type === "individual" ? (
                                    <span className="px-2 py-0.5 text-[10px] font-bold bg-blue-100 text-blue-700 rounded-full border border-blue-200">
                                      งานเดี่ยว
                                    </span>
                                  ) : (
                                    <span className="px-2 py-0.5 text-[10px] font-bold bg-emerald-100 text-emerald-700 rounded-full border border-emerald-200">
                                      งานกลุ่ม
                                    </span>
                                  )}
                                </div>
                              </div>
                            </TableCell>
                            <TableCell className="text-slate-500 text-sm max-w-xs">
                              <div className="truncate">{wl.description || "-"}</div>
                              {(wl.sample_file_path || wl.sample_link_url) && (
                                <div className="flex gap-1.5 mt-1 flex-wrap">
                                  {wl.sample_file_path && (
                                    <a 
                                      href={`${BACKEND_URL}${wl.sample_file_path}`} 
                                      target="_blank" 
                                      rel="noopener noreferrer"
                                      className="inline-flex items-center gap-0.5 text-[10px] bg-slate-100 hover:bg-slate-200 text-slate-600 px-1 py-0.5 rounded transition-colors duration-200"
                                    >
                                      ไฟล์ตัวอย่าง
                                    </a>
                                  )}
                                  {wl.sample_link_url && (
                                    <a 
                                      href={wl.sample_link_url} 
                                      target="_blank" 
                                      rel="noopener noreferrer"
                                      className="inline-flex items-center gap-0.5 text-[10px] bg-primary/10 hover:bg-primary/20 text-primary px-1 py-0.5 rounded transition-colors duration-200"
                                    >
                                      ลิงก์ตัวอย่าง
                                    </a>
                                  )}
                                </div>
                              )}
                            </TableCell>
                            <TableCell className="text-rose-700 text-sm font-medium">
                              {new Date(wl.deadline).toLocaleString("th-TH")}
                            </TableCell>
                            <TableCell>{wl.max_score} คะแนน</TableCell>
                            <TableCell className="text-right flex items-center justify-end gap-2">
                              <Button 
                                variant="outline" 
                                size="sm"
                                onClick={() => {
                                  setEditingWorkload(wl);
                                  setWorkloadForm({
                                    title: wl.title,
                                    description: wl.description,
                                    deadline: new Date(wl.deadline).toISOString().substring(0, 16),
                                    max_score: wl.max_score,
                                    semester_id: wl.semester_id,
                                    sample_file_path: wl.sample_file_path || "",
                                    sample_link_url: wl.sample_link_url || "",
                                    type: wl.type || "group"
                                  });
                                  setOpenWorkloadDialog(true);
                                }}
                                className="border-slate-100 hover:bg-slate-100 text-slate-600"
                              >
                                <Edit className="h-3.5 w-3.5" />
                              </Button>
                              <Button 
                                variant="destructive" 
                                size="sm"
                                onClick={() => handleWorkloadDelete(wl.id)}
                              >
                                <Trash className="h-3.5 w-3.5" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ));
                      })()}
                    </TableBody>
                  </Table>
                  {(() => {
                    const filteredWorkloads = workloads.filter(wl => 
                      wl.title.toLowerCase().includes(wlSearch.toLowerCase()) ||
                      (wl.description || "").toLowerCase().includes(wlSearch.toLowerCase()) ||
                      wl.max_score.toString().includes(wlSearch)
                    );
                    return renderPagination(wlPage, setWlPage, wlPageSize, setWlPageSize, filteredWorkloads.length);
                  })()}
                </CardContent>
              </Card>
            )}

            {/* CRITERIA TAB */}
            {activeTab === "criteria" && (
              <Card className="bg-white border-slate-100 text-slate-800 shadow-sm rounded-2xl">
                <CardHeader className="flex flex-row items-center justify-between border-b border-slate-100 pb-4">
                  <div>
                    <CardTitle className="text-lg font-bold">เกณฑ์ประเมิน Final Project (Final Project Criteria)</CardTitle>
                    <CardDescription className="text-slate-500 text-xs">ตั้งสูตรถ่วงน้ำหนักการคิดเกณฑ์ประเมินความสมบูรณ์สำหรับกรรมการประเมินจบ</CardDescription>
                  </div>
                  <Button 
                    onClick={() => {
                      setEditingCriteria(null);
                      setCriteriaForm({ title: "", max_score: 100, weight: 50, semester_id: currentViewingSem ? currentViewingSem.id : 0 });
                      setOpenCriteriaDialog(true);
                    }}
                    className="bg-primary hover:bg-primary/90 text-white gap-1"
                  >
                    <Plus className="h-4 w-4" /> สร้างเกณฑ์
                  </Button>
                </CardHeader>
                <CardContent className="pt-6">
                  <div className="mb-4 max-w-sm">
                    <Input
                      placeholder="ค้นหาเกณฑ์ประเมิน..."
                      value={critSearch}
                      onChange={(e) => setCritSearch(e.target.value)}
                      className="bg-slate-50 border-slate-100 text-slate-800"
                    />
                  </div>
                  <Table>
                    <TableHeader className="border-slate-100">
                      <TableRow className="border-slate-100 hover:bg-slate-50/50">
                        <TableHead className="text-slate-500">หัวข้อการประเมิน</TableHead>
                        <TableHead className="text-slate-500">คะแนนประเมินดิบเต็ม</TableHead>
                        <TableHead className="text-slate-500">สัดส่วนถ่วงน้ำหนัก (Weight %)</TableHead>
                        <TableHead className="text-slate-500 text-right">เครื่องมือ</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(() => {
                        const filteredCriteria = criteria.filter(crit => 
                          crit.title.toLowerCase().includes(critSearch.toLowerCase()) ||
                          crit.max_score.toString().includes(critSearch) ||
                          crit.weight.toString().includes(critSearch)
                        );
                        const paginatedCriteria = filteredCriteria.slice((critPage - 1) * critPageSize, critPage * critPageSize);

                        if (filteredCriteria.length === 0) {
                          return (
                            <TableRow>
                              <TableCell colSpan={4} className="text-center py-6 text-slate-500 italic">ไม่พบข้อมูลเกณฑ์ประเมิน</TableCell>
                            </TableRow>
                          );
                        }

                        return paginatedCriteria.map((crit) => (
                          <TableRow key={crit.id} className="border-slate-100 hover:bg-slate-50/30">
                            <TableCell className="font-semibold text-slate-700">{crit.title}</TableCell>
                            <TableCell>{crit.max_score} คะแนน</TableCell>
                            <TableCell className="text-slate-800 font-bold">{crit.weight}%</TableCell>
                            <TableCell className="text-right flex items-center justify-end gap-2">
                              <Button 
                                variant="outline" 
                                size="sm"
                                onClick={() => {
                                  setEditingCriteria(crit);
                                  setCriteriaForm({
                                    title: crit.title,
                                    max_score: crit.max_score,
                                    weight: crit.weight,
                                    semester_id: crit.semester_id
                                  });
                                  setOpenCriteriaDialog(true);
                                }}
                                className="border-slate-100 hover:bg-slate-100 text-slate-600"
                              >
                                <Edit className="h-3.5 w-3.5" />
                              </Button>
                              <Button 
                                variant="destructive" 
                                size="sm"
                                onClick={() => handleCriteriaDelete(crit.id)}
                              >
                                <Trash className="h-3.5 w-3.5" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ));
                      })()}
                    </TableBody>
                  </Table>
                  {(() => {
                    const filteredCriteria = criteria.filter(crit => 
                      crit.title.toLowerCase().includes(critSearch.toLowerCase()) ||
                      crit.max_score.toString().includes(critSearch) ||
                      crit.weight.toString().includes(critSearch)
                    );
                    return renderPagination(critPage, setCritPage, critPageSize, setCritPageSize, filteredCriteria.length);
                  })()}
                </CardContent>
              </Card>
            )}

            {/* SETTINGS TAB */}
            {activeTab === "settings" && (
              <Card className="bg-white border-slate-100 text-slate-800 shadow-sm rounded-2xl">
                <CardHeader className="border-b border-slate-100 pb-4">
                  <CardTitle className="text-lg font-bold">ตั้งค่าระบบทั่วไปและระบบสี</CardTitle>
                  <CardDescription className="text-slate-500 text-xs">ปรับแต่ง UI, แจ้งเตือน Telegram, และ Popup ประกาศของสถาบัน</CardDescription>
                </CardHeader>
                <CardContent className="pt-6">
                  <form onSubmit={handleConfigSubmit} className="space-y-6">
                    {/* General Settings */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="text-xs font-semibold text-slate-500 uppercase">ชื่อระบบงาน</label>
                        <Input 
                          value={configForm["system_name"] || ""} 
                          onChange={(e) => setConfigForm({ ...configForm, system_name: e.target.value })}
                          className="bg-slate-50 border-slate-100 focus-visible:ring-indigo-500"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-semibold text-slate-500 uppercase">คำอธิบายระบบ</label>
                        <Input 
                          value={configForm["system_description"] || ""} 
                          onChange={(e) => setConfigForm({ ...configForm, system_description: e.target.value })}
                          className="bg-slate-50 border-slate-100 focus-visible:ring-indigo-500"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-semibold text-slate-500 uppercase">Footer Text</label>
                        <Input 
                          value={configForm["footer_text"] || ""} 
                          onChange={(e) => setConfigForm({ ...configForm, footer_text: e.target.value })}
                          className="bg-slate-50 border-slate-100 focus-visible:ring-indigo-500"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-semibold text-slate-500 uppercase">ชื่อสถาบันการศึกษา</label>
                        <Input 
                          value={configForm["institution_name"] || ""} 
                          onChange={(e) => setConfigForm({ ...configForm, institution_name: e.target.value })}
                          className="bg-slate-50 border-slate-100 focus-visible:ring-indigo-500"
                        />
                      </div>
                    </div>

                    {/* Image Settings */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 border-t border-slate-100/80 pt-6">
                      {/* Logo Path Upload */}
                      <div className="space-y-2">
                        <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Logo หลักของระบบ</label>
                        <div className="border border-dashed border-slate-200 rounded-2xl p-4 bg-slate-50 hover:bg-slate-100/30 transition-all duration-200 flex flex-col items-center justify-center min-h-[140px] relative">
                          <input
                            type="file"
                            id="logo-upload-input"
                            accept="image/*"
                            className="hidden"
                            onChange={handleLogoUpload}
                            disabled={uploadingLogo}
                          />
                          {configForm["logo_path"] ? (
                            <div className="flex flex-col items-center gap-3">
                              <div className="relative p-2 bg-white rounded-xl border border-slate-100 shadow-sm max-w-[120px] max-h-[80px] flex items-center justify-center overflow-hidden">
                                <img
                                  src={configForm["logo_path"].startsWith("http") ? configForm["logo_path"] : `${BACKEND_URL}${configForm["logo_path"]}`}
                                  alt="Logo Preview"
                                  className="max-w-full max-h-[60px] object-contain"
                                />
                              </div>
                              <div className="flex gap-2">
                                <label htmlFor="logo-upload-input" className="cursor-pointer text-xs font-medium text-indigo-600 hover:text-indigo-800 bg-white border border-indigo-100 px-3 py-1 rounded-full shadow-sm hover:shadow transition-all">
                                  {uploadingLogo ? "กำลังอัปโหลด..." : "เปลี่ยนรูปภาพ"}
                                </label>
                                <Button
                                  type="button"
                                  onClick={handleRemoveLogo}
                                  variant="ghost"
                                  className="text-xs font-medium text-rose-500 hover:text-rose-700 hover:bg-rose-50 px-3 py-1 h-auto rounded-full"
                                >
                                  ลบออก
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <label htmlFor="logo-upload-input" className="cursor-pointer flex flex-col items-center justify-center space-y-2 text-center p-2 w-full h-full">
                              {uploadingLogo ? (
                                <div className="flex flex-col items-center gap-2">
                                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-600"></div>
                                  <span className="text-xs text-slate-500">กำลังอัปโหลด...</span>
                                </div>
                              ) : (
                                <>
                                  <div className="p-2 bg-indigo-50 text-indigo-600 rounded-full">
                                    <Upload className="h-5 w-5" />
                                  </div>
                                  <span className="text-sm font-medium text-slate-700">คลิกเพื่ออัปโหลดโลโก้</span>
                                  <span className="text-xs text-slate-400">รองรับไฟล์ PNG, JPG, SVG, GIF</span>
                                </>
                              )}
                            </label>
                          )}
                        </div>
                      </div>

                      {/* Favicon Path Upload */}
                      <div className="space-y-2">
                        <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Favicon (ไอคอนบนแท็บบราวเซอร์)</label>
                        <div className="border border-dashed border-slate-200 rounded-2xl p-4 bg-slate-50 hover:bg-slate-100/30 transition-all duration-200 flex flex-col items-center justify-center min-h-[140px] relative">
                          <input
                            type="file"
                            id="favicon-upload-input"
                            accept="image/*,.ico"
                            className="hidden"
                            onChange={handleFaviconUpload}
                            disabled={uploadingFavicon}
                          />
                          {configForm["favicon_path"] ? (
                            <div className="flex flex-col items-center gap-3">
                              <div className="relative p-2 bg-white rounded-xl border border-slate-100 shadow-sm w-12 h-12 flex items-center justify-center overflow-hidden">
                                <img
                                  src={configForm["favicon_path"].startsWith("http") ? configForm["favicon_path"] : `${BACKEND_URL}${configForm["favicon_path"]}`}
                                  alt="Favicon Preview"
                                  className="w-8 h-8 object-contain"
                                />
                              </div>
                              <div className="flex gap-2">
                                <label htmlFor="favicon-upload-input" className="cursor-pointer text-xs font-medium text-indigo-600 hover:text-indigo-800 bg-white border border-indigo-100 px-3 py-1 rounded-full shadow-sm hover:shadow transition-all">
                                  {uploadingFavicon ? "กำลังอัปโหลด..." : "เปลี่ยนไอคอน"}
                                </label>
                                <Button
                                  type="button"
                                  onClick={handleRemoveFavicon}
                                  variant="ghost"
                                  className="text-xs font-medium text-rose-500 hover:text-rose-700 hover:bg-rose-50 px-3 py-1 h-auto rounded-full"
                                >
                                  ลบออก
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <label htmlFor="favicon-upload-input" className="cursor-pointer flex flex-col items-center justify-center space-y-2 text-center p-2 w-full h-full">
                              {uploadingFavicon ? (
                                <div className="flex flex-col items-center gap-2">
                                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-600"></div>
                                  <span className="text-xs text-slate-500">กำลังอัปโหลด...</span>
                                </div>
                              ) : (
                                <>
                                  <div className="p-2 bg-indigo-50 text-indigo-600 rounded-full">
                                    <Upload className="h-5 w-5" />
                                  </div>
                                  <span className="text-sm font-medium text-slate-700">คลิกเพื่ออัปโหลด Favicon</span>
                                  <span className="text-xs text-slate-400">รองรับไฟล์ ICO, PNG, JPG</span>
                                </>
                              )}
                            </label>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Color settings */}
                    <div className="border-t border-slate-100/80 pt-4">
                      <h4 className="text-sm font-bold text-slate-600 mb-3">ธีมสีของเว็บไซต์ (Dynamic Theme Colors)</h4>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="space-y-2">
                          <label className="text-xs text-slate-500">สีหลัก (Primary HEX)</label>
                          <div className="flex gap-2">
                            <Input 
                              type="color" 
                              value={configForm["color_primary"] || "#4f46e5"}
                              onChange={(e) => setConfigForm({ ...configForm, color_primary: e.target.value })}
                              className="h-9 w-12 p-0.5 bg-slate-50 border-slate-200 cursor-pointer"
                            />
                            <Input 
                              value={configForm["color_primary"] || ""}
                              onChange={(e) => setConfigForm({ ...configForm, color_primary: e.target.value })}
                              className="bg-slate-50 border-slate-100 text-xs"
                            />
                          </div>
                        </div>
                        <div className="space-y-2">
                          <label className="text-xs text-slate-500">สีรอง (Secondary HEX)</label>
                          <div className="flex gap-2">
                            <Input 
                              type="color" 
                              value={configForm["color_secondary"] || "#06b6d4"}
                              onChange={(e) => setConfigForm({ ...configForm, color_secondary: e.target.value })}
                              className="h-9 w-12 p-0.5 bg-slate-50 border-slate-200 cursor-pointer"
                            />
                            <Input 
                              value={configForm["color_secondary"] || ""}
                              onChange={(e) => setConfigForm({ ...configForm, color_secondary: e.target.value })}
                              className="bg-slate-50 border-slate-100 text-xs"
                            />
                          </div>
                        </div>
                        <div className="space-y-2">
                          <label className="text-xs text-slate-500">สีพื้นหลังไล่เฉด (Start HEX)</label>
                          <div className="flex gap-2">
                            <Input 
                              type="color" 
                              value={configForm["color_bg_start"] || "#1e1b4b"}
                              onChange={(e) => setConfigForm({ ...configForm, color_bg_start: e.target.value })}
                              className="h-9 w-12 p-0.5 bg-slate-50 border-slate-200 cursor-pointer"
                            />
                            <Input 
                              value={configForm["color_bg_start"] || ""}
                              onChange={(e) => setConfigForm({ ...configForm, color_bg_start: e.target.value })}
                              className="bg-slate-50 border-slate-100 text-xs"
                            />
                          </div>
                        </div>
                        <div className="space-y-2">
                          <label className="text-xs text-slate-500">สีพื้นหลังไล่เฉด (End HEX)</label>
                          <div className="flex gap-2">
                            <Input 
                              type="color" 
                              value={configForm["color_bg_end"] || "#0f172a"}
                              onChange={(e) => setConfigForm({ ...configForm, color_bg_end: e.target.value })}
                              className="h-9 w-12 p-0.5 bg-slate-50 border-slate-200 cursor-pointer"
                            />
                            <Input 
                              value={configForm["color_bg_end"] || ""}
                              onChange={(e) => setConfigForm({ ...configForm, color_bg_end: e.target.value })}
                              className="bg-slate-50 border-slate-100 text-xs"
                            />
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Telegram settings */}
                    <div className="border-t border-slate-100/80 pt-4 space-y-4">
                      <h4 className="text-sm font-bold text-slate-600">Telegram Bot Notifications Settings</h4>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="space-y-2">
                          <label className="text-xs text-slate-500">Telegram Token จาก BotFather</label>
                          <Input 
                            type="password"
                            value={configForm["telegram_token"] || ""} 
                            onChange={(e) => setConfigForm({ ...configForm, telegram_token: e.target.value })}
                            className="bg-slate-50 border-slate-100 focus-visible:ring-indigo-500 text-xs"
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-xs text-slate-500">Admin Group Chat ID (ส่งข้อมูลระบบ)</label>
                          <Input 
                            value={configForm["telegram_admin_group"] || ""} 
                            onChange={(e) => setConfigForm({ ...configForm, telegram_admin_group: e.target.value })}
                            className="bg-slate-50 border-slate-100 focus-visible:ring-indigo-500 text-xs"
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-xs text-slate-500">Student Notification Group Chat ID</label>
                          <Input 
                            value={configForm["telegram_student_group"] || ""} 
                            onChange={(e) => setConfigForm({ ...configForm, telegram_student_group: e.target.value })}
                            className="bg-slate-50 border-slate-100 focus-visible:ring-indigo-500 text-xs"
                          />
                        </div>
                      </div>

                      <div className="flex gap-8">
                        <div className="flex items-center gap-2">
                          <input 
                            type="checkbox"
                            id="notify_admin"
                            checked={configForm["notify_admin"] === "true"}
                            onChange={(e) => setConfigForm({ ...configForm, notify_admin: e.target.checked ? "true" : "false" })}
                            className="rounded bg-slate-50 border-slate-100 text-indigo-600 focus:ring-indigo-500"
                          />
                          <label htmlFor="notify_admin" className="text-xs font-semibold text-slate-600">เปิดแจ้งเตือนแอดมิน</label>
                        </div>
                        <div className="flex items-center gap-2">
                          <input 
                            type="checkbox"
                            id="notify_student"
                            checked={configForm["notify_student"] === "true"}
                            onChange={(e) => setConfigForm({ ...configForm, notify_student: e.target.checked ? "true" : "false" })}
                            className="rounded bg-slate-50 border-slate-100 text-indigo-600 focus:ring-indigo-500"
                          />
                          <label htmlFor="notify_student" className="text-xs font-semibold text-slate-600">เปิดแจ้งเตือนกลุ่มนักเรียน</label>
                        </div>
                      </div>
                    </div>

                    {/* Announcement Popup & Banner Settings */}
                    <div className="border-t border-slate-100/80 pt-4 space-y-4">
                      <div>
                        <h4 className="text-sm font-bold text-slate-700 flex items-center gap-2">
                          <ShieldAlert className="h-4 w-4 text-primary" />
                          ตั้งค่ากล่องข้อความประกาศและข้อมูลประชาสัมพันธ์ (Announcement Popup & Banner)
                        </h4>
                        <p className="text-xs text-slate-500 mt-0.5">
                          ข้อความ ลิงก์ และรูปภาพที่ระบุจะแสดงในกล่องป๊อปอัปต้อนรับเมื่อผู้ใช้เข้าสู่ระบบ และแสดงบนแถบประกาศหน้าจอนักเรียน
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        <input 
                          type="checkbox"
                          id="popup_active"
                          checked={configForm["popup_active"] === "true"}
                          onChange={(e) => setConfigForm({ ...configForm, popup_active: e.target.checked ? "true" : "false" })}
                          className="rounded bg-slate-50 border-slate-200 text-primary focus:ring-primary h-4 w-4"
                        />
                        <label htmlFor="popup_active" className="text-xs font-semibold text-slate-700 cursor-pointer">
                          เปิดใช้งานกล่องประกาศให้ผู้ใช้เห็นทันทีตอนล็อกอิน (Popup Active)
                        </label>
                      </div>

                      <div className="space-y-2">
                        <label className="text-xs font-semibold text-slate-600">หัวข้อประกาศ (Announcement Title)</label>
                        <Input 
                          placeholder="เช่น ประกาศสำคัญ: กำหนดการนำส่งและนำเสนอ Final Project"
                          value={configForm["popup_title"] || ""}
                          onChange={(e) => setConfigForm({ ...configForm, popup_title: e.target.value })}
                          className="bg-slate-50 border-slate-200 focus-visible:ring-indigo-500 text-xs"
                        />
                      </div>

                      <div className="space-y-2">
                        <label className="text-xs font-semibold text-slate-600">เนื้อหาข้อความประกาศ (Announcement Content)</label>
                        <Textarea 
                          placeholder="ระบุข้อความประกาศ รายละเอียด หรือคำชี้แจงสำหรับนักเรียน..."
                          value={configForm["popup_content"] || ""}
                          onChange={(e) => setConfigForm({ ...configForm, popup_content: e.target.value })}
                          className="bg-slate-50 border-slate-200 focus-visible:ring-indigo-500 text-xs"
                          rows={4}
                        />
                      </div>

                      {/* Announcement Link */}
                      <div className="space-y-2">
                        <label className="text-xs font-semibold text-slate-600 flex items-center gap-1.5">
                          <LinkIcon className="h-3.5 w-3.5 text-primary" />
                          แนบลิงก์สำหรับประกาศ (Announcement Link URL)
                        </label>
                        <Input 
                          type="url"
                          placeholder="https://drive.google.com/... หรือ https://..."
                          value={configForm["popup_link"] || ""}
                          onChange={(e) => setConfigForm({ ...configForm, popup_link: e.target.value })}
                          className="bg-slate-50 border-slate-200 focus-visible:ring-indigo-500 text-xs"
                        />
                        <p className="text-[11px] text-slate-400">
                          แนบลิงก์ที่ต้องการให้นักเรียนเข้าถึงได้โดยตรง (เช่น ลิงก์ Google Drive เอกสารประกอบ, คู่มือ, หรือแบบฟอร์ม)
                        </p>
                      </div>

                      {/* Announcement Image */}
                      <div className="space-y-2">
                        <label className="text-xs font-semibold text-slate-600 flex items-center gap-1.5">
                          <ImageIcon className="h-3.5 w-3.5 text-primary" />
                          แนบรูปภาพประกาศ / โปสเตอร์ประชาสัมพันธ์ (Announcement Image)
                        </label>
                        <div className="flex gap-2">
                          <Input 
                            type="file"
                            id="popup-image-upload"
                            accept="image/*"
                            className="hidden"
                            onChange={handlePopupImageUpload}
                            disabled={uploadingPopupImage}
                          />
                          <label 
                            htmlFor="popup-image-upload" 
                            className={`flex-1 flex items-center justify-center gap-2 border border-dashed rounded-lg p-2.5 text-xs cursor-pointer transition-colors duration-200 ${
                              uploadingPopupImage 
                                ? "bg-slate-100 border-slate-300 text-slate-400 cursor-not-allowed" 
                                : "bg-slate-50 border-slate-200 hover:bg-slate-100 text-slate-600"
                            }`}
                          >
                            <Upload className="h-4 w-4 text-slate-500" />
                            <span>{uploadingPopupImage ? "กำลังอัปโหลดรูปภาพ..." : "เลือกไฟล์รูปภาพเพื่ออัปโหลด"}</span>
                          </label>
                          {configForm["popup_image"] && (
                            <Button 
                              type="button" 
                              variant="destructive" 
                              onClick={handleRemovePopupImage} 
                              className="cursor-pointer text-xs"
                            >
                              ลบรูปภาพ
                            </Button>
                          )}
                        </div>
                        {configForm["popup_image"] && (
                          <div className="mt-2 p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                            <p className="text-[11px] text-slate-500 font-medium">ตัวอย่างรูปภาพประกาศที่แนบไว้:</p>
                            <div className="relative rounded-lg overflow-hidden border border-slate-200 max-w-sm bg-white">
                              <img 
                                src={configForm["popup_image"].startsWith("/uploads/") ? `${BACKEND_URL}${configForm["popup_image"]}` : configForm["popup_image"]} 
                                alt="Announcement Preview"
                                className="w-full h-40 object-cover"
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Final Project Submission Control */}
                    <div className="border-t border-slate-100/80 pt-4 space-y-4">
                      <h4 className="text-sm font-bold text-slate-600 flex items-center gap-2">
                        🎓 ตั้งค่าการ เปิด-ปิด ระบบรับส่ง Final Project
                      </h4>
                      <p className="text-xs text-slate-500">
                        ควบคุมการรับส่งผลงานเล่มวิจัยและคลิปวิดีโอ Final Project เพื่อป้องกันการส่งก่อนหรือหลังเวลาที่กำหนด
                      </p>
                      
                      <div className="flex items-center gap-2 pt-1">
                        <input 
                          type="checkbox"
                          id="final_project_enabled"
                          checked={configForm["final_project_enabled"] !== "false"}
                          onChange={(e) => setConfigForm({ ...configForm, final_project_enabled: e.target.checked ? "true" : "false" })}
                          className="rounded bg-slate-50 border-slate-200 text-primary focus:ring-primary h-4 w-4"
                        />
                        <label htmlFor="final_project_enabled" className="text-xs font-semibold text-slate-700 cursor-pointer">
                          เปิดใช้งานระบบรับส่ง Final Project (เปิด/ปิด ทั้งหมด)
                        </label>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                        <div className="space-y-2">
                          <label className="text-xs font-semibold text-slate-500 uppercase">
                            วัน-เวลา เริ่มต้นเปิดรับส่ง (Start Time)
                          </label>
                          <Input 
                            type="datetime-local"
                            value={configForm["final_project_start_time"] || ""} 
                            onChange={(e) => setConfigForm({ ...configForm, final_project_start_time: e.target.value })}
                            className="bg-slate-50 border-slate-200 focus-visible:ring-indigo-500 text-xs"
                          />
                          <span className="text-[10px] text-slate-400 block">ปล่อยว่างหากต้องการให้ส่งได้ทันทีโดยไม่จำกัดวันเริ่มต้น</span>
                        </div>
                        <div className="space-y-2">
                          <label className="text-xs font-semibold text-slate-500 uppercase">
                            วัน-เวลา สิ้นสุดปิดรับส่ง (End Time / Deadline)
                          </label>
                          <Input 
                            type="datetime-local"
                            value={configForm["final_project_end_time"] || ""} 
                            onChange={(e) => setConfigForm({ ...configForm, final_project_end_time: e.target.value })}
                            className="bg-slate-50 border-slate-200 focus-visible:ring-indigo-500 text-xs"
                          />
                          <span className="text-[10px] text-slate-400 block">ปล่อยว่างหากไม่มีกำหนดวันสิ้นสุดการรับส่ง</span>
                        </div>
                      </div>

                      {/* Final Project Description / Instructions */}
                      <div className="space-y-2 pt-2 border-t border-slate-100">
                        <label className="text-xs font-semibold text-slate-600">
                          คำชี้แจงและรายละเอียดข้อกำหนด Final Project (Instructions / Details)
                        </label>
                        <Textarea 
                          placeholder="ระบุคำชี้แจง ข้อกำหนดการส่งผลงาน หรือคำแนะนำสำหรับนักเรียน..."
                          value={configForm["final_project_description"] || ""}
                          onChange={(e) => setConfigForm({ ...configForm, final_project_description: e.target.value })}
                          className="bg-slate-50 border-slate-200 focus-visible:ring-indigo-500 text-xs"
                          rows={3}
                        />
                      </div>

                      {/* Final Project Link */}
                      <div className="space-y-2">
                        <label className="text-xs font-semibold text-slate-600 flex items-center gap-1.5">
                          <LinkIcon className="h-3.5 w-3.5 text-primary" />
                          แนบลิงก์ข้อมูล / Google Drive สำหรับ Final Project (Link URL)
                        </label>
                        <Input 
                          type="url"
                          placeholder="https://drive.google.com/... หรือ https://..."
                          value={configForm["final_project_link_url"] || ""}
                          onChange={(e) => setConfigForm({ ...configForm, final_project_link_url: e.target.value })}
                          className="bg-slate-50 border-slate-200 focus-visible:ring-indigo-500 text-xs font-mono"
                        />
                        <p className="text-[11px] text-slate-400">
                          แนบลิงก์ที่ต้องการให้นักเรียนเข้าถึงได้โดยตรง เช่น โฟลเดอร์ Google Drive รวมแม่แบบ, สไลด์ตัวอย่าง หรือแบบฟอร์มส่งงาน
                        </p>
                      </div>

                      {/* Final Project Attachment File/Image */}
                      <div className="space-y-2">
                        <label className="text-xs font-semibold text-slate-600 flex items-center gap-1.5">
                          <ImageIcon className="h-3.5 w-3.5 text-primary" />
                          แนบรูปภาพโปสเตอร์ / เอกสารอ้างอิง Final Project (Poster Image / File Attachment)
                        </label>
                        <div className="flex gap-2">
                          <Input 
                            type="file"
                            id="final-attachment-upload"
                            className="hidden"
                            onChange={handleFinalAttachmentUpload}
                            disabled={uploadingFinalAttachment}
                          />
                          <label 
                            htmlFor="final-attachment-upload" 
                            className={`flex-1 flex items-center justify-center gap-2 border border-dashed rounded-lg p-2.5 text-xs cursor-pointer transition-colors duration-200 ${
                              uploadingFinalAttachment 
                                ? "bg-slate-100 border-slate-300 text-slate-400 cursor-not-allowed" 
                                : "bg-slate-50 border-slate-200 hover:bg-slate-100 text-slate-600"
                            }`}
                          >
                            <Upload className="h-4 w-4 text-slate-500" />
                            <span>{uploadingFinalAttachment ? "กำลังอัปโหลดไฟล์..." : "เลือกไฟล์รูปภาพหรือเอกสารอ้างอิง"}</span>
                          </label>
                          {configForm["final_project_attachment_path"] && (
                            <Button 
                              type="button" 
                              variant="destructive" 
                              onClick={handleRemoveFinalAttachment} 
                              className="cursor-pointer text-xs"
                            >
                              ลบไฟล์
                            </Button>
                          )}
                        </div>
                        {configForm["final_project_attachment_path"] && (
                          <div className="mt-2 p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                            <div className="flex items-center justify-between">
                              <p className="text-[11px] text-slate-500 font-medium">ไฟล์หรือรูปภาพที่แนบไว้:</p>
                              <a 
                                href={configForm["final_project_attachment_path"].startsWith("/uploads/") ? `${BACKEND_URL}${configForm["final_project_attachment_path"]}` : configForm["final_project_attachment_path"]} 
                                target="_blank" 
                                rel="noopener noreferrer" 
                                className="text-xs text-primary font-semibold hover:underline inline-flex items-center gap-1"
                              >
                                <ExternalLink className="h-3 w-3" /> เปิดดูไฟล์
                              </a>
                            </div>
                            {/\.(jpg|jpeg|png|webp|gif|svg)$/i.test(configForm["final_project_attachment_path"]) ? (
                              <div className="relative rounded-lg overflow-hidden border border-slate-200 max-w-sm bg-white">
                                <img 
                                  src={configForm["final_project_attachment_path"].startsWith("/uploads/") ? `${BACKEND_URL}${configForm["final_project_attachment_path"]}` : configForm["final_project_attachment_path"]} 
                                  alt="Final Project Attachment Preview"
                                  className="w-full h-40 object-cover"
                                />
                              </div>
                            ) : (
                              <div className="p-2 bg-white rounded border border-slate-200 text-xs font-mono text-slate-600 flex items-center gap-2">
                                <FileSpreadsheet className="h-4 w-4 text-primary" />
                                <span className="truncate">{configForm["final_project_attachment_path"].split('/').pop()}</span>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Max group member settings */}
                    <div className="border-t border-slate-100/80 pt-4 space-y-2">
                      <label className="text-xs font-semibold text-slate-500 uppercase">จำกัดสมาชิกกลุ่มสูงสุดต่อกลุ่ม</label>
                      <Input 
                        type="number"
                        value={configForm["max_group_members"] || "5"} 
                        onChange={(e) => setConfigForm({ ...configForm, max_group_members: e.target.value })}
                        className="bg-slate-50 border-slate-100 focus-visible:ring-indigo-500 w-32"
                      />
                    </div>

                    <Button 
                      type="submit"
                      className="w-full bg-primary hover:bg-primary/90 text-white font-bold transition-colors duration-200 cursor-pointer"
                    >
                      บันทึกการตั้งค่าทั้งหมด
                    </Button>
                  </form>
                </CardContent>
              </Card>
            )}
          </>
        )}
        </>
      )}
      </main>

      {/* DIALOGS */}

      {/* Semester Dialog */}
      <Dialog open={openSemDialog} onOpenChange={setOpenSemDialog}>
        <DialogContent className="bg-white border-slate-200 text-slate-800 shadow-md rounded-2xl">
          <DialogHeader>
            <DialogTitle>{editingSem ? "แก้ไขปีการศึกษา" : "สร้างปีการศึกษาและภาคเรียน"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSemSubmit} className="space-y-4 pt-2">
            <div className="space-y-2">
              <label className="text-xs text-slate-500">ปีการศึกษา (พ.ศ.)</label>
              <Input 
                type="number" 
                value={semForm.year} 
                onChange={(e) => setSemForm({ ...semForm, year: parseInt(e.target.value) })}
                className="bg-slate-50 border-slate-200"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs text-slate-500">ภาคเรียนที่</label>
              <Input 
                type="number" 
                value={semForm.term} 
                onChange={(e) => setSemForm({ ...semForm, term: parseInt(e.target.value) })}
                className="bg-slate-50 border-slate-200"
              />
            </div>
            <div className="flex items-center gap-2">
              <input 
                type="checkbox"
                id="sem_active"
                checked={semForm.is_active}
                onChange={(e) => setSemForm({ ...semForm, is_active: e.target.checked })}
                className="rounded bg-slate-50 border-slate-100 text-primary focus:ring-primary"
              />
              <label htmlFor="sem_active" className="text-xs">เปิดใช้งานเป็นภาคเรียนปัจจุบัน</label>
            </div>
            <DialogFooter className="mt-4">
              <Button type="button" variant="outline" onClick={() => setOpenSemDialog(false)} className="border-slate-100 text-slate-500">ยกเลิก</Button>
              <Button type="submit" className="bg-primary hover:bg-primary/90 transition-colors duration-200 cursor-pointer">บันทึก</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Classroom Dialog */}
      <Dialog open={openClassDialog} onOpenChange={(open) => { setOpenClassDialog(open); if (!open) setEditingClassroom(null); }}>
        <DialogContent className="bg-white border-slate-200 text-slate-800 shadow-md rounded-2xl">
          <DialogHeader>
            <DialogTitle>{editingClassroom ? "แก้ไขห้องเรียน" : "สร้างห้องเรียนใหม่"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleClassSubmit} className="space-y-4 pt-2">
            <div className="space-y-2">
              <label className="text-xs text-slate-500">ชื่อห้องเรียน (เช่น ม.6/1)</label>
              <Input 
                placeholder="ระบุชื่อห้อง..."
                value={classForm.name} 
                onChange={(e) => setClassForm({ ...classForm, name: e.target.value })}
                className="bg-slate-50 border-slate-200"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs text-slate-500">ภาคเรียนที่ต้องการผูก</label>
              <Select 
                value={classForm.semester_id.toString()} 
                onValueChange={(val) => setClassForm({ ...classForm, semester_id: parseInt(val || "0") })}
              >
                <SelectTrigger className="bg-slate-50 border-slate-100">
                  <SelectValue placeholder="เลือกภาคเรียน...">
                    {(val) => {
                      const sem = semesters.find(s => s.id.toString() === val);
                      return sem ? `เทอม ${sem.term}/${sem.year}` : val;
                    }}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent className="bg-white border-slate-200 text-slate-800">
                  {semesters.map(s => (
                    <SelectItem key={s.id} value={s.id.toString()}>เทอม {s.term}/{s.year}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <DialogFooter className="mt-4">
              <Button type="button" variant="outline" onClick={() => { setOpenClassDialog(false); setEditingClassroom(null); }} className="border-slate-100 text-slate-500">ยกเลิก</Button>
              <Button type="submit" className="bg-primary hover:bg-primary/90 transition-colors duration-200 cursor-pointer">บันทึก</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Assign Teacher Dialog */}
      <Dialog open={openAssignTeacherDialog} onOpenChange={setOpenAssignTeacherDialog}>
        <DialogContent className="bg-white border-slate-200 text-slate-800 shadow-md rounded-2xl max-w-md">
          <DialogHeader>
            <DialogTitle>มอบหมายอาจารย์สอนประจำห้อง {assigningClassroom?.name}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAssignTeacherSubmit} className="space-y-4 pt-2">
            <div className="max-h-60 overflow-y-auto space-y-2 pr-2">
              {teachers.map((t) => (
                <div key={t.id} className="flex items-center gap-3 p-2 hover:bg-slate-50 rounded border border-slate-200">
                  <input 
                    type="checkbox"
                    id={`teach-${t.id}`}
                    checked={selectedTeacherIDs.includes(t.id)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedTeacherIDs([...selectedTeacherIDs, t.id]);
                      } else {
                        setSelectedTeacherIDs(selectedTeacherIDs.filter(id => id !== t.id));
                      }
                    }}
                    className="rounded bg-slate-50 border-slate-100 text-primary focus:ring-primary"
                  />
                  <label htmlFor={`teach-${t.id}`} className="text-sm font-medium cursor-pointer">{t.full_name}</label>
                </div>
              ))}
              {teachers.length === 0 && (
                <p className="text-xs text-slate-500 italic text-center py-4">ไม่พบรายชื่ออาจารย์ในระบบ กรุณาสร้างบัญชีอาจารย์ก่อน</p>
              )}
            </div>
            <DialogFooter className="mt-4">
              <Button type="button" variant="outline" onClick={() => setOpenAssignTeacherDialog(false)} className="border-slate-100 text-slate-500">ยกเลิก</Button>
              <Button type="submit" className="bg-primary hover:bg-primary/90 transition-colors duration-200 cursor-pointer">บันทึกสิทธิ์</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* User Dialog */}
      <Dialog open={openUserDialog} onOpenChange={setOpenUserDialog}>
        <DialogContent className="bg-white border-slate-200 text-slate-800 shadow-md rounded-2xl max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingUser ? "แก้ไขผู้ใช้งาน" : "เพิ่มผู้ใช้งานระบบเดี่ยว"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleUserSubmit} className="space-y-4 pt-2">
            {!editingUser && (
              <div className="space-y-2">
                <label className="text-xs text-slate-500">Username (สำหรับใช้ล็อคอิน)</label>
                <Input 
                  value={userForm.username} 
                  onChange={(e) => setUserForm({ ...userForm, username: e.target.value })}
                  className="bg-slate-50 border-slate-200"
                  required
                />
              </div>
            )}
            <div className="space-y-2">
              <label className="text-xs text-slate-500">รหัสผ่าน (Password)</label>
              <Input 
                type="password"
                placeholder={editingUser ? "เว้นว่างไว้หากไม่ต้องการแก้ไข..." : "ระบุรหัสผ่าน..."}
                value={userForm.password} 
                onChange={(e) => setUserForm({ ...userForm, password: e.target.value })}
                className="bg-slate-50 border-slate-200"
                required={!editingUser}
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs text-slate-500">ชื่อ-นามสกุลจริง</label>
              <Input 
                value={userForm.full_name} 
                onChange={(e) => setUserForm({ ...userForm, full_name: e.target.value })}
                className="bg-slate-50 border-slate-200"
                required
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs text-slate-500">อีเมล</label>
              <Input 
                type="email"
                value={userForm.email} 
                onChange={(e) => setUserForm({ ...userForm, email: e.target.value })}
                className="bg-slate-50 border-slate-200"
              />
            </div>
            
            {!editingUser && (
              <div className="space-y-2">
                <label className="text-xs text-slate-500">ประเภทสิทธิ์การใช้งาน (Role)</label>
                <Select 
                  value={userForm.role} 
                  onValueChange={(val) => setUserForm({ ...userForm, role: (val || "student") as any })}
                >
                  <SelectTrigger className="bg-slate-50 border-slate-200">
                    <SelectValue placeholder="เลือกสิทธิ์...">
                      {(val) => {
                        if (val === "student") return "นักเรียน (Student)";
                        if (val === "teacher") return "ครู/อาจารย์ (Teacher)";
                        if (val === "admin") return "ผู้ดูแลระบบ (Admin)";
                        return val;
                      }}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent className="bg-white border-slate-200 text-slate-800">
                    <SelectItem value="student">นักเรียน (Student)</SelectItem>
                    <SelectItem value="teacher">ครู/อาจารย์ (Teacher)</SelectItem>
                    <SelectItem value="admin">ผู้ดูแลระบบ (Admin)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {userForm.role === "student" && classrooms.length > 0 && (
              <div className="space-y-2">
                <label className="text-xs text-slate-500">ห้องเรียน (เฉพาะนักเรียน)</label>
                <Select 
                  value={userForm.classroom_id.toString()} 
                  onValueChange={(val) => setUserForm({ ...userForm, classroom_id: parseInt(val || "0") })}
                >
                  <SelectTrigger className="bg-slate-50 border-slate-200">
                    <SelectValue placeholder="เลือกห้องเรียน...">
                      {(val) => classrooms.find(c => c.id.toString() === val)?.name || val}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent className="bg-white border-slate-200 text-slate-800">
                    {classrooms.map(c => (
                      <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <DialogFooter className="mt-4">
              <Button type="button" variant="outline" onClick={() => setOpenUserDialog(false)} className="border-slate-100 text-slate-500">ยกเลิก</Button>
              <Button type="submit" className="bg-primary hover:bg-primary/90 transition-colors duration-200 cursor-pointer">บันทึกข้อมูล</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Import User Dialog */}
      <Dialog open={openImportUserDialog} onOpenChange={setOpenImportUserDialog}>
        <DialogContent className="bg-white border-slate-200 text-slate-800 shadow-md rounded-2xl max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5 text-emerald-600" />
              <span>นำเข้าข้อมูลบัญชีผู้ใช้งานแบบกลุ่ม (Excel)</span>
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleImportUsersSubmit} className="space-y-4 pt-2">
            <div className="space-y-2">
              <label className="text-xs text-slate-500 font-medium">อัปโหลดไฟล์ Excel (.xlsx, .xls)</label>
              
              <div className="space-y-4 border border-dashed border-slate-200 rounded-xl p-6 text-center bg-slate-50 hover:bg-slate-100/50 transition-colors duration-200">
                <input
                  type="file"
                  id="excel-upload"
                  accept=".xlsx, .xls"
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files && e.target.files.length > 0) {
                      setImportFile(e.target.files[0]);
                    }
                  }}
                />
                <label htmlFor="excel-upload" className="cursor-pointer flex flex-col items-center justify-center space-y-2">
                  <Upload className="h-8 w-8 text-primary/80 animate-pulse" />
                  <span className="text-sm font-semibold text-slate-700">คลิกเพื่อเลือกไฟล์ Excel</span>
                  <span className="text-xs text-slate-400">รองรับไฟล์ประเภท .xlsx และ .xls</span>
                </label>
                {importFile && (
                  <div className="mt-2 text-xs font-mono text-emerald-700 flex items-center justify-center gap-1.5 bg-emerald-50 border border-emerald-200 rounded-lg p-2 max-w-sm mx-auto">
                    <Check className="h-4 w-4 text-emerald-600 animate-bounce" />
                    <span className="truncate">{importFile.name}</span>
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-between items-center bg-slate-50 border border-slate-100 rounded-xl p-3">
              <div className="text-xs text-slate-500 pr-2">
                <p className="font-semibold text-slate-600 mb-0.5">ต้องการเทมเพลตสำหรับกรอกข้อมูล?</p>
                <p>กรอกข้อมูลตามหัวตารางในไฟล์เพื่อป้องกันความผิดพลาด</p>
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={handleDownloadTemplate}
                className="text-xs border-emerald-600 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800 transition-all duration-200 cursor-pointer flex gap-1 items-center shrink-0"
              >
                <Download className="h-3.5 w-3.5" /> ดาวน์โหลดเทมเพลต
              </Button>
            </div>

            <DialogFooter className="mt-4">
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => setOpenImportUserDialog(false)} 
                className="border-slate-100 text-slate-500"
                disabled={importingUsers}
              >
                ยกเลิก
              </Button>
              <Button 
                type="submit" 
                disabled={!importFile || importingUsers} 
                className="bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50 transition-colors duration-200 cursor-pointer gap-1"
              >
                {importingUsers ? (
                  <>
                    <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white"></div>
                    กำลังนำเข้าข้อมูล...
                  </>
                ) : (
                  <>
                    <Check className="h-4 w-4" />
                    นำเข้าข้อมูล
                  </>
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Workload Dialog */}
      <Dialog open={openWorkloadDialog} onOpenChange={setOpenWorkloadDialog}>
        <DialogContent className="bg-white border-slate-200 text-slate-800 shadow-md rounded-2xl max-w-md">
          <DialogHeader>
            <DialogTitle>{editingWorkload ? "แก้ไขภาระงาน" : "สร้างภาระงานใหม่"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleWorkloadSubmit} className="space-y-4 pt-2">
            <div className="space-y-2">
              <label className="text-xs text-slate-500 font-semibold uppercase tracking-wider">รูปแบบภาระงาน</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setWorkloadForm({ ...workloadForm, type: "individual" })}
                  className={`px-3 py-2 text-xs font-semibold rounded-xl border flex items-center justify-center gap-2 transition-all cursor-pointer ${
                    workloadForm.type === "individual"
                      ? "bg-blue-50 border-blue-500 text-blue-700 shadow-sm"
                      : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  <UserIcon className="h-4 w-4 text-blue-600" />
                  <span>งานเดี่ยว (ครึ่งแรก)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setWorkloadForm({ ...workloadForm, type: "group" })}
                  className={`px-3 py-2 text-xs font-semibold rounded-xl border flex items-center justify-center gap-2 transition-all cursor-pointer ${
                    workloadForm.type === "group"
                      ? "bg-emerald-50 border-emerald-500 text-emerald-700 shadow-sm"
                      : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  <Users className="h-4 w-4 text-emerald-600" />
                  <span>งานกลุ่ม (ครึ่งหลัง)</span>
                </button>
              </div>
              <p className="text-[11px] text-slate-400">
                {workloadForm.type === "individual" 
                  ? "• นักเรียนส่งงานเดี่ยวได้ทันทีโดยไม่ต้องจัดตั้งกลุ่ม" 
                  : "• ตัวแทนกลุ่มเป็นผู้ส่งงาน และสมาชิกในกลุ่มทุกคนจะได้รับคะแนนร่วมกัน"}
              </p>
            </div>
            <div className="space-y-2">
              <label className="text-xs text-slate-500">ชื่อภาระงาน (เช่น ส่งรายงานความก้าวหน้า 1)</label>
              <Input 
                value={workloadForm.title} 
                onChange={(e) => setWorkloadForm({ ...workloadForm, title: e.target.value })}
                className="bg-slate-50 border-slate-200"
                required
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs text-slate-500">คำอธิบายรายละเอียดภาระงาน</label>
              <Textarea 
                value={workloadForm.description} 
                onChange={(e) => setWorkloadForm({ ...workloadForm, description: e.target.value })}
                className="bg-slate-50 border-slate-200"
                rows={3}
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs text-slate-500">วันครบกำหนดส่ง (Deadline)</label>
              <Input 
                type="datetime-local"
                value={workloadForm.deadline} 
                onChange={(e) => setWorkloadForm({ ...workloadForm, deadline: e.target.value })}
                className="bg-slate-50 border-slate-200"
                required
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs text-slate-500">คะแนนเต็มประจำชิ้นงาน</label>
              <Input 
                type="number"
                step="0.01"
                value={workloadForm.max_score} 
                onChange={(e) => setWorkloadForm({ ...workloadForm, max_score: parseFloat(e.target.value) })}
                className="bg-slate-50 border-slate-200"
                required
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs text-slate-500">ลิงก์ตัวอย่าง / ลิงก์อ้างอิง</label>
              <Input 
                type="url"
                placeholder="https://..."
                value={workloadForm.sample_link_url} 
                onChange={(e) => setWorkloadForm({ ...workloadForm, sample_link_url: e.target.value })}
                className="bg-slate-50 border-slate-200"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs text-slate-500">ไฟล์ตัวอย่าง / เอกสารแนบ</label>
              <div className="flex gap-2">
                <Input 
                  type="file"
                  id="sample-file-upload"
                  className="hidden"
                  onChange={handleSampleFileUpload}
                  disabled={uploadingSampleFile}
                />
                <label 
                  htmlFor="sample-file-upload" 
                  className={`flex-1 flex items-center justify-center gap-2 border border-dashed rounded-lg p-2.5 text-xs cursor-pointer transition-colors duration-200 ${
                    uploadingSampleFile 
                      ? "bg-slate-100 border-slate-300 text-slate-400 cursor-not-allowed" 
                      : "bg-slate-50 border-slate-200 hover:bg-slate-100 text-slate-600"
                  }`}
                >
                  <Upload className="h-4 w-4 text-slate-500" />
                  <span>{uploadingSampleFile ? "กำลังอัปโหลด..." : "เลือกไฟล์อัปโหลด"}</span>
                </label>
                {workloadForm.sample_file_path && (
                  <Button 
                    type="button" 
                    variant="destructive" 
                    onClick={handleClearSampleFile} 
                    className="cursor-pointer"
                  >
                    ลบไฟล์
                  </Button>
                )}
              </div>
              {workloadForm.sample_file_path && (
                <p className="text-[10px] text-slate-500 truncate bg-slate-50 p-1.5 rounded border border-slate-100 mt-1 flex items-center justify-between">
                  <span>ไฟล์ที่อัปโหลด: {workloadForm.sample_file_path.split('/').pop()}</span>
                  <a 
                    href={`${BACKEND_URL}${workloadForm.sample_file_path}`} 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    className="text-primary hover:underline font-semibold ml-2"
                  >
                    ดูไฟล์
                  </a>
                </p>
              )}
            </div>
            <DialogFooter className="mt-4">
              <Button type="button" variant="outline" onClick={() => setOpenWorkloadDialog(false)} className="border-slate-100 text-slate-500">ยกเลิก</Button>
              <Button type="submit" className="bg-primary hover:bg-primary/90 transition-colors duration-200 cursor-pointer">บันทึกภาระงาน</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Criteria Dialog */}
      <Dialog open={openCriteriaDialog} onOpenChange={setOpenCriteriaDialog}>
        <DialogContent className="bg-white border-slate-200 text-slate-800 shadow-md rounded-2xl max-w-md">
          <DialogHeader>
            <DialogTitle>{editingCriteria ? "แก้ไขเกณฑ์คะแนน" : "สร้างเกณฑ์คะแนน Final Project"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCriteriaSubmit} className="space-y-4 pt-2">
            <div className="space-y-2">
              <label className="text-xs text-slate-500">ชื่อเกณฑ์การประเมิน (เช่น ความสมบูรณ์ของเล่มรายงาน / ผลงาน)</label>
              <Input 
                value={criteriaForm.title} 
                onChange={(e) => setCriteriaForm({ ...criteriaForm, title: e.target.value })}
                className="bg-slate-50 border-slate-200"
                required
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs text-slate-500">คะแนนเต็มดิบการประเมินย่อย</label>
              <Input 
                type="number"
                step="0.01"
                value={criteriaForm.max_score} 
                onChange={(e) => setCriteriaForm({ ...criteriaForm, max_score: parseFloat(e.target.value) })}
                className="bg-slate-50 border-slate-200"
                required
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs text-slate-500">สัดส่วนคิดเป็นเปอร์เซ็นต์ (Weight %)</label>
              <Input 
                type="number"
                step="0.01"
                value={criteriaForm.weight} 
                onChange={(e) => setCriteriaForm({ ...criteriaForm, weight: parseFloat(e.target.value) })}
                className="bg-slate-50 border-slate-200"
                required
              />
            </div>
            <DialogFooter className="mt-4">
              <Button type="button" variant="outline" onClick={() => setOpenCriteriaDialog(false)} className="border-slate-100 text-slate-500">ยกเลิก</Button>
              <Button type="submit" className="bg-primary hover:bg-primary/90 transition-colors duration-200 cursor-pointer">บันทึกเกณฑ์</Button>
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
        defaultClassroomId={reportClassroom}
        reportData={reportData}
      />
      </div>
    </div>
  );
}
