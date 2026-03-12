export const breakpoints = {
  xs: "0px",
  sm: "576px",
  md: "768px",
  lg: "992px",
  xl: "1200px",
  "2xl": "1440px",
} as const;

export const mediaQueries = {
  sm: `@media (min-width: ${576}px)`,
  md: `@media (min-width: ${768}px)`,
  lg: `@media (min-width: ${992}px)`,
  xl: `@media (min-width: ${1200}px)`,
  "2xl": `@media (min-width: ${1440}px)`,
} as const;
