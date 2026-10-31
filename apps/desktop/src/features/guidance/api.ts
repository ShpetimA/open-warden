import { desktopFailure, queryResult, type DesktopResult } from "@/platform/desktop/failure";
import { z } from "zod";
import { hostedReposApi } from "@/features/hosted-repos/api";
import { desktop } from "@/platform/desktop";
import {
  guidanceConnectionSchema,
  guidanceActivitySchema,
  type GuidanceActivity,
  guidanceDocumentSchema,
  type GuidanceConnection,
  type GuidanceDocument,
  type GuidanceLocator,
  type GuidanceMessageInput,
  type GuidanceProgressInput,
} from "@/platform/desktop/guidance";

function parseReply<T>(result: DesktopResult<unknown>, schema: z.ZodType<T>) {
  if (!result.ok) return { error: result.error };
  const parsed = schema.safeParse(result.value);
  return parsed.success
    ? { data: parsed.data }
    : {
        error: desktopFailure(
          "guidance",
          "unexpected",
          "Open Warden returned an invalid guidance response.",
        ),
      };
}

function tag(locator: GuidanceLocator) {
  return { type: "Guidance" as const, id: `${locator.repoPath}:${locator.pullRequestNumber}` };
}

export const guidanceApi = hostedReposApi.injectEndpoints({
  endpoints: (builder) => ({
    getGuidanceActivity: builder.query<GuidanceActivity | null, GuidanceLocator>({
      async queryFn(input) {
        return parseReply(
          await desktop.getGuidanceActivity(input),
          guidanceActivitySchema.nullable(),
        );
      },
    }),
    clearGuidanceMessages: builder.mutation<GuidanceDocument, GuidanceLocator>({
      async queryFn(input) {
        return parseReply(await desktop.clearGuidanceMessages(input), guidanceDocumentSchema);
      },
      invalidatesTags: (_data, _error, input) => [tag(input)],
    }),
    getPullRequestGuidance: builder.query<GuidanceDocument | null, GuidanceLocator>({
      async queryFn(input) {
        try {
          return parseReply(
            await desktop.getPullRequestGuidance(input),
            guidanceDocumentSchema.nullable(),
          );
        } catch {
          return {
            error: desktopFailure(
              "getPullRequestGuidance",
              "unavailable",
              "The walkthrough could not be loaded.",
            ),
          };
        }
      },
      providesTags: (_data, _error, input) => [tag(input)],
    }),
    setGuidanceProgress: builder.mutation<GuidanceDocument, GuidanceProgressInput>({
      async queryFn(input) {
        try {
          return parseReply(await desktop.setGuidanceProgress(input), guidanceDocumentSchema);
        } catch {
          return {
            error: desktopFailure(
              "setGuidanceProgress",
              "unavailable",
              "Review progress could not be saved.",
            ),
          };
        }
      },
      invalidatesTags: (_data, _error, input) => [tag(input)],
    }),
    addGuidanceMessage: builder.mutation<GuidanceDocument, GuidanceMessageInput>({
      async queryFn(input) {
        try {
          return parseReply(await desktop.addGuidanceMessage(input), guidanceDocumentSchema);
        } catch {
          return {
            error: desktopFailure(
              "addGuidanceMessage",
              "unavailable",
              "Your message could not be saved. Try again.",
            ),
          };
        }
      },
      invalidatesTags: (_data, _error, input) => [tag(input)],
    }),
    getGuidanceConnection: builder.query<GuidanceConnection, void>({
      async queryFn() {
        return parseReply(await desktop.getGuidanceConnection(), guidanceConnectionSchema);
      },
      providesTags: ["GuidanceConnection"],
    }),
    changeGuidanceConnection: builder.mutation<GuidanceConnection, boolean>({
      async queryFn(enabled) {
        return queryResult(
          await (enabled ? desktop.startGuidanceConnection() : desktop.stopGuidanceConnection()),
        );
      },
      invalidatesTags: ["GuidanceConnection"],
    }),
  }),
});
export const {
  useGetGuidanceActivityQuery,
  useClearGuidanceMessagesMutation,
  useGetPullRequestGuidanceQuery,
  useSetGuidanceProgressMutation,
  useAddGuidanceMessageMutation,
  useGetGuidanceConnectionQuery,
  useChangeGuidanceConnectionMutation,
} = guidanceApi;
