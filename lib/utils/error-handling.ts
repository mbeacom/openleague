/**
 * Utility functions for error handling and network retry logic
 */

/**
 * Custom HTTP error class with status code
 */
export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'HttpError';
  }
}

export interface RetryOptions {
  maxRetries?: number;
  delay?: number;
  backoff?: boolean;
}

/**
 * Retry a function with exponential backoff
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const { maxRetries = 3, delay = 1000, backoff = true } = options;
  
  let lastError: Error | undefined;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      
      // Don't retry on the last attempt
      if (attempt === maxRetries) {
        break;
      }
      
      // Don't retry on certain error types
      if (isNonRetryableError(error)) {
        break;
      }
      
      // Calculate delay with exponential backoff
      const currentDelay = backoff ? delay * Math.pow(2, attempt) : delay;
      
      // Add some jitter to prevent thundering herd
      const jitter = Math.random() * 0.1 * currentDelay;
      
      await new Promise(resolve => setTimeout(resolve, currentDelay + jitter));
    }
  }
  
  throw lastError || new Error('Unknown error occurred');
}

/**
 * Check if an error should not be retried
 */
function isNonRetryableError(error: unknown): boolean {
  if (error instanceof Error) {
    // Don't retry validation errors, auth errors, etc.
    const message = error.message.toLowerCase();
    if (
      message.includes('validation') ||
      message.includes('unauthorized') ||
      message.includes('forbidden') ||
      message.includes('not found')
    ) {
      return true;
    }
  }
  
  // Check for HTTP status codes that shouldn't be retried
  if (error instanceof HttpError) {
    const status = error.status;
    if (status >= 400 && status < 500 && status !== 408 && status !== 429) {
      return true; // Client errors (except timeout and rate limit)
    }
  }
  
  return false;
}

/**
 * Check if the user is online
 */
export function isOnline(): boolean {
  return typeof navigator !== 'undefined' ? navigator.onLine : true;
}

/**
 * Wait for the user to come back online
 */
export function waitForOnline(): Promise<void> {
  return new Promise((resolve) => {
    if (isOnline()) {
      resolve();
      return;
    }
    
    const handleOnline = () => {
      window.removeEventListener('online', handleOnline);
      resolve();
    };
    
    window.addEventListener('online', handleOnline);
  });
}

/**
 * Enhanced fetch with retry logic and offline handling
 */
export async function fetchWithRetry(
  url: string,
  options: RequestInit = {},
  retryOptions: RetryOptions = {}
): Promise<Response> {
  return retryWithBackoff(async () => {
    // Wait for online if offline
    if (!isOnline()) {
      await waitForOnline();
    }
    
    const response = await fetch(url, options);
    
    // Throw on HTTP errors to trigger retry
    if (!response.ok) {
      throw new HttpError(response.status, `HTTP ${response.status}: ${response.statusText}`);
    }
    
    return response;
  }, retryOptions);
}

/**
 * Get user-friendly error message
 * Sanitizes error messages to prevent information leakage
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    // Don't expose internal error details in production
    if (process.env.NODE_ENV === "production") {
      // Check for known safe error messages
      const safeMessages = [
        "Invalid email or password",
        "Unauthorized",
        "Not found",
        "Validation failed",
        "Rate limit exceeded",
        "Team name is required",
        "Event not found",
        "You are not a member of this team",
        "Only team admins can perform this action",
      ];
      
      const message = error.message;
      const isSafeMessage = safeMessages.some(safe => message.includes(safe));
      
      if (isSafeMessage) {
        return message;
      }
      
      // Return generic message for unknown errors in production
      return "An unexpected error occurred";
    }
    
    return error.message;
  }
  
  if (typeof error === 'string') {
    return error;
  }
  
  if (typeof error === 'object' && error !== null && 'message' in error) {
    return String((error as { message: unknown }).message);
  }
  
  return 'An unexpected error occurred';
}

/**
 * Sanitize error for logging
 * Removes sensitive information before logging
 */
export function sanitizeErrorForLogging(error: unknown): unknown {
  if (error instanceof Error) {
    const sanitized = {
      name: error.name,
      message: error.message,
      stack: process.env.NODE_ENV === "development" ? error.stack : undefined,
    };
    
    // Remove sensitive patterns from error messages
    sanitized.message = sanitized.message
      .replace(/password[=:]\s*[^\s]+/gi, "password=***")
      .replace(/token[=:]\s*[^\s]+/gi, "token=***")
      .replace(/key[=:]\s*[^\s]+/gi, "key=***")
      .replace(/secret[=:]\s*[^\s]+/gi, "secret=***");
    
    return sanitized;
  }
  
  return error;
}

/**
 * Check if error is a network error
 */
export function isNetworkError(error: unknown): boolean {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return (
      message.includes('network') ||
      message.includes('fetch') ||
      message.includes('connection') ||
      message.includes('timeout') ||
      !isOnline()
    );
  }
  
  return false;
}