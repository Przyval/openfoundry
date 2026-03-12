import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { colors } from "../src/colors.js";
import { spacing } from "../src/spacing.js";
import { fontSizes, fontWeights, lineHeights, fontFamilies } from "../src/typography.js";
import { shadows } from "../src/shadows.js";
import { breakpoints, mediaQueries } from "../src/breakpoints.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const cssContent = readFileSync(resolve(__dirname, "../src/tokens.css"), "utf-8");

describe("ui-tokens", () => {
  it("colors object has primary palette with all shades", () => {
    expect(colors.primary).toBeDefined();
    expect(colors.primary[50]).toBe("#e3f2fd");
    expect(colors.primary[900]).toBe("#0d47a1");
  });

  it("colors object has semantic colors", () => {
    expect(colors.success).toBe("#0f9960");
    expect(colors.warning).toBe("#d9822b");
    expect(colors.danger).toBe("#db3737");
    expect(colors.info).toBe("#137cbd");
  });

  it("spacing scale is defined with 4px base unit", () => {
    expect(spacing[0]).toBe("0");
    expect(spacing[1]).toBe("4px");
    expect(spacing[4]).toBe("16px");
    expect(spacing[16]).toBe("64px");
  });

  it("typography tokens are fully defined", () => {
    expect(fontSizes.base).toBe("14px");
    expect(fontWeights.bold).toBe(700);
    expect(lineHeights.normal).toBe(1.5);
    expect(fontFamilies.sans).toContain("BlinkMacSystemFont");
  });

  it("shadows scale is defined with 5 levels", () => {
    expect(Object.keys(shadows)).toHaveLength(5);
    expect(shadows[0]).toBe("none");
    expect(shadows[4]).toContain("15px");
  });

  it("breakpoints are defined for responsive design", () => {
    expect(breakpoints.sm).toBe("576px");
    expect(breakpoints.xl).toBe("1200px");
    expect(mediaQueries.md).toContain("768");
  });

  it("CSS file contains primary color custom properties", () => {
    expect(cssContent).toContain("--of-color-primary: #137cbd");
    expect(cssContent).toContain("--of-color-success: #0f9960");
    expect(cssContent).toContain("--of-spacing-1: 4px");
    expect(cssContent).toContain("--of-font-size-sm: 12px");
  });

  it("CSS file contains dark theme overrides", () => {
    expect(cssContent).toContain('[data-theme="dark"]');
    expect(cssContent).toContain("--of-color-bg: #1c2127");
    expect(cssContent).toContain("--of-color-surface: #252a31");
    expect(cssContent).toContain("--of-color-text: #f6f7f9");
  });
});
