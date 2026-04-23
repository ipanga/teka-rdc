'use client';

import { useEffect, useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { useParams } from 'next/navigation';
import { Link } from '@/i18n/navigation';
import { apiFetch, ApiError } from '@/lib/api-client';
import { ProductStatusBadge } from '@/components/product/product-status-badge';
import { ImageUploader } from '@/components/product/image-uploader';

interface ProductImage {
  id: string;
  url: string;
  order: number;
}

interface Category {
  id: string;
  name: { fr?: string; en?: string };
  children?: Category[];
  subcategories?: Category[];
}

interface Product {
  id: string;
  title: { fr?: string; en?: string };
  description?: { fr?: string; en?: string } | null;
  priceCDF: string;
  priceUSD?: string | null;
  quantity: number;
  status: string;
  condition: string;
  categoryId: string;
  category?: { id: string; name: { fr?: string; en?: string } };
  images: ProductImage[];
  specifications?: { attributeId: string; value: string }[];
  rejectionReason?: string | null;
  createdAt: string;
  updatedAt: string;
}

export default function ProductDetailPage() {
  const t = useTranslations('Products');
  const params = useParams();
  const productId = params.id as string;

  const [product, setProduct] = useState<Product | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Form fields
  const [titleFr, setTitleFr] = useState('');
  const [titleEn, setTitleEn] = useState('');
  const [descriptionFr, setDescriptionFr] = useState('');
  const [descriptionEn, setDescriptionEn] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [priceCDF, setPriceCDF] = useState('');
  const [priceUSD, setPriceUSD] = useState('');
  const [quantity, setQuantity] = useState('');
  const [condition, setCondition] = useState<'NEW' | 'USED'>('NEW');
  const [images, setImages] = useState<ProductImage[]>([]);

  const isEditable = product?.status === 'DRAFT' || product?.status === 'REJECTED';
  const canSubmit = product?.status === 'DRAFT';

  const loadProduct = useCallback(async () => {
    try {
      const res = await apiFetch<{ product: Product } & Product>(`/v1/sellers/products/${productId}`);
      const p = res.data.product || res.data;
      setProduct(p);

      // Populate form
      setTitleFr(p.title?.fr || '');
      setTitleEn(p.title?.en || '');
      setDescriptionFr(p.description?.fr || '');
      setDescriptionEn(p.description?.en || '');
      setCategoryId(p.categoryId || '');
      setPriceCDF(p.priceCDF ? String(Number(p.priceCDF) / 100) : '');
      setPriceUSD(p.priceUSD ? String(Number(p.priceUSD) / 100) : '');
      setQuantity(String(p.quantity ?? 0));
      setCondition((p.condition as 'NEW' | 'USED') || 'NEW');
      setImages(p.images || []);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError(t('errorLoadingProduct'));
      }
    } finally {
      setIsLoading(false);
    }
  }, [productId, t]);

  useEffect(() => {
    loadProduct();
  }, [loadProduct]);

  useEffect(() => {
    async function loadCategories() {
      try {
        const res = await apiFetch<Record<string, unknown>>('/v1/browse/categories');
        const data = res.data;
        let cats: Category[] = [];
        if (Array.isArray(data)) {
          cats = data;
        } else if (data && Array.isArray((data as { categories?: Category[] }).categories)) {
          cats = (data as { categories: Category[] }).categories;
        }
        setCategories(cats);
      } catch {
        // Non-blocking -- category selection may not work but view is fine
      }
    }
    if (isEditable) {
      loadCategories();
    }
  }, [isEditable]);

  const flattenCategories = (cats: Category[], depth = 0): { id: string; label: string; depth: number }[] => {
    const result: { id: string; label: string; depth: number }[] = [];
    for (const cat of cats) {
      const label = cat.name?.fr || cat.name?.en || '---';
      result.push({ id: cat.id, label, depth });
      const kids = cat.children || cat.subcategories || [];
      if (kids.length > 0) {
        result.push(...flattenCategories(kids, depth + 1));
      }
    }
    return result;
  };

  const validate = (): boolean => {
    const errors: Record<string, string> = {};
    if (!titleFr.trim()) errors.titleFr = t('requiredField');
    if (!categoryId) errors.categoryId = t('requiredField');
    if (!priceCDF || isNaN(Number(priceCDF)) || Number(priceCDF) <= 0) {
      errors.priceCDF = t('invalidPrice');
    }
    if (priceUSD && (isNaN(Number(priceUSD)) || Number(priceUSD) < 0)) {
      errors.priceUSD = t('invalidPrice');
    }
    if (!quantity || isNaN(Number(quantity)) || Number(quantity) < 0) {
      errors.quantity = t('requiredField');
    }
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isEditable || !validate()) return;

    setIsSaving(true);
    setError('');
    setSuccessMessage('');

    try {
      const title: Record<string, string> = { fr: titleFr.trim() };
      if (titleEn.trim()) title.en = titleEn.trim();

      const description: Record<string, string> = {};
      if (descriptionFr.trim()) description.fr = descriptionFr.trim();
      if (descriptionEn.trim()) description.en = descriptionEn.trim();

      const body: Record<string, unknown> = {
        title,
        description: Object.keys(description).length > 0 ? description : undefined,
        categoryId,
        priceCDF: String(Math.round(Number(priceCDF) * 100)),
        quantity: Number(quantity),
        condition,
      };

      if (priceUSD && Number(priceUSD) > 0) {
        body.priceUSD = String(Math.round(Number(priceUSD) * 100));
      }

      await apiFetch(`/v1/sellers/products/${productId}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      });

      setSuccessMessage(t('productUpdated'));
      loadProduct();
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
        if (err.errors) {
          setFieldErrors(
            Object.fromEntries(
              Object.entries(err.errors).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v])
            )
          );
        }
      } else {
        setError('Une erreur est survenue');
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleSubmitForReview = async () => {
    setIsSubmitting(true);
    setError('');
    setSuccessMessage('');

    try {
      await apiFetch(`/v1/sellers/products/${productId}/submit`, { method: 'PATCH' });
      setSuccessMessage(t('productSubmitted'));
      loadProduct();
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('Une erreur est survenue');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatPrice = (centimes: string) => {
    const amount = Number(centimes) / 100;
    return new Intl.NumberFormat('fr-CD', {
      style: 'currency',
      currency: 'CDF',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  if (isLoading) {
    return (
      <div className="space-y-4 animate-pulse max-w-2xl">
        <div className="h-6 bg-muted rounded w-40" />
        <div className="h-8 bg-muted rounded w-64" />
        <div className="bg-white rounded-xl border border-border p-6 space-y-4">
          <div className="h-4 bg-muted rounded w-full" />
          <div className="h-4 bg-muted rounded w-3/4" />
          <div className="h-10 bg-muted rounded w-full" />
          <div className="h-10 bg-muted rounded w-full" />
        </div>
      </div>
    );
  }

  if (!product) {
    return (
      <div>
        <Link
          href="/dashboard/products"
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          &larr; {t('backToProducts')}
        </Link>
        <div className="mt-4 bg-destructive/10 text-destructive p-4 rounded-lg text-sm">
          {error || t('errorLoadingProduct')}
        </div>
      </div>
    );
  }

  const flatCats = flattenCategories(categories);

  return (
    <div>
      <div className="mb-6">
        <Link
          href="/dashboard/products"
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          &larr; {t('backToProducts')}
        </Link>
        <div className="flex items-center gap-3 mt-2">
          <h1 className="text-2xl font-bold text-foreground">
            {isEditable ? t('editProduct') : t('productDetail')}
          </h1>
          <ProductStatusBadge status={product.status} />
        </div>
      </div>

      {/* Rejection Reason */}
      {product.status === 'REJECTED' && product.rejectionReason && (
        <div className="mb-4 p-4 rounded-lg bg-destructive/10 border border-destructive/20">
          <p className="text-sm font-medium text-destructive">{t('rejectionReason')}</p>
          <p className="text-sm text-foreground mt-1">{product.rejectionReason}</p>
        </div>
      )}

      {/* Read-only notice */}
      {!isEditable && (
        <div className="mb-4 p-3 rounded-lg bg-muted text-muted-foreground text-sm">
          {t('readOnly')}
        </div>
      )}

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
          {error}
        </div>
      )}

      {successMessage && (
        <div className="mb-4 p-3 rounded-lg bg-success/10 text-success text-sm">
          {successMessage}
        </div>
      )}

      <div className="space-y-6 max-w-2xl">
        {/* Image Uploader */}
        <div className="bg-white rounded-xl border border-border p-6">
          <ImageUploader
            productId={productId}
            images={images}
            onImagesChange={setImages}
            readOnly={!isEditable}
          />
        </div>

        {/* Product Form */}
        <form onSubmit={handleSave} className="space-y-6">
          {/* Product Info Section */}
          <div className="bg-white rounded-xl border border-border p-6">
            <h2 className="text-lg font-semibold text-foreground mb-4">{t('productInfo')}</h2>
            <div className="space-y-4">
              {/* Category */}
              <div>
                <label htmlFor="categoryId" className="block text-sm font-medium text-foreground mb-1">
                  {t('category')} *
                </label>
                {isEditable ? (
                  <select
                    id="categoryId"
                    value={categoryId}
                    onChange={(e) => { setCategoryId(e.target.value); setFieldErrors((prev) => ({ ...prev, categoryId: '' })); }}
                    className={`w-full px-3 py-2 border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring ${
                      fieldErrors.categoryId ? 'border-destructive' : 'border-input'
                    }`}
                  >
                    <option value="">{t('selectCategory')}</option>
                    {flatCats.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {'\u00A0'.repeat(cat.depth * 4)}{cat.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <p className="px-3 py-2 bg-muted rounded-lg text-foreground text-sm">
                    {product.category?.name?.fr || product.category?.name?.en || product.categoryId}
                  </p>
                )}
                {fieldErrors.categoryId && (
                  <p className="text-xs text-destructive mt-1">{fieldErrors.categoryId}</p>
                )}
              </div>

              {/* Title FR */}
              <div>
                <label htmlFor="titleFr" className="block text-sm font-medium text-foreground mb-1">
                  {t('titleFr')} *
                </label>
                {isEditable ? (
                  <input
                    id="titleFr"
                    type="text"
                    value={titleFr}
                    onChange={(e) => { setTitleFr(e.target.value); setFieldErrors((prev) => ({ ...prev, titleFr: '' })); }}
                    className={`w-full px-3 py-2 border rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring ${
                      fieldErrors.titleFr ? 'border-destructive' : 'border-input'
                    }`}
                  />
                ) : (
                  <p className="px-3 py-2 bg-muted rounded-lg text-foreground text-sm">{titleFr || '---'}</p>
                )}
                {fieldErrors.titleFr && (
                  <p className="text-xs text-destructive mt-1">{fieldErrors.titleFr}</p>
                )}
              </div>

              {/* Title EN */}
              <div>
                <label htmlFor="titleEn" className="block text-sm font-medium text-foreground mb-1">
                  {t('titleEn')}
                </label>
                {isEditable ? (
                  <input
                    id="titleEn"
                    type="text"
                    value={titleEn}
                    onChange={(e) => setTitleEn(e.target.value)}
                    className="w-full px-3 py-2 border border-input rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                ) : (
                  <p className="px-3 py-2 bg-muted rounded-lg text-foreground text-sm">{titleEn || '---'}</p>
                )}
              </div>

              {/* Description FR */}
              <div>
                <label htmlFor="descriptionFr" className="block text-sm font-medium text-foreground mb-1">
                  {t('descriptionFr')}
                </label>
                {isEditable ? (
                  <textarea
                    id="descriptionFr"
                    value={descriptionFr}
                    onChange={(e) => setDescriptionFr(e.target.value)}
                    rows={4}
                    className="w-full px-3 py-2 border border-input rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-y"
                  />
                ) : (
                  <p className="px-3 py-2 bg-muted rounded-lg text-foreground text-sm whitespace-pre-wrap">
                    {descriptionFr || '---'}
                  </p>
                )}
              </div>

              {/* Description EN */}
              <div>
                <label htmlFor="descriptionEn" className="block text-sm font-medium text-foreground mb-1">
                  {t('descriptionEn')}
                </label>
                {isEditable ? (
                  <textarea
                    id="descriptionEn"
                    value={descriptionEn}
                    onChange={(e) => setDescriptionEn(e.target.value)}
                    rows={4}
                    className="w-full px-3 py-2 border border-input rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-y"
                  />
                ) : (
                  <p className="px-3 py-2 bg-muted rounded-lg text-foreground text-sm whitespace-pre-wrap">
                    {descriptionEn || '---'}
                  </p>
                )}
              </div>

              {/* Condition */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  {t('condition')}
                </label>
                {isEditable ? (
                  <div className="flex gap-4">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="condition"
                        value="NEW"
                        checked={condition === 'NEW'}
                        onChange={() => setCondition('NEW')}
                        className="accent-primary"
                      />
                      <span className="text-sm text-foreground">{t('conditionNew')}</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="condition"
                        value="USED"
                        checked={condition === 'USED'}
                        onChange={() => setCondition('USED')}
                        className="accent-primary"
                      />
                      <span className="text-sm text-foreground">{t('conditionUsed')}</span>
                    </label>
                  </div>
                ) : (
                  <p className="px-3 py-2 bg-muted rounded-lg text-foreground text-sm">
                    {condition === 'NEW' ? t('conditionNew') : t('conditionUsed')}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Pricing Section */}
          <div className="bg-white rounded-xl border border-border p-6">
            <h2 className="text-lg font-semibold text-foreground mb-4">{t('pricing')}</h2>
            <div className="space-y-4">
              {/* Price CDF */}
              <div>
                <label htmlFor="priceCDF" className="block text-sm font-medium text-foreground mb-1">
                  {t('priceCDF')} *
                </label>
                {isEditable ? (
                  <div className="relative">
                    <input
                      id="priceCDF"
                      type="number"
                      min="0"
                      step="any"
                      value={priceCDF}
                      onChange={(e) => { setPriceCDF(e.target.value); setFieldErrors((prev) => ({ ...prev, priceCDF: '' })); }}
                      className={`w-full px-3 py-2 pr-14 border rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring ${
                        fieldErrors.priceCDF ? 'border-destructive' : 'border-input'
                      }`}
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">CDF</span>
                  </div>
                ) : (
                  <p className="px-3 py-2 bg-muted rounded-lg text-foreground text-sm">
                    {formatPrice(product.priceCDF)}
                  </p>
                )}
                {fieldErrors.priceCDF && (
                  <p className="text-xs text-destructive mt-1">{fieldErrors.priceCDF}</p>
                )}
              </div>

              {/* Price USD */}
              <div>
                <label htmlFor="priceUSD" className="block text-sm font-medium text-foreground mb-1">
                  {t('priceUSD')}
                </label>
                {isEditable ? (
                  <div className="relative">
                    <input
                      id="priceUSD"
                      type="number"
                      min="0"
                      step="any"
                      value={priceUSD}
                      onChange={(e) => { setPriceUSD(e.target.value); setFieldErrors((prev) => ({ ...prev, priceUSD: '' })); }}
                      className={`w-full px-3 py-2 pr-14 border rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring ${
                        fieldErrors.priceUSD ? 'border-destructive' : 'border-input'
                      }`}
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">USD</span>
                  </div>
                ) : (
                  <p className="px-3 py-2 bg-muted rounded-lg text-foreground text-sm">
                    {product.priceUSD ? `$${(Number(product.priceUSD) / 100).toFixed(2)}` : '---'}
                  </p>
                )}
                {fieldErrors.priceUSD && (
                  <p className="text-xs text-destructive mt-1">{fieldErrors.priceUSD}</p>
                )}
              </div>

              {/* Quantity */}
              <div>
                <label htmlFor="quantity" className="block text-sm font-medium text-foreground mb-1">
                  {t('quantity')} *
                </label>
                {isEditable ? (
                  <input
                    id="quantity"
                    type="number"
                    min="0"
                    step="1"
                    value={quantity}
                    onChange={(e) => { setQuantity(e.target.value); setFieldErrors((prev) => ({ ...prev, quantity: '' })); }}
                    className={`w-full px-3 py-2 border rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring ${
                      fieldErrors.quantity ? 'border-destructive' : 'border-input'
                    }`}
                  />
                ) : (
                  <p className="px-3 py-2 bg-muted rounded-lg text-foreground text-sm">{product.quantity}</p>
                )}
                {fieldErrors.quantity && (
                  <p className="text-xs text-destructive mt-1">{fieldErrors.quantity}</p>
                )}
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-3">
            {isEditable && (
              <button
                type="submit"
                disabled={isSaving}
                className="px-6 py-2.5 bg-primary text-primary-foreground rounded-lg font-medium text-sm hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isSaving ? t('saving') : t('save')}
              </button>
            )}
            {canSubmit && (
              <button
                type="button"
                onClick={handleSubmitForReview}
                disabled={isSubmitting}
                className="px-6 py-2.5 bg-success text-white rounded-lg font-medium text-sm hover:bg-success/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isSubmitting ? '...' : t('submitForReview')}
              </button>
            )}
            <Link
              href="/dashboard/products"
              className="px-6 py-2.5 border border-border rounded-lg font-medium text-sm text-foreground hover:bg-muted transition-colors"
            >
              {t('backToProducts')}
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
