export function errorMessageFrom(error: unknown, fallback: string): string {
  if (!error) return fallback;
  if (typeof error === "string") return error;
  if (
    typeof error === "object" &&
    "message" in error &&
    typeof (error as { message?: unknown }).message === "string"
  ) {
    return (error as { message: string }).message;
  }
  if (typeof error === "object") {
    const maybeError = error as {
      error?: unknown;
      data?: unknown;
      statusText?: unknown;
    };

    if (typeof maybeError.error === "string" && maybeError.error.trim()) {
      return maybeError.error;
    }

    if (typeof maybeError.statusText === "string" && maybeError.statusText.trim()) {
      return maybeError.statusText;
    }

    if (typeof maybeError.data === "string" && maybeError.data.trim()) {
      return maybeError.data;
    }

    if (
      maybeError.data &&
      typeof maybeError.data === "object" &&
      "message" in maybeError.data &&
      typeof (maybeError.data as { message?: unknown }).message === "string"
    ) {
      return (maybeError.data as { message: string }).message;
    }
  }
  return fallback;
}
