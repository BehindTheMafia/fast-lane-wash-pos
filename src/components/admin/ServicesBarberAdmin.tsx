import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAllBarberServices } from "@/hooks/useServices";
import { useAllProducts } from "@/hooks/useProducts";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

const BARBER_ICONS = [
  "fa-scissors", "fa-user", "fa-face-smile", "fa-eye", "fa-spray-can",
  "fa-bottle-droplet", "fa-jar", "fa-pump-soap", "fa-star",
];

type BarberTab = "services" | "products";

export default function ServicesBarberAdmin() {
  const qc = useQueryClient();
  const { profile } = useAuth();
  const isAdmin = profile?.role === "admin" || profile?.role === "owner";

  const { data: services, isLoading: svcsLoading } = useAllBarberServices();
  const { data: products, isLoading: prodLoading } = useAllProducts();

  const [tab, setTab] = useState<BarberTab>("services");
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  const [svcEditing, setSvcEditing] = useState<"new" | Record<string, unknown> | null>(null);
  const [svcForm, setSvcForm] = useState({
    name: "",
    description: "",
    icon: "fa-scissors",
    base_price: "0",
  });

  const [prodEditing, setProdEditing] = useState<"new" | Record<string, unknown> | null>(null);
  const [prodForm, setProdForm] = useState({
    name: "",
    description: "",
    sku: "",
    price: "0",
    stock_quantity: "0",
    min_stock_level: "5",
    icon: "fa-bottle-droplet",
  });
  const [stockAdjust, setStockAdjust] = useState("");

  const showToast = (msg: string, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  };

  const refetch = () => {
    qc.invalidateQueries({ queryKey: ["all_barber_services"] });
    qc.invalidateQueries({ queryKey: ["barber_services"] });
    qc.invalidateQueries({ queryKey: ["all_products"] });
    qc.invalidateQueries({ queryKey: ["products"] });
  };

  const saveService = async () => {
    if (!svcForm.name.trim()) {
      showToast("El nombre es requerido", false);
      return;
    }
    const payload = {
      name: svcForm.name.trim(),
      description: svcForm.description,
      icon: svcForm.icon,
      is_extra: false,
      is_active: true,
      business_line: "barbershop" as const,
      base_price: parseFloat(svcForm.base_price) || 0,
    };
    if (svcEditing === "new") {
      const { error } = await supabase.from("services").insert(payload);
      if (error) {
        showToast(error.message, false);
        return;
      }
    } else if (svcEditing) {
      const { error } = await supabase
        .from("services")
        .update(payload)
        .eq("id", (svcEditing as { id: number }).id);
      if (error) {
        showToast(error.message, false);
        return;
      }
    }
    setSvcEditing(null);
    showToast("Servicio guardado");
    refetch();
  };

  const saveProduct = async () => {
    if (!prodForm.name.trim()) {
      showToast("El nombre es requerido", false);
      return;
    }
    const payload = {
      name: prodForm.name.trim(),
      description: prodForm.description,
      sku: prodForm.sku,
      price: parseFloat(prodForm.price) || 0,
      stock_quantity: parseInt(prodForm.stock_quantity, 10) || 0,
      min_stock_level: parseInt(prodForm.min_stock_level, 10) || 5,
      icon: prodForm.icon,
      is_active: true,
      business_line: "barbershop" as const,
    };
    if (prodEditing === "new") {
      const { error } = await supabase.from("products").insert(payload);
      if (error) {
        showToast(error.message, false);
        return;
      }
    } else if (prodEditing) {
      const { error } = await supabase
        .from("products")
        .update(payload)
        .eq("id", (prodEditing as { id: number }).id);
      if (error) {
        showToast(error.message, false);
        return;
      }
    }
    setProdEditing(null);
    showToast("Producto guardado");
    refetch();
  };

  const adjustStock = async (productId: number) => {
    const delta = parseInt(stockAdjust, 10);
    if (!delta || Number.isNaN(delta)) {
      showToast("Ingresa una cantidad válida", false);
      return;
    }
    const { error } = await supabase.rpc("adjust_product_stock", {
      p_product_id: productId,
      p_delta: delta,
      p_reason: "adjustment",
      p_notes: "Ajuste manual desde admin",
    });
    if (error) {
      showToast(error.message, false);
      return;
    }
    setStockAdjust("");
    showToast("Stock actualizado");
    refetch();
  };

  return (
    <div className="space-y-6">
      <div className="flex gap-1 bg-muted/30 p-1 rounded-xl w-fit">
        <button
          type="button"
          onClick={() => setTab("services")}
          className={`px-4 py-2 rounded-lg text-sm font-semibold ${tab === "services" ? "bg-background shadow-sm" : "text-muted-foreground"}`}
        >
          <i className="fa-solid fa-scissors mr-2" />
          Servicios
        </button>
        <button
          type="button"
          onClick={() => setTab("products")}
          className={`px-4 py-2 rounded-lg text-sm font-semibold ${tab === "products" ? "bg-background shadow-sm" : "text-muted-foreground"}`}
        >
          <i className="fa-solid fa-box mr-2" />
          Productos
        </button>
      </div>

      {tab === "services" && (
        <div className="space-y-4">
          {isAdmin && (
            <button
              type="button"
              onClick={() => {
                setSvcEditing("new");
                setSvcForm({ name: "", description: "", icon: "fa-scissors", base_price: "0" });
              }}
              className="touch-btn bg-accent text-accent-foreground px-4 py-2 rounded-xl font-semibold"
            >
              <i className="fa-solid fa-plus mr-2" />
              Nuevo servicio
            </button>
          )}
          {svcEditing && (
            <div className="pos-card p-5 space-y-3">
              <input
                className="input-touch w-full"
                placeholder="Nombre"
                value={svcForm.name}
                onChange={(e) => setSvcForm({ ...svcForm, name: e.target.value })}
              />
              <input
                className="input-touch w-full"
                placeholder="Descripción"
                value={svcForm.description}
                onChange={(e) => setSvcForm({ ...svcForm, description: e.target.value })}
              />
              <input
                type="number"
                className="input-touch w-full"
                placeholder="Precio C$"
                value={svcForm.base_price}
                onChange={(e) => setSvcForm({ ...svcForm, base_price: e.target.value })}
              />
              <div className="flex flex-wrap gap-2">
                {BARBER_ICONS.map((ic) => (
                  <button
                    key={ic}
                    type="button"
                    onClick={() => setSvcForm({ ...svcForm, icon: ic })}
                    className={`w-10 h-10 rounded-lg border ${svcForm.icon === ic ? "border-primary" : "border-border"}`}
                  >
                    <i className={`fa-solid ${ic}`} />
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={saveService} className="btn-cobrar px-4 py-2 text-sm">
                  Guardar
                </button>
                <button type="button" onClick={() => setSvcEditing(null)} className="touch-btn px-4 py-2 border rounded-xl text-sm">
                  Cancelar
                </button>
              </div>
            </div>
          )}
          {svcsLoading ? (
            <i className="fa-solid fa-spinner fa-spin text-accent" />
          ) : (
            services?.map((svc) => (
              <div key={svc.id} className="pos-card p-4 flex justify-between items-center">
                <div>
                  <p className="font-bold">{svc.name}</p>
                  <p className="text-sm text-primary">C${Number(svc.base_price ?? 0).toFixed(0)}</p>
                </div>
                {isAdmin && (
                  <button
                    type="button"
                    onClick={() => {
                      setSvcEditing(svc);
                      setSvcForm({
                        name: svc.name,
                        description: svc.description || "",
                        icon: svc.icon || "fa-scissors",
                        base_price: String(svc.base_price ?? 0),
                      });
                    }}
                    className="touch-btn p-2 text-secondary"
                  >
                    <i className="fa-solid fa-pen" />
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {tab === "products" && (
        <div className="space-y-4">
          {isAdmin && (
            <button
              type="button"
              onClick={() => {
                setProdEditing("new");
                setProdForm({
                  name: "",
                  description: "",
                  sku: "",
                  price: "0",
                  stock_quantity: "0",
                  min_stock_level: "5",
                  icon: "fa-bottle-droplet",
                });
              }}
              className="touch-btn bg-accent text-accent-foreground px-4 py-2 rounded-xl font-semibold"
            >
              <i className="fa-solid fa-plus mr-2" />
              Nuevo producto
            </button>
          )}
          {prodEditing && (
            <div className="pos-card p-5 space-y-3">
              <input className="input-touch w-full" placeholder="Nombre" value={prodForm.name} onChange={(e) => setProdForm({ ...prodForm, name: e.target.value })} />
              <input className="input-touch w-full" placeholder="SKU" value={prodForm.sku} onChange={(e) => setProdForm({ ...prodForm, sku: e.target.value })} />
              <input type="number" className="input-touch w-full" placeholder="Precio" value={prodForm.price} onChange={(e) => setProdForm({ ...prodForm, price: e.target.value })} />
              <input type="number" className="input-touch w-full" placeholder="Stock inicial" value={prodForm.stock_quantity} onChange={(e) => setProdForm({ ...prodForm, stock_quantity: e.target.value })} />
              <input type="number" className="input-touch w-full" placeholder="Alerta stock mín." value={prodForm.min_stock_level} onChange={(e) => setProdForm({ ...prodForm, min_stock_level: e.target.value })} />
              <div className="flex gap-2">
                <button type="button" onClick={saveProduct} className="btn-cobrar px-4 py-2 text-sm">Guardar</button>
                <button type="button" onClick={() => setProdEditing(null)} className="touch-btn px-4 py-2 border rounded-xl text-sm">Cancelar</button>
              </div>
            </div>
          )}
          {prodLoading ? (
            <i className="fa-solid fa-spinner fa-spin text-accent" />
          ) : (
            products?.map((prod) => (
              <div key={prod.id} className="pos-card p-4 space-y-2">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-bold">{prod.name}</p>
                    <p className="text-sm">C${Number(prod.price).toFixed(0)} · Stock: {prod.stock_quantity}</p>
                    {prod.stock_quantity <= prod.min_stock_level && (
                      <p className="text-xs text-amber-600 font-semibold">Stock bajo</p>
                    )}
                  </div>
                  {isAdmin && (
                    <button
                      type="button"
                      onClick={() => {
                        setProdEditing(prod);
                        setProdForm({
                          name: prod.name,
                          description: prod.description || "",
                          sku: prod.sku || "",
                          price: String(prod.price),
                          stock_quantity: String(prod.stock_quantity),
                          min_stock_level: String(prod.min_stock_level),
                          icon: prod.icon || "fa-bottle-droplet",
                        });
                      }}
                      className="touch-btn p-2"
                    >
                      <i className="fa-solid fa-pen" />
                    </button>
                  )}
                </div>
                {isAdmin && (
                  <div className="flex gap-2 items-center">
                    <input
                      type="number"
                      className="input-touch flex-1 text-sm"
                      placeholder="+/- unidades"
                      value={stockAdjust}
                      onChange={(e) => setStockAdjust(e.target.value)}
                    />
                    <button type="button" onClick={() => adjustStock(prod.id)} className="touch-btn px-3 py-2 bg-secondary text-white rounded-lg text-xs">
                      Ajustar stock
                    </button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {toast && (
        <div className={toast.ok ? "toast-success" : "toast-error"}>{toast.msg}</div>
      )}
    </div>
  );
}
