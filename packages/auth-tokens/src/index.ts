// Claims
export {
  type OpenFoundryClaims,
  type TokenInput,
  parseScopes,
  hasScope,
} from "./claims.js";

// Token creation
export {
  createToken,
  buildTokenInput,
  isValidClaimsShape,
} from "./token-creator.js";

// Token validation
export {
  validateToken,
  TokenValidationError,
  TokenValidationErrorCode,
  type ValidateTokenOptions,
} from "./token-validator.js";

// Bearer token
export { BearerToken } from "./bearer-token.js";

// Scopes
export {
  Scope,
  expandScopes,
  buildScopeString,
  satisfiesScope,
} from "./scopes.js";
