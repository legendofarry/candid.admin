export function getOwnerActor(contextUser, allowlist = "") {
  if (!contextUser?.id || !contextUser?.email) return null;
  const email = contextUser.email.trim().toLowerCase();
  const allowed = String(allowlist).split(",").map((value) => value.trim().toLowerCase()).filter(Boolean);
  if (allowed.length && !allowed.includes(email)) return null;
  return { id: contextUser.id, email };
}
