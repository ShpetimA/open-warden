import { createSerializer, parseAsString } from "nuqs";

export const pullRequestPreviewSearchParsers = {
  file: parseAsString,
};

export const serializePullRequestPreviewSearch = createSerializer(pullRequestPreviewSearchParsers);
