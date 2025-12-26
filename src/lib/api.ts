/**
 * API Client
 * Centralized HTTP client for backend API communication
 * Handles authentication, error handling, and timeout
 */

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3010';
const API_TOKEN = import.meta.env.VITE_API_TOKEN || '';

// Validate configuration
if (!API_TOKEN && import.meta.env.PROD) {
  console.error('VITE_API_TOKEN is required in production');
}

export interface ApiError {
  error: string;
  code?: string;
  message?: string;
}

export interface ApiResponse<T> {
  data: T;
  status: number;
  headers: Headers;
}

class ApiClient {
  private baseURL: string;
  private token: string;
  private defaultTimeout: number = 30000; // 30 seconds

  constructor(baseURL: string, token: string) {
    this.baseURL = baseURL.replace(/\/$/, ''); // Remove trailing slash
    this.token = token;
  }

  /**
   * Get request
   */
  async get<T>(path: string, config?: RequestInit): Promise<T> {
    return this.request<T>('GET', path, undefined, config);
  }

  /**
   * Post request
   */
  async post<T>(path: string, data?: unknown, config?: RequestInit): Promise<T> {
    return this.request<T>('POST', path, data, config);
  }

  /**
   * Delete request
   */
  async delete<T>(path: string, config?: RequestInit): Promise<T> {
    return this.request<T>('DELETE', path, undefined, config);
  }

  /**
   * Main request method
   */
  private async request<T>(
    method: string,
    path: string,
    data?: unknown,
    config?: RequestInit
  ): Promise<T> {
    const url = `${this.baseURL}${path.startsWith('/') ? path : `/${path}`}`;
    
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...config?.headers,
    };

    // Authentication: Try cookie first (HttpOnly), fallback to Authorization header for cross-site
    // Check if we have a token in sessionStorage (fallback for cross-site scenarios)
    const fallbackToken = typeof window !== 'undefined' ? sessionStorage.getItem('authToken') : null;
    if (fallbackToken) {
      headers['Authorization'] = `Bearer ${fallbackToken}`;
    }
    // Note: Cookies are automatically included via credentials: 'include'
    // But in cross-site scenarios, cookies may be blocked, so we use Authorization header as fallback

    const requestConfig: RequestInit = {
      method,
      headers,
      credentials: 'include', // Include cookies for authentication
      ...config,
    };

    // Add body for POST/PUT requests
    if (data && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
      requestConfig.body = JSON.stringify(data);
    }

    // Create abort controller for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.defaultTimeout);
    requestConfig.signal = controller.signal;

    try {
      const response = await fetch(url, requestConfig);
      clearTimeout(timeoutId);

      // Handle non-JSON responses
      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        return {} as T;
      }

      const json = await response.json();

      // Handle error responses
      if (!response.ok) {
        const error: ApiError = {
          error: json.error || `HTTP ${response.status}`,
          code: json.code || `HTTP_${response.status}`,
          message: json.message || response.statusText,
        };

        // Handle specific status codes
        if (response.status === 401) {
          // Unauthorized - token invalid or missing
          console.error('API: Unauthorized - check VITE_API_TOKEN');
          throw new Error('Authentication failed. Please check your API token.');
        }

        if (response.status === 403) {
          // Forbidden
          throw new Error('Access forbidden. You do not have permission to access this resource.');
        }

        if (response.status >= 500) {
          // Server error
          throw new Error(`Server error: ${error.error}. Please try again later.`);
        }

        throw new Error(error.error || error.message || 'Request failed');
      }

      return json as T;
    } catch (error) {
      clearTimeout(timeoutId);

      // Handle abort (timeout)
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('Request timeout. The server took too long to respond.');
      }

      // Handle network errors
      if (error instanceof TypeError && error.message.includes('fetch')) {
        throw new Error('Network error. Please check if the backend is running and accessible.');
      }

      // Re-throw other errors
      throw error;
    }
  }
}

// Create and export singleton instance
export const apiClient = new ApiClient(API_URL, API_TOKEN);

// Export for testing
export default apiClient;

