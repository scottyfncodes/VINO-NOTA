import { NextResponse } from "next/server";
import { getSessionUser } from "@/server/auth/session";
import { buildAccountExport, exportToCsv } from "@/server/export";

export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) return new NextResponse("Not signed in.", { status: 401 });
  const format = new URL(request.url).searchParams.get("format") === "csv" ? "csv" : "json";
  const data = await buildAccountExport(user.id);
  const stamp = new Date().toISOString().slice(0, 10);
  if (format === "csv") {
    return new NextResponse(exportToCsv(data), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="vino-nota-tastings-${stamp}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  }
  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="vino-nota-export-${stamp}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
