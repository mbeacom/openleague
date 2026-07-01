import { Pagination } from 'openleague';

const noop = () => {};

export const Full = () => (
  <div style={{ maxWidth: 680 }}>
    <Pagination
      currentPage={2}
      totalPages={8}
      totalItems={156}
      itemsPerPage={20}
      onPageChange={noop}
      onItemsPerPageChange={noop}
    />
  </div>
);

export const LoadMore = () => (
  <div style={{ maxWidth: 680 }}>
    <Pagination
      variant="loadMore"
      currentPage={1}
      totalPages={5}
      totalItems={94}
      itemsPerPage={20}
      onPageChange={noop}
    />
  </div>
);
