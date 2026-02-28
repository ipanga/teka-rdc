'use client';

import { useState, useRef } from 'react';
import { useTranslations } from 'next-intl';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5050/api';

interface ProductImage {
  id: string;
  url: string;
  order: number;
}

interface ImageUploaderProps {
  productId: string;
  images: ProductImage[];
  onImagesChange: (images: ProductImage[]) => void;
  readOnly?: boolean;
}

export function ImageUploader({ productId, images, onImagesChange, readOnly }: ImageUploaderProps) {
  const t = useTranslations('Products');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const sortedImages = [...images].sort((a, b) => a.order - b.order);
  const canUpload = !readOnly && images.length < 8;

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setError('');

    try {
      const formData = new FormData();
      formData.append('image', file);

      const res = await fetch(`${API_BASE}/v1/sellers/products/${productId}/images`, {
        method: 'POST',
        credentials: 'include',
        body: formData,
      });

      const json = await res.json();

      if (!res.ok) {
        setError(json?.error?.message || 'Upload failed');
        return;
      }

      const newImage: ProductImage = json.data.image || json.data;
      onImagesChange([...images, newImage]);
    } catch {
      setError('Upload failed');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleDelete = async (imageId: string) => {
    setDeletingId(imageId);
    setError('');

    try {
      const res = await fetch(`${API_BASE}/v1/sellers/products/${productId}/images/${imageId}`, {
        method: 'DELETE',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!res.ok) {
        const json = await res.json();
        setError(json?.error?.message || 'Delete failed');
        return;
      }

      onImagesChange(images.filter((img) => img.id !== imageId));
    } catch {
      setError('Delete failed');
    } finally {
      setDeletingId(null);
    }
  };

  const getThumbUrl = (url: string) => {
    return url.replace('/upload/', '/upload/w_200,h_200,c_fill/');
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-foreground">{t('images')}</h3>
        <span className="text-xs text-muted-foreground">
          {t('maxImages', { count: images.length })}
        </span>
      </div>

      {error && (
        <div className="mb-3 p-2 rounded bg-destructive/10 text-destructive text-xs">
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        {sortedImages.map((img) => (
          <div key={img.id} className="relative group aspect-square rounded-lg overflow-hidden border border-border bg-muted">
            <img
              src={getThumbUrl(img.url)}
              alt=""
              className="w-full h-full object-cover"
              loading="lazy"
            />
            {!readOnly && (
              <button
                onClick={() => handleDelete(img.id)}
                disabled={deletingId === img.id}
                className="absolute top-1.5 right-1.5 w-6 h-6 bg-destructive text-white rounded-full flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-50"
                title={t('deleteImage')}
              >
                {deletingId === img.id ? '...' : '\u00d7'}
              </button>
            )}
          </div>
        ))}

        {canUpload && (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className="aspect-square rounded-lg border-2 border-dashed border-border hover:border-primary/50 flex flex-col items-center justify-center gap-1 text-muted-foreground hover:text-primary transition-colors disabled:opacity-50"
          >
            {isUploading ? (
              <span className="text-xs">{t('uploadingImage')}</span>
            ) : (
              <>
                <span className="text-2xl">+</span>
                <span className="text-xs">{t('uploadImage')}</span>
              </>
            )}
          </button>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleUpload}
        className="hidden"
      />
    </div>
  );
}
