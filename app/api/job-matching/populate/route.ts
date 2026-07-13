import { NextRequest, NextResponse } from "next/server";
import { requireUserId } from "@/lib/requireAuth";
import { populateEmployeeEmbeddingsFromCertificates } from "@/lib/employeeCertificates";

export async function POST(request: NextRequest) {
  if (!requireUserId(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const processed = await populateEmployeeEmbeddingsFromCertificates();
    return NextResponse.json({ processed });
  } catch (error) {
    console.error("Embedding population error:", error);
    return NextResponse.json(
      { error: "Failed to populate embeddings." },
      { status: 500 }
    );
  }
}
