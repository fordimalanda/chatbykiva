"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Database, Zap, Shield, Users, MessageSquare, ArrowRight } from "lucide-react";

export default function Home() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && user) {
      router.push("/feed");
    }
  }, [user, loading, router]);

  if (loading) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden py-16 sm:py-24">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center space-y-8 max-w-3xl mx-auto">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-indigo-500/10 border border-indigo-500/30 text-indigo-300 text-xs font-semibold uppercase tracking-wider">
            <Database className="h-3.5 w-3.5" />
            Workspace KivaDB &ldquo;social_app&rdquo;
          </div>

          <h1 className="text-4xl sm:text-6xl font-black tracking-tight text-white">
            Le Réseau Social Temps Réel Propulsé par{" "}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400">
              KivaDB
            </span>
          </h1>

          <p className="text-lg text-slate-400 max-w-2xl mx-auto">
            Une architecture moderne complète avec NestJS, Next.js et la puissance
            de la base de données NoSQL KivaDB. Suivez vos amis, chattez instantanément
            et profitez des flux WebSockets en direct.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-4 pt-4">
            <Link href="/register">
              <Button size="lg" className="gap-2 shadow-xl shadow-indigo-500/20">
                Créer un compte
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <Link href="/login">
              <Button size="lg" variant="outline">
                Se connecter
              </Button>
            </Link>
          </div>
        </div>

        {/* Feature Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-20">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-6 backdrop-blur-sm">
            <div className="h-12 w-12 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center mb-4">
              <Database className="h-6 w-6 text-indigo-400" />
            </div>
            <h3 className="text-lg font-bold text-white mb-2">Persistance KivaDB</h3>
            <p className="text-sm text-slate-400 leading-relaxed">
              Documents utilisateurs sous <code className="text-indigo-300 font-mono">user:&lt;username&gt;</code> et
              messages sous <code className="text-indigo-300 font-mono">msg:&lt;id&gt;</code> dans le workspace dédié.
            </p>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-6 backdrop-blur-sm">
            <div className="h-12 w-12 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center mb-4">
              <Zap className="h-6 w-6 text-purple-400" />
            </div>
            <h3 className="text-lg font-bold text-white mb-2">WebSockets Temps Réel</h3>
            <p className="text-sm text-slate-400 leading-relaxed">
              Pont temps réel connecté au flux natif <code className="text-purple-300 font-mono">/ws</code> de KivaDB
              pour actualiser followers et messages instantanément.
            </p>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-6 backdrop-blur-sm">
            <div className="h-12 w-12 rounded-xl bg-pink-500/10 border border-pink-500/20 flex items-center justify-center mb-4">
              <Users className="h-6 w-6 text-pink-400" />
            </div>
            <h3 className="text-lg font-bold text-white mb-2">Système Follow & Chat</h3>
            <p className="text-sm text-slate-400 leading-relaxed">
              Explorez la communauté via scan des clés, suivez vos amis et échangez
              des messages sans recharger la page.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
