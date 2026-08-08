import { Response } from 'express';
import pool from '../config/database';

const clients = new Map<number, Set<Response>>();
const supervisorClients = new Map<string, Set<Response>>();

export function addNotificationClient(advertiserId: number, response: Response) {
  if (!clients.has(advertiserId)) clients.set(advertiserId, new Set());
  clients.get(advertiserId)!.add(response);
}

export function removeNotificationClient(advertiserId: number, response: Response) {
  const advertiserClients = clients.get(advertiserId);
  advertiserClients?.delete(response);
  if (!advertiserClients?.size) clients.delete(advertiserId);
}

export async function createNotification(input: {
  advertiserId: number;
  eventType: string;
  title: string;
  message: string;
  campaignId?: string | null;
}) {
  const [result] = await pool.execute<any>(
    `INSERT INTO notifications (advertiser_id, event_type, title, message, campaign_id)
     VALUES (?, ?, ?, ?, ?)`,
    [input.advertiserId, input.eventType, input.title, input.message, input.campaignId || null]
  );
  const notification = {
    id: result.insertId,
    event_type: input.eventType,
    title: input.title,
    message: input.message,
    campaign_id: input.campaignId || null,
    is_read: 0,
    created_at: new Date().toISOString(),
  };
  const payload = `event: notification\ndata: ${JSON.stringify(notification)}\n\n`;
  clients.get(Number(input.advertiserId))?.forEach(client => client.write(payload));
  return notification;
}

export function addSupervisorNotificationClient(username: string, response: Response) {
  if (!supervisorClients.has(username)) supervisorClients.set(username, new Set());
  supervisorClients.get(username)!.add(response);
}

export function removeSupervisorNotificationClient(username: string, response: Response) {
  const activeClients = supervisorClients.get(username);
  activeClients?.delete(response);
  if (!activeClients?.size) supervisorClients.delete(username);
}

export async function createSupervisorNotification(input: {
  eventType: string;
  title: string;
  message: string;
  campaignId?: string | null;
  advertiserId?: number | null;
}) {
  const [result] = await pool.execute<any>(
    `INSERT INTO supervisor_notifications (event_type, title, message, campaign_id, advertiser_id)
     VALUES (?, ?, ?, ?, ?)`,
    [input.eventType, input.title, input.message, input.campaignId || null, input.advertiserId || null]
  );
  const notification = {
    id: result.insertId,
    event_type: input.eventType,
    title: input.title,
    message: input.message,
    campaign_id: input.campaignId || null,
    advertiser_id: input.advertiserId || null,
    is_read: 0,
    created_at: new Date().toISOString(),
  };
  const payload = `event: notification\ndata: ${JSON.stringify(notification)}\n\n`;
  supervisorClients.forEach(activeClients => activeClients.forEach(client => client.write(payload)));
  return notification;
}
