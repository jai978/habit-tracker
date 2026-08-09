import { timingSafeEqual } from 'node:crypto';
import { Router, type NextFunction, type Request, type Response } from 'express';

import type { Config } from '../config.ts';
import type { Store } from '../db/index.ts';
import { REQUEST_STATUSES, type RequestStatus } from '../types/change-request.ts';
import type { ClientPatch } from '../types/client.ts';
import { EVENTS, errorMessage, type Logger } from '../utils/logger.ts';
import { rateLimit } from '../utils/rate-limit.ts';
import { sanitizeText } from '../utils/validation.ts';
import {
  clientFormPage,
  clientsPage,
  failedBatchesPage,
  layout,
  requestDetailPage,
  requestsPage,
} from './views.ts';

/**
 * The internal dashboard: read the request, copy the prompt, set the status.
 *
 * Auth is a single shared token — this is a one-operator tool, not a
 * multi-tenant app. The token is presented once as ?token=..., stored in a
 * SameSite=Strict cookie, and echoed in every form so a cross-site POST cannot
 * ride the cookie.
 */

const COOKIE_NAME = 'jps_dashboard';
const PAGE_SIZE = 50;

function readCookie(header: string | undefined, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return decodeURIComponent(rest.join('='));
  }
  return null;
}

function tokenMatches(provided: string | null, expected: string): boolean {
  if (!provided || provided.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
}

/** Express types a route param as string | string[]; we only ever use single values. */
function param(req: Request, name: string): string {
  const value = req.params[name];
  return typeof value === 'string' ? value : '';
}

function formValue(body: unknown, field: string): string {
  if (typeof body !== 'object' || body === null) return '';
  const value = (body as Record<string, unknown>)[field];
  return typeof value === 'string' ? sanitizeText(value, 20_000) : '';
}

function nullableValue(body: unknown, field: string): string | null {
  const value = formValue(body, field);
  return value === '' ? null : value;
}

export function createDashboardRouter(deps: {
  config: Config;
  store: Store;
  logger: Logger;
}): Router {
  const { config, store, logger } = deps;
  const router = Router();
  const token = config.dashboard.token ?? '';

  router.use(rateLimit({ windowMs: 60_000, max: 240 }));

  router.use((req: Request, res: Response, next: NextFunction) => {
    const query = typeof req.query.token === 'string' ? req.query.token : null;
    const cookie = readCookie(req.headers.cookie, COOKIE_NAME);

    if (tokenMatches(query, token)) {
      res.cookie(COOKIE_NAME, token, {
        httpOnly: true,
        sameSite: 'strict',
        secure: req.protocol === 'https',
        maxAge: 30 * 24 * 60 * 60 * 1000,
      });
      next();
      return;
    }

    if (tokenMatches(cookie, token)) {
      // Writes additionally require the token in the form body, so a request
      // forged from another site cannot act using the cookie alone.
      if (req.method !== 'GET' && !tokenMatches(formValue(req.body, 'token') || null, token)) {
        res.status(403).send(layout('Forbidden', '<h1>Forbidden</h1><p>Reload the page and try again.</p>'));
        return;
      }
      next();
      return;
    }

    res
      .status(401)
      .send(
        layout(
          'Sign in',
          '<h1>Sign in</h1><p class="muted">Open this dashboard with <code>?token=…</code> using the value of DASHBOARD_TOKEN.</p>',
        ),
      );
  });

  /** Turn any thrown error into a page rather than an express stack trace. */
  const handle =
    (fn: (req: Request, res: Response) => Promise<void>) =>
    async (req: Request, res: Response): Promise<void> => {
      try {
        await fn(req, res);
      } catch (error) {
        logger.error(EVENTS.error, { stage: 'dashboard', path: req.path, reason: errorMessage(error) });
        res.status(500).send(layout('Error', '<h1>Something went wrong</h1><p>Check the server logs.</p>'));
      }
    };

  router.get(
    '/',
    handle(async (req, res) => {
      const requested = typeof req.query.status === 'string' ? req.query.status : null;
      const status =
        requested && (REQUEST_STATUSES as readonly string[]).includes(requested)
          ? (requested as RequestStatus)
          : null;

      const [requests, clients, counts] = await Promise.all([
        store.changeRequests.list({ status: status ?? undefined, limit: PAGE_SIZE }),
        store.clients.list(),
        store.changeRequests.countByStatus(),
      ]);

      const byId = new Map(clients.map((client) => [client.id, client]));
      res.send(requestsPage(requests, byId, counts, status));
    }),
  );

  router.get(
    '/requests/:id',
    handle(async (req, res) => {
      const request = await store.changeRequests.getById(param(req, 'id'));
      if (!request) {
        res.status(404).send(layout('Not found', '<h1>Request not found</h1>'));
        return;
      }
      const [client, clients, batch] = await Promise.all([
        request.client_id ? store.clients.getById(request.client_id) : Promise.resolve(null),
        store.clients.list(),
        store.batches.getById(request.batch_id),
      ]);
      res.send(requestDetailPage(request, client, clients, token, batch?.facebook_sender_id ?? null));
    }),
  );

  router.post(
    '/requests/:id/status',
    handle(async (req, res) => {
      const id = param(req, 'id');
      const next = formValue(req.body, 'status');
      if (!(REQUEST_STATUSES as readonly string[]).includes(next)) {
        res.status(400).send(layout('Bad request', '<h1>Unknown status</h1>'));
        return;
      }
      const updated = await store.changeRequests.updateStatus(id, next as RequestStatus);
      logger.info(EVENTS.requestUpdated, { request_id: id, status: next, found: Boolean(updated) });
      res.redirect(`/dashboard/requests/${encodeURIComponent(id)}`);
    }),
  );

  // Attach an unrecognised sender to a client, then put the batch back in the
  // queue so it is interpreted with that client's site context.
  router.post(
    '/requests/:id/link',
    handle(async (req, res) => {
      const request = await store.changeRequests.getById(param(req, 'id'));
      const clientId = formValue(req.body, 'client_id');
      if (!request || !clientId) {
        res.status(400).send(layout('Bad request', '<h1>Could not link this sender</h1>'));
        return;
      }

      const batch = await store.batches.getById(request.batch_id);
      const client = await store.clients.getById(clientId);
      if (!batch || !client) {
        res.status(400).send(layout('Bad request', '<h1>Could not link this sender</h1>'));
        return;
      }

      await store.clients.update(client.id, { facebook_sender_id: batch.facebook_sender_id });
      await store.batches.setClient(batch.id, client.id);
      await store.messages.assignClientForBatch(batch.id, client.id);
      await store.batches.requeue(batch.id, new Date().toISOString());
      await store.changeRequests.updateStatus(request.id, 'REVIEWED');

      logger.info(EVENTS.requestUpdated, {
        request_id: request.id,
        action: 'linked_client',
        client_id: client.id,
        batch_id: batch.id,
      });
      res.redirect('/dashboard');
    }),
  );

  router.get(
    '/clients',
    handle(async (_req, res) => {
      res.send(clientsPage(await store.clients.list()));
    }),
  );

  router.get(
    '/clients/new',
    handle(async (_req, res) => {
      res.send(clientFormPage(null, token));
    }),
  );

  router.post(
    '/clients',
    handle(async (req, res) => {
      const businessName = formValue(req.body, 'business_name');
      const senderId = formValue(req.body, 'facebook_sender_id');
      if (!businessName || !senderId) {
        res.status(400).send(clientFormPage(null, token, 'Business name and Facebook sender id are required.'));
        return;
      }
      const created = await store.clients.create({
        business_name: businessName,
        facebook_sender_id: senderId,
        website_url: nullableValue(req.body, 'website_url'),
        lovable_project_reference: nullableValue(req.body, 'lovable_project_reference'),
        site_context: nullableValue(req.body, 'site_context'),
        special_instructions: nullableValue(req.body, 'special_instructions'),
        active: formValue(req.body, 'active') === '1',
      });
      logger.info('client_created', { client_id: created.id, business: created.business_name });
      res.redirect('/dashboard/clients');
    }),
  );

  router.get(
    '/clients/:id',
    handle(async (req, res) => {
      const client = await store.clients.getById(param(req, 'id'));
      if (!client) {
        res.status(404).send(layout('Not found', '<h1>Client not found</h1>'));
        return;
      }
      res.send(clientFormPage(client, token));
    }),
  );

  router.post(
    '/clients/:id',
    handle(async (req, res) => {
      const id = param(req, 'id');
      const patch: ClientPatch = {
        business_name: formValue(req.body, 'business_name'),
        facebook_sender_id: formValue(req.body, 'facebook_sender_id'),
        website_url: nullableValue(req.body, 'website_url'),
        lovable_project_reference: nullableValue(req.body, 'lovable_project_reference'),
        site_context: nullableValue(req.body, 'site_context'),
        special_instructions: nullableValue(req.body, 'special_instructions'),
        active: formValue(req.body, 'active') === '1',
      };
      if (!patch.business_name || !patch.facebook_sender_id) {
        const existing = await store.clients.getById(id);
        res
          .status(400)
          .send(clientFormPage(existing, token, 'Business name and Facebook sender id are required.'));
        return;
      }
      await store.clients.update(id, patch);
      logger.info('client_updated', { client_id: id });
      res.redirect('/dashboard/clients');
    }),
  );

  router.get(
    '/failed',
    handle(async (_req, res) => {
      res.send(failedBatchesPage(await store.batches.listFailed(50), token));
    }),
  );

  router.post(
    '/batches/:id/retry',
    handle(async (req, res) => {
      const id = param(req, 'id');
      const batch = await store.batches.requeue(id, new Date().toISOString());
      logger.info('batch_requeued', { batch_id: id, found: Boolean(batch) });
      res.redirect('/dashboard/failed');
    }),
  );

  return router;
}
