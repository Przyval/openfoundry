import { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Button,
  Callout,
  Card,
  Divider,
  FormGroup,
  H3,
  InputGroup,
} from "@blueprintjs/core";
import { useAuth } from "../context/AuthContext";

const IS_DEV = import.meta.env.DEV;

export default function Login() {
  const { login, loginWithOAuth } = useAuth();
  const navigate = useNavigate();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleLocalLogin = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError(null);
      setSubmitting(true);
      try {
        await login(username, password);
        navigate("/", { replace: true });
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setSubmitting(false);
      }
    },
    [login, username, password, navigate],
  );

  const handleOAuthLogin = useCallback(async () => {
    setError(null);
    try {
      await loginWithOAuth();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [loginWithOAuth]);

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        background: "var(--pt-app-background-color, #f5f8fa)",
      }}
    >
      <Card elevation={2} style={{ width: 400, padding: 32 }}>
        <H3 style={{ textAlign: "center", marginBottom: 24 }}>
          OpenFoundry Login
        </H3>

        {error && (
          <Callout intent="danger" icon="error" style={{ marginBottom: 16 }}>
            {error}
          </Callout>
        )}

        {/* ---------- OAuth button (always shown) ---------- */}
        <Button
          intent="primary"
          large
          fill
          icon="log-in"
          text="Login with OAuth"
          onClick={handleOAuthLogin}
        />

        {/* ---------- Local dev login form ---------- */}
        {IS_DEV && (
          <>
            <Divider style={{ margin: "20px 0" }} />
            <form onSubmit={handleLocalLogin}>
              <FormGroup label="Username" labelFor="username">
                <InputGroup
                  id="username"
                  placeholder="admin"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  leftIcon="person"
                  autoFocus
                />
              </FormGroup>
              <FormGroup label="Password" labelFor="password">
                <InputGroup
                  id="password"
                  placeholder="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  leftIcon="lock"
                />
              </FormGroup>
              <Button
                type="submit"
                intent="success"
                fill
                large
                text="Login (Dev Mode)"
                loading={submitting}
                disabled={!username}
              />
            </form>
          </>
        )}
      </Card>
    </div>
  );
}
