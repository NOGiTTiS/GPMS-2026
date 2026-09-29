"use client";

import React from "react";
import { useSystem } from "../context/SystemContext";
import { LogOut, User as UserIcon, GraduationCap, ChevronDown, Menu, X } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "./ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { apiRequest, BACKEND_URL } from "../lib/api";
import { toast } from "sonner";

const getInitials = (name: string) => {
  if (!name) return "?";
  const cleanName = name.replace(/^(นาย|นางสาว|นาง|ดร\.|อาจารย์|อ\.|ผศ\.\s*ดร\.|ผศ\.|รศ\.\s*ดร\.|รศ\.|ศ\.)\s*/, "");
  const parts = cleanName.trim().split(/\s+/);
  if (parts.length >= 2) {
    return `${parts[0].charAt(0)}${parts[1].charAt(0)}`.toUpperCase();
  }
  return cleanName.charAt(0).toUpperCase();
};

const getRoleLabel = (role: string) => {
  switch (role) {
    case "admin":
      return "ผู้ดูแลระบบ";
    case "teacher":
      return "อาจารย์ผู้สอน";
    case "student":
      return "นักเรียน";
    default:
      return role;
  }
};

const getRoleStyles = (role: string) => {
  switch (role) {
    case "admin":
      return "bg-rose-500/10 text-rose-400 border-rose-500/20";
    case "teacher":
      return "bg-amber-500/10 text-amber-400 border-amber-500/20";
    case "student":
    default:
      return "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
  }
};

interface HeaderProps {
  activeTab?: string;
  setActiveTab?: (tab: string) => void;
  tabs?: { id: string; label: string; icon?: React.ReactNode }[];
}

