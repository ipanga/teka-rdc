'use client';

import { useEffect, useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { Link } from '@/i18n/navigation';
import { apiFetch, ApiError } from '@/lib/api-client';
import DynamicAttributesForm from '@/components/products/dynamic-attributes-form';

interface Category {
  id: string;
  name: string;
  children?: Category[];
  subcategories?: Category[];
}

export default function NewProductPage() {
  const t = useTranslations('Products');
  const router = useRouter();

  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoadingCategories, setIsLoadingCategories] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Form fields
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [priceCDF, setPriceCDF] = useState('');
  const [priceUSD, setPriceUSD] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [condition, setCondition] = useState<'NEW' | 'USED'>('NEW');
  const [specifications, setSpecifications] = useState<{ attributeId: string; value: string }[]>([]);

  const handleSpecificationsChange = useCallback((specs: { attributeId: string; value: string }[]) => {
    setSpecifications(specs);
  }, []);

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
        setError(t('errorLoadingCategories'));
      } finally {
        setIsLoadingCategories(false);
      }
    }
    loadCategories();
  }, [t]);

  const flattenCategories = (cats: Category[], depth = 0): { id: string; label: string; depth: number }[] => {
    const result: { id: string; label: string; depth: number }[] = [];
    for (const cat of cats) {
      const label = cat.name || '---';
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
    if (!title.trim()) errors.title = t('requiredField');
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setIsSubmitting(true);
    setError('');

    try {
      const body: Record<string, unknown> = {
        title: title.trim(),
        description: description.trim() || undefined,
        categoryId,
        priceCDF: String(Math.round(Number(priceCDF) * 100)),
        quantity: Number(quantity),
        condition,
      };

      if (priceUSD && Number(priceUSD) > 0) {
        body.priceUSD = String(Math.round(Number(priceUSD) * 100));
      }

      if (specifications.length > 0) {
        body.specifications = specifications;
      }

      const res = await apiFetch<{ product?: { id: string }; id?: string }>('/v1/sellers/products', {
        method: 'POST',
        body: JSON.stringify(body),
      });

      const productId = res.data.product?.id || res.data.id;
      router.push(`/dashboard/products/${productId}`);
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
      setIsSubmitting(false);
    }
  };

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
        <h1 className="text-2xl font-bold text-foreground mt-2">{t('createProduct')}</h1>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6 max-w-2xl">
        {/* Product Info Section */}
        <div className="bg-white rounded-xl border border-border p-6">
          <h2 className="text-lg font-semibold text-foreground mb-4">{t('productInfo')}</h2>
          <div className="space-y-4">
            {/* Category */}
            <div>
              <label htmlFor="categoryId" className="block text-sm font-medium text-foreground mb-1">
                {t('category')} *
              </label>
              {isLoadingCategories ? (
                <div className="h-10 bg-muted rounded-lg animate-pulse" />
              ) : (
                <select
                  id="categoryId"
                  value={categoryId}
                  onChange={(e) => { setCategoryId(e.target.value); setSpecifications([]); setFieldErrors((prev) => ({ ...prev, categoryId: '' })); }}
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
              )}
              {fieldErrors.categoryId && (
                <p className="text-xs text-destructive mt-1">{fieldErrors.categoryId}</p>
              )}
            </div>

            {/* Title */}
            <div>
              <label htmlFor="title" className="block text-sm font-medium text-foreground mb-1">
                {t('title')} *
              </label>
              <input
                id="title"
                type="text"
                value={title}
                onChange={(e) => { setTitle(e.target.value); setFieldErrors((prev) => ({ ...prev, title: '' })); }}
                className={`w-full px-3 py-2 border rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring ${
                  fieldErrors.title ? 'border-destructive' : 'border-input'
                }`}
                placeholder="Ex: T-shirt en coton"
              />
              {fieldErrors.title && (
                <p className="text-xs text-destructive mt-1">{fieldErrors.title}</p>
              )}
            </div>

            {/* Description FR */}
            <div>
              <label htmlFor="description" className="block text-sm font-medium text-foreground mb-1">
                {t('description')}
              </label>
                            <textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
                className="w-full px-3 py-2 border border-input rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-y"
                placeholder="Donnez une description d\u00e9taill\u00e9e de votre produit..."
              />
            </div>

            {/* Condition */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                {t('condition')}
              </label>
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
            </div>
          </div>
        </div>

        {/* Dynamic Attributes Section */}
        {categoryId && (
          <DynamicAttributesForm
            categoryId={categoryId}
            onChange={handleSpecificationsChange}
          />
        )}

        {/* Pricing Section */}
        <div className="bg-white rounded-xl border border-border p-6">
          <h2 className="text-lg font-semibold text-foreground mb-4">{t('pricing')}</h2>
          <div className="space-y-4">
            {/* Price CDF */}
            <div>
              <label htmlFor="priceCDF" className="block text-sm font-medium text-foreground mb-1">
                {t('priceCDF')} *
              </label>
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
                  placeholder="5000"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">CDF</span>
              </div>
              {fieldErrors.priceCDF && (
                <p className="text-xs text-destructive mt-1">{fieldErrors.priceCDF}</p>
              )}
            </div>

            {/* Price USD */}
            <div>
              <label htmlFor="priceUSD" className="block text-sm font-medium text-foreground mb-1">
                {t('priceUSD')}
              </label>
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
                  placeholder="2"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">USD</span>
              </div>
              {fieldErrors.priceUSD && (
                <p className="text-xs text-destructive mt-1">{fieldErrors.priceUSD}</p>
              )}
            </div>

            {/* Quantity */}
            <div>
              <label htmlFor="quantity" className="block text-sm font-medium text-foreground mb-1">
                {t('quantity')} *
              </label>
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
                placeholder="1"
              />
              {fieldErrors.quantity && (
                <p className="text-xs text-destructive mt-1">{fieldErrors.quantity}</p>
              )}
            </div>
          </div>
        </div>

        {/* Note about images */}
        <div className="bg-muted/50 rounded-xl border border-border p-4 text-sm text-muted-foreground">
          {t('noImages')}
        </div>

        {/* Submit */}
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={isSubmitting}
            className="px-6 py-2.5 bg-primary text-primary-foreground rounded-lg font-medium text-sm hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isSubmitting ? t('creating') : t('create')}
          </button>
          <Link
            href="/dashboard/products"
            className="px-6 py-2.5 border border-border rounded-lg font-medium text-sm text-foreground hover:bg-muted transition-colors"
          >
            {t('backToProducts')}
          </Link>
        </div>
      </form>
    </div>
  );
}
