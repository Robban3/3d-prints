import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { calculateQuote, volumeDiscountRate } from "../src/pricing.ts";
import type { CustomQuoteRequest } from "../src/types.ts";

const base: CustomQuoteRequest = {
  material: "pla",
  quality: "standard",
  volumeCm3: 120,
  infill: 20,
  quantity: 1,
  rush: false,
  postProcessing: false,
};

describe("calculateQuote", () => {
  it("ger ett pris över minimibeloppet för ett normalt jobb", () => {
    const quote = calculateQuote(base);
    assert.ok(
      quote.total >= 149,
      `förväntade minst 149 kr, fick ${quote.total}`,
    );
    assert.equal(quote.setupFee, 95);
    assert.ok(quote.estimatedPrintHours > 0);
  });

  it("tar aldrig mindre än minimibeloppet", () => {
    const quote = calculateQuote({ ...base, volumeCm3: 1, infill: 5 });
    assert.equal(quote.total, 149);
  });

  it("gör dyrare material dyrare", () => {
    const pla = calculateQuote(base).total;
    const resin = calculateQuote({ ...base, material: "resin" }).total;
    assert.ok(resin > pla, `resin (${resin}) borde kosta mer än PLA (${pla})`);
  });

  it("gör finare lagerhöjd dyrare och långsammare", () => {
    const standard = calculateQuote(base);
    const ultrafin = calculateQuote({ ...base, quality: "ultrafin" });
    assert.ok(ultrafin.total > standard.total);
    assert.ok(ultrafin.estimatedPrintHours > standard.estimatedPrintHours);
  });

  it("höjer priset med fyllnadsgraden", () => {
    const low = calculateQuote({ ...base, infill: 10 }).total;
    const high = calculateQuote({ ...base, infill: 100 }).total;
    assert.ok(high > low);
  });

  it("ger lägre styckpris vid större volymer", () => {
    const single = calculateQuote(base);
    const bulk = calculateQuote({ ...base, quantity: 50 });
    assert.ok(bulk.unitPrice < single.unitPrice);
    assert.ok(bulk.volumeDiscount > 0);
  });

  it("lägger på expresstillägg och kortar leveranstiden", () => {
    const normal = calculateQuote(base);
    const rush = calculateQuote({ ...base, rush: true });
    assert.ok(rush.total > normal.total);
    assert.ok(rush.estimatedDeliveryDays < normal.estimatedDeliveryDays);
    assert.ok(rush.rushSurcharge > 0);
  });

  it("debiterar efterbearbetning per enhet", () => {
    const without = calculateQuote({ ...base, quantity: 2 });
    const withPost = calculateQuote({
      ...base,
      quantity: 2,
      postProcessing: true,
    });
    assert.equal(withPost.postProcessingCost, 85);
    assert.ok(withPost.total - without.total >= 170);
  });

  it("kastar fel för okänt material", () => {
    assert.throws(
      () => calculateQuote({ ...base, material: "trä" as never }),
      /Okänt material/,
    );
  });
});

describe("volumeDiscountRate", () => {
  it("trappar upp rabatten med antalet", () => {
    assert.equal(volumeDiscountRate(1), 0);
    assert.equal(volumeDiscountRate(5), 0.04);
    assert.equal(volumeDiscountRate(10), 0.08);
    assert.equal(volumeDiscountRate(20), 0.12);
    assert.equal(volumeDiscountRate(50), 0.18);
    assert.equal(volumeDiscountRate(250), 0.25);
  });
});