export default function Header({ activeTab, setActiveTab, tabs }: HeaderProps) {
  const { user, logout, settings, refreshProfile } = useSystem();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = React.useState(false);

  // Profile Dialog States
  const [isProfileOpen, setIsProfileOpen] = React.useState(false);
  const [isSaving, setIsSaving] = React.useState(false);
  const [fullName, setFullName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");

  if (!user) return null;

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (password) {
      if (password.length < 6) {
        toast.error("รหัสผ่านใหม่ต้องมีความยาวอย่างน้อย 6 ตัวอักษร");
        return;
      }
      if (password !== confirmPassword) {
        toast.error("รหัสผ่านใหม่และการยืนยันรหัสผ่านไม่ตรงกัน");
        return;
      }
    }

    try {
      setIsSaving(true);
      await apiRequest("/auth/profile", "PUT", {
        full_name: fullName,
        email: email,
        password: password || undefined,
      });

      await refreshProfile();
      toast.success("บันทึกข้อมูลส่วนตัวสำเร็จแล้ว");
      setIsProfileOpen(false);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "เกิดข้อผิดพลาดในการบันทึกข้อมูล";
      toast.error(errorMsg);
    } finally {
      setIsSaving(false);
    }
  };

  const sysName = settings["system_name"] || "GPMS : Group Project Management System";

  return (
    <header className="bg-slate-900 border-b border-slate-800 text-white sticky top-0 z-50 shadow-md font-sans">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo & System Name */}
          <div className="flex items-center gap-3">
            {tabs && setActiveTab && (
              <button
                type="button"
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                className="md:hidden flex items-center justify-center p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/80 focus:outline-none transition-colors"
                aria-expanded={isMobileMenuOpen}
              >
                {isMobileMenuOpen ? (
                  <X className="h-6 w-6 text-slate-200" />
                ) : (
                  <Menu className="h-6 w-6 text-slate-200" />
                )}
              </button>
            )}
            {settings["logo_path"] ? (
              <img 
                src={settings["logo_path"].startsWith("http") ? settings["logo_path"] : `${BACKEND_URL}${settings["logo_path"]}`} 
                alt="Logo" 
                className="h-8 w-8 object-contain"
              />
            ) : (
              <GraduationCap className="h-8 w-8 text-tu-pink" />
            )}
            <span className="font-bold text-lg hidden sm:block tracking-tight text-tu-pink">
              {sysName}
            </span>
            <span className="font-bold text-lg sm:hidden text-tu-pink">
              GPMS
            </span>
          </div>

          {/* Dynamic Navigation Tabs (desktop) */}
          {tabs && setActiveTab && (
            <nav className="hidden md:flex space-x-1.5">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold transition-all duration-200 ${
                    activeTab === tab.id
                      ? "bg-tu-pink text-white shadow-md shadow-tu-pink/20"
                      : "text-slate-400 hover:text-white hover:bg-slate-800"
                  }`}
                >
                  {tab.icon}
                  {tab.label}
                </button>
              ))}
            </nav>
          )}

          {/* User Info & Dropdown Menu */}
          <div className="flex items-center">
            <DropdownMenu>
              <DropdownMenuTrigger className="flex items-center gap-2 p-1 pl-1.5 pr-2.5 rounded-full bg-slate-800/30 border border-slate-800/50 hover:bg-slate-800/70 hover:border-slate-700/60 active:scale-98 transition-all duration-200 text-left outline-none cursor-pointer">
                {/* Avatar Circle */}
                <div className="h-8 w-8 rounded-full bg-gradient-to-br from-tu-pink to-pink-600 flex items-center justify-center text-white font-bold text-xs shadow-inner uppercase tracking-wider">
                  {getInitials(user.full_name)}
                </div>
                
                {/* Name and Role text */}
                <div className="hidden sm:flex flex-col text-[11px] leading-tight">
                  <span className="font-semibold text-slate-200 truncate max-w-[120px]">
                    {user.full_name}
                  </span>
                  <span className="text-[9px] text-slate-400 font-medium">
                    {getRoleLabel(user.role)}
                  </span>
                </div>

                <ChevronDown className="h-3.5 w-3.5 text-slate-400 hidden sm:block ml-0.5" />
              </DropdownMenuTrigger>

              <DropdownMenuContent
                align="end"
                className="w-56 bg-slate-900 border border-slate-800 text-slate-200 p-1.5 shadow-xl rounded-xl z-[100]"
              >
                {/* User Details Header card */}
                <div className="flex flex-col gap-2.5 p-3 bg-slate-950/45 rounded-lg border border-slate-800/50 mb-1">
                  <div className="flex items-center gap-2.5">
                    <div className="h-9 w-9 rounded-full bg-gradient-to-br from-tu-pink to-pink-600 flex items-center justify-center text-white font-bold text-sm shadow-md uppercase">
                      {getInitials(user.full_name)}
                    </div>
                    <div className="flex flex-col min-w-0">
                      <span className="font-semibold text-slate-100 text-xs truncate leading-snug">
                        {user.full_name}
                      </span>
                      <span className="text-slate-400 text-[10px] truncate">
                        {user.email || `@${user.username}`}
                      </span>
                    </div>
                  </div>
                  
                  <div className="flex justify-start">
                    <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border tracking-wide uppercase ${getRoleStyles(user.role)}`}>
                      {getRoleLabel(user.role)}
                    </span>
                  </div>
                </div>

                <DropdownMenuSeparator className="bg-slate-800/60 my-1" />

                <DropdownMenuItem 
                  onClick={() => {
                    setFullName(user.full_name);
                    setEmail(user.email || "");
                    setPassword("");
                    setConfirmPassword("");
                    setIsProfileOpen(true);
                  }}
                  className="flex items-center gap-2 px-2.5 py-1.5 text-xs text-slate-300 hover:text-white hover:bg-slate-800 rounded-md transition-colors cursor-pointer focus:bg-slate-800 focus:text-white outline-none"
                >
                  <UserIcon className="h-3.5 w-3.5 text-slate-400" />
                  <span>ข้อมูลส่วนตัว</span>
                </DropdownMenuItem>

                <DropdownMenuSeparator className="bg-slate-800/60 my-1" />

                <DropdownMenuItem
                  onClick={logout}
                  variant="destructive"
                  className="flex items-center gap-2 px-2.5 py-1.5 text-xs rounded-md transition-colors cursor-pointer outline-none"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  <span>ออกจากระบบ</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      {/* Backdrop overlay for mobile menu */}
      {tabs && setActiveTab && isMobileMenuOpen && (
        <div 
          className="md:hidden fixed inset-0 top-16 z-40 bg-slate-950/60 backdrop-blur-sm transition-opacity duration-300"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Mobile Dropdown Menu */}
      {tabs && setActiveTab && isMobileMenuOpen && (
        <div className="md:hidden absolute top-16 left-0 right-0 z-50 border-b border-slate-800 bg-slate-900/95 backdrop-blur-md shadow-2xl transition-all duration-300 ease-in-out transform origin-top">
          <div className="px-3 py-3 space-y-1.5 max-h-[calc(100vh-4rem)] overflow-y-auto">
            {tabs.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => {
                    setActiveTab(tab.id);
                    setIsMobileMenuOpen(false);
                  }}
                  className={`flex items-center gap-3 w-full px-4 py-3 rounded-xl text-sm font-semibold transition-all duration-200 active:scale-98 ${
                    isActive
                      ? "bg-tu-pink text-white shadow-md shadow-tu-pink/20"
                      : "text-slate-400 hover:text-white hover:bg-slate-800/60"
                  }`}
                >
                  {tab.icon}
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Profile Dialog */}
      <Dialog open={isProfileOpen} onOpenChange={setIsProfileOpen}>
        <DialogContent className="bg-slate-950 border border-slate-800 text-slate-200 max-w-md shadow-2xl rounded-2xl p-6 z-[101]">
          <DialogHeader className="pb-4 border-b border-slate-800">
            <DialogTitle className="text-slate-100 flex items-center gap-2 text-lg">
              <UserIcon className="h-5 w-5 text-tu-pink" />
              <span>ข้อมูลส่วนตัว</span>
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleUpdateProfile} className="space-y-4 pt-4">
            {/* Account Info (Read only) */}
            <div className="bg-slate-900/60 p-4 rounded-xl border border-slate-800/80 space-y-2.5">
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-400">ชื่อผู้ใช้งาน:</span>
                <span className="font-mono text-slate-200 font-semibold">{user.username}</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-400">บทบาทระบบ:</span>
                <span className={`px-2 py-0.5 rounded-full border text-[10px] font-bold uppercase ${getRoleStyles(user.role)}`}>
                  {getRoleLabel(user.role)}
                </span>
              </div>
              {user.role === "student" && (
                <>
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-400">ห้องเรียน:</span>
                    <span className="text-slate-200 font-semibold">{user.classroom?.name || "ยังไม่มีห้องเรียน"}</span>
                  </div>
                  {user.group ? (
                    <>
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-slate-400">กลุ่ม:</span>
                        <span className="text-slate-200 font-semibold">{user.group.name}</span>
                      </div>
                      <div className="flex justify-between items-start text-xs gap-4">
                        <span className="text-slate-400 shrink-0">หัวข้องาน:</span>
                        <span className="text-slate-200 font-semibold text-right break-words">{user.group.project_topic || "-"}</span>
                      </div>
                    </>
                  ) : (
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-slate-400">กลุ่ม:</span>
                      <span className="text-slate-400 italic">ยังไม่มีกลุ่ม</span>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Editable Fields */}
            <div className="space-y-3 pt-2">
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">ชื่อ-นามสกุล</label>
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 text-slate-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-tu-pink/70 transition-colors"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">อีเมล</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 text-slate-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-tu-pink/70 transition-colors"
                  placeholder="เช่น example@tu.ac.th"
                />
              </div>

              <div className="pt-2 border-t border-slate-800/80 space-y-3">
                <span className="block text-[11px] font-bold text-tu-pink uppercase tracking-wide">เปลี่ยนรหัสผ่าน (เว้นว่างหากไม่ต้องการเปลี่ยน)</span>
                
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-slate-400">รหัสผ่านใหม่</label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 text-slate-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-tu-pink/70 transition-colors"
                    placeholder="ขั้นต่ำ 6 ตัวอักษร"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-slate-400">ยืนยันรหัสผ่านใหม่</label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 text-slate-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-tu-pink/70 transition-colors"
                    placeholder="กรอกรหัสผ่านอีกครั้ง"
                  />
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-2.5 pt-4 border-t border-slate-800/60 mt-6">
              <button
                type="button"
                onClick={() => setIsProfileOpen(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-slate-200 transition-colors bg-slate-900/40 hover:bg-slate-900 border border-slate-800/60 rounded-lg cursor-pointer"
                disabled={isSaving}
              >
                ยกเลิก
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className="px-4 py-2 text-xs font-bold text-white bg-tu-pink hover:bg-tu-pink-hover active:scale-98 rounded-lg shadow-md shadow-tu-pink/20 transition-all cursor-pointer flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSaving ? "กำลังบันทึก..." : "บันทึกข้อมูล"}
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </header>
  );
}
