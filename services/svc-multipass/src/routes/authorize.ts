import { randomBytes } from "node:crypto";
import type { FastifyInstance, FastifyReply } from "fastify";
import type { ClientStore, OAuthClient } from "../store/client-store.js";
import type { TokenStore } from "../store/token-store.js";
import { authenticate, type UserDirectory } from "../store/user-store.js";
import { htmlHeaders, renderErrorPage, renderLoginPage } from "../login-page.js";

/**
 * The OAuth 2.0 authorization endpoint (RFC 6749 section 4.1.1), with the
 * login step it needs.
 *
 *   GET  /multipass/api/oauth2/authorize   validate the request, show the login form
 *   POST /multipass/api/oauth2/authorize   check the credentials, redirect with a code
 *
 * The form carries the authorization request through in hidden fields, so no
 * session or cookie is needed between the two: the POST re-validates exactly
 * what the GET did, and a code is issued only to a user whose password was
 * just checked. There is no consent step - every client is declared by the
 * operator (see ../store/client-store.ts), so each is first-party.
 */

const REQUEST_FIELDS = [
  "response_type",
  "client_id",
  "redirect_uri",
  "scope",
  "state",
  "code_challenge",
  "code_challenge_method",
] as const;

type AuthorizeRequest = Partial<Record<(typeof REQUEST_FIELDS)[number], string>>;

/** RFC 7636 section 4.2: 43-128 characters of the unreserved set. */
const CODE_CHALLENGE = /^[A-Za-z0-9\-._~]{43,128}$/;

/** Only string values count; a repeated parameter arrives as an array and is ignored. */
function pickRequest(source: unknown): AuthorizeRequest {
  const request: AuthorizeRequest = {};
  if (typeof source !== "object" || source === null) return request;
  for (const field of REQUEST_FIELDS) {
    const value = (source as Record<string, unknown>)[field];
    if (typeof value === "string" && value !== "") request[field] = value;
  }
  return request;
}

type Validated =
  /** The redirect target is unknown or untrusted, so the error is shown here. */
  | { kind: "page-error"; title: string; message: string }
  /** The redirect target is trusted, so the error goes back to the client. */
  | { kind: "redirect-error"; redirectUri: string; error: string; description: string }
  | { kind: "ok"; client: OAuthClient; redirectUri: string; scope: string };

/**
 * Validate an authorization request against the closed client registry.
 *
 * Until the client and redirect_uri are both established, nothing is
 * redirected anywhere (RFC 6749 section 4.1.2.1): redirecting to an
 * unverified URI is exactly how a code or an error leaks to an attacker.
 */
export function validateAuthorizeRequest(
  request: AuthorizeRequest,
  clientStore: ClientStore,
): Validated {
  if (!request.client_id) {
    return { kind: "page-error", title: "Invalid request", message: "The request names no client_id." };
  }

  const client = clientStore.getClient(request.client_id);
  if (!client) {
    return {
      kind: "page-error",
      title: "Unknown application",
      message: `No application with client_id "${request.client_id}" is registered.`,
    };
  }

  let redirectUri: string;
  if (request.redirect_uri !== undefined) {
    if (!client.redirectUris.includes(request.redirect_uri)) {
      return {
        kind: "page-error",
        title: "Invalid redirect URI",
        message: `The redirect URI is not registered for ${client.clientName}.`,
      };
    }
    redirectUri = request.redirect_uri;
  } else if (client.redirectUris.length === 1) {
    redirectUri = client.redirectUris[0]!;
  } else {
    return {
      kind: "page-error",
      title: "Invalid request",
      message: `${client.clientName} has more than one redirect URI, so the request must name one.`,
    };
  }

  const fail = (error: string, description: string): Validated => ({
    kind: "redirect-error",
    redirectUri,
    error,
    description,
  });

  if (request.response_type !== "code") {
    return fail("unsupported_response_type", "response_type must be 'code'");
  }
  if (!client.grantTypes.includes("authorization_code")) {
    return fail("unauthorized_client", "this client may not use the authorization_code grant");
  }

  if (request.code_challenge !== undefined) {
    // An omitted method means "plain" (RFC 7636 section 4.3), which offers no
    // protection against an intercepted request, so only S256 is accepted.
    if (request.code_challenge_method !== "S256") {
      return fail("invalid_request", "code_challenge_method must be S256");
    }
    if (!CODE_CHALLENGE.test(request.code_challenge)) {
      return fail("invalid_request", "code_challenge is malformed");
    }
  } else if (client.isPublic) {
    // A public client has no secret, so PKCE is the only thing binding the
    // code to the party that asked for it.
    return fail("invalid_request", "PKCE (code_challenge with S256) is required for this client");
  } else if (request.code_challenge_method !== undefined) {
    return fail("invalid_request", "code_challenge_method was given without a code_challenge");
  }

  const requested = (request.scope ?? client.scopes.join(" ")).split(/\s+/).filter(Boolean);
  const unknown = requested.filter((s) => !client.scopes.includes(s));
  if (requested.length === 0) {
    return fail("invalid_scope", "no scope requested");
  }
  if (unknown.length > 0) {
    return fail("invalid_scope", `scope not allowed for this client: ${unknown.join(" ")}`);
  }

  return { kind: "ok", client, redirectUri, scope: requested.join(" ") };
}

