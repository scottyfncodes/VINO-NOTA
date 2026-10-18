import { NextResponse } from "next/server";
import { getSessionUser } from "@/server/auth/session";
import { isUuid } from "@/server/catalog/wines";
import { recognizeLabel } from "@/server/recognition";

export const maxDuration = 60;

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  let imageId: unknown;
  try {
    imageId = (await request.json())?.imageId;
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  if (typeof imageId !== "string" || !isUuid(imageId)) return NextResponse.json({ error: "Invalid image." }, { status: 400 });
  const outcome = await recognizeLabel(user.id, imageId);
  return NextResponse.json(outcome);
}
