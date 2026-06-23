'use client';

import { useState } from 'react';
import Link from 'next/link';
import { apiFetch, ApiError } from '@/lib/api-client';
import { Button, Card, Input, Label, buttonVariants } from '@/components/ui';

export default function ReclamerComptePage() {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    try {
      await apiFetch('/v1/auth/buyer/claim/request', {
        method: 'POST',
        body: JSON.stringify({ email }),
      });
      setSubmitted(true);
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
      else setError('Une erreur est survenue');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-muted px-4 py-12">
      <div className="w-full max-w-md">
        <div className="text-center mb-5">
          <Link href="/" className="inline-block">
            <span className="text-2xl font-extrabold text-primary tracking-tight">teka</span>
            <span className="text-2xl font-bold text-foreground tracking-tight">.cd</span>
          </Link>
        </div>

        <Card padding="lg" variant="elevated">
          <div className="text-center mb-6">
            <h1 className="text-2xl font-bold text-foreground tracking-tight">
              {"Réclamer mon ancien compte"}
            </h1>
            <p className="text-muted-foreground mt-2 text-sm">{"Si vous aviez un compte avec email seulement, entrez-le ici. Nous vous enverrons un lien pour ajouter votre WhatsApp."}</p>
          </div>

          {submitted ? (
            <div className="space-y-4">
              <div className="p-4 rounded-lg bg-success-subtle border border-success/30 text-sm">
                <div className="flex items-start gap-2">
                  <svg
                    className="w-5 h-5 text-success shrink-0 mt-0.5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  <span className="text-foreground">{"Si un compte correspond, un email vous a été envoyé."}</span>
                </div>
              </div>
              <Link
                href="/connexion"
                className={buttonVariants({ variant: 'default', size: 'lg', className: 'w-full' })}
              >
                ← {"Connexion ou inscription"}
              </Link>
            </div>
          ) : (
            <>
              {error && (
                <div className="mb-4 p-3 rounded-lg bg-destructive-subtle border border-destructive/30 text-destructive text-sm">
                  {error}
                </div>
              )}
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <Label htmlFor="email">{"Adresse email"}</Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                    required
                  />
                </div>
                <Button
                  type="submit"
                  disabled={isLoading || !email}
                  size="lg"
                  className="w-full"
                >
                  {isLoading ? '...' : "Envoyer le lien"}
                </Button>
              </form>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
