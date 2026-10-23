import { Router } from 'express';
import { pool } from '../db/pool';
import { asyncHandler } from '../utils/asyncHandler';
import { parseRouteId } from '../utils/validation';
import { listSavedSearches, createSavedSearch, deleteSavedSearch } from '../items/service';

export const savedSearchesRouter = Router();

savedSearchesRouter.get('/', asyncHandler(async (req, res) => {
  res.json({ savedSearches: await listSavedSearches(pool, req.user!.id) });
}));

savedSearchesRouter.post('/', asyncHandler(async (req, res) => {
  const saved = await createSavedSearch(pool, req.user!.id, req.body?.name, req.body?.query);
  res.status(201).json({ savedSearch: saved });
}));

savedSearchesRouter.delete('/:id', asyncHandler(async (req, res) => {
  await deleteSavedSearch(pool, req.user!.id, parseRouteId(req.params.id, 'id'));
  res.status(204).end();
}));
