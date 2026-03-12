// ANSI escape codes for colored output
const RESET = "\x1b[0m";
const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const CYAN = "\x1b[36m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";

const isColorSupported =
  process.env["NO_COLOR"] === undefined && process.stdout.isTTY !== false;

function colorize(color: string, text: string): string {
  return isColorSupported ? `${color}${text}${RESET}` : text;
}

export function log(message: string): void {
  console.log(message);
}

export function success(message: string): void {
  console.log(colorize(GREEN, `✓ ${message}`));
}

export function warn(message: string): void {
  console.warn(colorize(YELLOW, `⚠ ${message}`));
}

export function error(message: string): void {
  console.error(colorize(RED, `✗ ${message}`));
}

export function bold(text: string): string {
  return colorize(BOLD, text);
}

export function dim(text: string): string {
  return colorize(DIM, text);
}

export function cyan(text: string): string {
  return colorize(CYAN, text);
}

export interface Spinner {
  stop(finalMessage?: string): void;
  update(message: string): void;
}

export function spinner(message: string): Spinner {
  const frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
  let frameIndex = 0;
  let currentMessage = message;

  const isTTY = process.stderr.isTTY;

  const interval = isTTY
    ? setInterval(() => {
        const frame = frames[frameIndex % frames.length];
        process.stderr.write(
          `\r${colorize(CYAN, frame)} ${currentMessage}`,
        );
        frameIndex++;
      }, 80)
    : null;

  if (!isTTY) {
    process.stderr.write(`  ${currentMessage}\n`);
  }

  return {
    stop(finalMessage?: string): void {
      if (interval) {
        clearInterval(interval);
        process.stderr.write("\r\x1b[K"); // Clear the line
      }
      if (finalMessage) {
        success(finalMessage);
      }
    },
    update(msg: string): void {
      currentMessage = msg;
      if (!isTTY) {
        process.stderr.write(`  ${msg}\n`);
      }
    },
  };
}

export function table(headers: string[], rows: string[][]): string {
  const allRows = [headers, ...rows];
  const colWidths: number[] = headers.map((_, colIndex) => {
    let maxWidth = 0;
    for (const row of allRows) {
      const cell = row[colIndex] ?? "";
      if (cell.length > maxWidth) {
        maxWidth = cell.length;
      }
    }
    return maxWidth;
  });

  const separator = colWidths.map((w) => "─".repeat(w + 2)).join("┼");
  const formatRow = (row: string[]): string =>
    row
      .map((cell, i) => ` ${(cell ?? "").padEnd(colWidths[i])} `)
      .join("│");

  const lines: string[] = [];
  lines.push(formatRow(headers));
  lines.push(separator);
  for (const row of rows) {
    lines.push(formatRow(row));
  }

  return lines.join("\n");
}
