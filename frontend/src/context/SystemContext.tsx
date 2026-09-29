"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import { apiRequest, fetchSystemSettings, clearAuth, setToken, User, BACKEND_URL } from "../lib/api";
import { useRouter, usePathname } from "next/navigation";

interface SystemContextType {
  settings: Record<string, string>;
  user: User | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<User>;
  logout: () => void;
  refreshProfile: () => Promise<void>;
  updateLocalSettings: (newSettings: Record<string, string>) => void;
}

const SystemContext = createContext<SystemContextType | undefined>(undefined);

export function SystemProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  const applyTheme = (settingsMap: Record<string, string>) => {
    if (typeof document === "undefined") return;
    const root = document.documentElement;

    const primary = settingsMap["color_primary"] || "#D81B60";
    const secondary = settingsMap["color_secondary"] || "#1e293b";
    const bgStart = settingsMap["color_bg_start"] || "#f8fafc";
    const bgEnd = settingsMap["color_bg_end"] || "#f1f5f9";

    // Set CSS variables
    root.style.setProperty("--primary", primary);
    root.style.setProperty("--secondary", secondary);
    root.style.setProperty("--bg-gradient-start", bgStart);
    root.style.setProperty("--bg-gradient-end", bgEnd);
    root.style.setProperty("--tu-pink", primary);
    root.style.setProperty("--tu-pink-hover", primary === "#D81B60" ? "#AD1457" : primary);
    root.style.setProperty("--tu-pink-light", primary === "#D81B60" ? "#F48FB1" : primary + "44");

    // Also override shadcn oklch values directly if we want raw HEX support
    root.style.setProperty("--background", "0 0% 100%"); // Light fallback
    root.style.setProperty("--foreground", "240 10% 3.9%");

    // Set Favicon dynamically
    const faviconUrl = settingsMap["favicon_path"];
    if (faviconUrl) {
      let fullFaviconUrl = faviconUrl;
      if (faviconUrl.startsWith("/uploads/")) {
        fullFaviconUrl = `${BACKEND_URL}${faviconUrl}`;
      }
      
      let link: HTMLLinkElement | null = document.querySelector("link[rel*='icon']");
      if (!link) {
        link = document.createElement('link');
        link.rel = 'icon';
        document.getElementsByTagName('head')[0].appendChild(link);
      }
      link.href = fullFaviconUrl;
    }
  };

  const refreshProfile = async () => {
    try {
      const profile = await apiRequest<User>("/auth/profile");
      setUser(profile);
      if (typeof window !== "undefined") {
        localStorage.setItem("gpms_user", JSON.stringify(profile));
      }
    } catch (err) {
      console.error("Failed to load profile, user might need to log in again:", err);
      clearAuth();
      setUser(null);
      if (pathname !== "/login" && pathname !== "/") {
        router.push("/login");
      }
    }
  };

  const login = async (username: string, password: string) => {
    const res = await apiRequest("/auth/login", "POST", { username, password });
    setToken(res.token);
    setUser(res.user);
    if (typeof window !== "undefined") {
      localStorage.setItem("gpms_user", JSON.stringify(res.user));
    }
    
    // Redirect based on role
    if (res.user.role === "admin") {
      router.push("/admin");
    } else if (res.user.role === "teacher") {
      router.push("/teacher");
    } else {
      router.push("/student");
    }
    return res.user;
  };

  const logout = () => {
    clearAuth();
    setUser(null);
    router.push("/login");
  };

  const updateLocalSettings = (newSettings: Record<string, string>) => {
    const updated = { ...settings, ...newSettings };
    setSettings(updated);
    applyTheme(updated);
  };

  // Initial load
  useEffect(() => {
    async function init() {
      // 1. Fetch system configs
      const configs = await fetchSystemSettings();
      setSettings(configs);
      applyTheme(configs);

      // 2. Load user profile if token exists
      const savedToken = localStorage.getItem("gpms_token");
      if (savedToken) {
        await refreshProfile();
      } else {
        if (pathname !== "/login" && pathname !== "/") {
          router.push("/login");
        }
      }
      setLoading(false);
    }
    init();
  }, []);

  return (
    <SystemContext.Provider
      value={{
        settings,
        user,
        loading,
        login,
        logout,
        refreshProfile,
        updateLocalSettings,
      }}
    >
      {children}
    </SystemContext.Provider>
  );
}

export function useSystem() {
  const context = useContext(SystemContext);
  if (!context) {
    throw new Error("useSystem must be used within a SystemProvider");
  }
  return context;
}
