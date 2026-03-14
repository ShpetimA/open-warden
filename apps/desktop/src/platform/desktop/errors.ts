import type { ApiError, ErrorCode } from './contracts'

export function createApiError(
  message: string,
  options?: { code?: ErrorCode; details?: string | null },
): ApiError {
  return {
    code: options?.code ?? 'BACKEND',
    message,
    details: options?.details ?? null,
  }
}

export function toErrorMessage(error: ApiError): string {
  return error.details ? `${error.message}: ${error.details}` : error.message
}

export function toError(error: ApiError): Error {
  return new Error(toErrorMessage(error))
}

export function unsupportedInBrowser(feature: string): Error {
  return toError(
    createApiError(`${feature} is unavailable in browser mode`, {
      code: 'UNAVAILABLE',
    }),
  )
}

export function desktopRuntimeUnavailable(): Error {
  return toError(
    createApiError(
      'Desktop API is unavailable in this renderer. If you opened http://localhost:1420 in a browser, use the Electron window from pnpm dev:electron instead. For browser-only development, run pnpm dev. If this is already the Electron window, the preload bridge failed to load.',
      {
        code: 'UNAVAILABLE',
      },
    ),
  )
}
