import React, { useState, useMemo } from 'react';
import { Box } from '../primitives/Box';
import { Text } from '../primitives/Text';
import { cn } from '../../design/utils';

export interface ColumnDef<T> {
  /** Unique column identifier */
  key: keyof T | string;
  /** Header label */
  header: string;
  /** Cell renderer (optional - uses toString by default) */
  render?: (value: T[keyof T], row: T) => React.ReactNode;
  /** Enable sorting for this column */
  sortable?: boolean;
  /** Column width (fixed or percentage) */
  width?: number | string;
  /** Text alignment */
  align?: 'left' | 'center' | 'right';
}

export interface TableProps<T> {
  /** Column definitions */
  columns: ColumnDef<T>[];
  /** Data rows */
  data: T[];
  /** Enable row selection */
  selectable?: boolean;
  /** Selected row keys */
  selectedKeys?: Array<string | number>;
  /** Row click handler */
  onRowClick?: (row: T, index: number) => void;
  /** Selection change handler */
  onSelectionChange?: (keys: Array<string | number>) => void;
  /** Get unique key for a row */
  getRowKey?: (row: T, index: number) => string | number;
  /** Empty state message */
  emptyMessage?: string;
  /** Maximum height with scroll */
  maxHeight?: number;
  /** Additional className */
  className?: string;
}

/**
 * Table — Sortable, scrollable data table
 * Mirrors the TUI's hand-rolled Table from src/tui/components.tsx
 * with added features like sorting and selection
 *
 * @example
 * <Table
 *   columns={[
 *     { key: 'name', header: 'Name', sortable: true },
 *     { key: 'tokens', header: 'Tokens', align: 'right' },
 *   ]}
 *   data={rows}
 *   onRowClick={(row) => console.log(row)}
 * />
 */
export function Table<T extends Record<string, unknown>>({
  columns,
  data,
  selectable = false,
  selectedKeys = [],
  onRowClick,
  onSelectionChange,
  getRowKey,
  emptyMessage = 'No data',
  maxHeight,
  className,
}: TableProps<T>) {
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  // Get cell value from row using key path (supports nested keys like 'user.name')
  const getCellValue = (row: T, key: string): unknown => {
    return key.split('.').reduce((obj, k) => (obj as any)?.[k], row);
  };

  // Sorted data
  const sortedData = useMemo(() => {
    if (!sortColumn) return data;

    return [...data].sort((a, b) => {
      const aValue = getCellValue(a, sortColumn);
      const bValue = getCellValue(b, sortColumn);

      let comparison = 0;
      if (typeof aValue === 'number' && typeof bValue === 'number') {
        comparison = aValue - bValue;
      } else {
        comparison = String(aValue).localeCompare(String(bValue));
      }

      return sortDirection === 'asc' ? comparison : -comparison;
    });
  }, [data, sortColumn, sortDirection]);

  const handleSort = (columnKey: string) => {
    if (sortColumn === columnKey) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(columnKey);
      setSortDirection('asc');
    }
  };

  const handleRowToggle = (row: T, index: number) => {
    if (!onSelectionChange) return;
    const key = getRowKey?.(row, index) ?? index;
    const isSelected = selectedKeys.includes(key);
    if (isSelected) {
      onSelectionChange(selectedKeys.filter((k) => k !== key));
    } else {
      onSelectionChange([...selectedKeys, key]);
    }
  };

  return (
    <Box
      flexDirection="column"
      border="rounded"
      borderColor="border"
      bg="bgElevated"
      className={cn('table', className)}
      style={{
        maxHeight: maxHeight ? `${maxHeight}px` : undefined,
        overflow: maxHeight ? 'auto' : undefined,
      }}
    >
      {/* Header */}
      <Box
        display="flex"
        flexDirection="row"
        borderBottom="solid"
        borderColor="border"
        className="table-header"
        style={{
          position: 'sticky',
          top: 0,
          backgroundColor: 'var(--color-bg-elevated)',
          zIndex: 1,
        }}
      >
        {selectable && (
          <Box
            padding="sm"
            style={{ width: '40px', flexShrink: 0 }}
            className="table-cell-header"
          />
        )}
        {columns.map((column) => (
          <Box
            key={column.key as string}
            padding="sm"
            className={cn(
              'table-cell-header',
              column.sortable && 'table-cell-sortable'
            )}
            style={{
              width: column.width,
              textAlign: column.align ?? 'left',
              cursor: column.sortable ? 'pointer' : undefined,
              userSelect: column.sortable ? 'none' : undefined,
            }}
            onClick={() => column.sortable && handleSort(column.key as string)}
          >
            <Box display="flex" flexDirection="row" gap="xs" alignItems="center">
              <Text fontSize="sm" fontWeight="bold" fg="accent">
                {column.header}
              </Text>
              {sortColumn === column.key && (
                <Text fontSize="xs" fg="accent">
                  {sortDirection === 'asc' ? '▲' : '▼'}
                </Text>
              )}
            </Box>
          </Box>
        ))}
      </Box>

      {/* Body */}
      {sortedData.length === 0 ? (
        <Box padding="lg" className="table-empty">
          <Text fontSize="sm" fg="fgMuted" block>
            {emptyMessage}
          </Text>
        </Box>
      ) : (
        sortedData.map((row, index) => {
          const key = getRowKey?.(row, index) ?? index;
          const isSelected = selectedKeys.includes(key as string | number);

          return (
            <Box
              key={key}
              display="flex"
              flexDirection="row"
              borderTop="solid"
              borderColor="border"
              className={cn(
                'table-row',
                isSelected && 'table-row-selected',
                onRowClick && 'table-row-clickable'
              )}
              style={{
                cursor: onRowClick ? 'pointer' : undefined,
                backgroundColor: isSelected
                  ? 'var(--color-bg)'
                  : undefined,
              }}
              onClick={() => {
                if (selectable) {
                  handleRowToggle(row, index);
                }
                onRowClick?.(row, index);
              }}
            >
              {selectable && (
                <Box
                  padding="sm"
                  style={{ width: '40px', flexShrink: 0 }}
                  className="table-cell"
                >
                  <Text fontSize="sm" mono>
                    {isSelected ? '✓' : '○'}
                  </Text>
                </Box>
              )}
              {columns.map((column) => (
                <Box
                  key={column.key as string}
                  padding="sm"
                  className="table-cell"
                  style={{
                    width: column.width,
                    textAlign: column.align ?? 'left',
                  }}
                >
                  {column.render
                    ? column.render(
                        getCellValue(row, column.key as string) as T[keyof T],
                        row
                      )
                    : String(getCellValue(row, column.key as string) ?? '')}
                </Box>
              ))}
            </Box>
          );
        })
      )}
    </Box>
  );
}