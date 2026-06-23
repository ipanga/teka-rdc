'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { apiFetch, ApiError } from '@/lib/api-client';
import { ProductStatusBadge } from '@/components/product/product-status-badge';
import { ImageUploader } from '@/components/product/image-uploader';
import DynamicAttributesForm from '@/components/products/dynamic-attributes-form';
import BrandSelect from '@/components/products/brand-select';
import CategoryCombobox from '@/components/products/category-combobox';

interface ProductImage {
  id: string;
  url: string;
  order: number;
}

interface Category {
  id: string;
  name: string;
  children?: Category[];
  subcategories?: Category[];
}

interface Product {
  id: string;
  title: string;
  description?: string | null;
  priceCDF: string;
  priceUSD?: string | null;
  quantity: number;
  status: string;
  condition: string;
  categoryId: string;
  category?: { id: string; name: string };
  brandId?: string | null;
  brand?: { id: string; name: string } | null;
  images: ProductImage[];
  specifications?: { attributeId: string; value: string }[];
  rejectionReason?: string | null;
  createdAt: string;
  updatedAt: string;
}

export default function ProductDetailPage() {
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
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [brandId, setBrandId] = useState('');
  const [priceCDF, setPriceCDF] = useState('');
  const [priceUSD, setPriceUSD] = useState('');
  const [quantity, setQuantity] = useState('');
  const [condition, setCondition] = useState<'NEW' | 'USED'>('NEW');
  const [images, setImages] = useState<ProductImage[]>([]);
  const [specifications, setSpecifications] = useState<{ attributeId: string; value: string }[]>([]);
  const [initialSpecValues, setInitialSpecValues] = useState<Record<string, string>>({});

  const handleSpecificationsChange = useCallback(
    (specs: { attributeId: string; value: string }[]) => setSpecifications(specs),
    [],
  );

  const isEditable = product?.status === 'DRAFT' || product?.status === 'REJECTED';
  const canSubmit = product?.status === 'DRAFT';

  const loadProduct = useCallback(async () => {
    try {
      const res = await apiFetch<{ product: Product } & Product>(`/v1/sellers/products/${productId}`);
      const p = res.data.product || res.data;
      setProduct(p);

      // Populate form
      setTitle(p.title || '');
      setDescription(p.description || '');
      setCategoryId(p.categoryId || '');
      setBrandId(p.brand?.id || p.brandId || '');
      setPriceCDF(p.priceCDF ? String(Number(p.priceCDF) / 100) : '');
      setPriceUSD(p.priceUSD ? String(Number(p.priceUSD) / 100) : '');
      setQuantity(String(p.quantity ?? 0));
      setCondition((p.condition as 'NEW' | 'USED') || 'NEW');
      setImages(p.images || []);
      const specs = p.specifications || [];
      setSpecifications(specs);
      setInitialSpecValues(
        Object.fromEntries(specs.map((s) => [s.attributeId, s.value])),
      );
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("Erreur lors du chargement du produit");
      }
    } finally {
      setIsLoading(false);
    }
  }, [productId]);

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

  const validate = (): boolean => {
    const errors: Record<string, string> = {};
    if (!title.trim()) errors.title = "Ce champ est requis";
    if (!categoryId) errors.categoryId = "Ce champ est requis";
    if (!priceCDF || isNaN(Number(priceCDF)) || Number(priceCDF) <= 0) {
      errors.priceCDF = "Veuillez entrer un prix valide";
    }
    if (priceUSD && (isNaN(Number(priceUSD)) || Number(priceUSD) < 0)) {
      errors.priceUSD = "Veuillez entrer un prix valide";
    }
    if (!quantity || isNaN(Number(quantity)) || Number(quantity) < 0) {
      errors.quantity = "Ce champ est requis";
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
      const body: Record<string, unknown> = {
        title: title.trim(),
        description: description.trim() || undefined,
        categoryId,
        priceCDF: String(Math.round(Number(priceCDF) * 100)),
        quantity: Number(quantity),
        condition,
        // null clears the brand; a value sets it (the API treats undefined as
        // "leave unchanged", but on edit we always send the current selection).
        brandId: brandId || null,
        specifications,
      };

      if (priceUSD && Number(priceUSD) > 0) {
        body.priceUSD = String(Math.round(Number(priceUSD) * 100));
      }

      await apiFetch(`/v1/sellers/products/${productId}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      });

      setSuccessMessage("Produit mis à jour avec succès");
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
      setSuccessMessage("Produit soumis pour validation");
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
          &larr; Retour aux produits
        </Link>
        <div className="mt-4 bg-destructive/10 text-destructive p-4 rounded-lg text-sm">
          {error || "Erreur lors du chargement du produit"}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <Link
          href="/dashboard/products"
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          &larr; Retour aux produits
        </Link>
        <div className="flex items-center gap-3 mt-2">
          <h1 className="text-2xl font-bold text-foreground">
            {isEditable ? 'Modifier le produit' : 'Détail du produit'}
          </h1>
          <ProductStatusBadge status={product.status} />
        </div>
      </div>

      {/* Rejection Reason */}
      {product.status === 'REJECTED' && product.rejectionReason && (
        <div className="mb-4 p-4 rounded-lg bg-destructive/10 border border-destructive/20">
          <p className="text-sm font-medium text-destructive">Raison du rejet</p>
          <p className="text-sm text-foreground mt-1">{product.rejectionReason}</p>
        </div>
      )}

      {/* Read-only notice */}
      {!isEditable && (
        <div className="mb-4 p-3 rounded-lg bg-muted text-muted-foreground text-sm">
          Ce produit ne peut pas être modifié dans son statut actuel.
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
            <h2 className="text-lg font-semibold text-foreground mb-4">Informations du produit</h2>
            <div className="space-y-4">
              {/* Category */}
              <div>
                <label htmlFor="categoryId" className="block text-sm font-medium text-foreground mb-1">
                  Catégorie *
                </label>
                {isEditable ? (
                  <CategoryCombobox
                    categories={categories}
                    value={categoryId}
                    onChange={(id) => {
                      setCategoryId(id);
                      setBrandId('');
                      setSpecifications([]);
                      setInitialSpecValues({});
                      setFieldErrors((prev) => ({ ...prev, categoryId: '' }));
                    }}
                    hasError={!!fieldErrors.categoryId}
                  />
                ) : (
                  <p className="px-3 py-2 bg-muted rounded-lg text-foreground text-sm">
                    {product.category?.name || product.categoryId}
                  </p>
                )}
                {fieldErrors.categoryId && (
                  <p className="text-xs text-destructive mt-1">{fieldErrors.categoryId}</p>
                )}
              </div>

              {/* Title */}
              <div>
                <label htmlFor="title" className="block text-sm font-medium text-foreground mb-1">
                  Nom *
                </label>
                {isEditable ? (
                  <input
                    id="title"
                    type="text"
                    value={title}
                    onChange={(e) => { setTitle(e.target.value); setFieldErrors((prev) => ({ ...prev, title: '' })); }}
                    className={`w-full px-3 py-2 border rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring ${
                      fieldErrors.title ? 'border-destructive' : 'border-input'
                    }`}
                  />
                ) : (
                  <p className="px-3 py-2 bg-muted rounded-lg text-foreground text-sm">{title || '---'}</p>
                )}
                {fieldErrors.title && (
                  <p className="text-xs text-destructive mt-1">{fieldErrors.title}</p>
                )}
              </div>

              {/* Description */}
              <div>
                <label htmlFor="description" className="block text-sm font-medium text-foreground mb-1">
                  Description
                </label>
                {isEditable ? (
                  <textarea
                    id="description"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={4}
                    className="w-full px-3 py-2 border border-input rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-y"
                  />
                ) : (
                  <p className="px-3 py-2 bg-muted rounded-lg text-foreground text-sm whitespace-pre-wrap">
                    {description || '---'}
                  </p>
                )}
              </div>

              {/* Condition */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Condition
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
                      <span className="text-sm text-foreground">Neuf</span>
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
                      <span className="text-sm text-foreground">Occasion</span>
                    </label>
                  </div>
                ) : (
                  <p className="px-3 py-2 bg-muted rounded-lg text-foreground text-sm">
                    {condition === 'NEW' ? 'Neuf' : 'Occasion'}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Brand + dynamic attributes (editable products only) */}
          {isEditable && categoryId && (
            <>
              <BrandSelect categoryId={categoryId} value={brandId} onChange={setBrandId} />
              <DynamicAttributesForm
                categoryId={categoryId}
                onChange={handleSpecificationsChange}
                initialValues={initialSpecValues}
              />
            </>
          )}

          {/* Pricing Section */}
          <div className="bg-white rounded-xl border border-border p-6">
            <h2 className="text-lg font-semibold text-foreground mb-4">Tarification</h2>
            <div className="space-y-4">
              {/* Price CDF */}
              <div>
                <label htmlFor="priceCDF" className="block text-sm font-medium text-foreground mb-1">
                  Prix en CDF *
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
                  Prix en USD (optionnel)
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
                  Quantité *
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
                {isSaving ? 'Enregistrement...' : 'Enregistrer'}
              </button>
            )}
            {canSubmit && (
              <button
                type="button"
                onClick={handleSubmitForReview}
                disabled={isSubmitting}
                className="px-6 py-2.5 bg-success text-white rounded-lg font-medium text-sm hover:bg-success/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isSubmitting ? '...' : 'Soumettre pour validation'}
              </button>
            )}
            <Link
              href="/dashboard/products"
              className="px-6 py-2.5 border border-border rounded-lg font-medium text-sm text-foreground hover:bg-muted transition-colors"
            >
              Retour aux produits
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
