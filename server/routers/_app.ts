import { router } from "../trpc";
import { entriesRouter } from "./entries";
import { roundupsRouter } from "./roundups";

export const appRouter = router({
  entries: entriesRouter,
  roundups: roundupsRouter
});

export type AppRouter = typeof appRouter;
