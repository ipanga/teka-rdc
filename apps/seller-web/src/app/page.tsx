import Link from 'next/link';

export default function SellerHomePage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-6 p-8">
      <div className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
        Espace Vendeur
      </div>
      <h1 className="sr-only">Teka RDC</h1>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/logo.svg"
        alt="Teka RDC"
        className="h-14 w-auto"
        width={280}
        height={56}
      />
      <p className="text-lg text-muted-foreground">Votre marketplace en ligne en RD Congo</p>
      <div className="flex items-center gap-3">
        <Link
          href="/login"
          className="px-6 py-2 bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition"
        >
          Se connecter
        </Link>
        <Link
          href="/inscription"
          className="px-6 py-2 border border-primary text-primary rounded-lg hover:bg-primary/5 transition"
        >
          Créer un compte
        </Link>
      </div>
    </main>
  );
}
