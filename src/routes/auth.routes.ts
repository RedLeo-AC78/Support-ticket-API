import { Router, type RequestHandler } from "express";

import type { authController } from "../controllers/auth.controller.js";

import { rateLimit } from "../middlewares/rate-limit.js";

import {
  digest,
  emailValue,
  objectBody,
  passwordValue,
} from "../utils/security.js";

export function authRoutes(
  controller: ReturnType<typeof authController>,
  authenticate: RequestHandler,
) {
  const router = Router();
  const byIp = rateLimit(30, 15 * 60 * 1000, (req) => req.ip ?? "unknown");

  const emailKey = (req: Parameters<RequestHandler>[0]) =>
    digest(
      String(req.body?.email ?? "")
        .trim()
        .toLowerCase(),
    );

  // La limite IP protège aussi les corps invalides ; le quota email suit la validation.
  const validateLoginBody: RequestHandler = (req, _res, next) => {
    const body = objectBody(req.body, ["email", "password"]);

    emailValue(body.email);
    passwordValue(body.password);

    next();
  };

  router.post(
    "/login",
    byIp,
    validateLoginBody,
    rateLimit(10, 15 * 60 * 1000, emailKey),
    controller.login,
  );

  router.post("/refresh", byIp, controller.refresh);

  router.post("/logout", byIp, controller.logout);

  router.get("/me", authenticate, controller.me);

  router.post(
    "/accept-invitation",
    rateLimit(15, 15 * 60 * 1000, (req) => req.ip ?? "unknown"),
    controller.accept,
  );

  router.post(
    "/forgot-password",
    rateLimit(20, 15 * 60 * 1000, (req) => req.ip ?? "unknown"),
    rateLimit(3, 60 * 60 * 1000, emailKey),
    controller.forgot,
  );

  router.post(
    "/reset-password",
    rateLimit(15, 15 * 60 * 1000, (req) => req.ip ?? "unknown"),
    controller.reset,
  );

  return router;
}
