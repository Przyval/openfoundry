import { Button, ButtonGroup, HTMLSelect } from "@blueprintjs/core";

export interface PaginationBarProps {
  hasNext: boolean;
  hasPrevious: boolean;
  onNext: () => void;
  onPrevious: () => void;
  pageSize: number;
  onPageSizeChange?: (size: number) => void;
  totalCount?: number;
}

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

export function PaginationBar({
  hasNext,
  hasPrevious,
  onNext,
  onPrevious,
  pageSize,
  onPageSizeChange,
  totalCount,
}: PaginationBarProps): JSX.Element {
  return (
    <div
      className="of-pagination-bar"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "8px 0",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {onPageSizeChange && (
          <>
            <span className="bp5-text-muted" style={{ fontSize: 12 }}>
              Rows per page:
            </span>
            <HTMLSelect
              value={pageSize}
              onChange={(e) =>
                onPageSizeChange(Number(e.currentTarget.value))
              }
              minimal
            >
              {PAGE_SIZE_OPTIONS.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </HTMLSelect>
          </>
        )}
        {totalCount !== undefined && (
          <span className="bp5-text-muted" style={{ fontSize: 12 }}>
            {totalCount.toLocaleString()} total
          </span>
        )}
      </div>

      <ButtonGroup>
        <Button
          icon="chevron-left"
          disabled={!hasPrevious}
          onClick={onPrevious}
          small
          minimal
          aria-label="Previous page"
        />
        <Button
          icon="chevron-right"
          disabled={!hasNext}
          onClick={onNext}
          small
          minimal
          aria-label="Next page"
        />
      </ButtonGroup>
    </div>
  );
}
