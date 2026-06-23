import Link from 'next/link';

export default function NotFound() {

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="text-center max-w-md">
        <div className="text-8xl font-bold text-muted-foreground/30 mb-4">404</div>
        <h1 className="text-2xl font-bold text-foreground mb-2">
          {"Page non trouvée"}
        </h1>
        <p className="text-muted-foreground mb-6">
          {"La page que vous recherchez n'existe pas ou a été déplacée."}
        </p>
        <Link
          href="/"
          className="inline-block px-6 py-2.5 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 transition-colors"
        >
          {"Retour à l'accueil"}
        </Link>
      </div>
    </div>
  );
}
