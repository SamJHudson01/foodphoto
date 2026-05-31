import { TRPCError } from "@trpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { appRouter } from "./_app";

const r2 = vi.hoisted(() => ({
  deletePhotoObject: vi.fn(),
  putPhotoObject: vi.fn(),
  publicPhotoUrl: vi.fn((key: string) => `https://photos.test/${key}`),
  createPhotoKey: vi.fn((userId: string, entryId: string, extension: string) => `users/${userId}/entries/${entryId}.${extension}`)
}));

vi.mock("../../lib/r2", () => r2);

type UserRow = {
  id: string;
  clerkUserId: string;
};

type EntryRow = {
  id: string;
  userId: string;
  capturedAt: Date;
  note: string;
  r2Key: string;
  publicUrl: string;
  contentType: string;
  byteSize: number;
  width?: number;
  height?: number;
  migrationKey?: string;
  createdAt: Date;
  updatedAt: Date;
};

class MemoryPrisma {
  users: UserRow[] = [];
  entries: EntryRow[] = [];
  failNextEntryCreate: Error | null = null;

  user = {
    findUnique: vi.fn(async ({ where }: { where: { clerkUserId: string } }) => {
      return this.users.find((user) => user.clerkUserId === where.clerkUserId) ?? null;
    }),
    upsert: vi.fn(
      async ({
        where,
        create
      }: {
        where: { clerkUserId: string };
        create: { clerkUserId: string };
      }) => {
        const existing = this.users.find((user) => user.clerkUserId === where.clerkUserId);
        if (existing) return { id: existing.id };

        const user = {
          id: `user-${this.users.length + 1}`,
          clerkUserId: create.clerkUserId
        };
        this.users.push(user);
        return { id: user.id };
      }
    )
  };

  foodEntry = {
    findMany: vi.fn(
      async ({
        where,
        orderBy,
        take
      }: {
        where: { userId: string };
        orderBy?: { capturedAt: "asc" | "desc" };
        take?: number;
      }) => {
        const rows = this.entries
          .filter((entry) => entry.userId === where.userId)
          .sort((a, b) =>
            orderBy?.capturedAt === "asc"
              ? a.capturedAt.getTime() - b.capturedAt.getTime()
              : b.capturedAt.getTime() - a.capturedAt.getTime()
          );

        return typeof take === "number" ? rows.slice(0, take) : rows;
      }
    ),
    findFirst: vi.fn(
      async ({ where }: { where: { id?: string; userId: string; migrationKey?: string } }) => {
        return (
          this.entries.find((entry) => {
            if (entry.userId !== where.userId) return false;
            if (where.id && entry.id !== where.id) return false;
            if (where.migrationKey && entry.migrationKey !== where.migrationKey) return false;
            return true;
          }) ?? null
        );
      }
    ),
    create: vi.fn(async ({ data }: { data: Omit<EntryRow, "createdAt" | "updatedAt"> }) => {
      if (this.failNextEntryCreate) {
        const error = this.failNextEntryCreate;
        this.failNextEntryCreate = null;
        throw error;
      }

      const now = new Date("2026-05-31T09:00:00.000Z");
      const row = {
        ...data,
        createdAt: now,
        updatedAt: now
      };
      this.entries.push(row);
      return row;
    }),
    update: vi.fn(async ({ where, data }: { where: { id: string }; data: { note: string } }) => {
      const row = this.entries.find((entry) => entry.id === where.id);
      if (!row) throw new Error("missing entry");

      row.note = data.note;
      row.updatedAt = new Date("2026-05-31T09:05:00.000Z");
      return row;
    }),
    delete: vi.fn(async ({ where }: { where: { id: string } }) => {
      const index = this.entries.findIndex((entry) => entry.id === where.id);
      if (index === -1) throw new Error("missing entry");

      const [deleted] = this.entries.splice(index, 1);
      return deleted;
    })
  };
}

function callerFor(prisma: MemoryPrisma, clerkUserId = "clerk-user-1") {
  return appRouter.createCaller({
    auth: { userId: clerkUserId },
    prisma
  } as never);
}

function jpegDataUrl(body = "photo") {
  return `data:image/jpeg;base64,${Buffer.from(body).toString("base64")}`;
}

