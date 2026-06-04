import { router } from "../trpc";
import { entriesRouter } from "./entries";
import { guitarPracticeRouter } from "./guitar-practice";
import { roundupsRouter } from "./roundups";

export const appRouter = router({
  entries: entriesRouter,
  guitarPractice: guitarPracticeRouter,
  roundups: roundupsRouter
});

export type AppRouter = typeof appRouter;
