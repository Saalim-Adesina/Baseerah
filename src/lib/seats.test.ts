import { describe, expect, it } from "vitest";
import { PLANS, planById, planIdFromPolarProduct, seatsSupported } from "@/lib/plans";
import {
  atSeatLimit,
  canAddSeat,
  overageCostCents,
  overageSeats,
  seatsRemaining,
  seatsUsed,
  totalSeats,
} from "@/lib/seats";

const angel = planById("angel")!;
const syndicate = planById("syndicate")!;
const institution = planById("institution")!;

describe("plan catalogue", () => {
  it("maps every purchasable plan to a Polar product", () => {
    for (const plan of PLANS) expect(plan.polarProductId).toBeTruthy();
  });

  it("resolves a Polar product id back to a plan", () => {
    expect(planIdFromPolarProduct(syndicate.polarProductId)).toBe("syndicate");
    expect(planIdFromPolarProduct("not-a-product")).toBeUndefined();
  });

  it("only offers seats on multi-seat plans", () => {
    expect(seatsSupported("angel")).toBe(false);
    expect(seatsSupported("syndicate")).toBe(true);
    expect(seatsSupported("institution")).toBe(true);
  });
});

describe("seat maths", () => {
  it("counts only assigned seat rows, not the owner separately", () => {
    expect(seatsUsed(0)).toBe(0);
    expect(seatsUsed(1)).toBe(1);
    expect(seatsUsed(4)).toBe(4);
  });

  it("never drops below the bundled seat count", () => {
    expect(totalSeats(syndicate, 0)).toBe(5);
    expect(totalSeats(syndicate, 8)).toBe(8);
    expect(totalSeats(syndicate, null)).toBe(5);
  });

  it("reports remaining seats and stops at zero", () => {
    expect(seatsRemaining(syndicate, 5, 0)).toBe(4);
    expect(seatsRemaining(syndicate, 5, 4)).toBe(0);
    expect(seatsRemaining(syndicate, 5, 9)).toBe(0);
  });

  it("flags overage beyond the purchased seats", () => {
    expect(overageSeats(syndicate, 5, 4)).toBe(0);
    expect(overageSeats(syndicate, 5, 6)).toBe(2);
    expect(overageCostCents(syndicate, 5, 6)).toBe(5800);
    expect(overageCostCents(institution, 20, 40)).toBe(0);
  });

  it("enforces the hard plan ceiling", () => {
    expect(atSeatLimit(angel, 0)).toBe(true);
    expect(atSeatLimit(syndicate, 10)).toBe(false);
    expect(atSeatLimit(syndicate, 24)).toBe(true);
    expect(atSeatLimit(institution, 5000)).toBe(false);
  });

  it("blocks seat invites on single-seat plans and at the ceiling", () => {
    expect(canAddSeat(angel, 0)).toBe(false);
    expect(canAddSeat(syndicate, 3)).toBe(true);
    expect(canAddSeat(syndicate, 24)).toBe(false);
    expect(canAddSeat(institution, 999)).toBe(true);
  });
});
