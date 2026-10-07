import type { APIRequestContext } from '@playwright/test';
import { env } from '../config/env';
import { readJson } from './http';
import { RoomReportSchema, type ReportEntry } from './models';

/**
 * Client for /api/report. The room report is public and lists every booked range for a room
 * (title "Unavailable"), which makes it the simplest way to confirm a booking was stored.
 *
 * Known product bug: the API wraps the list as { report: [...] }, while the guest calendar
 * expects a bare array, so booked dates never render for guests. Specs therefore verify
 * persistence here rather than in the calendar.
 */
export class ReportClient {
  constructor(private readonly request: APIRequestContext) {}

  async roomBookings(roomId: number): Promise<ReportEntry[]> {
    const response = await this.request.get(`${env.apiUrl}/report/room/${roomId}`);
    return readJson(response, RoomReportSchema, `Room #${roomId} report`);
  }
}
