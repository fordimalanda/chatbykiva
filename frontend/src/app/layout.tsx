import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AuthProvider } from "@/context/AuthContext";
import { SocketProvider } from "@/context/SocketContext";
import { Navbar } from "@/components/Navbar";
import { Toaster } from "@/components/Toaster";

export const metadata: Metadata = {
  title: "KivaSocial - Réseau Social propulsé par KivaDB",
  description: "Mini réseau social haute performance avec persistance NoSQL 100% KivaDB et synchronisation temps réel.",
  appleWebApp: { capable: true, title: "KivaSocial", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#030712",
  colorScheme: "dark",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" className="dark">
      <body className="bg-slate-950 text-slate-100 min-h-screen flex flex-col selection:bg-indigo-500/30 selection:text-indigo-200">
        <AuthProvider>
          <SocketProvider>
            <Navbar />
            <main className="relative z-10 flex-1 pb-[calc(var(--bottom-nav-h)+var(--safe-bottom)+0.75rem)] md:pb-8">
              {children}
            </main>
            <Toaster />
          </SocketProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
