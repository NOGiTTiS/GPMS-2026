"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSystem } from "../context/SystemContext";

export default function Home() {
  const { user, loading } = useSystem();
  const router = useRouter();

  useEffect(() => {
    if (!loading) {
      if (user) {
        if (user.role === "admin") {
          router.push("/admin");
        } else if (user.role === "teacher") {
          router.push("/teacher");
        } else {
          router.push("/student");
        }
      } else {
        router.push("/login");
      }
    }
  }, [user, loading, router]);

  return (
    <div className="flex flex-1 flex-col items-center justify-center bg-slate-950 text-white min-h-screen">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-500"></div>
      <p className="mt-4 text-slate-400 text-sm">กำลังโหลดข้อมูลระบบ...</p>
    </div>
  );
}