export interface AuthorizeRoutesOptions {
  clientStore: ClientStore;
  tokenStore: TokenStore;
  users: UserDirectory;
}

export function registerAuthorizeRoutes(
  app: FastifyInstance,
  { clientStore, tokenStore, users }: AuthorizeRoutesOptions,
): void {
  function sendPage(reply: FastifyReply, status: number, html: string): FastifyReply {
    return reply.status(status).headers(htmlHeaders).send(html);
  }

  function redirectTo(
    reply: FastifyReply,
    status: 302 | 303,
    redirectUri: string,
    params: Record<string, string | undefined>,
  ): FastifyReply {
    const url = new URL(redirectUri);
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) url.searchParams.set(key, value);
    }
    return reply.header("cache-control", "no-store").redirect(url.toString(), status);
  }

  /** Answer a request that failed validation. Null when it passed. */
  function rejectInvalid(
    reply: FastifyReply,
    validated: Validated,
    state: string | undefined,
    status: 302 | 303,
  ): FastifyReply | null {
    if (validated.kind === "page-error") {
      return sendPage(reply, 400, renderErrorPage(validated.title, validated.message));
    }
    if (validated.kind === "redirect-error") {
      return redirectTo(reply, status, validated.redirectUri, {
        error: validated.error,
        error_description: validated.description,
        state,
      });
    }
    return null;
  }

  app.get("/multipass/api/oauth2/authorize", async (request, reply) => {
    const authRequest = pickRequest(request.query);
    const validated = validateAuthorizeRequest(authRequest, clientStore);
    const rejected = rejectInvalid(reply, validated, authRequest.state, 302);
    if (rejected || validated.kind !== "ok") return rejected;

    return sendPage(
      reply,
      200,
      renderLoginPage({ clientName: validated.client.clientName, request: authRequest }),
    );
  });

  app.post("/multipass/api/oauth2/authorize", async (request, reply) => {
    const body = (request.body ?? {}) as Record<string, unknown>;
    const authRequest = pickRequest(body);
    // 303, not 302: the browser must follow up with a GET, never re-POST the
    // credentials to the client's redirect URI.
    const validated = validateAuthorizeRequest(authRequest, clientStore);
    const rejected = rejectInvalid(reply, validated, authRequest.state, 303);
    if (rejected || validated.kind !== "ok") return rejected;

    if (body.action === "deny") {
      return redirectTo(reply, 303, validated.redirectUri, {
        error: "access_denied",
        error_description: "the user cancelled the sign-in",
        state: authRequest.state,
      });
    }

    const username = typeof body.username === "string" ? body.username.trim() : "";
    const password = typeof body.password === "string" ? body.password : "";
    const user = username && password ? await authenticate(users, username, password) : undefined;

    if (!user) {
      request.log.info({ username, clientId: validated.client.clientId }, "Sign-in failed");
      return sendPage(
        reply,
        401,
        renderLoginPage({
          clientName: validated.client.clientName,
          request: authRequest,
          username,
          error: "Incorrect username or password.",
        }),
      );
    }

    const code = randomBytes(32).toString("base64url");
    tokenStore.storeAuthCode({
      code,
      clientId: validated.client.clientId,
      userId: user.username,
      redirectUri: validated.redirectUri,
      scope: validated.scope,
      ...(authRequest.code_challenge !== undefined
        ? { codeChallenge: authRequest.code_challenge, codeChallengeMethod: "S256" as const }
        : {}),
    });

    request.log.info({ username: user.username, clientId: validated.client.clientId }, "Signed in");
    return redirectTo(reply, 303, validated.redirectUri, { code, state: authRequest.state });
  });
}
