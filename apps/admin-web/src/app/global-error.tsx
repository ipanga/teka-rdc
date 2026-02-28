'use client';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="fr">
      <body style={{ fontFamily: 'system-ui, -apple-system, sans-serif', margin: 0, display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', backgroundColor: '#f8fafc' }}>
        <div style={{ textAlign: 'center', padding: '2rem', maxWidth: '500px' }}>
          <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>&#9888;&#65039;</div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#1e293b', marginBottom: '0.5rem' }}>
            Une erreur est survenue
          </h1>
          <p style={{ color: '#64748b', marginBottom: '1.5rem', lineHeight: '1.6' }}>
            Nous sommes d&#233;sol&#233;s, quelque chose s&apos;est mal pass&#233;. Veuillez r&#233;essayer.
          </p>
          <button
            onClick={reset}
            style={{
              padding: '0.75rem 2rem',
              backgroundColor: '#BF0000',
              color: 'white',
              border: 'none',
              borderRadius: '0.5rem',
              fontSize: '0.875rem',
              fontWeight: '600',
              cursor: 'pointer',
            }}
          >
            R&#233;essayer
          </button>
        </div>
      </body>
    </html>
  );
}
