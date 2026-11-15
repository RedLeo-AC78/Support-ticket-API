import { Router, type RequestHandler } from "express";

import type { ticketsController } from "../controllers/tickets.controller.js";

import { requirePermission } from "../middlewares/authentication.js";

export function ticketsRoutes(
  controller: ReturnType<typeof ticketsController>,
  authenticate: RequestHandler,
) {
  const router = Router();

  router.use(authenticate);

  router.post("/", requirePermission("tickets:create"), controller.create);

  router.get("/", controller.list);

  router.get("/:id", controller.get);

  router.patch(
    "/:id/status",
    requirePermission("tickets:update-status"),
    controller.updateStatus,
  );

  return router;
}
