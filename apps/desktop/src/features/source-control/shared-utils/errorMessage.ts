export function errorMessageFrom(error: unknown, fallback: string): string {
  if (!error) return fallback
  if (
    typeof error === 'object' &&
    'message' in error &&
    typeof (error as { message?: unknown }).message === 'string'
  ) {
    return (error as { message: string }).message
  }
  return fallback
}
