// Ids the detail pager swipes through. Library/search set this before pushing /card/[id].
let ids: string[] = [];
export const detailSet = {
  set: (next: string[]) => { ids = next; },
  get: () => ids,
};
