import { z } from "zod";

export const gitObjectIdSchema = z
  .string()
  .refine(
    (value) =>
      (value.length === 40 || value.length === 64) &&
      [...value].every((character) => "0123456789abcdef".includes(character)),
  );
