import type { RootState } from "@/app/store";
import { getWrappedNavigationIndex } from "@/lib/keyboard-navigation";

function matchesSymbolPeekQueryText(text: string, query: string) {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return true;
  }

  return text.toLowerCase().includes(normalizedQuery);
}

function getFilteredSymbolPeekIndexes(state: RootState) {
  const symbolPeek = state.sourceControl.symbolPeek;
  if (!symbolPeek) {
    return [] as number[];
  }

  return symbolPeek.locations.flatMap((location, index) => {
    const searchableText = `${location.relPath} ${location.line} ${location.character + 1}`;
    return matchesSymbolPeekQueryText(searchableText, symbolPeek.query) ? [index] : [];
  });
}

export function getNextSymbolPeekIndex(state: RootState, nextKey: boolean) {
  const symbolPeek = state.sourceControl.symbolPeek;
  if (!symbolPeek || symbolPeek.locations.length === 0) {
    return null;
  }

  const filteredIndexes = getFilteredSymbolPeekIndexes(state);
  if (filteredIndexes.length === 0) {
    return null;
  }

  const activeFilteredIndex = filteredIndexes.findIndex(
    (index) => index === symbolPeek.activeIndex,
  );
  const targetFilteredIndex = getWrappedNavigationIndex(
    activeFilteredIndex,
    filteredIndexes.length,
    nextKey,
  );

  return filteredIndexes[targetFilteredIndex] ?? null;
}
