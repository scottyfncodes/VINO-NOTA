/**
 * Downscales a photo in the browser before upload. iPhone camera images are
 * large HEIC/JPEG files; Safari decodes them, so re-encoding here keeps uploads
 * small and fast. EXIF orientation is applied by the decoder.
 */
const MAX_EDGE = 2200;
const TARGET_BYTES = 3.6 * 1024 * 1024;

async function decode(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if ("createImageBitmap" in window) {
    try {
      return await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      // fall through to <img> decoding
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function toBlob(canvas: HTMLCanvasElement, quality: number) {
  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
}

export async function prepareImage(file: File): Promise<Blob> {
  if (!file.type.startsWith("image/") && !/\.(heic|heif|jpe?g|png|webp)$/i.test(file.name)) {
    throw new Error("Please choose a photo.");
  }
  let source: ImageBitmap | HTMLImageElement;
  try {
    source = await decode(file);
  } catch {
    // This browser can't decode it (e.g. HEIC outside Safari); let the server try if small enough.
    if (file.size <= TARGET_BYTES) return file;
    throw new Error("This photo format can't be read here. Try a JPEG or take the photo with the camera button.");
  }
  const w = "naturalWidth" in source ? source.naturalWidth : source.width;
  const h = "naturalHeight" in source ? source.naturalHeight : source.height;
  let scale = Math.min(1, MAX_EDGE / Math.max(w, h));
  for (let attempt = 0; attempt < 4; attempt++) {
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(w * scale);
    canvas.height = Math.round(h * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) break;
    ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
    const blob = await toBlob(canvas, attempt === 0 ? 0.86 : 0.8);
    if (blob && blob.size <= TARGET_BYTES) {
      if ("close" in source) source.close();
      return blob;
    }
    scale *= 0.75;
  }
  throw new Error("That photo couldn't be prepared for upload. Please try another.");
}

export async function uploadPhoto(blob: Blob, opts: { source: "camera" | "user_upload"; wineId?: string; imageType?: string }) {
  const form = new FormData();
  form.append("file", blob, "label.jpg");
  form.append("source", opts.source);
  if (opts.wineId) form.append("wineId", opts.wineId);
  if (opts.imageType) form.append("imageType", opts.imageType);
  let res: Response;
  try {
    res = await fetch("/api/images", { method: "POST", body: form });
  } catch {
    throw new Error("The upload didn't reach the server. Check your connection and try again.");
  }
  const body = (await res.json().catch(() => ({}))) as { id?: string; error?: string };
  if (!res.ok || !body.id) throw new Error(body.error ?? "The photo couldn't be saved. Please try again.");
  return body.id;
}
