import test from "node:test";
import assert from "node:assert/strict";
import { makeManualPackageChange, normalizeMembership, validateAdminPackageChange } from "./membership-policy.js";
import { getOwnerActor } from "./owner-access.js";

const actor = { id: "netlify-user-1", email: "owner@example.test" };

test("normalizes tier and computes effective badge entitlement", () => {
  assert.equal(normalizeMembership({ subscription_tier: "premium" }).effective_tier, "premium");
  assert.equal(normalizeMembership({ subscription_tier: "gold", subscription_status: "expired" }).effective_tier, "basic");
});

test("accepts package upgrade and downgrade with a current version", () => {
  assert.equal(validateAdminPackageChange({ tier: "gold", expected_version: 2 }, { subscription_tier: "basic", subscription_version: 2 }).ok, true);
  assert.equal(validateAdminPackageChange({ tier: "basic", expected_version: 2 }, { subscription_tier: "gold", subscription_version: 2 }).ok, true);
});

test("rejects invalid tiers and stale concurrent package requests", () => {
  assert.equal(validateAdminPackageChange({ tier: "diamond", expected_version: 0 }, {}).status, 400);
  assert.equal(validateAdminPackageChange({ tier: "gold", expected_version: 1 }, { subscription_version: 2 }).status, 409);
});

test("manual package changes mark complimentary access and never claim payment", () => {
  const result = makeManualPackageChange({
    profile: { id: "member-1", subscription_tier: "basic", subscription_version: 0 },
    tier: "premium", actor, reason: "Support grant", now: "2026-10-09T10:00:00.000Z", changeId: "change-1",
  });
  assert.equal(result.patch.subscription_source, "complimentary");
  assert.equal(result.patch.subscription_status, "active");
  assert.equal(result.patch.subscription_period_ends_at, null);
  assert.equal(result.event.payment_processed, false);
  assert.equal(result.event.initiated_by, actor.email);
  assert.equal(result.patch.subscription_version, 1);
});

test("owner profile patch is the effective state read by both apps", () => {
  const change = makeManualPackageChange({
    profile: { id: "member-2", subscription_tier: "basic", subscription_version: 4 },
    tier: "gold", actor, now: "2026-10-09T10:00:00.000Z", changeId: "change-3",
  });
  const effective = normalizeMembership({ ...{ id: "member-2" }, ...change.patch });
  assert.equal(effective.tier, "gold");
  assert.equal(effective.effective_tier, "gold");
  assert.equal(effective.source, "complimentary");
  assert.equal(effective.version, 5);
});

test("an unchanged active package is idempotent", () => {
  const profile = { id: "member-3", subscription_tier: "premium", subscription_status: "active", subscription_source: "paid", subscription_version: 2 };
  const change = makeManualPackageChange({ profile, tier: "premium", actor, now: "2026-10-09T10:00:00.000Z", changeId: "change-4" });
  assert.equal(change.changed, false);
});

test("preserves unrelated profile data and package-change access history", () => {
  const profile = { id: "member-1", username: "worker", subscription_tier: "gold", subscription_switch_unlocked: true, saved_story_ids: ["story-1"], usage_count: 7, subscription_version: 3 };
  const { patch } = makeManualPackageChange({ profile, tier: "basic", actor, now: "2026-10-09T10:00:00.000Z", changeId: "change-2" });
  assert.deepEqual(profile.saved_story_ids, ["story-1"]);
  assert.equal(profile.usage_count, 7);
  assert.equal(patch.subscription_switch_unlocked, true);
});

test("requires a trusted Netlify user and applies the configured allowlist", () => {
  assert.equal(getOwnerActor(null), null);
  assert.equal(getOwnerActor({ id: "user", email: "intruder@example.test" }, "owner@example.test"), null);
  assert.deepEqual(getOwnerActor(actor, "owner@example.test"), actor);
});
