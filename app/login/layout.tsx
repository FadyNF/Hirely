import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sign In",
  description: "Sign in to Foundry to manage employee records.",
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
