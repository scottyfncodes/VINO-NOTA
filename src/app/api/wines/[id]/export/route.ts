import { NextResponse } from "next/server";
import { getSessionUser } from "@/server/auth/session";
import { buildWineExport } from "@/server/export";
import { NotFoundError } from "@/server/errors";

export async function GET(_request: Request, ctx: RouteContext<"/api/wines/[id]/export">) {
  const user = await getSessionUser();
  if (!user) return new NextResponse("Not signed in.", { status: 401 });
  const { id } = await ctx.params;
  try {
    const data = await buildWineExport(user.id, id);
    const slug = data.wines[0].name.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40);
    return new NextResponse(JSON.stringify(data, null, 2), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="vino-nota-${slug || "wine"}.json"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    if (error instanceof NotFoundError) return new NextResponse("Not found.", { status: 404 });
    throw error;
  }
}
