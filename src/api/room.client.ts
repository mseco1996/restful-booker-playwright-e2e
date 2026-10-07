import { test, type APIRequestContext } from '@playwright/test';
import { env } from '../config/env';
import type { AdminSession } from './auth.client';
import { expectOk, failWith, readJson } from './http';
import {
  RoomListSchema,
  RoomSchema,
  type Room,
  type RoomListEntry,
  type RoomPayload,
} from './models';

/**
 * Client for /api/room.
 *
 * Quirks of the platform's API proxy that shape this client:
 * - POST /room answers { success: true } WITHOUT the new room's id, so `create()` looks the room
 *   up by its unique name afterwards.
 * - GET or DELETE on a room that doesn't exist returns HTTP 500, not 404 (the proxy fails to parse
 *   the backend's empty 404 body). `deleteIfPresent()` therefore double-checks against the list.
 * - Writes need the admin token as a `token` cookie; AdminSession provides and refreshes it.
 */
export class RoomClient {
  constructor(
    private readonly request: APIRequestContext,
    private readonly session: AdminSession,
  ) {}

  /** Every room, including other people's on a shared environment. Public, no auth needed. */
  async list(): Promise<RoomListEntry[]> {
    const response = await this.request.get(this.url());
    const { rooms } = await readJson(response, RoomListSchema, 'List rooms');
    return rooms;
  }

  /** Note: a missing room comes back as HTTP 500 (see class notes). */
  async get(roomId: number): Promise<Room> {
    const response = await this.request.get(this.url(roomId));
    return readJson(response, RoomSchema, `Get room #${roomId}`);
  }

  async findByName(roomName: string): Promise<Room | undefined> {
    const match = (await this.list()).find((room) => room.roomName === roomName);
    return match ? RoomSchema.parse(match) : undefined;
  }

  /** Creates a room and returns it with its id. The payload's roomName must be unique. */
  async create(payload: RoomPayload): Promise<Room> {
    return test.step(
      `Create room "${payload.roomName}"`,
      async () => {
        const response = await this.session.send((headers) =>
          this.request.post(this.url(), { data: payload, headers }),
        );
        await expectOk(response, `Create room "${payload.roomName}"`);

        const room = await this.findByName(payload.roomName);
        if (!room) {
          throw new Error(
            `Room "${payload.roomName}" was accepted but is missing from the room list. ` +
              'The shared environment may have reset in between; re-run before raising a bug.',
          );
        }
        return room;
      },
      { box: true },
    );
  }

  /** Strict delete: throws on any failure. Use in tests that verify deletion itself. */
  async delete(roomId: number): Promise<void> {
    const response = await this.session.send((headers) =>
      this.request.delete(this.url(roomId), { headers }),
    );
    await expectOk(response, `Delete room #${roomId}`);
  }

  /**
   * Cleanup-friendly delete. A room that is already gone (wiped by an environment reset, or
   * deleted by someone else) counts as clean. Anything else still throws.
   */
  async deleteIfPresent(roomId: number): Promise<'deleted' | 'already-gone'> {
    return test.step(
      `Delete room #${roomId}`,
      async () => {
        const response = await this.session.send((headers) =>
          this.request.delete(this.url(roomId), { headers }),
        );
        if (response.ok()) return 'deleted';

        const stillThere = (await this.list()).some((room) => room.roomid === roomId);
        if (!stillThere) return 'already-gone';
        return failWith(response, `Delete room #${roomId}`);
      },
      { box: true },
    );
  }

  private url(roomId?: number): string {
    return roomId === undefined ? `${env.apiUrl}/room` : `${env.apiUrl}/room/${roomId}`;
  }
}
