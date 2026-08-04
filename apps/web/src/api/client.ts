import axios, { type AxiosRequestConfig } from "axios";

const BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000";

export const apiClient = axios.create({
  baseURL: BASE_URL,
  headers: { "Content-Type": "application/json" },
});

// Module-level ref so interceptors can read the token without React context.
let _accessToken: string | null = null;
let _refreshToken: string | null = null;
let _onAuthFailure: (() => void) | null = null;

export function setTokens(access: string, refresh: string) {
  _accessToken = access;
  _refreshToken = refresh;
  localStorage.setItem("refreshToken", refresh);
}

export function clearTokens() {
  _accessToken = null;
  _refreshToken = null;
  localStorage.removeItem("refreshToken");
}

export function getStoredRefreshToken(): string | null {
  return localStorage.getItem("refreshToken");
}

export function registerAuthFailureHandler(fn: () => void) {
  _onAuthFailure = fn;
}

apiClient.interceptors.request.use((config) => {
  if (_accessToken) {
    config.headers = config.headers ?? {};
    config.headers.Authorization = `Bearer ${_accessToken}`;
  }
  return config;
});

let refreshPromise: Promise<string | null> | null = null;

apiClient.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config as AxiosRequestConfig & { _retry?: boolean };
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true;

      if (!refreshPromise) {
        refreshPromise = (async () => {
          const rt = _refreshToken ?? getStoredRefreshToken();
          if (!rt) return null;
          try {
            const { data } = await axios.post<{ accessToken: string }>(
              `${BASE_URL}/api/auth/refresh`,
              { refreshToken: rt }
            );
            _accessToken = data.accessToken;
            return data.accessToken;
          } catch {
            return null;
          } finally {
            refreshPromise = null;
          }
        })();
      }

      const newToken = await refreshPromise;
      if (!newToken) {
        clearTokens();
        _onAuthFailure?.();
        return Promise.reject(error);
      }

      if (original.headers) {
        original.headers.Authorization = `Bearer ${newToken}`;
      } else {
        original.headers = { Authorization: `Bearer ${newToken}` };
      }
      return apiClient(original);
    }
    return Promise.reject(error);
  }
);
