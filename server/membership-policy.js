export const MEMBERSHIP_TIERS = Object.freeze(["basic", "premium", "gold"]);

export function normalizeMembership(profile = {}, now = Date.now()) {
  const assignedTier = MEMBERSHIP_TIERS.includes(profile.subscription_tier)
    ? profile.subscription_tier
    : "basic";
  const status = ["active", "cancelled", "expired", "past_due"].includes(profile.subscription_status)
    ? profile.subscription_status
    : "active";
  const periodEndsAt = profile.subscription_period_ends_at || null;
  const periodEnd = periodEndsAt ? Date.parse(periodEndsAt) : NaN;
  const source = ["default", "complimentary", "manual", "paid"].includes(profile.subscription_source)
    ? profile.subscription_source
    : assignedTier === "basic" ? "default" : "manual";
  const isCurrent = status === "active"
    || (status === "cancelled" && source === "paid" && Number.isFinite(periodEnd) && periodEnd > now);
  const effectiveTier = isCurrent ? assignedTier : "basic";
  return {
    tier: assignedTier,
    effective_tier: effectiveTier,
    status,
    source,
    provider: source === "paid" ? profile.subscription_provider || null : null,
    started_at: source === "paid" ? profile.subscription_started_at || null : null,
    period_ends_at: source === "paid" ? periodEndsAt : null,
    version: Number.isInteger(profile.subscription_version) && profile.subscription_version >= 0
      ? profile.subscription_version
      : 0,
    switch_unlocked: profile.subscription_switch_unlocked === true
      || (assignedTier === "gold" && source === "manual"),
  };
}

export function validateAdminPackageChange(input, profile) {
  if (!input || !MEMBERSHIP_TIERS.includes(input.tier)) {
    return { ok: false, status: 400, error: "Invalid membership package" };
  }
  if (!Number.isInteger(input.expected_version) || input.expected_version < 0) {
    return { ok: false, status: 400, error: "A valid package version is required" };
  }
  const membership = normalizeMembership(profile);
  if (membership.version !== input.expected_version) {
    return { ok: false, status: 409, error: "This package changed in another session. Refresh and try again." };
  }
  return { ok: true, membership };
}

export function makeManualPackageChange({ profile, tier, actor, reason = null, now, changeId }) {
  const current = normalizeMembership(profile, Date.parse(now));
  const nextSource = tier === "basic" ? "manual" : "complimentary";
  const timestamp = now;
  const nextVersion = current.version + 1;
  const preserveLegacyGoldAccess = current.switch_unlocked;
  const patch = {
    subscription_tier: tier,
    subscription_status: "active",
    subscription_source: nextSource,
    subscription_provider: null,
    subscription_started_at: null,
    subscription_period_ends_at: null,
    subscription_assigned_by: actor.email,
    subscription_assigned_at: timestamp,
    subscription_changed_at: timestamp,
    subscription_change_id: changeId,
    subscription_version: nextVersion,
    ...(preserveLegacyGoldAccess ? { subscription_switch_unlocked: true } : {}),
  };
  const event = {
    id: changeId,
    user_id: profile.id,
    from_tier: current.tier,
    to_tier: tier,
    from_status: current.status,
    to_status: "active",
    source: nextSource,
    initiated_by: actor.email,
    initiated_by_id: actor.id,
    initiated_by_type: "owner_admin",
    change_type: "manual_assignment",
    reason,
    payment_processed: false,
    created_at: timestamp,
    effective_at: timestamp,
    version: nextVersion,
  };
  return { patch, event, changed: current.tier !== tier || current.status !== "active" };
}
