import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import { readDesktopFailure, type DesktopFailure } from "@/platform/desktop/failure";

type ReadDeadlines = { byScope: Record<string, DesktopFailure> };

const initialState: ReadDeadlines = { byScope: {} };
const slice = createSlice({
  name: "hostedReadDeadlines",
  initialState,
  reducers: {
    rememberHostedReadDeadline(
      state,
      { payload }: PayloadAction<{ scopes: string[]; failure: DesktopFailure; now: number }>,
    ) {
      for (const [scope, failure] of Object.entries(state.byScope)) {
        if ((failure.retryAt ?? 0) <= payload.now) delete state.byScope[scope];
      }
      for (const scope of payload.scopes) {
        if ((payload.failure.retryAt ?? 0) > (state.byScope[scope]?.retryAt ?? 0))
          state.byScope[scope] = payload.failure;
      }
    },
  },
});

export const { rememberHostedReadDeadline } = slice.actions;
export const hostedReadDeadlinesReducer = slice.reducer;

export function hostedReadDeadline(state: unknown, scopes: readonly string[], now: number) {
  if (typeof state !== "object" || state === null || !("hostedReadDeadlines" in state)) return;
  const policy = state.hostedReadDeadlines;
  if (typeof policy !== "object" || policy === null || !("byScope" in policy)) return;
  const deadlines = policy.byScope;
  if (typeof deadlines !== "object" || deadlines === null) return;

  let longest: DesktopFailure | undefined;
  for (const scope of scopes) {
    const failure = readDesktopFailure(Reflect.get(deadlines, scope));
    if (failure && (failure.retryAt ?? 0) > Math.max(now, longest?.retryAt ?? 0)) longest = failure;
  }
  return longest;
}
