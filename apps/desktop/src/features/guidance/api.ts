import { z } from "zod";
import { hostedReposApi } from "@/features/hosted-repos/api";
import { desktop } from "@/platform/desktop";
import {
  guidanceConnectionSchema,
  guidanceActivitySchema,
  type GuidanceActivity,
  guidanceDocumentSchema,
  guidanceResultSchema,
  type GuidanceConnection,
  type GuidanceDocument,
  type GuidanceLocator,
  type GuidanceMessageInput,
  type GuidanceProgressInput,
} from "@/platform/desktop/guidance";

function parseReply<T>(value: unknown, schema: z.ZodType<T>) {
  const parsed = guidanceResultSchema(schema).safeParse(value);
  if (!parsed.success)
    return { error: { message: "Open Warden returned an invalid guidance response." } };
  return parsed.data.ok
    ? { data: parsed.data.value }
    : { error: { message: parsed.data.error.message } };
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
          return { error: { message: "The walkthrough could not be loaded." } };
        }
      },
      providesTags: (_data, _error, input) => [tag(input)],
    }),
    setGuidanceProgress: builder.mutation<GuidanceDocument, GuidanceProgressInput>({
      async queryFn(input) {
        try {
          return parseReply(await desktop.setGuidanceProgress(input), guidanceDocumentSchema);
        } catch {
          return { error: { message: "Review progress could not be saved." } };
        }
      },
      invalidatesTags: (_data, _error, input) => [tag(input)],
    }),
    addGuidanceMessage: builder.mutation<GuidanceDocument, GuidanceMessageInput>({
      async queryFn(input) {
        try {
          return parseReply(await desktop.addGuidanceMessage(input), guidanceDocumentSchema);
        } catch {
          return { error: { message: "Your message could not be saved. Try again." } };
        }
      },
      invalidatesTags: (_data, _error, input) => [tag(input)],
    }),
    getGuidanceConnection: builder.query<GuidanceConnection, void>({
      async queryFn() {
        try {
          const parsed = guidanceConnectionSchema.safeParse(await desktop.getGuidanceConnection());
          return parsed.success
            ? { data: parsed.data }
            : { error: { message: "The connection state could not be read." } };
        } catch {
          return { error: { message: "The connection state could not be read." } };
        }
      },
      providesTags: ["GuidanceConnection"],
    }),
    changeGuidanceConnection: builder.mutation<GuidanceConnection, boolean>({
      async queryFn(enabled) {
        try {
          const parsed = guidanceConnectionSchema.safeParse(
            await (enabled ? desktop.startGuidanceConnection() : desktop.stopGuidanceConnection()),
          );
          return parsed.success
            ? { data: parsed.data }
            : { error: { message: "The connection could not be changed." } };
        } catch {
          return { error: { message: "The connection could not be changed." } };
        }
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
