import { createContext, useContext } from "react";
import type { ReactNode } from "react";

export interface OpenFoundryContextValue {
  baseUrl: string;
  token?: string;
  tokenProvider?: () => Promise<string>;
}

export const OpenFoundryContext = createContext<OpenFoundryContextValue | null>(null);

export interface OpenFoundryProviderProps {
  baseUrl: string;
  token?: string;
  tokenProvider?: () => Promise<string>;
  children: ReactNode;
}

export function OpenFoundryProvider(props: OpenFoundryProviderProps): JSX.Element {
  const { baseUrl, token, tokenProvider, children } = props;
  const value: OpenFoundryContextValue = { baseUrl, token, tokenProvider };

  return (
    <OpenFoundryContext.Provider value={value}>
      {children}
    </OpenFoundryContext.Provider>
  );
}

export function useOpenFoundry(): OpenFoundryContextValue {
  const ctx = useContext(OpenFoundryContext);
  if (ctx === null) {
    throw new Error(
      "useOpenFoundry must be used within an <OpenFoundryProvider>. " +
      "Wrap your component tree with <OpenFoundryProvider baseUrl=\"...\">.",
    );
  }
  return ctx;
}
