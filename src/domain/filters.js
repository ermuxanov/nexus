export function filterOrders(
  orders,
  { search = "", status = "all", startDate = "", endDate = "" } = {},
  customers = [],
) {
  const query = search.trim().toLowerCase();
  const customerNames = new Map(customers.map((customer) => [customer.id, customer.name.toLowerCase()]));
  return orders.filter((order) => {
    const day = order.createdAt.slice(0, 10);
    return (
      (status === "all" || order.status === status) &&
      (!startDate || day >= startDate) &&
      (!endDate || day <= endDate) &&
      (!query || `${order.id} ${customerNames.get(order.customerId) || ""}`.toLowerCase().includes(query))
    );
  });
}
