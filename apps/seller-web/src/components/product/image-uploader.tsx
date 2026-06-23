'use client';

import { useState, useRef } from 'react';
import { compressImageForUpload } from '@/lib/image-compress';
import { apiFetch, ApiError } from '@/lib/api-client';

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
      // Compress to ≤500 KB WebP before upload. Saves 2G/3G bandwidth
      // for sellers in DRC and cuts Cloudinary storage. No-op for files
      // already under the threshold or for GIFs (animation preserved).
      const fileToUpload = await compressImageForUpload(file);

      const formData = new FormData();
      formData.append('image', fileToUpload);

      // Through apiFetch (not raw fetch) so an expired access token is
      // transparently refreshed mid-upload instead of failing — and so the
      // seller isn't left in a broken auth state after posting a product.
      const json = await apiFetch<{ image?: ProductImage }>(
        `/v1/sellers/products/${productId}/images`,
        { method: 'POST', body: formData },
      );

      const newImage = json.data.image ?? (json.data as unknown as ProductImage);
      onImagesChange([...images, newImage]);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Upload failed');
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
      await apiFetch(
        `/v1/sellers/products/${productId}/images/${imageId}`,
        { method: 'DELETE' },
      );

      onImagesChange(images.filter((img) => img.id !== imageId));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Delete failed');
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
        <h3 className="text-sm font-medium text-foreground">Images</h3>
        <span className="text-xs text-muted-foreground">
          {`${images.length}/8 images`}
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
                title="Supprimer l'image"
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
              <span className="text-xs">Envoi en cours...</span>
            ) : (
              <>
                <span className="text-2xl">+</span>
                <span className="text-xs">Ajouter une image</span>
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
