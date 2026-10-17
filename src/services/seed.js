import { orderTotalCents } from "../domain/money.js";

export function createSeed(now = new Date()) {
  const customers = [
    ["cus_01", "Olivia Rhye", "olivia@atlas.example", "Atlas Studio"],
    ["cus_02", "Phoenix Baker", "phoenix@layers.example", "Layers"],
    ["cus_03", "Lana Steiner", "lana@sisyphus.example", "Sisyphus"],
    ["cus_04", "Demi Wilkinson", "demi@catalog.example", "Catalog"],
    ["cus_05", "Drew Cano", "drew@circooles.example", "Circooles"],
    ["cus_06", "Natali Craig", "natali@hourglass.example", "Hourglass"],
    ["cus_07", "Andi Lane", "andi@quotient.example", "Quotient"],
    ["cus_08", "Kate Morrison", "kate@northstar.example", "Northstar"],
  ].map(([id, name, email, company]) => ({ id, name, email, company }));
  const products = [
    ["Business plan · monthly", 7900],
    ["Team plan · monthly", 2900],
    ["Business plan · annual", 79000],
    ["Onboarding workshop", 24900],
  ];
  const orders = Array.from({ length: 32 }, (_, index) => {
    const [name, unitPriceCents] = products[index % products.length];
    const items = [{ name, unitPriceCents, quantity: index % 5 === 0 ? 2 : 1 }];
    const date = new Date(now);
    date.setUTCDate(date.getUTCDate() - index * 2);
    date.setUTCHours(10 + (index % 8), 15, 0, 0);
    return {
      id: `NX-${1048 - index}`,
      customerId: customers[index % customers.length].id,
      status: index % 11 === 0 ? "cancelled" : index % 4 === 0 ? "pending" : "paid",
      createdAt: date.toISOString(),
      currency: "USD",
      items,
      totalCents: orderTotalCents(items),
    };
  });
  return { customers, orders };
}
