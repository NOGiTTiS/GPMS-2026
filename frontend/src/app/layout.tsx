import type { Metadata } from "next";
import { Prompt, Geist_Mono } from "next/font/google";
import "./globals.css";
import { SystemProvider } from "../context/SystemContext";
import { Toaster } from "../components/ui/sonner";

const prompt = Prompt({
  subsets: ["thai", "latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-prompt",
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "GPMS : Group Project Management System",
  description: "ระบบบริหารจัดการการส่งงานกลุ่มในชั้นเรียน",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="th"
      className={`${prompt.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body 
        className={`${prompt.className} font-sans min-h-full flex flex-col text-slate-800`}
        style={{
          background: `linear-gradient(to bottom, var(--bg-gradient-start, #f8fafc), var(--bg-gradient-end, #f1f5f9))`,
          backgroundAttachment: "fixed",
        }}
      >
        <SystemProvider>
          {children}
          <Toaster position="top-right" richColors />
        </SystemProvider>
      </body>
    </html>
  );
}

