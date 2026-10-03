import { randomBytes } from "node:crypto";

/**
 * A new Play id, generated before insert so createManyAndReturn rows can be
 * matched by id rather than by position. Not Prisma's cuid() (which is not
 * exported); it is cuid-shaped — "c", a base-36 timestamp and 64 random bits,
 * 25 lowercase alphanumerics — so it passes the z.string().cuid() checks the
 * play-id schemas apply.
 */
export function newPlayId(): string {
    const time = Date.now().toString(36).padStart(8, "0").slice(-8);
    return `c${time}${randomBytes(8).toString("hex")}`;
}
