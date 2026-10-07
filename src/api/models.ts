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

const ReportEntrySchema = z.object({ start: z.string(), end: z.string(), title: z.string() });
export type ReportEntry = z.infer<typeof ReportEntrySchema>;

/**
 * GET /api/report/room/{id}. Today the API answers { report: [...] }; the platform's own route
 * handler would answer a bare array, and fixing the bug below likely switches to it. Accept both,
 * so the fix doesn't break our tests for the wrong reason.
 */
export const RoomReportSchema = z.union([
  z.array(ReportEntrySchema),
  z.object({ report: z.array(ReportEntrySchema) }).transform(({ report }) => report),
]);
