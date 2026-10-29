import type { AppThunk } from "@/app/store";
import { failureFromUnknown } from "@/platform/desktop/failure";
import { gitApi } from "./api";
import {
  fileSaveFailed,
  isWorkingFileTrashing,
  fileSaveStarted,
  fileSaveSucceeded,
  workingFileKey,
  type WorkingFileTarget,
} from "./fileEditorSlice";

export const saveWorkingFile =
  (target: WorkingFileTarget): AppThunk =>
  async (dispatch, getState) => {
    const editor = getState().fileEditor;
    if (isWorkingFileTrashing(editor, target)) return;
    const document = editor.documents[workingFileKey(target)];
    if (!document || document.save.kind === "saving" || document.contents === document.baseContents)
      return;
    const { contents, baseContents } = document;
    dispatch(fileSaveStarted(target));
    try {
      await dispatch(
        gitApi.endpoints.saveWorkingFile.initiate({
          ...target,
          contents,
          expectedContents: baseContents,
        }),
      ).unwrap();
      dispatch(fileSaveSucceeded({ ...target, contents }));
    } catch (cause: unknown) {
      dispatch(fileSaveFailed({ ...target, error: failureFromUnknown(cause, "saveWorkingFile") }));
    }
  };
