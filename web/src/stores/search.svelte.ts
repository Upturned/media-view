/**
 * The search box's state (technical doc §11.2a). A page with a grid registers itself as the search
 * context: the box then filters that grid ("This album"); otherwise, or with "Everywhere", Enter
 * opens the Search page.
 */
export const search = $state({
  /** The query applied to the current page's grid. */
  q: '',
  /** What the box is editing (applied on Enter, live on grid pages). */
  draft: '',
  scope: 'here' as 'here' | 'everywhere',
  /** The current grid, if the page has one (e.g. "Portraits"). The Search page uses kind 'search'. */
  context: null as null | { label: string; kind: 'grid' | 'search' },
});

/** Register the page's grid as the search context; returns the cleanup (use in an $effect). */
export function useSearchContext(label: string, kind: 'grid' | 'search' = 'grid', initial = ''): () => void {
  search.context = { label, kind };
  search.q = initial;
  search.draft = initial;
  search.scope = 'here';
  return () => {
    if (search.context?.label === label) {
      search.context = null;
      search.q = '';
      search.draft = '';
    }
  };
}

/** Change the applied query (e.g. from the tag index) and show it in the box. */
export function setQuery(q: string): void {
  search.q = q;
  search.draft = q;
}
