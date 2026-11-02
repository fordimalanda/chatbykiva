import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center text-center px-4">
      <h2 className="text-3xl font-bold text-white mb-2">404 - Page non trouvée</h2>
      <p className="text-slate-400 mb-6">
        La page que vous recherchez n&apos;existe pas ou a été déplacée.
      </p>
      <Link
        href="/feed"
        className="rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 transition-colors"
      >
        Retourner au fil d&apos;actualité
      </Link>
    </div>
  );
}
