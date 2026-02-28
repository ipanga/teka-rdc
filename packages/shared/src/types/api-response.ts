export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
}

export interface ApiError {
  success: false;
  error: {
    type: string;
    title: string;
    detail: string;
    status: number;
    errors?: Array<{ field: string; message: string }>;
  };
}
