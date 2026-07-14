// This import MUST come before importing "pdf-parse" itself.
// It's required for pdf-parse (which relies on pdfjs-dist internally)
// to work correctly in Next.js's Node.js server runtime.
import { getData } from "pdf-parse/worker";
import { PDFParse, VerbosityLevel } from "pdf-parse";

PDFParse.setWorker(getData());

export async function extractTextFromPdf(buffer: Buffer): Promise<string> {
  const parser = new PDFParse({
    data: buffer,
    // Suppresses pdf.js's internal console logs (info/warnings about
    // font types, structure quirks, etc.) — only real errors will throw.
    verbosity: VerbosityLevel.ERRORS,
  });

  try {
    const result = await parser.getText({
      // By default pdf-parse inserts "\n-- page_number of total_number --"
      // between pages' text. We don't want that noise mixed into the job
      // description, so just join pages with a plain newline instead.
      pageJoiner: "\n",
    });
    const text = result.text?.trim() ?? "";

    if (!text) {
      throw new Error("No extractable text found in PDF.");
    }

    return text;
  } finally {
    await parser.destroy();
  }
}