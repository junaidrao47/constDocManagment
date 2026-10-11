import type { UserEntity } from "../modules/users/user.entity";

/**
 * The only user fields that may be embedded in another resource's response.
 *
 * A loaded `UserEntity` carries `passwordHash` and `tokensValidFrom`; returning a
 * relation as-is serialises both. Services that load a user relation pass it through
 * here before the object leaves the service.
 */
export interface PublicUser {
  id: string;
  email: string;
  name: string | null;
  phone: string | null;
  role: UserEntity["role"];
}

export function toPublicUser(user: UserEntity): PublicUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name ?? null,
    phone: user.phone ?? null,
    role: user.role,
  };
}
