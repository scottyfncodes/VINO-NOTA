import { NextResponse } from "next/server";
import { getSessionUser } from "@/server/auth/session";
import { getImageForUser, type ImageSize } from "@/server/images";
import { isUuid } from "@/server/catalog/wines";

/** Streams a private image to its owner only. */
export async function GET(request: Request, ctx: RouteContext<"/api/images/[id]">) {
  const user = await getSessionUser();
  if (!user) return new NextResponse("Not signed in.", { status: 401 });
  const { id } = await ctx.params;
  if (!isUuid(id)) return new NextResponse("Not found.", { status: 404 });
  const sizeParam = new URL(request.url).searchParams.get("size");
  const size: ImageSize = sizeParam === "original" || sizeParam === "display" ? sizeParam : "thumb";
  const obj = await getImageForUser(user.id, id, size);
  if (!obj) return new NextResponse("Not found.", { status: 404 });
  const body = Buffer.isBuffer(obj.body) ? new Uint8Array(obj.body) : obj.body;
  return new NextResponse(body, {
    headers: {
      "Content-Type": obj.contentType,
      // Keys are immutable per image id; cache only in the user's own browser.
      "Cache-Control": "private, max-age=31536000, immutable",
      "Content-Disposition": size === "original" ? `inline; filename="vino-nota-${id}.jpg"` : "inline",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
