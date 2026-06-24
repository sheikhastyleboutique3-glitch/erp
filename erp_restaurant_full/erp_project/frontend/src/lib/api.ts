import axios, { AxiosError, AxiosInstance, InternalAxiosRequestConfig } from 'axios';

export interface ApiError { message: string; statusCode: number; path?: string; timestamp?: string; }
interface QueueItem { resolve: (token: string) => void; reject: (err: unknown) => void; }

let isRefreshing = false;
let failedQueue: QueueItem[] = [];

function processQueue(error: unknown, token: string | null) {
  failedQueue.forEach((item) => error ? item.reject(error) : item.resolve(token!));
  failedQueue = [];
}

export function getToken(): string | null { return localStorage.getItem('token'); }
export function getRefreshToken(): string | null { return localStorage.getItem('refresh_token'); }
export function clearAuth() { localStorage.removeItem('token'); localStorage.removeItem('refresh_token'); localStorage.removeItem('user'); }

function redirectToLogin() { clearAuth(); if (window.location.pathname !== '/login') window.location.replace('/login'); }

const api: AxiosInstance = axios.create({ baseURL: '/api', timeout: 15_000, headers: { 'Content-Type': 'application/json' } });

api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = getToken();
  if (token && config.headers) config.headers.Authorization = `Bearer ${token}`;
  return config;
}, (error) => Promise.reject(error));

api.interceptors.response.use((response) => response, async (error: AxiosError<ApiError>) => {
  const originalRequest = error.config as any;
  if (axios.isCancel(error)) return Promise.reject(error);
  if (error.response?.status !== 401 || originalRequest._retry) return Promise.reject(normaliseError(error));
  if (originalRequest.url?.includes('/auth/refresh')) { redirectToLogin(); return Promise.reject(normaliseError(error)); }
  originalRequest._retry = true;
  if (isRefreshing) {
    return new Promise<string>((resolve, reject) => { failedQueue.push({ resolve, reject }); })
      .then((newToken) => { if (originalRequest.headers) originalRequest.headers['Authorization'] = `Bearer ${newToken}`; return api(originalRequest); })
      .catch((err) => Promise.reject(err));
  }
  isRefreshing = true;
  const refreshToken = getRefreshToken();
  if (!refreshToken) { isRefreshing = false; processQueue(new Error('No refresh token'), null); redirectToLogin(); return Promise.reject(normaliseError(error)); }
  try {
    const { data } = await axios.post<{ success: boolean; data: { access_token: string } }>('/api/auth/refresh', { refresh_token: refreshToken });
    const newToken = data.data.access_token;
    localStorage.setItem('token', newToken);
    if (originalRequest.headers) originalRequest.headers['Authorization'] = `Bearer ${newToken}`;
    processQueue(null, newToken);
    return api(originalRequest);
  } catch (refreshError) { processQueue(refreshError, null); redirectToLogin(); return Promise.reject(refreshError); }
  finally { isRefreshing = false; }
});

function normaliseError(error: AxiosError<ApiError>): ApiError {
  if (error.response?.data) {
    const d = error.response.data;
    return { message: typeof d.message === 'string' ? d.message : Array.isArray(d.message) ? (d.message as string[]).join(', ') : 'An error occurred', statusCode: error.response.status, path: d.path, timestamp: d.timestamp };
  }
  if (error.request) return { message: 'Network error', statusCode: 0 };
  return { message: error.message ?? 'Unknown error', statusCode: -1 };
}

/**
 * Authenticated CSV download helper.
 * Uses the axios instance (with JWT) instead of window.open(),
 * which would send an unauthenticated browser request and get 401.
 */
export async function downloadCsv(path: string, filename: string): Promise<void> {
  const response = await api.get(path, { responseType: 'blob' });
  const url = URL.createObjectURL(new Blob([response.data], { type: 'text/csv;charset=utf-8;' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default api;
