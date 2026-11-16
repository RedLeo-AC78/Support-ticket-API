import { Router, type RequestHandler } from "express";

import type { ticketsController } from "../controllers/tickets.controller.js";

import { requirePermission } from "../middlewares/authentication.js";
import { rateLimit } from "../middlewares/rate-limit.js";

export function ticketsRoutes(
  controller: ReturnType<typeof ticketsController>,
  authenticate: RequestHandler,
) {
  const router = Router();

  router.use(authenticate);

  router.post(
    "/",
    requirePermission("tickets:create"),
    rateLimit(30, 3600000, (req) => req.ip ?? "unknown"),
    controller.create,
  );

  router.post(
    "/:id/ai/retry",
    requirePermission("tickets:update-status"),
    rateLimit(5, 3600000, (req) => req.ip ?? "unknown"),
    controller.retryAi,
  );

  router.post(
    "/:id/ai/feedback",
    rateLimit(30, 3600000, (req) => req.ip ?? "unknown"),
    controller.feedback,
  );

  router.get("/", controller.list);

  router.get("/:id", controller.get);

  router.patch(
    "/:id/status",
    requirePermission("tickets:update-status"),
    controller.updateStatus,
  );

  return router;
}
