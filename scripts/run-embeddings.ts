import { populateEmployeeEmbeddingsFromCertificates } from '../lib/employeeCertificates';

async function main() {
  console.log("Starting local embedding refresh...");
  try {
    const count = await populateEmployeeEmbeddingsFromCertificates();
    console.log(`Success! Processed ${count} dirty records.`);
  } catch (error) {
    console.error("Error running embeddings:", error);
  } finally {
    process.exit(0);
  }
}