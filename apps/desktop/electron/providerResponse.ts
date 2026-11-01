import { z } from "zod";

import { providerFailure } from "./desktop-failure";
import { desktopFailure, type DesktopFailure } from "../src/platform/desktop/failure";

export type HostedProvider = "github" | "bitbucket";

const graphEnvelope = z.object({
  errors: z
    .array(
      z.object({
        type: z.string().optional(),
        message: z.string().optional(),
        extensions: z.object({ code: z.string().optional() }).optional(),
      }),
    )
    .optional(),
});

const httpEnvelope = z.object({ message: z.string().optional() });

export function readProviderResponseFailure(
  provider: HostedProvider,
  response: Response,
  body: string,
  now: number,
  graphql: boolean,
): DesktopFailure | null {
  let payload: unknown;

  if (!response.ok || graphql) {
    try {
      payload = JSON.parse(body);
    } catch {
      if (response.ok) {
        return desktopFailure(
          `${provider}.request`,
          "unexpected",
          "The provider returned an invalid response.",
        );
      }
    }
  }

  if (!response.ok) {
    const parsed = httpEnvelope.safeParse(payload);
    const message = parsed.success ? (parsed.data.message ?? "") : "";
    const rateLimited =
      provider === "github" &&
      response.status === 403 &&
      /secondary rate limit|abuse detection/i.test(message);

    return providerFailure(provider, response.status, response.headers, now, { rateLimited });
  }

  if (!graphql) return null;

  const parsed = graphEnvelope.safeParse(payload);
  if (!parsed.success) {
    return desktopFailure(
      `${provider}.request`,
      "unexpected",
      "The provider returned an invalid GraphQL response.",
    );
  }

  const errors = parsed.data.errors ?? [];
  if (!errors.length) return null;

  const rateLimited = errors.some(
    (error) =>
      error.type === "RATE_LIMITED" ||
      error.extensions?.code === "RATE_LIMITED" ||
      /rate limit/i.test(error.message ?? ""),
  );
  const types = new Set(errors.map((error) => error.type ?? error.extensions?.code));
  let status = 503;

  if (types.has("NOT_FOUND")) status = 404;
  else if (types.has("FORBIDDEN")) status = 403;
  else if (types.has("UNAUTHENTICATED")) status = 401;
  else if (
    types.has("GRAPHQL_VALIDATION_FAILED") ||
    types.has("GRAPHQL_PARSE_FAILED") ||
    types.has("BAD_USER_INPUT")
  )
    status = 422;

  const failure = providerFailure(provider, status, response.headers, now, { rateLimited });
  return { ...failure, status: response.status };
}
