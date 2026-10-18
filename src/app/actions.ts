"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { requireUser } from "@/server/auth/session";
import { getAuth } from "@/server/auth/auth";
import { deleteWine, findWineMatches, mergeWines, updateWine, type DuplicateCandidate } from "@/server/catalog/wines";
import { createTasting, deleteTasting, saveCapture, updateTasting, type CapturePayload } from "@/server/tastings";
import { deleteImage } from "@/server/images";
import { deleteAccount, updatePreferences } from "@/server/account";
import { toActionError, type ActionResult } from "@/server/errors";

function revalidateJournal() {
  revalidatePath("/", "layout");
}

export async function saveCaptureAction(payload: CapturePayload): Promise<ActionResult<{ wineId: string; tastingId: string }>> {
  const user = await requireUser();
  try {
    const result = await saveCapture(user.id, payload);
    revalidateJournal();
    return { ok: true, data: result };
  } catch (error) {
    return toActionError(error, "saveCapture");
  }
}

export async function findMatchesAction(probe: { producer?: string | null; name: string; vintage?: number | null; isNonVintage?: boolean }, excludeWineId?: string): Promise<DuplicateCandidate[]> {
  const user = await requireUser();
  if (typeof probe?.name !== "string") return [];
  return findWineMatches(
    user.id,
    {
      name: probe.name.slice(0, 200),
      producer: typeof probe.producer === "string" ? probe.producer.slice(0, 200) : null,
      vintage: Number.isInteger(probe.vintage) ? probe.vintage : null,
      isNonVintage: Boolean(probe.isNonVintage),
    },
    excludeWineId,
  );
}

export async function updateWineAction(wineId: string, input: unknown): Promise<ActionResult<{ wineId: string }>> {
  const user = await requireUser();
  try {
    await updateWine(user.id, wineId, input);
    revalidateJournal();
    return { ok: true, data: { wineId } };
  } catch (error) {
    return toActionError(error, "updateWine");
  }
}

export async function deleteWineAction(wineId: string): Promise<ActionResult<null>> {
  const user = await requireUser();
  try {
    await deleteWine(user.id, wineId);
  } catch (error) {
    return toActionError(error, "deleteWine");
  }
  revalidateJournal();
  redirect("/journal?deleted=1");
}

export async function mergeWinesAction(targetId: string, sourceId: string): Promise<ActionResult<{ movedTastings: number }>> {
  const user = await requireUser();
  try {
    const result = await mergeWines(user.id, targetId, sourceId);
    revalidateJournal();
    return { ok: true, data: result };
  } catch (error) {
    return toActionError(error, "mergeWines");
  }
}

export async function createTastingAction(wineId: string, input: unknown): Promise<ActionResult<{ tastingId: string }>> {
  const user = await requireUser();
  try {
    const t = await createTasting(user.id, wineId, input);
    revalidateJournal();
    return { ok: true, data: { tastingId: t.id } };
  } catch (error) {
    return toActionError(error, "createTasting");
  }
}

export async function updateTastingAction(tastingId: string, input: unknown): Promise<ActionResult<{ wineId: string }>> {
  const user = await requireUser();
  try {
    const t = await updateTasting(user.id, tastingId, input);
    revalidateJournal();
    return { ok: true, data: { wineId: t.wineId } };
  } catch (error) {
    return toActionError(error, "updateTasting");
  }
}

export async function deleteTastingAction(tastingId: string): Promise<ActionResult<{ wineId: string }>> {
  const user = await requireUser();
  try {
    const t = await deleteTasting(user.id, tastingId);
    revalidateJournal();
    return { ok: true, data: { wineId: t.wineId } };
  } catch (error) {
    return toActionError(error, "deleteTasting");
  }
}

export async function deleteImageAction(imageId: string): Promise<ActionResult<null>> {
  const user = await requireUser();
  try {
    await deleteImage(user.id, imageId);
    revalidateJournal();
    return { ok: true, data: null };
  } catch (error) {
    return toActionError(error, "deleteImage");
  }
}

export async function updatePreferencesAction(prefs: { defaultCurrency: string }): Promise<ActionResult<{ defaultCurrency: string }>> {
  const user = await requireUser();
  try {
    const result = await updatePreferences(user.id, { defaultCurrency: String(prefs?.defaultCurrency ?? "") });
    revalidateJournal();
    return { ok: true, data: result };
  } catch (error) {
    return toActionError(error, "updatePreferences");
  }
}

export async function deleteAccountAction(confirmation: string): Promise<ActionResult<null>> {
  const user = await requireUser();
  if (confirmation.trim().toUpperCase() !== "DELETE") return { ok: false, error: "Type DELETE to confirm." };
  try {
    await deleteAccount(user.id);
  } catch (error) {
    return toActionError(error, "deleteAccount");
  }
  redirect("/sign-in?deleted=1");
}

export async function signOutAction() {
  await getAuth().api.signOut({ headers: await headers() });
  redirect("/sign-in");
}
