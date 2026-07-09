// app/app/records/page.tsx

import { getAllEmployees } from "@/lib/employees";
import RecordsView from "@/components/records/RecordsView";

export default async function RecordsPage() {
  const employees = await getAllEmployees();

  // Strip createdAt (a Date object) before handing this to the Client
  // Component — only plain serializable data can cross that boundary.
  const serialized = employees.map(({ createdAt, ...rest }) => rest);

  return <RecordsView employees={serialized} />;
}