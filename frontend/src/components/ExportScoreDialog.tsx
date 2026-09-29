"use client";

import React, { useState, useEffect } from "react";
import { Semester, Classroom, Workload, FinalProjectCriteria, apiDownloadFile, apiRequest } from "../lib/api";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "./ui/dialog";
import { Button } from "./ui/button";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "./ui/select";
import { toast } from "sonner";
import {
  FileSpreadsheet,
  Download,
  Users,
  UserCheck,
  Layers,
  FileText,
  Loader2,
  Calendar,
  CheckCircle2
} from "lucide-react";

interface ExportScoreDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  semesters: Semester[];
  classrooms: Classroom[];
  defaultSemesterId?: string;
  defaultClassroomId?: string;
  reportData?: { workloads: Workload[]; criteria?: FinalProjectCriteria[]; rows: any[] } | null;
}

export default function ExportScoreDialog({
  open,
  onOpenChange,
  semesters,
  classrooms,
  defaultSemesterId = "",
  defaultClassroomId = "",
  reportData = null,
}: ExportScoreDialogProps) {
  const [selectedSemester, setSelectedSemester] = useState<string>(defaultSemesterId);
  const [selectedClassroom, setSelectedClassroom] = useState<string>(defaultClassroomId || "all");
  const [exportType, setExportType] = useState<"group" | "student">("group");
  const [fileFormat, setFileFormat] = useState<"xlsx" | "csv">("xlsx");
  const [loading, setLoading] = useState<boolean>(false);

  useEffect(() => {
    if (open) {
      if (defaultSemesterId) setSelectedSemester(defaultSemesterId);
      if (defaultClassroomId) setSelectedClassroom(defaultClassroomId);
    }
  }, [open, defaultSemesterId, defaultClassroomId]);

  const handleDownload = async () => {
    setLoading(true);
    try {
      if (fileFormat === "xlsx") {
        const clsParam = selectedClassroom && selectedClassroom !== "all" ? `&classroom_id=${selectedClassroom}` : "";
        const semParam = selectedSemester ? `?semester_id=${selectedSemester}` : "";
        const typeParam = `&type=${exportType}`;
        const query = semParam ? `${semParam}${clsParam}${typeParam}` : `?type=${exportType}${clsParam}`;

        const defaultName = `GPMS_คะแนนที่ตรวจแล้ว_${exportType === "group" ? "รายกลุ่ม" : "รายบุคคล"}.xlsx`;
        await apiDownloadFile(`/dashboard/export/excel${query}`, defaultName);
        toast.success("ดาวน์โหลดไฟล์ Excel สำเร็จเรียบร้อย!");
        onOpenChange(false);
      } else {
        // CSV Export
        let rep = reportData;
        if (!rep || selectedClassroom !== defaultClassroomId || selectedSemester !== defaultSemesterId) {
          const semQuery = selectedSemester ? `semester_id=${selectedSemester}` : "";
          const clsQuery = selectedClassroom && selectedClassroom !== "all" ? `classroom_id=${selectedClassroom}` : "";
          const params = [semQuery, clsQuery].filter(Boolean).join("&");
          rep = await apiRequest(`/dashboard/report${params ? `?${params}` : ""}`);
        }

        if (!rep || !rep.rows || rep.rows.length === 0) {
          toast.error("ไม่พบข้อมูลคะแนนสำหรับส่งออกในเงื่อนไขที่เลือก");
          return;
        }

        const criteriaList: FinalProjectCriteria[] = rep.criteria || [];
        const criteriaHeaders = criteriaList.map(c => `Final: ${c.title} (${c.max_score} คะแนน / ถ่วง ${c.weight}%)`);

        let csvContent = "\uFEFF"; // UTF-8 BOM for Thai Excel

        if (exportType === "student") {
          const headers = [
            "ลำดับ", "ชื่อ-นามสกุล", "ห้องเรียน", "ชื่อกลุ่ม", "หัวข้องาน",
            ...rep.workloads.map((w: Workload) => `คะแนน: ${w.title} (${w.max_score})`),
            "รวมคะแนนย่อย",
            ...criteriaHeaders,
            "รวม Final Project แบบไม่ถ่วงน้ำหนัก",
            "รวม Final Project (ถ่วงน้ำหนัก)",
            "คะแนนรวมสุทธิ"
          ];
          csvContent += headers.map((h) => `"${h}"`).join(",") + "\n";

          let studentIdx = 1;
          rep.rows.forEach((r) => {
            const members = r.members && r.members.length > 0 ? r.members : [r.leader_name];
            const finalScores = r.final_criteria_scores && r.final_criteria_scores.length > 0
              ? r.final_criteria_scores.map((s: number) => (s ?? 0).toFixed(2))
              : criteriaList.map(() => "0.00");

            members.forEach((m: string) => {
              const row = [
                studentIdx.toString(),
                m,
                r.classroom_name,
                r.group_name,
                r.project_topic,
                ...r.workload_scores.map((s: number) => s.toString()),
                r.accumulated_score.toFixed(2),
                ...finalScores,
                (r.final_unweighted_score ?? 0).toFixed(2),
                r.final_project_score.toFixed(2),
                r.total_score.toFixed(2),
              ];
              csvContent += row.map((cell) => `"${(cell || "").replace(/"/g, '""')}"`).join(",") + "\n";
              studentIdx++;
            });
          });
        } else {
          // Group Summary
          const headers = [
            "ลำดับ", "ชื่อกลุ่ม", "ห้องเรียน", "หัวข้องาน", "หัวหน้ากลุ่ม", "สมาชิกกลุ่ม",
            ...rep.workloads.map((w: Workload) => `คะแนน: ${w.title} (${w.max_score})`),
            "รวมคะแนนย่อย",
            ...criteriaHeaders,
            "รวม Final Project แบบไม่ถ่วงน้ำหนัก",
            "รวม Final Project (ถ่วงน้ำหนัก)",
            "คะแนนรวมสุทธิ"
          ];
          csvContent += headers.map((h) => `"${h}"`).join(",") + "\n";

          rep.rows.forEach((r, idx) => {
            const membersText = r.members ? r.members.join("; ") : "";
            const finalScores = r.final_criteria_scores && r.final_criteria_scores.length > 0
              ? r.final_criteria_scores.map((s: number) => (s ?? 0).toFixed(2))
              : criteriaList.map(() => "0.00");

            const row = [
              (idx + 1).toString(),
              r.group_name,
              r.classroom_name,
              r.project_topic,
              r.leader_name || "",
              membersText,
              ...r.workload_scores.map((s: number) => s.toString()),
              r.accumulated_score.toFixed(2),
              ...finalScores,
              (r.final_unweighted_score ?? 0).toFixed(2),
              r.final_project_score.toFixed(2),
              r.total_score.toFixed(2),
            ];
            csvContent += row.map((cell) => `"${(cell || "").replace(/"/g, '""')}"`).join(",") + "\n";
          });
        }

        const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", `GPMS_คะแนนที่ตรวจแล้ว_${exportType === "group" ? "รายกลุ่ม" : "รายบุคคล"}_${new Date().toLocaleDateString("th-TH")}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);

        toast.success("ดาวน์โหลดไฟล์ CSV สำเร็จเรียบร้อย!");
        onOpenChange(false);
      }
    } catch (err: any) {
      toast.error(err.message || "เกิดข้อผิดพลาดในการส่งออกข้อมูล");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-white border-slate-200 text-slate-800 shadow-xl rounded-2xl max-w-lg">
        <DialogHeader className="space-y-1">
          <div className="flex items-center gap-2 text-primary font-bold">
            <FileSpreadsheet className="h-5 w-5" />
            <DialogTitle className="text-lg">ส่งออกรายงานคะแนนที่ตรวจแล้ว</DialogTitle>
          </div>
          <DialogDescription className="text-xs text-slate-500">
            เลือกระดับข้อมูล รูปแบบการจัดกลุ่ม และไฟล์ที่ต้องการส่งออกสำหรับนำไปประมวลผลหรือตัดเกรด
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Semester Selector */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-600 flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5 text-slate-400" /> ภาคเรียน
            </label>
            <Select value={selectedSemester} onValueChange={(val) => setSelectedSemester(val || "")}>
              <SelectTrigger className="bg-slate-50 border-slate-200 text-xs h-9">
                <SelectValue placeholder="เลือกภาคเรียน..." />
              </SelectTrigger>
              <SelectContent className="bg-white border-slate-200 text-slate-800">
                {semesters.map((s) => (
                  <SelectItem key={s.id} value={s.id.toString()}>
                    ภาคเรียนที่ {s.term}/{s.year} {s.is_active ? "(เปิดใช้งานอยู่)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Classroom Scope */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-600 flex items-center gap-1.5">
              <Layers className="h-3.5 w-3.5 text-slate-400" /> ขอบเขตห้องเรียน (การแยกห้อง)
            </label>
            <Select value={selectedClassroom} onValueChange={(val) => setSelectedClassroom(val || "all")}>
              <SelectTrigger className="bg-slate-50 border-slate-200 text-xs h-9">
                <SelectValue placeholder="ทุกห้องเรียน..." />
              </SelectTrigger>
              <SelectContent className="bg-white border-slate-200 text-slate-800">
                <SelectItem value="all">
                  📁 ทุกห้องเรียน (รวมทุกห้อง + แยกชีตตามห้องใน Excel)
                </SelectItem>
                {classrooms.map((c) => (
                  <SelectItem key={c.id} value={c.id.toString()}>
                    ห้อง {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-slate-500">
              {selectedClassroom === "all"
                ? "💡 ระบบจะสร้างชีตสรุปภาพรวมทั้งหมด + สร้างชีตแยกของแต่ละห้องเรียนโดยเฉพาะ"
                : "💡 จะส่งออกเฉพาะข้อมูลนักเรียนและกลุ่มในห้องเรียนที่เลือก"}
            </p>
          </div>

          {/* Export Level (Group vs Student) */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-600 flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5 text-slate-400" /> ระดับข้อมูลที่ต้องการแสดง (การแยกกลุ่ม)
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setExportType("group")}
                className={`flex flex-col items-start p-3 rounded-xl border text-left transition-all ${
                  exportType === "group"
                    ? "border-primary bg-primary/5 text-primary shadow-xs"
                    : "border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100"
                }`}
              >
                <div className="flex items-center gap-1.5 font-bold text-xs">
                  <Users className="h-3.5 w-3.5" />
                  <span>สรุปรายกลุ่ม</span>
                  {exportType === "group" && <CheckCircle2 className="h-3.5 w-3.5 ml-auto text-primary" />}
                </div>
                <span className="text-[10px] text-slate-500 mt-1">
                  1 แถวต่อ 1 กลุ่ม พร้อมรายชื่อสมาชิก เหมาะสำหรับภาพรวมกลุ่ม
                </span>
              </button>

              <button
                type="button"
                onClick={() => setExportType("student")}
                className={`flex flex-col items-start p-3 rounded-xl border text-left transition-all ${
                  exportType === "student"
                    ? "border-primary bg-primary/5 text-primary shadow-xs"
                    : "border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100"
                }`}
              >
                <div className="flex items-center gap-1.5 font-bold text-xs">
                  <UserCheck className="h-3.5 w-3.5" />
                  <span>รายชื่อนักเรียนรายคน</span>
                  {exportType === "student" && <CheckCircle2 className="h-3.5 w-3.5 ml-auto text-primary" />}
                </div>
                <span className="text-[10px] text-slate-500 mt-1">
                  1 แถวต่อนักเรียน 1 คน แสดงรหัสและชื่อ เหมาะสำหรับส่งเกรดเข้าระบบทะเบียน
                </span>
              </button>
            </div>
          </div>

          {/* File Format */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-600 flex items-center gap-1.5">
              <FileSpreadsheet className="h-3.5 w-3.5 text-slate-400" /> นามสกุลไฟล์
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setFileFormat("xlsx")}
                className={`flex items-center gap-2 p-2.5 rounded-xl border transition-all text-xs font-semibold ${
                  fileFormat === "xlsx"
                    ? "border-emerald-600 bg-emerald-50 text-emerald-800 shadow-xs"
                    : "border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100"
                }`}
              >
                <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
                <span>Excel (.xlsx) - แนะนำ</span>
                {fileFormat === "xlsx" && <CheckCircle2 className="h-3.5 w-3.5 ml-auto text-emerald-600" />}
              </button>

              <button
                type="button"
                onClick={() => setFileFormat("csv")}
                className={`flex items-center gap-2 p-2.5 rounded-xl border transition-all text-xs font-semibold ${
                  fileFormat === "csv"
                    ? "border-blue-600 bg-blue-50 text-blue-800 shadow-xs"
                    : "border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100"
                }`}
              >
                <FileText className="h-4 w-4 text-blue-600" />
                <span>CSV (.csv)</span>
                {fileFormat === "csv" && <CheckCircle2 className="h-3.5 w-3.5 ml-auto text-blue-600" />}
              </button>
            </div>
          </div>
        </div>

        <DialogFooter className="mt-4 gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="border-slate-200 text-slate-600 text-xs"
            disabled={loading}
          >
            ยกเลิก
          </Button>
          <Button
            type="button"
            onClick={handleDownload}
            disabled={loading}
            className="bg-primary hover:bg-primary/90 text-white text-xs gap-1.5 shadow-sm cursor-pointer"
          >
            {loading ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                กำลังสร้างไฟล์ส่งออก...
              </>
            ) : (
              <>
                <Download className="h-3.5 w-3.5" />
                ดาวน์โหลดรายงาน ({fileFormat.toUpperCase()})
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
