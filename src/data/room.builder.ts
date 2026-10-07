import type { RoomPayload } from '../api/models';
import { env } from '../config/env';
import { uniqueName } from '../utils/unique';

/**
 * A valid room with a unique name. Override only the fields your test cares about:
 *   buildRoom({ type: 'Suite', roomPrice: 450 })
 */
export function buildRoom(overrides: Partial<RoomPayload> = {}): RoomPayload {
  return {
    roomName: uniqueName('room'),
    type: 'Double',
    accessible: true,
    image: '/images/room2.jpg',
    description: `Created by automated tests (run ${env.runId}). Safe to delete.`,
    features: ['WiFi', 'TV'],
    roomPrice: 150,
    ...overrides,
  };
}
