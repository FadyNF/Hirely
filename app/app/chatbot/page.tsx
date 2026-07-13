// app/app/chatbot/page.tsx

import type { Metadata } from "next";
import ChatbotView from "@/components/chatbot/ChatbotView";

export const metadata: Metadata = { title: "Chatbot" };

export default function ChatbotPage() {
  return <ChatbotView />;
}