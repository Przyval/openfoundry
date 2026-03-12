import { Button, ButtonGroup } from "@blueprintjs/core";

interface PaginationControlsProps {
  /** Whether a previous page is available. */
  hasPrevious: boolean;
  /** Whether a next page is available (i.e. a nextPageToken exists). */
  hasNext: boolean;
  onPrevious: () => void;
  onNext: () => void;
}

export default function PaginationControls({
  hasPrevious,
  hasNext,
  onPrevious,
  onNext,
}: PaginationControlsProps) {
  return (
    <ButtonGroup style={{ marginTop: 12 }}>
      <Button
        icon="chevron-left"
        text="Previous"
        disabled={!hasPrevious}
        onClick={onPrevious}
      />
      <Button
        rightIcon="chevron-right"
        text="Next"
        disabled={!hasNext}
        onClick={onNext}
      />
    </ButtonGroup>
  );
}
