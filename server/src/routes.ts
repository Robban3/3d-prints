import { Router } from "express";
import type { RequestHandler } from "express";
import { categories, productBySlug, products } from "./data/products.ts";
import { materials, qualities } from "./data/materials.ts";
import { calculateQuote, QUOTE_LIMITS } from "./pricing.ts";
import {
  FREE_SHIPPING_THRESHOLD,
  SHIPPING_FEE,
  shippingFor,
} from "./shipping.ts";
import { findOrder, generateOrderNumber, saveOrder } from "./store.ts";
import {
  ValidationError,
  parseCustomer,
  parseOrderLines,
  parseQuoteRequest,
} from "./validation.ts";
import type { CustomOrder, Order } from "./types.ts";

export const api = Router();

/**
 * Express 4 fångar inte avvisade promises från async-handlers, så asynkrona
 * rutter lindas för att skicka vidare felet till felhanteraren.
 */
function wrap(handler: RequestHandler): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

api.get("/health", (_req, res) => {
  res.json({ status: "ok", products: products.length });
});

api.get("/config", (_req, res) => {
  res.json({
    materials,
    qualities,
    categories,
    quoteLimits: QUOTE_LIMITS,
    shipping: { fee: SHIPPING_FEE, freeThreshold: FREE_SHIPPING_THRESHOLD },
  });
});

api.get("/products", (req, res) => {
  const category =
    typeof req.query.category === "string" ? req.query.category : undefined;
  const search =
    typeof req.query.search === "string"
      ? req.query.search.toLowerCase().trim()
      : "";

  let result = products;
  if (category && category !== "alla") {
    result = result.filter((product) => product.category === category);
  }
  if (search) {
    result = result.filter((product) =>
      [product.name, product.tagline, product.description]
        .join(" ")
        .toLowerCase()
        .includes(search),
    );
  }
  res.json({ products: result, total: result.length });
});

api.get("/products/:slug", (req, res) => {
  const product = productBySlug.get(req.params.slug ?? "");
  if (!product) {
    res.status(404).json({ error: "Produkten hittades inte" });
    return;
  }
  const related = products
    .filter((p) => p.id !== product.id && p.category === product.category)
    .slice(0, 3);
  res.json({ product, related });
});

api.post("/quote", (req, res) => {
  const request = parseQuoteRequest(req.body);
  res.json({ request, quote: calculateQuote(request) });
});

api.post(
  "/orders",
  wrap(async (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const customer = parseCustomer(body.customer);
    const lines = parseOrderLines(body.lines);

    const subtotal = lines.reduce(
      (sum, line) => sum + line.unitPrice * line.quantity,
      0,
    );
    const shipping = shippingFor(subtotal);

    const order: Order = {
      id: generateOrderNumber("S"),
      type: "shop",
      createdAt: new Date().toISOString(),
      status: "mottagen",
      customer,
      lines,
      subtotal,
      shipping,
      total: subtotal + shipping,
    };

    await saveOrder(order);
    res.status(201).json({ order });
  }),
);

api.post(
  "/custom-orders",
  wrap(async (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const customer = parseCustomer(body.customer);
    const request = parseQuoteRequest(body.request);

    const projectName = String(body.projectName ?? "").trim();
    const description = String(body.description ?? "").trim();
    const errors: Record<string, string> = {};
    if (projectName.length < 2) errors.projectName = "Ge projektet ett namn.";
    if (description.length < 10)
      errors.description = "Beskriv vad du vill ha printat (minst 10 tecken).";
    const fileName = String(body.fileName ?? "").trim();
    if (fileName && !/\.(stl|obj|3mf|step|stp|f3d)$/i.test(fileName)) {
      errors.fileName = "Filen ska vara STL, OBJ, 3MF, STEP eller F3D.";
    }
    if (Object.keys(errors).length > 0) throw new ValidationError(errors);

    const quote = calculateQuote(request);
    const order: CustomOrder = {
      id: generateOrderNumber("C"),
      type: "custom",
      createdAt: new Date().toISOString(),
      status: "mottagen",
      customer,
      request,
      projectName,
      fileName: fileName || undefined,
      description,
      quote,
      total: quote.total,
    };

    await saveOrder(order);
    res.status(201).json({ order });
  }),
);

api.get(
  "/orders/:id",
  wrap(async (req, res) => {
    const order = await findOrder(req.params.id ?? "");
    if (!order) {
      res.status(404).json({ error: "Ordern hittades inte" });
      return;
    }
    res.json({ order });
  }),
);
