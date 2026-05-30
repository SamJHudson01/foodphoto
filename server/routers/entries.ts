import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { createPhotoKey, deletePhotoObject, publicPhotoUrl, putPhotoObject } from "../../lib/r2";
import { protectedProcedure, router, translatePrismaError } from "../trpc";

const maxPhotoBytes = 4_500_000;

const entrySelect = {
  id: true,
  capturedAt: true,
  note: true,
  publicUrl: true,
  contentType: true,
  byteSize: true,
  width: true,
  height: true,
  createdAt: true,
  updatedAt: true
} as const;

const imageTypes = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp"
} as const;

function parseDataUrl(photoDataUrl: string) {
  const match = photoDataUrl.match(/^data:(image\/(?:jpeg|jpg|png|webp));base64,([a-zA-Z0-9+/=]+)$/);

  if (!match) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Unsupported image payload." });
  }

  const contentType = match[1] as keyof typeof imageTypes;
  const body = Buffer.from(match[2], "base64");

  if (body.byteLength === 0 || body.byteLength > maxPhotoBytes) {
    throw new TRPCError({ code: "PAYLOAD_TOO_LARGE", message: "Photo is too large." });
  }

  return {
    body,
    contentType,
    extension: imageTypes[contentType]
  };
}

export const entriesRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const user = await ctx.prisma.user.findUnique({
      where: { clerkUserId: ctx.userId },
      select: { id: true }
    });

    if (!user) return [];

    return ctx.prisma.foodEntry.findMany({
      where: { userId: user.id },
      orderBy: { capturedAt: "desc" },
      take: 400,
      select: entrySelect
    });
  }),

  create: protectedProcedure
    .input(
      z.object({
        capturedAt: z.coerce.date(),
        note: z.string().max(140).optional().default(""),
        photoDataUrl: z.string().max(6_500_000),
        width: z.number().int().positive().max(2400).optional(),
        height: z.number().int().positive().max(2400).optional(),
        migrationKey: z.string().max(120).optional()
      })
    )
    .mutation(async ({ ctx, input }) => {
      const user = await ctx.prisma.user.upsert({
        where: { clerkUserId: ctx.userId },
        update: { clerkUserId: ctx.userId },
        create: { clerkUserId: ctx.userId },
        select: { id: true }
      });

      if (input.migrationKey) {
        const existing = await ctx.prisma.foodEntry.findFirst({
          where: { userId: user.id, migrationKey: input.migrationKey },
          select: entrySelect
        });

        if (existing) return existing;
      }

      const photo = parseDataUrl(input.photoDataUrl);
      const entryId = crypto.randomUUID();
      const r2Key = createPhotoKey(user.id, entryId, photo.extension);
      const publicUrl = publicPhotoUrl(r2Key);

      await putPhotoObject({
        key: r2Key,
        body: photo.body,
        contentType: photo.contentType
      });

      try {
        return await ctx.prisma.foodEntry.create({
          data: {
            id: entryId,
            userId: user.id,
            capturedAt: input.capturedAt,
            note: input.note.trim(),
            r2Key,
            publicUrl,
            contentType: photo.contentType,
            byteSize: photo.body.byteLength,
            width: input.width,
            height: input.height,
            migrationKey: input.migrationKey
          },
          select: entrySelect
        });
      } catch (error) {
        await deletePhotoObject(r2Key).catch(() => undefined);
        translatePrismaError(error);
      }
    }),

  updateNote: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        note: z.string().max(140)
      })
    )
    .mutation(async ({ ctx, input }) => {
      const user = await ctx.prisma.user.findUnique({
        where: { clerkUserId: ctx.userId },
        select: { id: true }
      });

      if (!user) throw new TRPCError({ code: "NOT_FOUND" });

      const entry = await ctx.prisma.foodEntry.findFirst({
        where: { id: input.id, userId: user.id },
        select: { id: true }
      });

      if (!entry) throw new TRPCError({ code: "NOT_FOUND" });

      return ctx.prisma.foodEntry.update({
        where: { id: input.id },
        data: { note: input.note.trim() },
        select: entrySelect
      });
    }),

  delete: protectedProcedure.input(z.object({ id: z.string().uuid() })).mutation(async ({ ctx, input }) => {
    const user = await ctx.prisma.user.findUnique({
      where: { clerkUserId: ctx.userId },
      select: { id: true }
    });

    if (!user) throw new TRPCError({ code: "NOT_FOUND" });

    const entry = await ctx.prisma.foodEntry.findFirst({
      where: { id: input.id, userId: user.id },
      select: { id: true, r2Key: true }
    });

    if (!entry) throw new TRPCError({ code: "NOT_FOUND" });

    await ctx.prisma.foodEntry.delete({ where: { id: entry.id } });
    await deletePhotoObject(entry.r2Key).catch(() => undefined);

    return { deleted: true };
  })
});
