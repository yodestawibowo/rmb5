import React, { useState } from 'react';
import { 
  LogIn, 
  Lock, 
  User, 
  ShieldCheck, 
  CheckCircle2, 
  ArrowRight, 
  Eye, 
  EyeOff, 
  KeyRound,
  UserCheck
} from 'lucide-react';

interface LoginSectionProps {
  onLoginSuccess: (user: { name: string; role: string; email: string }) => void;
  redirectReason?: string | null;
}

export const LoginSection: React.FC<LoginSectionProps> = ({
  onLoginSuccess,
  redirectReason,
}) => {
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('admin');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Quick 1-click admin login
  const handleQuickAdminLogin = () => {
    setIsLoading(true);
    setTimeout(() => {
      onLoginSuccess({
        name: 'Administrator',
        role: 'Super Admin & Pengelola Portal',
        email: 'admin',
      });
      setIsLoading(false);
    }, 200);
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    setTimeout(() => {
      const cleanUser = username.trim().toLowerCase();
      const cleanPass = password.trim();

      if (cleanUser === 'admin' && cleanPass === 'admin') {
        onLoginSuccess({
          name: 'Administrator',
          role: 'Super Admin & Pengelola Portal',
          email: 'admin',
        });
      } else {
        setError('Username atau password tidak sesuai. Gunakan user: admin dan password: admin');
      }
      setIsLoading(false);
    }, 250);
  };

  return (
    <div className="max-w-md mx-auto my-6 sm:my-10 px-4 animate-in fade-in duration-300">
      <div className="bg-white border border-neutral-200/90 rounded-3xl p-6 sm:p-8 shadow-sm">
        {/* Friendly Header with Official Logo */}
        <div className="flex items-center gap-3.5 mb-4">
          <img
            src="/logo.jpeg"
            alt="Logo Resmi Warung Rimbun"
            className="w-12 h-12 rounded-2xl object-contain border border-neutral-200/90 shadow-2xs bg-white p-0.5 shrink-0"
          />
          <div>
            <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 text-3xs font-bold uppercase tracking-wider mb-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span>Ruang Pengelola Warung Rimbun</span>
            </div>
            <h2 className="text-lg sm:text-xl font-bold tracking-tight text-neutral-900 font-serif">
              Masuk Panel Administrator
            </h2>
          </div>
        </div>

        <p className="text-xs text-neutral-500 leading-relaxed mb-5">
          Masuk untuk mempublikasikan kegiatan, memantau kurva target program unggulan, dan mengelola naskah jurnal lapangan.
        </p>

        {/* Redirect notice if triggered by protected action */}
        {redirectReason && (
          <div className="mb-5 p-3 rounded-2xl bg-amber-50 border border-amber-200/80 text-amber-900 text-xs flex items-start gap-2.5">
            <KeyRound className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" />
            <div className="leading-relaxed">
              <span className="font-semibold block mb-0.5">Akses Memerlukan Izin</span>
              <span>{redirectReason}</span>
            </div>
          </div>
        )}

        {/* Default Credential Info Banner */}
        <div className="mb-4 p-3 rounded-2xl bg-neutral-50 border border-neutral-200/80 text-neutral-700 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-emerald-600 shrink-0" />
            <div>
              <span className="font-semibold block text-2xs text-neutral-500 uppercase tracking-wide">Kredensial Default</span>
              <span className="font-mono text-xs font-bold text-neutral-900">user: admin · password: admin</span>
            </div>
          </div>
          <button
            type="button"
            onClick={handleQuickAdminLogin}
            disabled={isLoading}
            className="px-2.5 py-1 text-2xs font-semibold bg-emerald-100 hover:bg-emerald-200 text-emerald-800 rounded-lg transition-colors cursor-pointer"
          >
            Masuk Cepat
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-2xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Primary Admin Login Form */}
        <form onSubmit={handleFormSubmit} className="space-y-3.5">
          <div>
            <label className="block text-2xs font-semibold text-neutral-700 mb-1">
              Username
            </label>
            <div className="relative">
              <User className="w-4 h-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="admin"
                className="w-full text-xs pl-9 pr-3 py-2.5 bg-neutral-50 border border-neutral-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-neutral-900 focus:bg-white text-neutral-900 font-medium"
              />
            </div>
          </div>

          <div>
            <label className="block text-2xs font-semibold text-neutral-700 mb-1">
              Password
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type={showPassword ? 'text' : 'password'}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="admin"
                className="w-full text-xs pl-9 pr-9 py-2.5 bg-neutral-50 border border-neutral-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-neutral-900 focus:bg-white text-neutral-900 font-medium"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-700 p-0.5"
                title={showPassword ? 'Sembunyikan sandi' : 'Tampilkan sandi'}
              >
                {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          <div className="pt-1 space-y-2">
            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-2.5 px-4 bg-neutral-900 hover:bg-neutral-800 text-white rounded-xl text-xs sm:text-sm font-semibold transition-all flex items-center justify-center gap-2 shadow-xs group cursor-pointer disabled:opacity-70"
            >
              {isLoading ? (
                <span className="animate-pulse">Memverifikasi Admin...</span>
              ) : (
                <>
                  <LogIn className="w-4 h-4 text-emerald-400" />
                  <span>Masuk sebagai Admin</span>
                  <ArrowRight className="w-3.5 h-3.5 text-neutral-400 group-hover:translate-x-0.5 transition-transform" />
                </>
              )}
            </button>
          </div>
        </form>

        {/* Privileges List */}
        <div className="mt-5 pt-4 border-t border-neutral-100">
          <span className="text-3xs uppercase tracking-wider font-semibold text-neutral-400 block mb-2">
            Fasilitas Akses Pengelola:
          </span>
          <div className="grid grid-cols-1 gap-1.5 text-2xs text-neutral-600">
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              <span>Tambah &amp; publikasikan kegiatan baru beserta galeri foto</span>
            </div>
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              <span>Rencanakan target tahunan &amp; kurva grafik program unggulan</span>
            </div>
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              <span>Kelola, edit, dan hapus kategori program dengan mudah</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
