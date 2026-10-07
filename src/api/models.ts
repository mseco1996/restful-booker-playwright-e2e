import { z } from 'zod';

/** Allowed room types, mirroring the room service's validation (room/.../model/db/Room.java). */
export const ROOM_TYPES = ['Single', 'Double', 'Twin', 'Family', 'Suite'] as const;
export type RoomType = (typeof ROOM_TYPES)[number];

/** Body for POST /api/room. The room service requires a name, a valid type and a price of 1-999. */
export interface RoomPayload {
  roomName: string;
  type: RoomType;
  accessible: boolean;
  image: string;
  description: string;
  features: string[];
  roomPrice: number;
}

/**
 * A room as returned by the API. Strict on purpose: we only parse rooms our own tests created,
 * so any mismatch is a real contract change worth failing on.
 */
export const RoomSchema = z.object({
  roomid: z.number().int().positive(),
  roomName: z.string(),
  type: z.enum(ROOM_TYPES),
  accessible: z.boolean(),
  image: z.string().nullable(),
  description: z.string().nullable(),
  features: z.array(z.string()).nullable(),
  roomPrice: z.number().int(),
});
export type Room = z.infer<typeof RoomSchema>;

/**
 * GET /api/room. Lenient on purpose: on the shared demo the list includes rooms created by
 * strangers, and one malformed room of theirs must not break our lookups.
 */
export const RoomListSchema = z.object({
  rooms: z.array(z.looseObject({ roomid: z.number(), roomName: z.string().nullable() })),
});
export type RoomListEntry = z.infer<typeof RoomListSchema>['rooms'][number];

/** POST /api/auth/login. The token comes back in the JSON body; no cookie is set. */
export const LoginResponseSchema = z.object({ token: z.string().min(1) });
