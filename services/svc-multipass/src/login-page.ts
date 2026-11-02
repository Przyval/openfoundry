/**
 * The HTML svc-multipass serves at /multipass/api/oauth2/authorize: a login
 * form, and an error page for requests it cannot safely redirect back from.
 *
 * Deliberately script-free. The page is served with a CSP that forbids
 * scripts and framing (see `htmlHeaders`), so the credentials form cannot be
 * overlaid or read by anything but the browser's own form submission.
 */

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Response headers for every HTML page multipass serves. */
export const htmlHeaders: Readonly<Record<string, string>> = {
  "content-type": "text/html; charset=utf-8",
  "cache-control": "no-store",
  pragma: "no-cache",
  "x-frame-options": "DENY",
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
  // No form-action: browsers apply it to the redirect that follows a form
  // submission too, and that redirect goes to the client's own origin.
  "content-security-policy":
    "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'",
};

const STYLES = `
  :root {
    color-scheme: light dark;
    --bg: #f6f7f9; --card: #ffffff; --text: #1c2127; --muted: #5f6b7c;
    --border: #d3d8de; --input: #ffffff; --accent: #2d72d2; --accent-hover: #215db0;
    --danger-bg: #fcebeb; --danger-text: #ac2f33;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #1c2127; --card: #252a31; --text: #f6f7f9; --muted: #abb3bf;
      --border: #404854; --input: #1c2127; --accent: #4c90f0; --accent-hover: #8abbff;
      --danger-bg: #3b2224; --danger-text: #fa999c;
    }
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center;
    padding: 16px; background: var(--bg); color: var(--text);
    font: 14px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  }
  main {
    width: 100%; max-width: 380px; background: var(--card); border: 1px solid var(--border);
    border-radius: 8px; padding: 32px; box-shadow: 0 1px 3px rgba(17, 20, 24, 0.12);
  }
  h1 { margin: 0 0 4px; font-size: 20px; font-weight: 600; }
  p { margin: 0 0 24px; color: var(--muted); }
  .error {
    margin: 0 0 16px; padding: 10px 12px; border-radius: 4px;
    background: var(--danger-bg); color: var(--danger-text);
  }
  label { display: block; margin: 0 0 4px; font-weight: 500; }
  input[type="text"], input[type="password"] {
    display: block; width: 100%; margin: 0 0 16px; padding: 8px 10px; font: inherit;
    color: var(--text); background: var(--input); border: 1px solid var(--border); border-radius: 4px;
  }
  input:focus { outline: 2px solid var(--accent); outline-offset: -1px; }
  .actions { display: flex; gap: 8px; margin-top: 8px; }
  button {
    flex: 1; padding: 9px 12px; font: inherit; font-weight: 500; border-radius: 4px; cursor: pointer;
    border: 1px solid var(--border); background: transparent; color: var(--text);
  }
  button.primary { background: var(--accent); border-color: var(--accent); color: #ffffff; }
  button.primary:hover { background: var(--accent-hover); border-color: var(--accent-hover); }
`;

function page(title: string, body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${escapeHtml(title)}</title>
<style>${STYLES}</style>
</head>
<body>
<main>
${body}
</main>
</body>
</html>
`;
}

export interface LoginPageOptions {
  /** The requesting application's display name. */
  readonly clientName: string;
  /** The authorization request, carried through the form unchanged. */
  readonly request: Readonly<Record<string, string | undefined>>;
  /** Pre-filled username, after a failed attempt. */
  readonly username?: string;
  /** Message shown above the form. */
  readonly error?: string;
}

export function renderLoginPage(options: LoginPageOptions): string {
  const hidden = Object.entries(options.request)
    .filter((entry): entry is [string, string] => entry[1] !== undefined && entry[1] !== "")
    .map(([name, value]) => `<input type="hidden" name="${escapeHtml(name)}" value="${escapeHtml(value)}">`)
    .join("\n");

  const error = options.error
    ? `<div class="error" role="alert">${escapeHtml(options.error)}</div>\n`
    : "";

  // Relative to /multipass/api/oauth2/, so the form posts back to this same
  // endpoint whichever gateway or proxy prefix served the page.
  return page(
    "Sign in - OpenFoundry",
    `<h1>Sign in to OpenFoundry</h1>
<p>to continue to ${escapeHtml(options.clientName)}</p>
${error}<form method="post" action="authorize">
${hidden}
<label for="username">Username</label>
<input type="text" id="username" name="username" value="${escapeHtml(options.username ?? "")}" autocomplete="username" autocapitalize="none" spellcheck="false" required${options.username ? "" : " autofocus"}>
<label for="password">Password</label>
<input type="password" id="password" name="password" autocomplete="current-password" required${options.username ? " autofocus" : ""}>
<div class="actions">
<button type="submit" name="action" value="login" class="primary">Sign in</button>
<button type="submit" name="action" value="deny" formnovalidate>Cancel</button>
</div>
</form>`,
  );
}

export function renderErrorPage(title: string, message: string): string {
  return page(`${title} - OpenFoundry`, `<h1>${escapeHtml(title)}</h1>\n<p>${escapeHtml(message)}</p>`);
}
