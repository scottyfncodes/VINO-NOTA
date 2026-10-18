import { NextResponse } from "next/server";
import { getSessionUser } from "@/server/auth/session";
import { MAX_UPLOAD_BYTES, uploadImage, type ImageType } from "@/server/images";
import { UserFacingError } from "@/server/errors";

export const maxDuration = 30;

const TYPES: ImageType[] = ["front_label", "back_label", "bottle", "other"];

/** Multipart upload of one photo. Returns the stored image id. */
export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > MAX_UPLOAD_BYTES + 64 * 1024) {
    return NextResponse.json({ error: "That image is too large. Please use a photo under 4 MB." }, { status: 413 });
  }
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "The upload could not be read." }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "No photo was attached." }, { status: 400 });
  const typeField = String(form.get("imageType") ?? "front_label");
  const imageType = TYPES.includes(typeField as ImageType) ? (typeField as ImageType) : "front_label";
  const wineId = form.get("wineId");
  const source = form.get("source") === "camera" ? "camera" : "user_upload";
  try {
    const bytes = Buffer.from(await file.arrayBuffer());
    const row = await uploadImage(user.id, bytes, { imageType, wineId: typeof wineId === "string" && wineId ? wineId : null, source });
    return NextResponse.json({ id: row.id, width: row.width, height: row.height });
  } catch (error) {
    if (error instanceof UserFacingError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("[api/images] upload failed");
    return NextResponse.json({ error: "The photo couldn't be saved. Please try again." }, { status: 500 });
  }
}
