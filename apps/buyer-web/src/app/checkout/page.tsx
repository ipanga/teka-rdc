'use client';

import { useState, useEffect, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { Header } from '@/components/layout/header';
import { Footer } from '@/components/layout/footer';
import { useCartStore } from '@/lib/cart-store';
import { useAuthStore } from '@/lib/auth-store';
import { apiFetch } from '@/lib/api-client';
import { formatCDF } from '@/lib/format';
import { Badge, Button, Card, Container, Input, Label, buttonVariants, cn } from '@/components/ui';
import type {
  Address,
  CartItem,
  PaymentMethod,
  MobileMoneyProvider,
  CheckoutRequest,
  CheckoutResponse,
  DeliveryEstimate,
  Commune,
} from '@/lib/types';
import type { City } from '@/lib/city-store';

type CheckoutStep = 'address' | 'payment' | 'review';

const STEP_ORDER: CheckoutStep[] = ['address', 'payment', 'review'];

export default function CheckoutPage() {
  const t = useTranslations('Checkout');
  const tCart = useTranslations('Cart');
  const router = useRouter();
  const cartItems = useCartStore((s) => s.items);
  const fetchCart = useCartStore((s) => s.fetchCart);
  const clearCart = useCartStore((s) => s.clearCart);
  const user = useAuthStore((s) => s.user);

  const [step, setStep] = useState<CheckoutStep>('address');
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('COD');
  const [mobileMoneyProvider, setMobileMoneyProvider] = useState<MobileMoneyProvider | ''>('');
  const [payerPhone, setPayerPhone] = useState('');
  const [buyerNote, setBuyerNote] = useState('');
  const [isLoadingAddresses, setIsLoadingAddresses] = useState(true);
  const [isPlacing, setIsPlacing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deliveryFees, setDeliveryFees] = useState<Record<string, string>>({});

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
    details: '',
    recipientName: '',
    phone: '',
  });

  useEffect(() => {
    if (user?.phone && !payerPhone) {
      setPayerPhone(user.phone);
    }
  }, [user, payerPhone]);

  useEffect(() => {
    fetchCart();
    loadAddresses();
  }, [fetchCart]);

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
        details: newAddr.details || undefined,
        recipientName: newAddr.recipientName || undefined,
        phone: newAddr.phone || undefined,
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
        details: '',
        recipientName: '',
        phone: '',
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : t('addressError');
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
        (sum, item) => sum + BigInt(item.product.priceCDF) * BigInt(item.quantity),
        BigInt(0),
      );
    }
    return result;
  }, [itemsBySeller]);

  const subtotalCDF = useMemo(() => {
    return cartItems.reduce(
      (sum, item) => sum + BigInt(item.product.priceCDF) * BigInt(item.quantity),
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

  useEffect(() => {
    if (!selectedAddress) return;
    const fetchEstimates = async () => {
      const newFees: Record<string, string> = {};
      for (const sellerId of Object.keys(itemsBySeller)) {
        try {
          const res = await apiFetch<DeliveryEstimate>(
            `/v1/delivery-zones/estimate?toTown=${encodeURIComponent(selectedAddress.town)}`,
          );
          newFees[sellerId] = res.data.feeCDF;
        } catch {
          newFees[sellerId] = '0';
        }
      }
      setDeliveryFees(newFees);
    };
    fetchEstimates();
  }, [selectedAddressId, selectedAddress, itemsBySeller]);

  async function handlePlaceOrder() {
    if (!selectedAddressId || isPlacing) return;

    if (paymentMethod === 'MOBILE_MONEY') {
      if (!mobileMoneyProvider) {
        setError(t('providerRequired'));
        return;
      }
      if (!payerPhone.trim()) {
        setError(t('phoneRequired'));
        return;
      }
    }

    setIsPlacing(true);
    setError(null);

    const idempotencyKey = crypto.randomUUID();
    const body: CheckoutRequest = {
      deliveryAddressId: selectedAddressId,
      paymentMethod,
      idempotencyKey,
    };
    if (paymentMethod === 'MOBILE_MONEY') {
      body.mobileMoneyProvider = mobileMoneyProvider;
      body.payerPhone = payerPhone.trim();
    }
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
        router.push(`/checkout/payment-pending?group=${res.data.checkoutGroupId}`);
      } else {
        router.push('/checkout/success');
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
  const isMobileMoneyValid =
    paymentMethod !== 'MOBILE_MONEY' || (!!mobileMoneyProvider && !!payerPhone.trim());
  const canProceedToReview = canProceedToPayment && !!paymentMethod && isMobileMoneyValid;

  if (cartItems.length === 0 && !isPlacing) {
    return (
      <div className="min-h-screen flex flex-col bg-surface-muted">
        <Header />
        <main className="flex-1 flex items-center justify-center px-4">
          <div className="text-center">
            <p className="text-muted-foreground mb-4">{tCart('empty')}</p>
            <Link href="/categories" className={buttonVariants({ variant: 'default', size: 'md' })}>
              {tCart('emptyAction')}
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
            {t('title')}
          </h1>

          {/* Step indicators */}
          <Card padding="sm" className="mb-6">
            <div className="flex items-center gap-2">
              {STEP_ORDER.map((s, i) => {
                const stepLabels: Record<CheckoutStep, string> = {
                  address: t('selectAddress'),
                  payment: t('paymentMethod'),
                  review: t('orderSummary'),
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
                {t('selectAddress')}
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
                      <p className="text-muted-foreground mb-3">{t('noAddresses')}</p>
                      <Button
                        variant="default"
                        size="md"
                        onClick={() => setShowNewAddressForm(true)}
                      >
                        + {t('addAddress')}
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
                            <p className="text-sm text-muted-foreground mt-0.5">{addr.phone}</p>
                            <p className="text-sm text-muted-foreground">
                              {addr.neighborhood}, {addr.town}
                              {addr.avenue ? `, ${addr.avenue}` : ''}
                            </p>
                            {addr.details && (
                              <p className="text-xs text-muted-foreground mt-1">{addr.details}</p>
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
                          + {t('addAddress')}
                        </button>
                      )}
                    </div>
                  )}

                  {/* New address form */}
                  {showNewAddressForm && (
                    <Card padding="md" className="mt-4 border-primary/30 bg-primary-subtle/40">
                      <h3 className="text-sm font-semibold text-foreground mb-4 tracking-tight">
                        {t('newAddress')}
                      </h3>
                      <div className="space-y-4">
                        {/* City */}
                        <div>
                          <Label htmlFor="ck-city">
                            {t('cityLabel')} <span className="text-destructive">*</span>
                          </Label>
                          {isLoadingCities ? (
                            <p className="text-sm text-muted-foreground py-2">{t('loadingCities')}</p>
                          ) : (
                            <select
                              id="ck-city"
                              value={newAddr.cityId}
                              onChange={(e) => handleCityChange(e.target.value)}
                              className="w-full px-3 py-2 border border-input rounded-md bg-background text-foreground text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            >
                              <option value="">{t('cityPlaceholder')}</option>
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
                              {t('communeLabel')} <span className="text-destructive">*</span>
                            </Label>
                            {isLoadingCommunes ? (
                              <p className="text-sm text-muted-foreground py-2">
                                {t('loadingCommunes')}
                              </p>
                            ) : (
                              <select
                                id="ck-commune"
                                value={newAddr.communeId}
                                onChange={(e) => handleCommuneChange(e.target.value)}
                                className="w-full px-3 py-2 border border-input rounded-md bg-background text-foreground text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                              >
                                <option value="">{t('communePlaceholder')}</option>
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
                          <Label htmlFor="ck-avenue">{t('avenueLabel')}</Label>
                          <Input
                            id="ck-avenue"
                            value={newAddr.avenue}
                            onChange={(e) =>
                              setNewAddr((prev) => ({ ...prev, avenue: e.target.value }))
                            }
                            placeholder={t('avenuePlaceholder')}
                          />
                        </div>

                        <div>
                          <Label htmlFor="ck-details">{t('referenceLabel')}</Label>
                          <Input
                            id="ck-details"
                            value={newAddr.details}
                            onChange={(e) =>
                              setNewAddr((prev) => ({ ...prev, details: e.target.value }))
                            }
                            placeholder={t('referencePlaceholder')}
                          />
                        </div>

                        <div>
                          <Label htmlFor="ck-recipient">{t('recipientNameLabel')}</Label>
                          <Input
                            id="ck-recipient"
                            value={newAddr.recipientName}
                            onChange={(e) =>
                              setNewAddr((prev) => ({ ...prev, recipientName: e.target.value }))
                            }
                            placeholder={t('recipientNamePlaceholder')}
                          />
                        </div>

                        <div>
                          <Label htmlFor="ck-recipient-phone">{t('recipientPhoneLabel')}</Label>
                          <Input
                            id="ck-recipient-phone"
                            type="tel"
                            value={newAddr.phone}
                            onChange={(e) =>
                              setNewAddr((prev) => ({ ...prev, phone: e.target.value }))
                            }
                            placeholder={t('recipientPhonePlaceholder')}
                          />
                        </div>

                        <div className="flex gap-3 pt-2">
                          <Button
                            variant="outline"
                            size="md"
                            className="flex-1"
                            onClick={() => setShowNewAddressForm(false)}
                          >
                            {t('cancelNewAddress')}
                          </Button>
                          <Button
                            variant="default"
                            size="md"
                            className="flex-1"
                            onClick={handleSaveNewAddress}
                            disabled={!newAddr.cityId || !newAddr.communeId || isSavingAddress}
                          >
                            {isSavingAddress ? t('savingAddress') : t('saveAddress')}
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
                  {t('paymentMethod')}
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
                {t('paymentMethod')}
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
                  title={t('cod')}
                />

                {/* Mobile Money */}
                <PaymentTile
                  selected={paymentMethod === 'MOBILE_MONEY'}
                  onSelect={() => setPaymentMethod('MOBILE_MONEY')}
                  name="payment"
                  value="MOBILE_MONEY"
                  icon={
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1.5}
                        d="M10.5 1.5H8.25A2.25 2.25 0 0 0 6 3.75v16.5a2.25 2.25 0 0 0 2.25 2.25h7.5A2.25 2.25 0 0 0 18 20.25V3.75a2.25 2.25 0 0 0-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3m-3 18.75h3"
                      />
                    </svg>
                  }
                  title={t('mobileMoney')}
                  subtitle="M-Pesa, Airtel Money, Orange Money"
                />

                {/* Provider sub-selection */}
                {paymentMethod === 'MOBILE_MONEY' && (
                  <Card padding="md" className="ml-0 sm:ml-4 bg-surface-muted/40">
                    <p className="text-sm font-semibold text-foreground mb-3 tracking-tight">
                      {t('selectProvider')}
                    </p>

                    <div className="space-y-2 mb-4">
                      <ProviderTile
                        accent="green"
                        selected={mobileMoneyProvider === 'M_PESA'}
                        onSelect={() => setMobileMoneyProvider('M_PESA')}
                        label={t('mpesa')}
                      />
                      <ProviderTile
                        accent="red"
                        selected={mobileMoneyProvider === 'AIRTEL_MONEY'}
                        onSelect={() => setMobileMoneyProvider('AIRTEL_MONEY')}
                        label={t('airtelMoney')}
                      />
                      <ProviderTile
                        accent="orange"
                        selected={mobileMoneyProvider === 'ORANGE_MONEY'}
                        onSelect={() => setMobileMoneyProvider('ORANGE_MONEY')}
                        label={t('orangeMoney')}
                      />
                    </div>

                    <div>
                      <Label htmlFor="ck-payer-phone">{t('payerPhone')}</Label>
                      <Input
                        id="ck-payer-phone"
                        type="tel"
                        value={payerPhone}
                        onChange={(e) => setPayerPhone(e.target.value)}
                        placeholder={t('payerPhonePlaceholder')}
                      />
                    </div>
                  </Card>
                )}
              </div>

              <div className="mt-4">
                <Label htmlFor="ck-note">{t('buyerNote')}</Label>
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
                  {t('selectAddress')}
                </Button>
                <Button
                  variant="default"
                  size="lg"
                  onClick={() => goToStep('review')}
                  disabled={!canProceedToReview}
                >
                  {t('orderSummary')}
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
                    {t('selectAddress')}
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
                    <p>{selectedAddress.phone}</p>
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
                    {t('paymentMethod')}
                  </h3>
                  <button
                    type="button"
                    onClick={() => goToStep('payment')}
                    className="text-xs text-primary hover:text-primary-hover hover:underline underline-offset-4 font-medium"
                  >
                    Modifier
                  </button>
                </div>
                <p className="text-sm text-muted-foreground">
                  {paymentMethod === 'COD' ? t('cod') : t('mobileMoney')}
                </p>
                {paymentMethod === 'MOBILE_MONEY' && mobileMoneyProvider && (
                  <div className="text-sm text-muted-foreground mt-1 space-y-0.5">
                    <p>
                      {mobileMoneyProvider === 'M_PESA' && t('mpesa')}
                      {mobileMoneyProvider === 'AIRTEL_MONEY' && t('airtelMoney')}
                      {mobileMoneyProvider === 'ORANGE_MONEY' && t('orangeMoney')}
                    </p>
                    {payerPhone && <p>{payerPhone}</p>}
                  </div>
                )}
                {buyerNote && (
                  <p className="text-xs text-muted-foreground mt-2 italic">
                    {t('buyerNote')}: {buyerNote}
                  </p>
                )}
              </Card>

              {/* Items by seller */}
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-foreground tracking-tight">
                  {t('orderSummary')}
                </h3>
                {Object.entries(itemsBySeller).map(([sellerId, group]) => {
                  const sellerFee = deliveryFees[sellerId] || '0';

                  return (
                    <Card key={sellerId} padding="md">
                      <p className="text-sm font-semibold text-foreground mb-3">
                        {tCart('seller')}: <span className="font-normal">{group.sellerName}</span>
                      </p>

                      {group.items.map((item) => {
                        const title = item.product.title ?? '';
                        const lineTotal =
                          BigInt(item.product.priceCDF) * BigInt(item.quantity);
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
                                {formatCDF(item.product.priceCDF)} × {item.quantity}
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
                          <span className="text-muted-foreground">{t('subtotal')}</span>
                          <span className="text-foreground">
                            {formatCDF((sellerSubtotals[sellerId] || BigInt(0)).toString())}
                          </span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">{t('deliveryFee')}</span>
                          <span className="text-foreground">
                            {BigInt(sellerFee) > BigInt(0) ? formatCDF(sellerFee) : 'Gratuit'}
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
                    <span className="text-muted-foreground">{t('subtotal')}</span>
                    <span className="text-foreground">{formatCDF(subtotalCDF.toString())}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{t('deliveryFee')}</span>
                    <span className="text-foreground">
                      {totalDeliveryFeeCDF > BigInt(0)
                        ? formatCDF(totalDeliveryFeeCDF.toString())
                        : 'Gratuit'}
                    </span>
                  </div>
                  <div className="flex justify-between items-baseline border-t border-border pt-3 mt-2">
                    <span className="text-base font-semibold text-foreground">{t('total')}</span>
                    <span className="text-2xl font-bold text-primary tracking-tight">
                      {formatCDF(grandTotalCDF.toString())}
                    </span>
                  </div>
                </div>
              </Card>

              {/* Place order */}
              <div className="flex justify-between items-center pt-2 gap-3">
                <Button variant="outline" size="lg" onClick={() => goToStep('payment')}>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                  {t('paymentMethod')}
                </Button>
                <Button
                  variant="default"
                  size="lg"
                  onClick={handlePlaceOrder}
                  disabled={isPlacing}
                  className="font-bold"
                >
                  {isPlacing ? (
                    <>
                      <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      {t('processing')}
                    </>
                  ) : (
                    t('placeOrder')
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
  subtitle?: string;
}

function PaymentTile({ selected, onSelect, name, value, icon, title, subtitle }: PaymentTileProps) {
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
        {subtitle && (
          <p className="text-xs text-muted-foreground mt-1 ml-7">{subtitle}</p>
        )}
      </div>
    </label>
  );
}

interface ProviderTileProps {
  accent: 'green' | 'red' | 'orange';
  selected: boolean;
  onSelect: () => void;
  label: string;
}

function ProviderTile({ accent, selected, onSelect, label }: ProviderTileProps) {
  const accentDot: Record<ProviderTileProps['accent'], string> = {
    green: 'bg-green-500',
    red: 'bg-red-500',
    orange: 'bg-orange-500',
  };
  return (
    <label
      className={cn(
        'flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all',
        selected
          ? 'border-primary bg-surface ring-1 ring-primary/30'
          : 'border-border bg-surface hover:border-border-strong',
      )}
    >
      <input
        type="radio"
        name="mmProvider"
        checked={selected}
        onChange={onSelect}
        className="accent-primary"
      />
      <span className={cn('w-2.5 h-2.5 rounded-full shrink-0', accentDot[accent])} aria-hidden />
      <span className="text-sm font-medium text-foreground">{label}</span>
    </label>
  );
}
