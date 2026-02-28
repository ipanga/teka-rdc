const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5050/api';

interface ApiErrorData {
  error?: {
    message?: string;
    status?: number;
    errors?: Record<string, string[]>;
  };
}

export class ApiError extends Error {
  status: number;
  errors?: Record<string, string[]>;

  constructor(data: ApiErrorData) {
    super(data?.error?.message || 'Une erreur est survenue');
    this.status = data?.error?.status || 500;
    this.errors = data?.error?.errors;
  }
}

export async function apiFetch<T = unknown>(
  path: string,
  options?: RequestInit,
): Promise<{ success: boolean; data: T; message?: string }> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  const json = await res.json();

  if (!res.ok) {
    throw new ApiError(json);
  }

  return json;
}