beforeEach(() => {
  vi.restoreAllMocks();
  r2.deletePhotoObject.mockReset().mockResolvedValue(undefined);
  r2.putPhotoObject.mockReset().mockResolvedValue(undefined);
  r2.publicPhotoUrl.mockClear();
  r2.createPhotoKey.mockClear();
});

describe("food entry persistence behavior", () => {
  it("creates the first user entry, trims the note, stores image metadata, and uploads exactly one R2 object", async () => {
    const prisma = new MemoryPrisma();
    vi.spyOn(crypto, "randomUUID").mockReturnValue("00000000-0000-4000-8000-000000000001");

    const created = await callerFor(prisma).entries.create({
      capturedAt: new Date("2026-05-31T08:15:00.000Z"),
      note: "  eggs after gym  ",
      photoDataUrl: jpegDataUrl("real jpeg bytes"),
      width: 1200,
      height: 900
    });

    expect(created).toMatchObject({
      id: "00000000-0000-4000-8000-000000000001",
      capturedAt: new Date("2026-05-31T08:15:00.000Z"),
      note: "eggs after gym",
      publicUrl: "https://photos.test/users/user-1/entries/00000000-0000-4000-8000-000000000001.jpg",
      contentType: "image/jpeg",
      byteSize: Buffer.from("real jpeg bytes").byteLength,
      width: 1200,
      height: 900
    });
    expect(prisma.users).toEqual([{ id: "user-1", clerkUserId: "clerk-user-1" }]);
    expect(prisma.entries).toHaveLength(1);
    expect(r2.putPhotoObject).toHaveBeenCalledTimes(1);
    expect(r2.putPhotoObject).toHaveBeenCalledWith({
      key: "users/user-1/entries/00000000-0000-4000-8000-000000000001.jpg",
      body: Buffer.from("real jpeg bytes"),
      contentType: "image/jpeg"
    });
  });

  it("makes migration creates idempotent without uploading a duplicate photo", async () => {
    const prisma = new MemoryPrisma();
    vi.spyOn(crypto, "randomUUID")
      .mockReturnValueOnce("00000000-0000-4000-8000-000000000010")
      .mockReturnValueOnce("00000000-0000-4000-8000-000000000011");
    const caller = callerFor(prisma);

    const first = await caller.entries.create({
      capturedAt: new Date("2026-05-30T12:00:00.000Z"),
      note: "original local note",
      photoDataUrl: jpegDataUrl("first"),
      migrationKey: "local-entry-123"
    });
    const second = await caller.entries.create({
      capturedAt: new Date("2026-05-30T13:00:00.000Z"),
      note: "changed note that must not overwrite",
      photoDataUrl: jpegDataUrl("second"),
      migrationKey: "local-entry-123"
    });

    expect(second).toMatchObject({
      id: first.id,
      capturedAt: new Date("2026-05-30T12:00:00.000Z"),
      note: "original local note"
    });
    expect(prisma.entries).toHaveLength(1);
    expect(r2.putPhotoObject).toHaveBeenCalledTimes(1);
  });

  it("deletes the uploaded object when database creation fails after R2 has accepted the photo", async () => {
    const prisma = new MemoryPrisma();
    prisma.failNextEntryCreate = new Error("database unavailable");
    vi.spyOn(crypto, "randomUUID").mockReturnValue("00000000-0000-4000-8000-000000000020");

    await expect(
      callerFor(prisma).entries.create({
        capturedAt: new Date("2026-05-31T08:15:00.000Z"),
        note: "will fail",
        photoDataUrl: jpegDataUrl("orphan risk")
      })
    ).rejects.toThrow("database unavailable");

    expect(r2.putPhotoObject).toHaveBeenCalledTimes(1);
    expect(r2.deletePhotoObject).toHaveBeenCalledTimes(1);
    expect(r2.deletePhotoObject).toHaveBeenCalledWith("users/user-1/entries/00000000-0000-4000-8000-000000000020.jpg");
    expect(prisma.entries).toHaveLength(0);
  });

  it("rejects unsupported image payloads before any storage write happens", async () => {
    const prisma = new MemoryPrisma();

    await expect(
      callerFor(prisma).entries.create({
        capturedAt: new Date("2026-05-31T08:15:00.000Z"),
        photoDataUrl: "data:text/plain;base64,aGVsbG8="
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    expect(r2.putPhotoObject).not.toHaveBeenCalled();
    expect(prisma.entries).toHaveLength(0);
  });

  it("lists only the signed-in user's photos in newest-first order", async () => {
    const prisma = new MemoryPrisma();
    vi.spyOn(crypto, "randomUUID")
      .mockReturnValueOnce("00000000-0000-4000-8000-000000000030")
      .mockReturnValueOnce("00000000-0000-4000-8000-000000000031")
      .mockReturnValueOnce("00000000-0000-4000-8000-000000000032");

    await callerFor(prisma, "user-a").entries.create({
      capturedAt: new Date("2026-05-30T07:00:00.000Z"),
      note: "older",
      photoDataUrl: jpegDataUrl("older")
    });
    await callerFor(prisma, "user-a").entries.create({
      capturedAt: new Date("2026-05-31T18:00:00.000Z"),
      note: "newer",
      photoDataUrl: jpegDataUrl("newer")
    });
    await callerFor(prisma, "user-b").entries.create({
      capturedAt: new Date("2026-05-31T19:00:00.000Z"),
      note: "other user",
      photoDataUrl: jpegDataUrl("other")
    });

    const listed = await callerFor(prisma, "user-a").entries.list();

    expect(listed.map((entry) => entry.note)).toEqual(["newer", "older"]);
    expect(listed.every((entry) => entry.publicUrl.includes("users/user-1/"))).toBe(true);
  });

  it("does not let another signed-in user update or delete someone else's entry", async () => {
    const prisma = new MemoryPrisma();
    vi.spyOn(crypto, "randomUUID").mockReturnValue("00000000-0000-4000-8000-000000000040");
    const owner = callerFor(prisma, "owner");
    const intruder = callerFor(prisma, "intruder");

    const created = await owner.entries.create({
      capturedAt: new Date("2026-05-31T08:15:00.000Z"),
      note: "private note",
      photoDataUrl: jpegDataUrl("owned")
    });

    await expect(intruder.entries.updateNote({ id: created.id, note: "stolen" })).rejects.toMatchObject({
      code: "NOT_FOUND"
    });
    await expect(intruder.entries.delete({ id: created.id })).rejects.toMatchObject({ code: "NOT_FOUND" });

    expect(prisma.entries[0].note).toBe("private note");
    expect(r2.deletePhotoObject).not.toHaveBeenCalled();
  });

  it("updates the owner's note and trims whitespace without changing the photo", async () => {
    const prisma = new MemoryPrisma();
    vi.spyOn(crypto, "randomUUID").mockReturnValue("00000000-0000-4000-8000-000000000050");
    const caller = callerFor(prisma);
    const created = await caller.entries.create({
      capturedAt: new Date("2026-05-31T08:15:00.000Z"),
      note: "before",
      photoDataUrl: jpegDataUrl("same photo")
    });

    const updated = await caller.entries.updateNote({ id: created.id, note: "  after lunch  " });

    expect(updated).toMatchObject({
      id: created.id,
      note: "after lunch",
      publicUrl: created.publicUrl,
      contentType: "image/jpeg",
      byteSize: Buffer.from("same photo").byteLength
    });
    expect(r2.putPhotoObject).toHaveBeenCalledTimes(1);
  });

  it("deletes the owner's database entry even when R2 cleanup fails", async () => {
    const prisma = new MemoryPrisma();
    vi.spyOn(crypto, "randomUUID").mockReturnValue("00000000-0000-4000-8000-000000000060");
    r2.deletePhotoObject.mockRejectedValueOnce(new Error("r2 timeout"));
    const caller = callerFor(prisma);
    const created = await caller.entries.create({
      capturedAt: new Date("2026-05-31T08:15:00.000Z"),
      note: "delete me",
      photoDataUrl: jpegDataUrl("delete")
    });

    await expect(caller.entries.delete({ id: created.id })).resolves.toEqual({ deleted: true });
    await expect(caller.entries.list()).resolves.toEqual([]);
    expect(r2.deletePhotoObject).toHaveBeenCalledWith("users/user-1/entries/00000000-0000-4000-8000-000000000060.jpg");
  });

  it("rejects protected entry procedures when there is no signed-in user", async () => {
    const prisma = new MemoryPrisma();
    const caller = appRouter.createCaller({
      auth: { userId: null },
      prisma
    } as never);

    const rejected = caller.entries.list();
    await expect(rejected).rejects.toBeInstanceOf(TRPCError);
    await expect(rejected).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});
