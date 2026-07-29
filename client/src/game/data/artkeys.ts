/**
 * Canonical lists of generated art keys.
 *
 * Kept in a dependency-free module so both the boot loader and the data tests
 * can import them without pulling in the rendering engine.
 */

export const CHARACTER_KEYS = [
  'player_m', 'player_f', 'rival', 'professor',
  'npc_engineer', 'npc_technician', 'npc_kid', 'npc_medic', 'npc_clerk', 'npc_guard',
  'mom', 'leader_volt', 'leader_cryo', 'leader_thermal', 'champion',
];

export const TRAINER_KEYS = [
  'trainer_rival', 'trainer_gym1', 'trainer_gym2', 'trainer_gym3',
  'trainer_engineer', 'trainer_technician', 'trainer_kid', 'trainer_guard',
];

export const BUILDING_KEYS = [
  'house_small', 'house_large', 'lab', 'clinic', 'shop',
  'gym_datacenter', 'tower_server', 'sign_post',
];

export const BACKDROP_KEYS = ['bg_grass', 'bg_city', 'bg_cave', 'bg_datacenter', 'bg_road', 'bg_night'];
