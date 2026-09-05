import { formatDate, formatHours, formatPrice } from "../lib/format";
import type { AnyOrder } from "../types";

const statusLabels: Record<string, string> = {
  mottagen: "Mottagen",
  i_produktion: "I produktion",
  skickad: "Skickad",
  levererad: "Levererad",
};

/** Visar en order både på bekräftelsesidan och i orderspårningen. */
export function OrderSummary({ order }: { order: AnyOrder }) {
  return (
    <div className="panel">
      <div className="spread">
        <div>
          <span className="field-label">Ordernummer</span>
          <div className="order-id">{order.id}</div>
        </div>
        <span className="badge badge-accent">
          {statusLabels[order.status] ?? order.status}
        </span>
      </div>
      <p className="dim" style={{ fontSize: "0.86rem", marginTop: 8 }}>
        Lagd {formatDate(order.createdAt)}
      </p>

      {order.type === "shop" ? (
        <div style={{ marginTop: 18 }}>
          {order.lines.map((line) => (
            <div
              className="summary-row"
              key={`${line.productId}-${line.color}-${line.size ?? ""}`}
            >
              <span>
                {line.quantity} × {line.name}
                <br />
                <span className="dim" style={{ fontSize: "0.82rem" }}>
                  {line.color}
                  {line.size ? ` · ${line.size}` : ""}
                </span>
              </span>
              <span>{formatPrice(line.unitPrice * line.quantity)}</span>
            </div>
          ))}
          <div className="summary-row">
            <span>Frakt</span>
            <span>
              {order.shipping === 0 ? "Fri" : formatPrice(order.shipping)}
            </span>
          </div>
          <div className="summary-row total">
            <span>Totalt</span>
            <span>{formatPrice(order.total)}</span>
          </div>
        </div>
      ) : (
        <div style={{ marginTop: 18 }}>
          <h3>{order.projectName}</h3>
          <p className="muted" style={{ fontSize: "0.93rem" }}>
            {order.description}
          </p>
          <table className="spec-table">
            <tbody>
              <tr>
                <th>Fil</th>
                <td>{order.fileName ?? "Skickas separat"}</td>
              </tr>
              <tr>
                <th>Material</th>
                <td>{order.request.material.toUpperCase()}</td>
              </tr>
              <tr>
                <th>Kvalitet</th>
                <td>{order.request.quality}</td>
              </tr>
              <tr>
                <th>Volym / fyllnad</th>
                <td>
                  {order.request.volumeCm3} cm³ · {order.request.infill} %
                </td>
              </tr>
              <tr>
                <th>Antal</th>
                <td>{order.request.quantity} st</td>
              </tr>
              <tr>
                <th>Beräknad printtid</th>
                <td>{formatHours(order.quote.estimatedPrintHours)}</td>
              </tr>
              <tr>
                <th>Leverans</th>
                <td>{order.quote.estimatedDeliveryDays} arbetsdagar</td>
              </tr>
            </tbody>
          </table>
          <div className="summary-row total">
            <span>Totalt</span>
            <span>{formatPrice(order.total)}</span>
          </div>
        </div>
      )}

      <div
        style={{
          marginTop: 20,
          borderTop: "1px solid var(--border)",
          paddingTop: 16,
        }}
      >
        <span className="field-label">Levereras till</span>
        <p className="muted" style={{ margin: "6px 0 0", fontSize: "0.92rem" }}>
          {order.customer.name}
          <br />
          {order.customer.address}
          <br />
          {order.customer.postalCode} {order.customer.city}
          <br />
          {order.customer.email}
        </p>
      </div>
    </div>
  );
}
