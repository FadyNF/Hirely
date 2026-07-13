import type { Metadata } from "next";
import MatchingView from "@/components/matching/MatchingView";

export const metadata: Metadata = {
  title: "Job Matching",
};

export default function MatchingPage() {
  return <MatchingView />;
}
