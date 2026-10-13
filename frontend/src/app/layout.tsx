import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/context/AuthContext";
import { SocketProvider } from "@/context/SocketContext";
import { Navbar } from "@/components/Navbar";

export const metadata: Metadata = {
  title: "KivaSocial - Réseau Social propulsé par KivaDB",
  description: "Mini réseau social haute performance avec persistance NoSQL 100% KivaDB et synchronisation temps réel.",
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
            <main className="flex-1 relative z-10 pb-20 md:pb-6">{children}</main>
          </SocketProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
