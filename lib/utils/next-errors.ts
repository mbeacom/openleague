const NEXT_REDIRECT_ERROR_CODE = "NEXT_REDIRECT";

type RedirectErrorLike = Error & {
  digest?: string;
};

export function isNextRedirectError(error: unknown): error is RedirectErrorLike {
  if (typeof error !== "object" || error === null) {
    return false;
  }

  const maybeRedirectError = error as { digest?: unknown };
  if (
    typeof maybeRedirectError.digest === "string" &&
    maybeRedirectError.digest.startsWith(`${NEXT_REDIRECT_ERROR_CODE};`)
  ) {
    return true;
  }

  return error instanceof Error && error.message.includes(NEXT_REDIRECT_ERROR_CODE);
}

export function rethrowIfNextRedirectError(error: unknown): void {
  if (isNextRedirectError(error)) {
    throw error;
  }
}