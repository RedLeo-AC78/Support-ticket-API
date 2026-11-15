import type { RequestHandler } from "express";

import type { AuthService } from "../services/auth.service.js";
import type { InvitationsService } from "../services/invitations.service.js";
import type { PasswordResetService } from "../services/password-reset.service.js";

export function authController(
  service: AuthService,
  invitations: InvitationsService,
  resets: PasswordResetService,
) {
  const login: RequestHandler = async (req, res) => {
    res.json(await service.login(req.body));
  };

  const refresh: RequestHandler = async (req, res) => {
    res.json(await service.refresh(req.body));
  };

  const logout: RequestHandler = async (req, res) => {
    await service.logout(req.body);

    res.status(204).end();
  };

  const me: RequestHandler = (_req, res) => {
    res.json(res.locals.user);
  };

  const accept: RequestHandler = async (req, res) => {
    res.json(await invitations.accept(req.body));
  };

  const forgot: RequestHandler = (req, res) => {
    res.status(202).json(resets.forgot(req.body));
  };

  const reset: RequestHandler = async (req, res) => {
    res.json(await resets.reset(req.body));
  };

  return { login, refresh, logout, me, accept, forgot, reset };
}
