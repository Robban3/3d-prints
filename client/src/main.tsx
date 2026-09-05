import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./App";
import { CartProvider } from "./lib/cart";
import "./styles.css";

const container = document.getElementById("root");
if (!container) throw new Error("Hittade inte #root");

createRoot(container).render(
  <StrictMode>
    <BrowserRouter>
      <CartProvider>
        <App />
      </CartProvider>
    </BrowserRouter>
  </StrictMode>,
);
