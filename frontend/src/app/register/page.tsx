"use client";

import { useState } from "react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Database, AlertCircle, UserPlus, Sparkles, Eye, EyeOff } from "lucide-react";

export default function RegisterPage() {
  const { register } = useAuth();
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Robustesse indicative : longueur + variété des caractères
  const strength = [password.length >= 8, /[A-Z]/.test(password) && /[a-z]/.test(password), /[0-9]/.test(password), /[^A-Za-z0-9]/.test(password)].filter(Boolean).length;
  const strengthLabel = ["Très faible", "Faible", "Moyen", "Bon", "Excellent"][strength];
  const strengthColor = ["bg-rose-500", "bg-rose-500", "bg-amber-500", "bg-emerald-500", "bg-emerald-400"][strength];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!username.trim() || !password) {
      setError("Le nom d'utilisateur et le mot de passe sont obligatoires.");
      return;
    }

    if (username.trim().length < 3) {
      setError("Le nom d'utilisateur doit contenir au moins 3 caractères.");
      return;
    }

    if (password.length < 6) {
      setError("Le mot de passe doit contenir au moins 6 caractères.");
      return;
    }

    setLoading(true);
    try {
      await register({
        username: username.trim(),
        password,
        displayName: displayName.trim() || username.trim(),
        bio: bio.trim(),
      });
    } catch (err: any) {
      setError(err.message || "Erreur lors de l'inscription");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[85dvh] flex items-center justify-center px-4 py-8 sm:py-12">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex h-12 w-12 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 items-center justify-center mb-4">
            <Sparkles className="h-6 w-6 text-indigo-400" />
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Rejoindre KivaSocial</h1>
          <p className="text-sm text-slate-400 mt-1">
            Création d&apos;un document sous <span className="font-mono text-indigo-300">user:&lt;username&gt;</span>
          </p>
        </div>

        <Card className="border-slate-800/90 p-5 shadow-2xl sm:p-6">
          <CardHeader>
            <CardTitle>Inscription</CardTitle>
            <CardDescription>
              Créez votre profil persistant dans KivaDB.
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
                  Nom d&apos;utilisateur *
                </label>
                <Input
                  type="text"
                  placeholder="ex: bob"
                  value={username}
                  onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ""))}
                  maxLength={24}
                  autoCapitalize="none"
                  autoCorrect="off"
                  autoComplete="username"
                  required
                />
                <span className="text-[11px] text-slate-400">
                  Clé générée : <code className="text-indigo-400 font-mono">user:{username || "..."}</code>
                </span>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                  Nom d&apos;affichage (Optionnel)
                </label>
                <Input
                  type="text"
                  placeholder="ex: Bob Dylan"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                  Bio / Présentation
                </label>
                <Input
                  type="text"
                  placeholder="Passionné de bases de données distribuées..."
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                  Mot de passe *
                </label>
                <div className="relative">
                  <Input
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="new-password"
                    className="pr-10"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                    aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {password && (
                  <div className="flex items-center gap-2 pt-1">
                    <div className="flex flex-1 gap-1">
                      {[0, 1, 2, 3].map((i) => (
                        <span key={i} className={`h-1 flex-1 rounded-full ${i < Math.max(1, strength) ? strengthColor : "bg-slate-800"}`} />
                      ))}
                    </div>
                    <span className="text-[11px] text-slate-400">{password.length < 6 ? "6 caractères min." : strengthLabel}</span>
                  </div>
                )}
              </div>
            </CardContent>

            <CardFooter className="flex flex-col gap-4">
              <Button type="submit" className="w-full gap-2" isLoading={loading}>
                <UserPlus className="h-4 w-4" />
                Créer mon compte
              </Button>

              <p className="text-xs text-center text-slate-400">
                Déjà inscrit ?{" "}
                <Link href="/login" className="text-indigo-400 hover:text-indigo-300 font-semibold underline underline-offset-4">
                  Se connecter
                </Link>
              </p>
            </CardFooter>
          </form>
        </Card>
      </div>
    </div>
  );
}
