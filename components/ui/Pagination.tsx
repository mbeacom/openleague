"use client";

import { Box, Button, Typography, Select, MenuItem, FormControl, InputLabel } from "@mui/material";
import {
  KeyboardArrowLeft as PrevIcon,
  KeyboardArrowRight as NextIcon,
} from "@mui/icons-material";

export interface PaginationProps {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  itemsPerPage: number;
  onPageChange: (page: number) => void;
  onItemsPerPageChange?: (itemsPerPage: number) => void;
  itemsPerPageOptions?: number[];
  isLoading?: boolean;
  showItemsPerPage?: boolean;
  variant?: "full" | "loadMore";
}

export default function Pagination({
  currentPage,
  totalPages,
  totalItems,
  itemsPerPage,
  onPageChange,
  onItemsPerPageChange,
  itemsPerPageOptions = [10, 20, 50],
  isLoading = false,
  showItemsPerPage = true,
  variant = "full",
}: PaginationProps) {
  const startItem = (currentPage - 1) * itemsPerPage + 1;
  const endItem = Math.min(currentPage * itemsPerPage, totalItems);
  const hasNextPage = currentPage < totalPages;
  const hasPrevPage = currentPage > 1;

  if (variant === "loadMore") {
    return (
      <Box
        display="flex"
        flexDirection="column"
        alignItems="center"
        gap={2}
        sx={{ py: 2 }}
      >
        <Typography variant="body2" color="text.secondary">
          Showing {startItem} - {endItem} of {totalItems} items
        </Typography>
        {hasNextPage && (
          <Button
            variant="outlined"
            onClick={() => onPageChange(currentPage + 1)}
            disabled={isLoading}
            sx={{ minWidth: 200 }}
          >
            {isLoading ? "Loading..." : "Load More"}
          </Button>
        )}
      </Box>
    );
  }

  return (
    <Box
      display="flex"
      flexDirection={{ xs: "column", sm: "row" }}
      justifyContent="space-between"
      alignItems={{ xs: "stretch", sm: "center" }}
      gap={2}
      sx={{ py: 2 }}
    >
      {/* Items per page selector */}
      {showItemsPerPage && onItemsPerPageChange && (
        <FormControl size="small" sx={{ minWidth: 120 }}>
          <InputLabel id="items-per-page-label">Per page</InputLabel>
          <Select
            labelId="items-per-page-label"
            value={itemsPerPage}
            label="Per page"
            onChange={(e) => onItemsPerPageChange(Number(e.target.value))}
            disabled={isLoading}
          >
            {itemsPerPageOptions.map((option) => (
              <MenuItem key={option} value={option}>
                {option}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      )}

      {/* Item count */}
      <Typography
        variant="body2"
        color="text.secondary"
        sx={{ display: { xs: "none", sm: "block" } }}
      >
        Showing {startItem} - {endItem} of {totalItems} items
      </Typography>

      {/* Page navigation */}
      <Box display="flex" alignItems="center" gap={1}>
        <Button
          variant="outlined"
          size="small"
          onClick={() => onPageChange(currentPage - 1)}
          disabled={!hasPrevPage || isLoading}
          startIcon={<PrevIcon />}
          sx={{ minWidth: { xs: 80, sm: 100 } }}
        >
          Previous
        </Button>

        <Typography variant="body2" sx={{ mx: 1, whiteSpace: "nowrap" }}>
          Page {currentPage} of {totalPages}
        </Typography>

        <Button
          variant="outlined"
          size="small"
          onClick={() => onPageChange(currentPage + 1)}
          disabled={!hasNextPage || isLoading}
          endIcon={<NextIcon />}
          sx={{ minWidth: { xs: 80, sm: 100 } }}
        >
          Next
        </Button>
      </Box>
    </Box>
  );
}
