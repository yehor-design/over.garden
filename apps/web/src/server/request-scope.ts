export interface RequestScope {
  userId: string;
}

export function scopedToUser(userId: string): RequestScope {
  if (!userId) throw new Error("A scoped repository requires a user id.");
  return { userId };
}
