import { useAppSelector } from "@/app/hooks";
import type { RootState } from "@/app/store";
import { PierreFileTreeBrowser, type PierreFileTreeBrowserProps } from "./PierreFileTreeBrowser";

type SelectedTreeProps<TFile extends { path: string }> = Omit<
  PierreFileTreeBrowserProps<TFile>,
  "selectedPath"
> & {
  displayPathBySourcePath: ReadonlyMap<string, string>;
};

export function SelectedPierreFileTree<TFile extends { path: string }>({
  selection,
  ...props
}: SelectedTreeProps<TFile> & { selection: string | ((state: RootState) => string) }) {
  if (typeof selection === "function") {
    return <ReduxSelectedTree {...props} selectPath={selection} />;
  }

  const { displayPathBySourcePath, ...treeProps } = props;
  return (
    <PierreFileTreeBrowser
      {...treeProps}
      selectedPath={displayPathBySourcePath.get(selection) ?? ""}
    />
  );
}

function ReduxSelectedTree<TFile extends { path: string }>({
  selectPath,
  ...props
}: SelectedTreeProps<TFile> & { selectPath: (state: RootState) => string }) {
  const activePath = useAppSelector(selectPath);
  return <SelectedPierreFileTree {...props} selection={activePath} />;
}
