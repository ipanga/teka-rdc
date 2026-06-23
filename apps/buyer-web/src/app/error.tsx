'use client';

import Link from 'next/link';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="text-center max-w-md">
        <div className="text-6xl mb-4">&#9888;&#65039;</div>
        <h1 className="text-2xl font-bold text-foreground mb-2">
          {"Une erreur est survenue"}
        </h1>
        <p className="text-muted-foreground mb-6">
          {"Nous sommes désolés, quelque chose s'est mal passé. Veuillez réessayer."}
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <button
            onClick={reset}
            className="px-6 py-2.5 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 transition-colors"
          >
            {"Réessayer"}
          </button>
          <Link
            href="/"
            className="px-6 py-2.5 border border-border rounded-lg font-medium text-foreground hover:bg-muted transition-colors"
          >
            {"Retour à l'accueil"}
          </Link>
        </div>
      </div>
    </div>
  );
}
