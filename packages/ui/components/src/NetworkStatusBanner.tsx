import { useCallback, useEffect, useState } from "react";
import { Callout, Button } from "@blueprintjs/core";

/**
 * Detects online/offline status and shows a dismissible warning banner
 * when the browser is offline.
 */
export function NetworkStatusBanner(): JSX.Element | null {
  const [isOffline, setIsOffline] = useState(
    typeof navigator !== "undefined" ? !navigator.onLine : false,
  );
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const handleOnline = () => {
      setIsOffline(false);
      setDismissed(false);
    };
    const handleOffline = () => {
      setIsOffline(true);
      setDismissed(false);
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  const handleDismiss = useCallback(() => {
    setDismissed(true);
  }, []);

  if (!isOffline || dismissed) {
    return null;
  }

  return (
    <Callout
      intent="warning"
      icon="offline"
      style={{ margin: 0, borderRadius: 0 }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <span>
          You are offline. Some features may be unavailable.
        </span>
        <Button
          minimal
          small
          icon="cross"
          onClick={handleDismiss}
          aria-label="Dismiss"
        />
      </div>
    </Callout>
  );
}
