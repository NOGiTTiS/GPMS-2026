"use client";

import React, { useState } from "react";
import { useSystem } from "../../context/SystemContext";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "../../components/ui/card";
import { toast } from "sonner";
import { Lock, User as UserIcon, ShieldAlert, Loader2, LogIn } from "lucide-react";
import { Label } from "../../components/ui/label";
import { BACKEND_URL } from "../../lib/api";

export default function LoginPage() {
  const { login, settings } = useSystem();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) {
      toast.error("กรุณากรอกชื่อผู้ใช้และรหัสผ่าน");
      return;
    }

    setLoading(true);
    try {
      await login(username, password);
      toast.success("เข้าสู่ระบบสำเร็จ");
    } catch (err: any) {
      toast.error(err.message || "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง");
    } finally {
      setLoading(false);
    }
  };

  const sysName = settings["system_name"] || "GPMS : Group Project Management System";
  const sysDesc = settings["system_description"] || "ระบบบริหารจัดการการส่งงานกลุ่มในชั้นเรียน";
  const footerText = settings["footer_text"] || "© 2026 GPMS. All Rights Reserved.";
  const institutionName = settings["institution_name"] || "";

  return (
    <div className="flex flex-1 flex-col items-center justify-center min-h-screen bg-slate-50 font-sans px-4">
      {/* Announcement Alert */}
      {settings["popup_active"] === "true" && (
        <div className="mb-6 max-w-md w-full bg-primary/10 backdrop-blur-md border border-primary/30 text-slate-800 rounded-lg p-4 flex gap-3 shadow-lg">
          <ShieldAlert className="h-5 w-5 text-primary shrink-0 mt-0.5 animate-pulse" />
          <div>
            <h4 className="font-semibold text-sm text-primary">ประกาศระบบ</h4>
            <p className="text-xs mt-1 leading-relaxed text-slate-600">{settings["popup_content"]}</p>
          </div>
        </div>
      )}

      <Card className="w-full max-w-md shadow-2xl border-none rounded-3xl overflow-hidden bg-white">
        <div className="bg-slate-900 p-6 text-center rounded-t-3xl">
          {settings["logo_path"] && (
            <div className="mb-4 flex justify-center">
              <div className="relative w-20 h-20 rounded-2xl overflow-hidden bg-white/10 p-2">
                <img
                  src={settings["logo_path"].startsWith("http") ? settings["logo_path"] : `${BACKEND_URL}${settings["logo_path"]}`}
                  alt="Logo"
                  className="w-full h-full object-contain"
                />
              </div>
            </div>
          )}
          <h1 className="text-3xl font-bold text-tu-pink tracking-wider">
            {sysName}
          </h1>
          <p className="text-slate-400 text-xs mt-2 leading-relaxed">
            {sysDesc} {institutionName && `| ${institutionName}`}
          </p>
        </div>

        <CardHeader className="text-center pb-2 pt-4">
          <CardTitle className="text-xl font-bold text-slate-800">
            เข้าสู่ระบบ
          </CardTitle>
          <CardDescription>
            กรุณากรอกชื่อผู้ใช้งานและรหัสผ่านเพื่อดำเนินการต่อ
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4 px-8 pb-8">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="username" className="text-slate-700 font-medium ml-1">
                ชื่อผู้ใช้ (Username)
              </Label>
              <div className="relative">
                <UserIcon className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  id="username"
                  type="text"
                  placeholder="กรอกชื่อผู้ใช้..."
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="rounded-full h-12 pl-11 pr-4 bg-slate-50 border-slate-200 focus:bg-white transition-all shadow-sm text-slate-800"
                  disabled={loading}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-slate-700 font-medium ml-1">
                รหัสผ่าน (Password)
              </Label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  id="password"
                  type="password"
                  placeholder="กรอกรหัสผ่าน..."
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="rounded-full h-12 pl-11 pr-4 bg-slate-50 border-slate-200 focus:bg-white transition-all shadow-sm text-slate-800"
                  disabled={loading}
                />
              </div>
            </div>

            <Button
              type="submit"
              className="w-full bg-tu-pink hover:bg-tu-pink-hover text-white rounded-full h-12 text-base font-semibold shadow-lg shadow-tu-pink/20 mt-4 cursor-pointer"
              disabled={loading}
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  กำลังตรวจสอบ...
                </>
              ) : (
                <>
                  <LogIn className="mr-2 h-5 w-5" /> เข้าสู่ระบบ
                </>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>

      <footer className="mt-8 text-center text-xs text-slate-500">
        {footerText}
      </footer>
    </div>
  );
}
