export function parseGearActivitySearchParams(searchParams: {
  activityPage?: string | string[];
  activitySearch?: string | string[];
}) {
  const pageValue = Array.isArray(searchParams.activityPage)
    ? searchParams.activityPage[0]
    : searchParams.activityPage;
  const searchValue = Array.isArray(searchParams.activitySearch)
    ? searchParams.activitySearch[0]
    : searchParams.activitySearch;
  const parsedPage = Number.parseInt(pageValue ?? "1", 10);

  return {
    activityPage: Number.isSafeInteger(parsedPage) ? Math.min(10_000, Math.max(1, parsedPage)) : 1,
    activitySearch: (searchValue ?? "").trim().slice(0, 100),
  };
}
