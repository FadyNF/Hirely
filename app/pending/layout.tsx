import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Waiting for approval",
  description: "Your Hirely account is pending administrator approval.",
};

export default function PendingLayout({ children }: { children: React.ReactNode }) {
  return children;
}
