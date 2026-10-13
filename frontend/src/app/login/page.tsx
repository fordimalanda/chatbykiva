"use client";

import { useState } from "react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Database, AlertCircle, LogIn, Eye, EyeOff, Sparkles, UserCheck } from "lucide-react";

export default function LoginPage() {
  const { login } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!username.trim() || !password) {
      setError("Veuillez renseigner tous les champs.");
      return;
    }

    setLoading(true);
    try {
      await login({ username: username.trim().toLowerCase(), password });
    } catch (err: any) {
      setError(err.message || "Identifiant ou mot de passe incorrect");
    } finally {
      setLoading(false);
    }
  };

  const handleQuickLogin = (demoUser: string, demoPass: string) => {
    setUsername(demoUser);
    setPassword(demoPass);
  };

  return (
    <div className="min-h-[85vh] flex items-center justify-center px-4 py-8 sm:py-12">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex h-14 w-14 rounded-2xl bg-gradient-to-tr from-indigo-500 via-purple-500 to-pink-500 items-center justify-center mb-4 shadow-xl shadow-indigo-500/25">
            <Database className="h-7 w-7 text-white" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">Connexion à KivaSocial</h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Persistance NoSQL 100% sur <span className="font-mono text-indigo-300 font-semibold">KivaDB</span>
          </p>
        </div>

        <Card className="border-slate-800/90 shadow-2xl bg-slate-900/80 backdrop-blur-xl">
          <CardHeader>
            <CardTitle>Identifiants</CardTitle>
            <CardDescription>
              Entrez votre nom d&apos;utilisateur et mot de passe.
            </CardDescription>
          </CardHeader>

          <form onSubmit={handleSubmit}>
            <CardContent className="space-y-4">
              {error && (
                <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3.5 flex items-start gap-3 text-rose-300 text-sm">
                  <AlertCircle className="h-5 w-5 shrink-0 text-rose-400 mt-0.5" />
                  <p>{error}</p>
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                  Nom d&apos;utilisateur
                </label>
                <Input
                  type="text"
                  placeholder="ex: alice ou bob"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoComplete="username"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                  Mot de passe
                </label>
                <div className="relative">
                  <Input
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                    className="pr-10"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-3 text-slate-400 hover:text-white"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {/* Demo Accounts Quick-Fill */}
              <div className="pt-2 border-t border-slate-800/60">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-2 flex items-center gap-1.5">
                  <Sparkles className="h-3 w-3 text-indigo-400" />
                  Comptes de test rapide :
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    { name: "alice", pass: "alice123" },
                    { name: "bob", pass: "bob123" },
                  ].map((demo) => (
                    <button
                      key={demo.name}
                      type="button"
                      onClick={() => handleQuickLogin(demo.name, demo.pass)}
                      className="px-2.5 py-1 rounded-lg bg-slate-800/80 hover:bg-slate-700 border border-slate-700/60 text-[11px] text-slate-300 font-mono transition-colors"
                    >
                      @{demo.name}
                    </button>
                  ))}
                </div>
              </div>
            </CardContent>

            <CardFooter className="flex flex-col gap-4">
              <Button type="submit" className="w-full gap-2 shadow-lg shadow-indigo-500/20" isLoading={loading}>
                <LogIn className="h-4 w-4" />
                Se connecter
              </Button>

              <p className="text-xs text-center text-slate-400">
                Pas encore de compte ?{" "}
                <Link href="/register" className="text-indigo-400 hover:text-indigo-300 font-semibold underline underline-offset-4">
                  Créer un compte
                </Link>
              </p>
            </CardFooter>
          </form>
        </Card>
      </div>
    </div>
  );
}
