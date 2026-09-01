'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { Header } from '@/components/layout/header';
import { Footer } from '@/components/layout/footer';
import { useCartStore } from '@/lib/cart-store';
import { apiFetch } from '@/lib/api-client';
import { track } from '@/lib/analytics';
import { formatCDF, effectiveCentimes } from '@/lib/format';
import { Badge, Button, Card, Container, Input, Label, buttonVariants, cn } from '@/components/ui';
import type {
  Address,
  CartItem,
  PaymentMethod,
  CheckoutRequest,
  CheckoutResponse,
  Commune,
} from '@/lib/types';
import type { City } from '@/lib/city-store';

type CheckoutStep = 'address' | 'payment' | 'review';

const STEP_ORDER: CheckoutStep[] = ['address', 'payment', 'review'];

export default function CheckoutPage() {
  const router = useRouter();
  const cartItems = useCartStore((s) => s.items);
  const fetchCart = useCartStore((s) => s.fetchCart);
  const clearCart = useCartStore((s) => s.clearCart);

  const [step, setStep] = useState<CheckoutStep>('address');
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('COD');
  const [buyerNote, setBuyerNote] = useState('');
  const [isLoadingAddresses, setIsLoadingAddresses] = useState(true);
  const [isPlacing, setIsPlacing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deliveryFees, setDeliveryFees] = useState<Record<string, string>>({});
  // Delivery availability from the checkout quote. `null` = not yet loaded.
  // `false` = no active delivery zone covers this address (block — never show a
  // misleading "Gratuit"). `quoteError` = the quote request itself failed.
  const [deliveryAvailable, setDeliveryAvailable] = useState<boolean | null>(null);
  const [quoteError, setQuoteError] = useState(false);
  // Non-blocking warning: a seller ships from a different town than the
  // delivery address, so transport cost may rise. Never gates the button.
  const [townMismatch, setTownMismatch] = useState(false);
  // Stable idempotency key for this checkout intent — generated once on the
  // first place-order attempt and reused on every retry, so a retry-after-
  // timeout resolves to the same server-side order instead of duplicating it.
  const idempotencyKeyRef = useRef<string | null>(null);

  const [showNewAddressForm, setShowNewAddressForm] = useState(false);
  const [cities, setCities] = useState<City[]>([]);
  const [communes, setCommunes] = useState<Commune[]>([]);
  const [isLoadingCities, setIsLoadingCities] = useState(false);
  const [isLoadingCommunes, setIsLoadingCommunes] = useState(false);
  const [isSavingAddress, setIsSavingAddress] = useState(false);
  const [newAddr, setNewAddr] = useState({
    cityId: '',
    communeId: '',
    province: '',
    town: '',
    neighborhood: '',
    avenue: '',
    reference: '',
    recipientName: '',
    recipientPhone: '',
  });

  useEffect(() => {
    fetchCart();
    loadAddresses();
  }, [fetchCart]);

  // Buyer-owned UI event — fire once when the checkout opens with a
  // non-empty cart (server owns the authoritative order_created later).
  const checkoutTracked = useRef(false);
  useEffect(() => {
    if (checkoutTracked.current || cartItems.length === 0) return;
    checkoutTracked.current = true;
    const cartValueCdf = cartItems.reduce(
      (sum, i) => sum + Number(effectiveCentimes(i.product)) * i.quantity,
      0,
    );
    track('checkout_started', {
      item_count: cartItems.length,
      cart_value_cdf: cartValueCdf,
    });
  }, [cartItems]);

  async function loadAddresses() {
    setIsLoadingAddresses(true);
    try {
      const res = await apiFetch<Address[]>('/v1/addresses');
      setAddresses(res.data);
      const defaultAddr = res.data.find((a) => a.isDefault);
      if (defaultAddr) {
        setSelectedAddressId(defaultAddr.id);
      } else if (res.data.length > 0) {
        setSelectedAddressId(res.data[0].id);
      }
    } catch {
      // silent
    } finally {
      setIsLoadingAddresses(false);
    }
  }

  useEffect(() => {
    if (showNewAddressForm && cities.length === 0) {
      setIsLoadingCities(true);
      apiFetch<City[]>('/v1/cities')
        .then((res) => setCities(res.data))
        .catch(() => {})
        .finally(() => setIsLoadingCities(false));
    }
  }, [showNewAddressForm, cities.length]);

  useEffect(() => {
    if (!newAddr.cityId) {
      setCommunes([]);
      return;
    }
    setIsLoadingCommunes(true);
    setCommunes([]);
    apiFetch<Commune[]>(`/v1/cities/${newAddr.cityId}/communes`)
      .then((res) => setCommunes(res.data))
      .catch(() => {})
      .finally(() => setIsLoadingCommunes(false));
  }, [newAddr.cityId]);

  function handleCityChange(cityId: string) {
    const city = cities.find((c) => c.id === cityId);
    setNewAddr((prev) => ({
      ...prev,
      cityId,
      communeId: '',
      province: city?.province || '',
      town: city?.name || '',
      neighborhood: '',
    }));
  }

  function handleCommuneChange(communeId: string) {
    const commune = communes.find((c) => c.id === communeId);
    setNewAddr((prev) => ({
      ...prev,
      communeId,
      neighborhood: commune?.name || '',
    }));
  }

  async function handleSaveNewAddress() {
    if (!newAddr.cityId || !newAddr.communeId) return;
    setIsSavingAddress(true);
    setError(null);
    try {
      const body = {
        province: newAddr.province,
        town: newAddr.town,
        neighborhood: newAddr.neighborhood,
        avenue: newAddr.avenue || undefined,
        reference: newAddr.reference || undefined,
        recipientName: newAddr.recipientName || undefined,
        recipientPhone: newAddr.recipientPhone || undefined,
        cityId: newAddr.cityId,
        communeId: newAddr.communeId,
      };
      await apiFetch('/v1/addresses', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      await loadAddresses();
      setShowNewAddressForm(false);
      setNewAddr({
        cityId: '',
        communeId: '',
        province: '',
        town: '',
        neighborhood: '',
        avenue: '',
        reference: '',
        recipientName: '',
        recipientPhone: '',
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Erreur lors de l'enregistrement";
      setError(message);
    } finally {
      setIsSavingAddress(false);
    }
  }

  const itemsBySeller = useMemo(() => {
    const grouped: Record<string, { sellerName: string; items: CartItem[] }> = {};
    for (const item of cartItems) {
      const sid = item.product.seller.id;
      if (!grouped[sid]) {
        grouped[sid] = {
          sellerName: item.product.seller.businessName,
          items: [],
        };
      }
      grouped[sid].items.push(item);
    }
    return grouped;
  }, [cartItems]);

  const sellerSubtotals = useMemo(() => {
    const result: Record<string, bigint> = {};
    for (const [sid, group] of Object.entries(itemsBySeller)) {
      result[sid] = group.items.reduce(
        (sum, item) =>
          sum +
          BigInt(effectiveCentimes(item.product)) * BigInt(item.quantity),
        BigInt(0),
      );
    }
    return result;
  }, [itemsBySeller]);

  const subtotalCDF = useMemo(() => {
    return cartItems.reduce(
      (sum, item) =>
        sum + BigInt(effectiveCentimes(item.product)) * BigInt(item.quantity),
      BigInt(0),
    );
  }, [cartItems]);

  const totalDeliveryFeeCDF = useMemo(() => {
    return Object.values(deliveryFees).reduce(
      (sum, fee) => sum + BigInt(fee || '0'),
      BigInt(0),
    );
  }, [deliveryFees]);

  const grandTotalCDF = subtotalCDF + totalDeliveryFeeCDF;
  const selectedAddress = addresses.find((a) => a.id === selectedAddressId);

  // Preview the per-seller delivery fee from the checkout QUOTE endpoint, which
  // reuses the exact server-side calc → the previewed fee equals what the order
  // is charged. (The old per-seller `/delivery-zones/estimate?toTown=` call was
  // broken: it omitted the required `fromTown` and 400'd, so fees showed 0.)
  useEffect(() => {
    if (!selectedAddressId) return;
    let cancelled = false;
    // Reset to the loading state while the new address is priced.
    setDeliveryAvailable(null);
    setQuoteError(false);
    const fetchQuote = async () => {
      try {
        const res = await apiFetch<{
          deliveryAvailable: boolean;
          townMismatch?: boolean;
          sellerQuotes: {
            sellerId: string;
            deliveryFeeCDF: string | null;
            deliveryAvailable: boolean;
          }[];
        }>('/v1/checkout/quote', {
          method: 'POST',
          body: JSON.stringify({ deliveryAddressId: selectedAddressId }),
        });
        if (cancelled) return;
        const fees: Record<string, string> = {};
        for (const sq of res.data.sellerQuotes) {
          if (sq.deliveryAvailable && sq.deliveryFeeCDF != null) {
            fees[sq.sellerId] = sq.deliveryFeeCDF;
          }
        }
        setDeliveryFees(fees);
        setDeliveryAvailable(res.data.deliveryAvailable);
        setTownMismatch(res.data.townMismatch ?? false);
        setQuoteError(false);
      } catch {
        // Do NOT fall back to free delivery — surface the failure so the buyer
        // can't be silently undercharged. Block placing the order.
        if (!cancelled) {
          setDeliveryFees({});
          setDeliveryAvailable(false);
          setTownMismatch(false);
          setQuoteError(true);
        }
      }
    };
    fetchQuote();
    return () => {
      cancelled = true;
    };
  }, [selectedAddressId]);

  async function handlePlaceOrder() {
    if (!selectedAddressId || isPlacing) return;
    // Defense in depth — the button is already disabled when delivery isn't
    // available; the API also rejects such an order. Never place without a fee.
    if (deliveryAvailable !== true) return;

    setIsPlacing(true);
    setError(null);

    const idempotencyKey =
      idempotencyKeyRef.current ?? (idempotencyKeyRef.current = crypto.randomUUID());
    const body: CheckoutRequest = {
      deliveryAddressId: selectedAddressId,
      paymentMethod,
      idempotencyKey,
    };
    if (buyerNote.trim()) {
      body.buyerNote = buyerNote.trim();
    }

    try {
      const res = await apiFetch<CheckoutResponse>('/v1/checkout', {
        method: 'POST',
        body: JSON.stringify(body),
      });

      await clearCart();

      const orderNumbers = res.data.orders.map((o) => o.orderNumber);
      const orderIds = res.data.orders.map((o) => o.id);
      sessionStorage.setItem('teka_checkout_orders', JSON.stringify(orderNumbers));
      sessionStorage.setItem('teka_checkout_order_ids', JSON.stringify(orderIds));

      if (res.data.paymentPending && res.data.checkoutGroupId) {
        router.push(`/paiement/payment-pending?group=${res.data.checkoutGroupId}`);
      } else {
        router.push('/paiement/success');
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Une erreur est survenue';
      setError(message);
    } finally {
      setIsPlacing(false);
    }
  }

  function goToStep(s: CheckoutStep) {
    setStep(s);
    setError(null);
  }

  const canProceedToPayment = !!selectedAddressId;
  const canProceedToReview = canProceedToPayment && !!paymentMethod;

  if (cartItems.length === 0 && !isPlacing) {
    return (
      <div className="min-h-screen flex flex-col bg-surface-muted">
        <Header />
        <main className="flex-1 flex items-center justify-center px-4">
          <div className="text-center">
            <p className="text-muted-foreground mb-4">{"Votre panier est vide"}</p>
            <Link href="/categories" className={buttonVariants({ variant: 'default', size: 'md' })}>
              {"Découvrir nos produits"}
            </Link>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-surface-muted">
      <Header />

      <main className="flex-1">
        <Container className="py-6 md:py-10 max-w-4xl">
          <h1 className="text-2xl md:text-3xl font-bold text-foreground tracking-tight mb-6">
            {"Passer la commande"}
          </h1>

          {/* Step indicators */}
          <Card padding="sm" className="mb-6">
            <div className="flex items-center gap-2">
              {STEP_ORDER.map((s, i) => {
                const stepLabels: Record<CheckoutStep, string> = {
                  address: "Adresse de livraison",
                  payment: "Mode de paiement",
                  review: "Récapitulatif",
                };
                const isActive = s === step;
                const stepIndex = STEP_ORDER.indexOf(step);
                const isPast = i < stepIndex;

                return (
                  <div key={s} className="flex items-center gap-2 flex-1">
                    <button
                      type="button"
                      onClick={() => {
                        if (isPast) goToStep(s);
                      }}
                      disabled={!isPast && !isActive}
                      className={cn(
                        'flex items-center gap-2 text-sm font-medium transition-colors',
                        isActive
                          ? 'text-primary'
                          : isPast
                            ? 'text-success cursor-pointer hover:text-success/80'
                            : 'text-muted-foreground',
                      )}
                    >
                      <span
                        className={cn(
                          'w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0',
                          isActive
                            ? 'bg-primary text-primary-foreground shadow-sm'
                            : isPast
                              ? 'bg-success-subtle text-success ring-1 ring-success/30'
                              : 'bg-surface-muted text-muted-foreground',
                        )}
                      >
                        {isPast ? (
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                          </svg>
                        ) : (
                          i + 1
                        )}
                      </span>
                      <span className="hidden sm:inline">{stepLabels[s]}</span>
                    </button>
                    {i < 2 && (
                      <div
                        className={cn(
                          'flex-1 h-0.5 rounded-full',
                          isPast ? 'bg-success/60' : 'bg-border',
                        )}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </Card>

          {error && (
            <div className="mb-4 p-3 bg-destructive-subtle border border-destructive/30 rounded-lg text-sm text-destructive">
              {error}
            </div>
          )}

          {/* Step 1: Address selection */}
          {step === 'address' && (
            <div className="space-y-4">
              <h2 className="text-base font-semibold text-foreground tracking-tight">
                {"Adresse de livraison"}
              </h2>

              {isLoadingAddresses ? (
                <div className="animate-pulse space-y-3">
                  <div className="h-24 bg-muted rounded-xl" />
                  <div className="h-24 bg-muted rounded-xl" />
                </div>
              ) : (
                <>
                  {addresses.length === 0 && !showNewAddressForm ? (
                    <Card padding="lg" className="text-center">
                      <p className="text-muted-foreground mb-3">{"Aucune adresse enregistrée"}</p>
                      <Button
                        variant="default"
                        size="md"
                        onClick={() => setShowNewAddressForm(true)}
                      >
                        + {"Ajouter une adresse"}
                      </Button>
                    </Card>
                  ) : (
                    <div className="space-y-3">
                      {addresses.map((addr) => (
                        <label
                          key={addr.id}
                          className={cn(
                            'flex items-start gap-3 p-4 rounded-xl border cursor-pointer transition-all',
                            selectedAddressId === addr.id
                              ? 'border-primary bg-primary-subtle ring-1 ring-primary/30 shadow-xs'
                              : 'border-border bg-surface hover:border-border-strong hover:shadow-xs',
                          )}
                        >
                          <input
                            type="radio"
                            name="address"
                            value={addr.id}
                            checked={selectedAddressId === addr.id}
                            onChange={(e) => setSelectedAddressId(e.target.value)}
                            className="mt-1 accent-primary"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="text-sm font-semibold text-foreground">
                                {addr.recipientName}
                              </p>
                              {addr.isDefault && (
                                <Badge variant="info" size="sm">
                                  Par défaut
                                </Badge>
                              )}
                            </div>
                            <p className="text-sm text-muted-foreground mt-0.5">{addr.recipientPhone}</p>
                            <p className="text-sm text-muted-foreground">
                              {addr.neighborhood}, {addr.town}
                              {addr.avenue ? `, ${addr.avenue}` : ''}
                            </p>
                            {addr.reference && (
                              <p className="text-xs text-muted-foreground mt-1">{addr.reference}</p>
                            )}
                          </div>
                        </label>
                      ))}

                      {!showNewAddressForm && (
                        <button
                          type="button"
                          onClick={() => setShowNewAddressForm(true)}
                          className="w-full py-3.5 border-2 border-dashed border-primary/40 rounded-xl text-sm font-semibold text-primary hover:bg-primary-subtle hover:border-primary transition-colors"
                        >
                          + {"Ajouter une adresse"}
                        </button>
                      )}
                    </div>
                  )}

                  {/* New address form */}
                  {showNewAddressForm && (
                    <Card padding="md" className="mt-4 border-primary/30 bg-primary-subtle/40">
                      <h3 className="text-sm font-semibold text-foreground mb-4 tracking-tight">
                        {"Nouvelle adresse"}
                      </h3>
                      <div className="space-y-4">
                        {/* City */}
                        <div>
                          <Label htmlFor="ck-city">
                            {"Ville"} <span className="text-destructive">*</span>
                          </Label>
                          {isLoadingCities ? (
                            <p className="text-sm text-muted-foreground py-2">{"Chargement des villes..."}</p>
                          ) : (
                            <select
                              id="ck-city"
                              value={newAddr.cityId}
                              onChange={(e) => handleCityChange(e.target.value)}
                              className="w-full px-3 py-2 border border-input rounded-md bg-background text-foreground text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            >
                              <option value="">{"Sélectionnez une ville"}</option>
                              {cities.map((city) => (
                                <option key={city.id} value={city.id}>
                                  {city.name} ({city.province})
                                </option>
                              ))}
                            </select>
                          )}
                        </div>

                        {/* Commune */}
                        {newAddr.cityId && (
                          <div>
                            <Label htmlFor="ck-commune">
                              {"Commune"} <span className="text-destructive">*</span>
                            </Label>
                            {isLoadingCommunes ? (
                              <p className="text-sm text-muted-foreground py-2">
                                {"Chargement des communes..."}
                              </p>
                            ) : (
                              <select
                                id="ck-commune"
                                value={newAddr.communeId}
                                onChange={(e) => handleCommuneChange(e.target.value)}
                                className="w-full px-3 py-2 border border-input rounded-md bg-background text-foreground text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                              >
                                <option value="">{"Sélectionnez une commune"}</option>
                                {communes.map((commune) => (
                                  <option key={commune.id} value={commune.id}>
                                    {commune.name}
                                  </option>
                                ))}
                              </select>
                            )}
                          </div>
                        )}

                        <div>
                          <Label htmlFor="ck-avenue">{"Avenue / Rue"}</Label>
                          <Input
                            id="ck-avenue"
                            value={newAddr.avenue}
                            onChange={(e) =>
                              setNewAddr((prev) => ({ ...prev, avenue: e.target.value }))
                            }
                            placeholder={"Ex: Av. Lumumba n°24"}
                          />
                        </div>

                        <div>
                          <Label htmlFor="ck-details">{"Point de repère"}</Label>
                          <Input
                            id="ck-details"
                            value={newAddr.reference}
                            onChange={(e) =>
                              setNewAddr((prev) => ({ ...prev, reference: e.target.value }))
                            }
                            placeholder={"Ex: En face de la pharmacie"}
                          />
                        </div>

                        <div>
                          <Label htmlFor="ck-recipient">{"Nom du destinataire"}</Label>
                          <Input
                            id="ck-recipient"
                            value={newAddr.recipientName}
                            onChange={(e) =>
                              setNewAddr((prev) => ({ ...prev, recipientName: e.target.value }))
                            }
                            placeholder={"Nom complet"}
                          />
                        </div>

                        <div>
                          <Label htmlFor="ck-recipient-phone">{"Téléphone du destinataire"}</Label>
                          <Input
                            id="ck-recipient-phone"
                            type="tel"
                            value={newAddr.recipientPhone}
                            onChange={(e) =>
                              setNewAddr((prev) => ({ ...prev, recipientPhone: e.target.value }))
                            }
                            placeholder={"+243..."}
                          />
                        </div>

                        <div className="flex gap-3 pt-2">
                          <Button
                            variant="outline"
                            size="md"
                            className="flex-1"
                            onClick={() => setShowNewAddressForm(false)}
                          >
                            {"Annuler"}
                          </Button>
                          <Button
                            variant="default"
                            size="md"
                            className="flex-1"
                            onClick={handleSaveNewAddress}
                            disabled={!newAddr.cityId || !newAddr.communeId || isSavingAddress}
                          >
                            {isSavingAddress ? "Enregistrement..." : "Enregistrer l'adresse"}
                          </Button>
                        </div>
                      </div>
                    </Card>
                  )}
                </>
              )}

              <div className="flex justify-end pt-4">
                <Button
                  variant="default"
                  size="lg"
                  onClick={() => goToStep('payment')}
                  disabled={!canProceedToPayment}
                >
                  {"Mode de paiement"}
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </Button>
              </div>
            </div>
          )}

          {/* Step 2: Payment method */}
          {step === 'payment' && (
            <div className="space-y-4">
              <h2 className="text-base font-semibold text-foreground tracking-tight">
                {"Mode de paiement"}
              </h2>

              <div className="space-y-3">
                {/* COD */}
                <PaymentTile
                  selected={paymentMethod === 'COD'}
                  onSelect={() => setPaymentMethod('COD')}
                  name="payment"
                  value="COD"
                  icon={
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1.5}
                        d="M2.25 18.75a60.07 60.07 0 0 1 15.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 0 1 3 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 0 0-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 0 1-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 0 0 3 15h-.75M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm3 0h.008v.008H18V10.5Zm-12 0h.008v.008H6V10.5Z"
                      />
                    </svg>
                  }
                  title={"Paiement à la livraison"}
                />
              </div>

              <div className="mt-4">
                <Label htmlFor="ck-note">{"Note pour le vendeur (optionnel)"}</Label>
                <textarea
                  id="ck-note"
                  value={buyerNote}
                  onChange={(e) => setBuyerNote(e.target.value)}
                  rows={3}
                  maxLength={500}
                  className="w-full px-3 py-2 border border-input rounded-md bg-background text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
                />
              </div>

              <div className="flex justify-between pt-4 gap-3">
                <Button variant="outline" size="lg" onClick={() => goToStep('address')}>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                  {"Adresse de livraison"}
                </Button>
                <Button
                  variant="default"
                  size="lg"
                  onClick={() => goToStep('review')}
                  disabled={!canProceedToReview}
                >
                  {"Récapitulatif"}
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </Button>
              </div>
            </div>
          )}

          {/* Step 3: Review */}
          {step === 'review' && (
            <div className="space-y-4">
              {/* Address summary */}
              <Card padding="md">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-semibold text-foreground tracking-tight">
                    {"Adresse de livraison"}
                  </h3>
                  <button
                    type="button"
                    onClick={() => goToStep('address')}
                    className="text-xs text-primary hover:text-primary-hover hover:underline underline-offset-4 font-medium"
                  >
                    Modifier
                  </button>
                </div>
                {selectedAddress && (
                  <div className="text-sm text-muted-foreground">
                    <p className="font-medium text-foreground">{selectedAddress.recipientName}</p>
                    <p>{selectedAddress.recipientPhone}</p>
                    <p>
                      {selectedAddress.neighborhood}, {selectedAddress.town}
                      {selectedAddress.avenue ? `, ${selectedAddress.avenue}` : ''}
                    </p>
                  </div>
                )}
              </Card>

              {/* Payment summary */}
              <Card padding="md">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-semibold text-foreground tracking-tight">
                    {"Mode de paiement"}
                  </h3>
                  <button
                    type="button"
                    onClick={() => goToStep('payment')}
                    className="text-xs text-primary hover:text-primary-hover hover:underline underline-offset-4 font-medium"
                  >
                    Modifier
                  </button>
                </div>
                <p className="text-sm text-muted-foreground">{"Paiement à la livraison"}</p>
                {buyerNote && (
                  <p className="text-xs text-muted-foreground mt-2 italic">
                    {"Note pour le vendeur (optionnel)"}: {buyerNote}
                  </p>
                )}
              </Card>

              {/* Items by seller */}
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-foreground tracking-tight">
                  {"Récapitulatif"}
                </h3>
                {Object.entries(itemsBySeller).map(([sellerId, group]) => {
                  const hasFee = sellerId in deliveryFees;
                  const sellerFee = deliveryFees[sellerId] || '0';

                  return (
                    <Card key={sellerId} padding="md">
                      <p className="text-sm font-semibold text-foreground mb-3">
                        {"Vendeur"}: <span className="font-normal">{group.sellerName}</span>
                      </p>

                      {group.items.map((item) => {
                        const title = item.product.title ?? '';
                        const lineTotal =
                          BigInt(effectiveCentimes(item.product)) *
                          BigInt(item.quantity);
                        const thumbUrl =
                          item.product.image?.thumbnailUrl || item.product.image?.url;

                        return (
                          <div
                            key={item.productId}
                            className="flex items-center gap-3 py-2 border-b border-border last:border-0"
                          >
                            <div className="relative w-12 h-12 bg-surface-muted rounded-lg overflow-hidden shrink-0 border border-border">
                              {thumbUrl ? (
                                <Image
                                  src={thumbUrl}
                                  alt={title}
                                  fill
                                  sizes="48px"
                                  className="object-cover"
                                />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                                  <svg
                                    className="w-5 h-5"
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                  >
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      strokeWidth={1.5}
                                      d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                                    />
                                  </svg>
                                </div>
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-foreground truncate">{title}</p>
                              <p className="text-xs text-muted-foreground">
                                {formatCDF(effectiveCentimes(item.product))} × {item.quantity}
                              </p>
                            </div>
                            <p className="text-sm font-semibold text-foreground shrink-0">
                              {formatCDF(lineTotal.toString())}
                            </p>
                          </div>
                        );
                      })}

                      <div className="mt-3 pt-3 space-y-1 border-t border-border">
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">{"Sous-total"}</span>
                          <span className="text-foreground">
                            {formatCDF((sellerSubtotals[sellerId] || BigInt(0)).toString())}
                          </span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">{"Frais de livraison"}</span>
                          <span className="text-foreground">
                            {deliveryAvailable === null ? (
                              <span className="text-muted-foreground">…</span>
                            ) : hasFee ? (
                              formatCDF(sellerFee)
                            ) : (
                              <span className="text-destructive">{"Non disponible"}</span>
                            )}
                          </span>
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>

              {/* Grand total */}
              <Card padding="md">
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{"Sous-total"}</span>
                    <span className="text-foreground">{formatCDF(subtotalCDF.toString())}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{"Frais de livraison"}</span>
                    <span className="text-foreground">
                      {deliveryAvailable === null ? (
                        <span className="text-muted-foreground">…</span>
                      ) : deliveryAvailable ? (
                        formatCDF(totalDeliveryFeeCDF.toString())
                      ) : (
                        <span className="text-destructive">{"Non disponible"}</span>
                      )}
                    </span>
                  </div>
                  <div className="flex justify-between items-baseline border-t border-border pt-3 mt-2">
                    <span className="text-base font-semibold text-foreground">{"Total"}</span>
                    <span className="text-2xl font-bold text-primary tracking-tight">
                      {formatCDF(grandTotalCDF.toString())}
                    </span>
                  </div>
                </div>
              </Card>

              {/* Delivery unavailable / quote failure — block, never silently free */}
              {deliveryAvailable === false && (
                <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                  {quoteError
                    ? "Impossible de calculer les frais de livraison. Veuillez réessayer."
                    : "Aucune zone de livraison disponible pour cette adresse. Veuillez vérifier votre ville de livraison."}
                </div>
              )}

              {/* Town-mismatch heads-up — non-blocking; the confirm button stays enabled */}
              {deliveryAvailable !== false && townMismatch && (
                <div className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  <svg className="w-5 h-5 shrink-0 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span>
                    {"L'adresse de livraison sélectionnée se trouve dans une ville différente de celle des produits. Cela peut entraîner des frais de transport supplémentaires. Veuillez vérifier votre adresse avant de confirmer la commande."}
                  </span>
                </div>
              )}

              {/* Place order */}
              <div className="flex justify-between items-center pt-2 gap-3">
                <Button variant="outline" size="lg" onClick={() => goToStep('payment')}>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                  {"Mode de paiement"}
                </Button>
                <Button
                  variant="default"
                  size="lg"
                  onClick={handlePlaceOrder}
                  disabled={isPlacing || deliveryAvailable !== true}
                  className="font-bold"
                >
                  {isPlacing ? (
                    <>
                      <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      {"Traitement en cours..."}
                    </>
                  ) : (
                    "Confirmer la commande"
                  )}
                </Button>
              </div>
            </div>
          )}
        </Container>
      </main>

      <Footer />
    </div>
  );
}

interface PaymentTileProps {
  selected: boolean;
  onSelect: () => void;
  name: string;
  value: string;
  icon: React.ReactNode;
  title: string;
}

function PaymentTile({ selected, onSelect, name, value, icon, title }: PaymentTileProps) {
  return (
    <label
      className={cn(
        'flex items-start gap-3 p-4 rounded-xl border cursor-pointer transition-all',
        selected
          ? 'border-primary bg-primary-subtle ring-1 ring-primary/30 shadow-xs'
          : 'border-border bg-surface hover:border-border-strong hover:shadow-xs',
      )}
    >
      <input
        type="radio"
        name={name}
        value={value}
        checked={selected}
        onChange={onSelect}
        className="mt-1 accent-primary"
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 text-foreground">
          {icon}
          <p className="text-sm font-semibold">{title}</p>
        </div>
      </div>
    </label>
  );
}
