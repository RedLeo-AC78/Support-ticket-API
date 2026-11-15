import type { RequestHandler } from "express";

import type { TicketsService } from "../services/tickets.service.js";

export function ticketsController(service: TicketsService) {
  const create: RequestHandler = async (req, res) => {
    const ticket = await service.create(req.body, res.locals.user);

    res.location(`/tickets/${ticket.id}`).status(201).json(ticket);
  };

  const list: RequestHandler = async (req, res) => {
    res.json(await service.list(res.locals.user, req.query));
  };

  const get: RequestHandler = async (req, res) => {
    res.json(await service.get(req.params.id, res.locals.user));
  };

  const updateStatus: RequestHandler = async (req, res) => {
    res.json(
      await service.updateStatus(req.params.id, req.body, res.locals.user),
    );
  };

  return { create, list, get, updateStatus };
}
