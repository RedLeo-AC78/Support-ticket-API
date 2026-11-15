import type { RequestHandler } from "express";

import type { UsersService } from "../services/users.service.js";
import type { InvitationsService } from "../services/invitations.service.js";

export function usersController(
  service: UsersService,
  invitations: InvitationsService,
) {
  const list: RequestHandler = async (_req, res) => {
    res.json(await service.list());
  };

  const create: RequestHandler = async (req, res) => {
    res.status(201).json(await invitations.create(req.body));
  };

  const resend: RequestHandler = async (req, res) => {
    res.json(await invitations.resend(req.params.id));
  };

  const changeStatus: RequestHandler = async (req, res) => {
    res.json(
      await service.changeStatus(
        req.params.id,
        req.body,
        res.locals.user.id,
        res.locals.sessionId,
      ),
    );
  };

  return { list, create, resend, changeStatus };
}
