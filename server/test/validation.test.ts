import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import {
  ValidationError,
  parseCustomer,
  parseOrderLines,
  parseQuoteRequest,
} from "../src/validation.ts";
import { products } from "../src/data/products.ts";

const validCustomer = {
  name: "Anna Andersson",
  email: "anna@example.com",
  address: "Storgatan 1",
  postalCode: "112 34",
  city: "Stockholm",
};

describe("parseCustomer", () => {
  it("normaliserar postnummer och behåller uppgifterna", () => {
    const customer = parseCustomer(validCustomer);
    assert.equal(customer.postalCode, "11234");
    assert.equal(customer.name, "Anna Andersson");
  });

  it("pekar ut felaktiga fält", () => {
    try {
      parseCustomer({
        ...validCustomer,
        email: "inte-en-mejl",
        postalCode: "12",
      });
      assert.fail("förväntade ValidationError");
    } catch (error) {
      assert.ok(error instanceof ValidationError);
      assert.ok(error.fields["customer.email"]);
      assert.ok(error.fields["customer.postalCode"]);
    }
  });
});

describe("parseOrderLines", () => {
  const product = products[0]!;

  it("hämtar priset från katalogen och ignorerar klientens pris", () => {
    const lines = parseOrderLines([
      {
        productId: product.id,
        quantity: 2,
        color: product.colors[0],
        unitPrice: 1,
      },
    ]);
    assert.equal(lines.length, 1);
    assert.equal(
      lines[0]!.unitPrice,
      product.price + product.sizes![0]!.priceDelta,
    );
  });

  it("lägger till storlekstillägg", () => {
    const large = product.sizes!.at(-1)!;
    const lines = parseOrderLines([
      {
        productId: product.id,
        quantity: 1,
        color: product.colors[0],
        size: large.id,
      },
    ]);
    assert.equal(lines[0]!.unitPrice, product.price + large.priceDelta);
  });

  it("avvisar tom varukorg", () => {
    assert.throws(() => parseOrderLines([]), ValidationError);
  });

  it("avvisar okänd produkt och ogiltig färg", () => {
    assert.throws(
      () => parseOrderLines([{ productId: "saknas", quantity: 1 }]),
      ValidationError,
    );
    assert.throws(
      () =>
        parseOrderLines([
          { productId: product.id, quantity: 1, color: "Neonrosa" },
        ]),
      ValidationError,
    );
  });

  it("avvisar orimliga antal", () => {
    assert.throws(
      () => parseOrderLines([{ productId: product.id, quantity: 0 }]),
      ValidationError,
    );
    assert.throws(
      () => parseOrderLines([{ productId: product.id, quantity: 500 }]),
      ValidationError,
    );
  });
});

describe("parseQuoteRequest", () => {
  const valid = {
    material: "petg",
    quality: "fin",
    volumeCm3: 80,
    infill: 30,
    quantity: 3,
    rush: false,
    postProcessing: true,
  };

  it("tar emot en giltig förfrågan", () => {
    const request = parseQuoteRequest(valid);
    assert.equal(request.material, "petg");
    assert.equal(request.postProcessing, true);
  });

  it("avvisar värden utanför gränserna", () => {
    assert.throws(
      () => parseQuoteRequest({ ...valid, volumeCm3: 99999 }),
      ValidationError,
    );
    assert.throws(
      () => parseQuoteRequest({ ...valid, infill: 300 }),
      ValidationError,
    );
    assert.throws(
      () => parseQuoteRequest({ ...valid, material: "guld" }),
      ValidationError,
    );
  });
});
