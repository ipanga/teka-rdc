'use client';

import { useEffect } from 'react';
import { Link } from '@/i18n/navigation';
import { useCartStore } from '@/lib/cart-store';
import { useAuthStore } from '@/lib/auth-store';

export function CartBadge() {
  const totalItems = useCartStore((s) => s.totalItems);
  const fetchCart = useCartStore((s) => s.fetchCart);
  const setAuthenticated = useCartStore((s) => s.setAuthenticated);
  const mergeGuestCart = useCartStore((s) => s.mergeGuestCart);
  const user = useAuthStore((s) => s.user);
  const isLoadingAuth = useAuthStore((s) => s.isLoading);

  useEffect(() => {
    if (isLoadingAuth) return;

    const isAuth = !!user;
    setAuthenticated(isAuth);

    if (isAuth) {
      // On login, merge guest cart then fetch
      mergeGuestCart().then(() => fetchCart());
    } else {
      fetchCart();
    }
  }, [user, isLoadingAuth, setAuthenticated, mergeGuestCart, fetchCart]);

  return (
    <Link
      href="/cart"
      className="relative p-2 text-foreground hover:text-primary transition-colors"
      aria-label="Cart"
    >
      <svg
        className="w-6 h-6"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M15.75 10.5V6a3.75 3.75 0 1 0-7.5 0v4.5m11.356-1.993 1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 0 1-1.12-1.243l1.264-12A1.125 1.125 0 0 1 5.513 7.5h12.974c.576 0 1.059.435 1.119 1.007ZM8.625 10.5a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm7.5 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z"
        />
      </svg>
      {totalItems > 0 && (
        <span className="absolute -top-0.5 -right-0.5 flex items-center justify-center w-5 h-5 text-[10px] font-bold text-white bg-primary rounded-full">
          {totalItems > 99 ? '99+' : totalItems}
        </span>
      )}
    </Link>
  );
}
