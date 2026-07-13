import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Waiting for approval",
  description: "Your Foundry account is pending administrator approval.",
};

export default function PendingLayout({ children }: { children: React.ReactNode }) {
  return children;
}
