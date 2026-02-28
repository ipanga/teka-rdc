'use client';

import { useState, useEffect, useMemo } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { Header } from '@/components/layout/header';
import { Footer } from '@/components/layout/footer';
import { useCartStore } from '@/lib/cart-store';
import { useAuthStore } from '@/lib/auth-store';
import { apiFetch } from '@/lib/api-client';
import { formatCDF, getLocalizedName } from '@/lib/format';
import Link from 'next/link';
import type {
  Address,
  CartItem,
  PaymentMethod,
  MobileMoneyProvider,
  CheckoutRequest,
  CheckoutResponse,
  DeliveryEstimate,
} from '@/lib/types';
import Image from 'next/image';

type CheckoutStep = 'address' | 'payment' | 'review';

export default function CheckoutPage() {
  const t = useTranslations('Checkout');
  const tCart = useTranslations('Cart');
  const locale = useLocale();
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

  // Pre-fill payer phone from user profile
  useEffect(() => {
    if (user?.phone && !payerPhone) {
      setPayerPhone(user.phone);
    }
  }, [user, payerPhone]);

  // Fetch cart and addresses on mount
  useEffect(() => {
    fetchCart();
    loadAddresses();
  }, [fetchCart]);

  async function loadAddresses() {
    setIsLoadingAddresses(true);
    try {
      const res = await apiFetch<Address[]>('/v1/addresses');
      setAddresses(res.data);
      // Pre-select default address
      const defaultAddr = res.data.find((a) => a.isDefault);
      if (defaultAddr) {
        setSelectedAddressId(defaultAddr.id);
      } else if (res.data.length > 0) {
        setSelectedAddressId(res.data[0].id);
      }
    } catch {
      // silently fail
    } finally {
      setIsLoadingAddresses(false);
    }
  }

  // Group items by seller
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

  // Calculate subtotals per seller
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

  // Grand subtotal
  const subtotalCDF = useMemo(() => {
    return cartItems.reduce(
      (sum, item) => sum + BigInt(item.product.priceCDF) * BigInt(item.quantity),
      BigInt(0),
    );
  }, [cartItems]);

  // Total delivery fees
  const totalDeliveryFeeCDF = useMemo(() => {
    return Object.values(deliveryFees).reduce(
      (sum, fee) => sum + BigInt(fee || '0'),
      BigInt(0),
    );
  }, [deliveryFees]);

  // Grand total
  const grandTotalCDF = subtotalCDF + totalDeliveryFeeCDF;

  const selectedAddress = addresses.find((a) => a.id === selectedAddressId);

  // Fetch delivery estimates when address changes
  useEffect(() => {
    if (!selectedAddress) return;

    const fetchEstimates = async () => {
      const newFees: Record<string, string> = {};
      // For simplicity, use a flat fee — the API might not be fully set up
      // Try to fetch estimates; if it fails, default to "0"
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

    // Validate Mobile Money fields
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

      // Clear cart after successful order
      await clearCart();

      // Store order info for success/pending pages
      const orderNumbers = res.data.orders.map((o) => o.orderNumber);
      const orderIds = res.data.orders.map((o) => o.id);
      sessionStorage.setItem('teka_checkout_orders', JSON.stringify(orderNumbers));
      sessionStorage.setItem('teka_checkout_order_ids', JSON.stringify(orderIds));

      // If payment is pending (Mobile Money), redirect to payment-pending page
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
  const isMobileMoneyValid = paymentMethod !== 'MOBILE_MONEY' || (!!mobileMoneyProvider && !!payerPhone.trim());
  const canProceedToReview = canProceedToPayment && !!paymentMethod && isMobileMoneyValid;

  if (cartItems.length === 0 && !isPlacing) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <Header />
        <main className="flex-1 flex items-center justify-center px-4">
          <div className="text-center">
            <p className="text-muted-foreground mb-4">{tCart('empty')}</p>
            <Link
              href="/categories"
              className="text-primary hover:underline font-medium"
            >
              {tCart('emptyAction')}
            </Link>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />

      <main className="flex-1 max-w-4xl mx-auto px-4 py-6 w-full">
        <h1 className="text-xl md:text-2xl font-bold text-foreground mb-6">
          {t('title')}
        </h1>

        {/* Step indicators */}
        <div className="flex items-center gap-2 mb-8">
          {(['address', 'payment', 'review'] as CheckoutStep[]).map((s, i) => {
            const stepLabels: Record<CheckoutStep, string> = {
              address: t('selectAddress'),
              payment: t('paymentMethod'),
              review: t('orderSummary'),
            };
            const isActive = s === step;
            const stepIndex = ['address', 'payment', 'review'].indexOf(step);
            const isPast = i < stepIndex;

            return (
              <div key={s} className="flex items-center gap-2 flex-1">
                <button
                  onClick={() => {
                    if (isPast) goToStep(s);
                  }}
                  disabled={!isPast && !isActive}
                  className={`flex items-center gap-2 text-sm font-medium transition-colors ${
                    isActive
                      ? 'text-primary'
                      : isPast
                        ? 'text-success cursor-pointer hover:text-success/80'
                        : 'text-muted-foreground'
                  }`}
                >
                  <span
                    className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                      isActive
                        ? 'bg-primary text-white'
                        : isPast
                          ? 'bg-success text-white'
                          : 'bg-muted text-muted-foreground'
                    }`}
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
                  <div className={`flex-1 h-0.5 ${isPast ? 'bg-success' : 'bg-border'}`} />
                )}
              </div>
            );
          })}
        </div>

        {error && (
          <div className="mb-4 p-3 bg-destructive/10 border border-destructive/30 rounded-lg text-sm text-destructive">
            {error}
          </div>
        )}

        {/* Step 1: Address selection */}
        {step === 'address' && (
          <div className="space-y-4">
            <h2 className="text-base font-semibold text-foreground">{t('selectAddress')}</h2>

            {isLoadingAddresses ? (
              <div className="animate-pulse space-y-3">
                <div className="h-20 bg-muted rounded-lg" />
                <div className="h-20 bg-muted rounded-lg" />
              </div>
            ) : addresses.length === 0 ? (
              <div className="text-center py-8 border border-border rounded-lg">
                <p className="text-muted-foreground mb-3">{t('noAddresses')}</p>
                <Link
                  href="/addresses"
                  className="text-primary hover:underline text-sm font-medium"
                >
                  + {t('selectAddress')}
                </Link>
              </div>
            ) : (
              <div className="space-y-3">
                {addresses.map((addr) => (
                  <label
                    key={addr.id}
                    className={`flex items-start gap-3 p-4 border rounded-lg cursor-pointer transition-colors ${
                      selectedAddressId === addr.id
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:border-primary/50'
                    }`}
                  >
                    <input
                      type="radio"
                      name="address"
                      value={addr.id}
                      checked={selectedAddressId === addr.id}
                      onChange={(e) => setSelectedAddressId(e.target.value)}
                      className="mt-1 accent-primary"
                    />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-foreground">{addr.recipientName}</p>
                      <p className="text-sm text-muted-foreground">{addr.phone}</p>
                      <p className="text-sm text-muted-foreground">
                        {addr.neighborhood}, {addr.town}
                        {addr.avenue ? `, ${addr.avenue}` : ''}
                      </p>
                      {addr.details && (
                        <p className="text-xs text-muted-foreground mt-1">{addr.details}</p>
                      )}
                      {addr.isDefault && (
                        <span className="inline-block mt-1 text-xs text-primary font-medium">
                          Par defaut
                        </span>
                      )}
                    </div>
                  </label>
                ))}
              </div>
            )}

            <div className="flex justify-end pt-4">
              <button
                onClick={() => goToStep('payment')}
                disabled={!canProceedToPayment}
                className="px-6 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {t('paymentMethod')}
                <svg className="w-4 h-4 inline-block ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Payment method */}
        {step === 'payment' && (
          <div className="space-y-4">
            <h2 className="text-base font-semibold text-foreground">{t('paymentMethod')}</h2>

            <div className="space-y-3">
              {/* Cash on Delivery */}
              <label
                className={`flex items-start gap-3 p-4 border rounded-lg cursor-pointer transition-colors ${
                  paymentMethod === 'COD'
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-primary/50'
                }`}
              >
                <input
                  type="radio"
                  name="payment"
                  value="COD"
                  checked={paymentMethod === 'COD'}
                  onChange={() => setPaymentMethod('COD')}
                  className="mt-1 accent-primary"
                />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <svg className="w-5 h-5 text-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.25 18.75a60.07 60.07 0 0 1 15.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 0 1 3 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 0 0-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 0 1-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 0 0 3 15h-.75M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm3 0h.008v.008H18V10.5Zm-12 0h.008v.008H6V10.5Z" />
                    </svg>
                    <p className="text-sm font-medium text-foreground">{t('cod')}</p>
                  </div>
                </div>
              </label>

              {/* Mobile Money */}
              <label
                className={`flex items-start gap-3 p-4 border rounded-lg cursor-pointer transition-colors ${
                  paymentMethod === 'MOBILE_MONEY'
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-primary/50'
                }`}
              >
                <input
                  type="radio"
                  name="payment"
                  value="MOBILE_MONEY"
                  checked={paymentMethod === 'MOBILE_MONEY'}
                  onChange={() => setPaymentMethod('MOBILE_MONEY')}
                  className="mt-1 accent-primary"
                />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <svg className="w-5 h-5 text-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.5 1.5H8.25A2.25 2.25 0 0 0 6 3.75v16.5a2.25 2.25 0 0 0 2.25 2.25h7.5A2.25 2.25 0 0 0 18 20.25V3.75a2.25 2.25 0 0 0-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3m-3 18.75h3" />
                    </svg>
                    <p className="text-sm font-medium text-foreground">{t('mobileMoney')}</p>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 ml-7">
                    M-Pesa, Airtel Money, Orange Money
                  </p>
                </div>
              </label>

              {/* Mobile Money provider selection */}
              {paymentMethod === 'MOBILE_MONEY' && (
                <div className="ml-4 mt-2 space-y-3 p-4 bg-muted/30 rounded-lg border border-border">
                  <p className="text-sm font-medium text-foreground">{t('selectProvider')}</p>

                  <div className="space-y-2">
                    {/* M-Pesa (Vodacom) */}
                    <label
                      className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition-colors border-l-4 ${
                        mobileMoneyProvider === 'M_PESA'
                          ? 'border-l-green-500 border-green-300 bg-green-50'
                          : 'border-l-green-500 border-border hover:border-green-300'
                      }`}
                    >
                      <input
                        type="radio"
                        name="mmProvider"
                        value="M_PESA"
                        checked={mobileMoneyProvider === 'M_PESA'}
                        onChange={() => setMobileMoneyProvider('M_PESA')}
                        className="accent-green-600"
                      />
                      <span className="text-sm font-medium text-foreground">{t('mpesa')}</span>
                    </label>

                    {/* Airtel Money */}
                    <label
                      className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition-colors border-l-4 ${
                        mobileMoneyProvider === 'AIRTEL_MONEY'
                          ? 'border-l-red-500 border-red-300 bg-red-50'
                          : 'border-l-red-500 border-border hover:border-red-300'
                      }`}
                    >
                      <input
                        type="radio"
                        name="mmProvider"
                        value="AIRTEL_MONEY"
                        checked={mobileMoneyProvider === 'AIRTEL_MONEY'}
                        onChange={() => setMobileMoneyProvider('AIRTEL_MONEY')}
                        className="accent-red-600"
                      />
                      <span className="text-sm font-medium text-foreground">{t('airtelMoney')}</span>
                    </label>

                    {/* Orange Money */}
                    <label
                      className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition-colors border-l-4 ${
                        mobileMoneyProvider === 'ORANGE_MONEY'
                          ? 'border-l-orange-500 border-orange-300 bg-orange-50'
                          : 'border-l-orange-500 border-border hover:border-orange-300'
                      }`}
                    >
                      <input
                        type="radio"
                        name="mmProvider"
                        value="ORANGE_MONEY"
                        checked={mobileMoneyProvider === 'ORANGE_MONEY'}
                        onChange={() => setMobileMoneyProvider('ORANGE_MONEY')}
                        className="accent-orange-600"
                      />
                      <span className="text-sm font-medium text-foreground">{t('orangeMoney')}</span>
                    </label>
                  </div>

                  {/* Payer phone number */}
                  <div className="mt-3">
                    <label className="block text-sm font-medium text-foreground mb-1.5">
                      {t('payerPhone')}
                    </label>
                    <input
                      type="tel"
                      value={payerPhone}
                      onChange={(e) => setPayerPhone(e.target.value)}
                      placeholder={t('payerPhonePlaceholder')}
                      className="w-full px-3 py-2 border border-input rounded-lg bg-background text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Buyer note */}
            <div className="mt-4">
              <label className="block text-sm font-medium text-foreground mb-1.5">
                {t('buyerNote')}
              </label>
              <textarea
                value={buyerNote}
                onChange={(e) => setBuyerNote(e.target.value)}
                rows={3}
                maxLength={500}
                className="w-full px-3 py-2 border border-input rounded-lg bg-background text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
              />
            </div>

            <div className="flex justify-between pt-4">
              <button
                onClick={() => goToStep('address')}
                className="px-6 py-2.5 border border-border text-foreground rounded-lg text-sm font-medium hover:bg-muted transition-colors"
              >
                <svg className="w-4 h-4 inline-block mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                {t('selectAddress')}
              </button>
              <button
                onClick={() => goToStep('review')}
                disabled={!canProceedToReview}
                className="px-6 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {t('orderSummary')}
                <svg className="w-4 h-4 inline-block ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Review & Place Order */}
        {step === 'review' && (
          <div className="space-y-6">
            {/* Delivery address summary */}
            <div className="bg-white border border-border rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold text-foreground">{t('selectAddress')}</h3>
                <button
                  onClick={() => goToStep('address')}
                  className="text-xs text-primary hover:underline"
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
            </div>

            {/* Payment method summary */}
            <div className="bg-white border border-border rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold text-foreground">{t('paymentMethod')}</h3>
                <button
                  onClick={() => goToStep('payment')}
                  className="text-xs text-primary hover:underline"
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
            </div>

            {/* Order items by seller */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-foreground">{t('orderSummary')}</h3>
              {Object.entries(itemsBySeller).map(([sellerId, group]) => {
                const sellerFee = deliveryFees[sellerId] || '0';

                return (
                  <div key={sellerId} className="bg-white border border-border rounded-lg p-4">
                    <p className="text-sm font-medium text-foreground mb-3">
                      {tCart('seller')}: {group.sellerName}
                    </p>

                    {group.items.map((item) => {
                      const title = getLocalizedName(item.product.title, locale);
                      const lineTotal = BigInt(item.product.priceCDF) * BigInt(item.quantity);
                      const thumbUrl = item.product.image?.thumbnailUrl || item.product.image?.url;

                      return (
                        <div key={item.productId} className="flex items-center gap-3 py-2 border-b border-border last:border-0">
                          <div className="relative w-12 h-12 bg-muted rounded overflow-hidden shrink-0">
                            {thumbUrl ? (
                              <Image src={thumbUrl} alt={title} fill sizes="48px" className="object-cover" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                </svg>
                              </div>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-foreground truncate">{title}</p>
                            <p className="text-xs text-muted-foreground">
                              {formatCDF(item.product.priceCDF)} x {item.quantity}
                            </p>
                          </div>
                          <p className="text-sm font-medium text-foreground shrink-0">
                            {formatCDF(lineTotal.toString())}
                          </p>
                        </div>
                      );
                    })}

                    {/* Seller subtotals */}
                    <div className="mt-3 pt-3 space-y-1">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">{t('subtotal')}</span>
                        <span className="text-foreground">{formatCDF((sellerSubtotals[sellerId] || BigInt(0)).toString())}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">{t('deliveryFee')}</span>
                        <span className="text-foreground">
                          {BigInt(sellerFee) > BigInt(0) ? formatCDF(sellerFee) : 'Gratuit'}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Grand total */}
            <div className="bg-white border border-border rounded-lg p-4">
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{t('subtotal')}</span>
                  <span className="text-foreground">{formatCDF(subtotalCDF.toString())}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{t('deliveryFee')}</span>
                  <span className="text-foreground">
                    {totalDeliveryFeeCDF > BigInt(0) ? formatCDF(totalDeliveryFeeCDF.toString()) : 'Gratuit'}
                  </span>
                </div>
                <div className="flex justify-between text-base font-bold border-t border-border pt-2 mt-2">
                  <span className="text-foreground">{t('total')}</span>
                  <span className="text-primary">{formatCDF(grandTotalCDF.toString())}</span>
                </div>
              </div>
            </div>

            {/* Place order */}
            <div className="flex justify-between pt-2">
              <button
                onClick={() => goToStep('payment')}
                className="px-6 py-2.5 border border-border text-foreground rounded-lg text-sm font-medium hover:bg-muted transition-colors"
              >
                <svg className="w-4 h-4 inline-block mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                {t('paymentMethod')}
              </button>
              <button
                onClick={handlePlaceOrder}
                disabled={isPlacing}
                className="px-8 py-3 bg-primary text-primary-foreground rounded-lg text-sm font-bold hover:bg-primary/90 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {isPlacing ? (
                  <span className="flex items-center gap-2">
                    <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    {t('processing')}
                  </span>
                ) : (
                  t('placeOrder')
                )}
              </button>
            </div>
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
}
