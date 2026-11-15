import { Router, type RequestHandler } from "express";

import type { usersController } from "../controllers/users.controller.js";

import { requirePermission } from "../middlewares/authentication.js";
import { rateLimit } from "../middlewares/rate-limit.js";

export function usersRoutes(
  controller: ReturnType<typeof usersController>,
  authenticate: RequestHandler,
) {
  const router = Router();

  router.use(authenticate);

  const inviteLimit = rateLimit(
    20,
    60 * 60 * 1000,
    (req) => req.ip ?? "unknown",
  );

  router.get("/", requirePermission("users:list"), controller.list);

  router.get("/audit-logs", requirePermission("audit:read"), controller.audit);

  router.patch(
    "/:id/role",
    requirePermission("users:manage-role"),
    rateLimit(30, 15 * 60 * 1000, (req) => req.ip ?? "unknown"),
    controller.changeRole,
  );

  router.post(
    "/",
    requirePermission("users:invite"),
    inviteLimit,
    controller.create,
  );

  router.post(
    "/:id/invitation",
    requirePermission("users:invite"),
    inviteLimit,
    controller.resend,
  );

  router.patch(
    "/:id/status",
    requirePermission("users:manage-status"),
    rateLimit(30, 15 * 60 * 1000, (req) => req.ip ?? "unknown"),
    controller.changeStatus,
  );

  return router;
}
