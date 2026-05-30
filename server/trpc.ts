import { auth } from "@clerk/nextjs/server";
import { Prisma } from "@prisma/client";
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { prisma } from "../lib/prisma";

export async function createTRPCContext() {
  const authState = await auth();

  return {
    auth: authState,
    prisma
  };
}

type TRPCContext = Awaited<ReturnType<typeof createTRPCContext>>;

const t = initTRPC.context<TRPCContext>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    if (error.code === "INTERNAL_SERVER_ERROR") {
      return {
        ...shape,
        message: "Something went wrong."
      };
    }

    return shape;
  }
});

export const createCallerFactory = t.createCallerFactory;
export const router = t.router;
export const publicProcedure = t.procedure;

export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.auth.userId) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }

  return next({
    ctx: {
      ...ctx,
      userId: ctx.auth.userId
    }
  });
});

export function translatePrismaError(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2025") {
      throw new TRPCError({ code: "NOT_FOUND" });
    }

    if (error.code === "P2002") {
      throw new TRPCError({ code: "CONFLICT" });
    }
  }

  throw error;
}
