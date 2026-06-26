export interface RequestScope {
  userId: string;
  sessionId?: string | null;
}

export function scopedToUser(
  userId: string,
  sessionId?: string | null,
): RequestScope {
  if (!userId) throw new Error("A scoped repository requires a user id.");
  return { userId, sessionId: sessionId ?? null };
}
