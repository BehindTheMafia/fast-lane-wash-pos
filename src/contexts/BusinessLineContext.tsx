import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import {
  BusinessLine,
  BUSINESS_LINE_STORAGE_KEY,
  parseBusinessLine,
} from "@/lib/businessLine";
import { supabase } from "@/integrations/supabase/client";

interface BusinessLineContextValue {
  businessLine: BusinessLine;
  setBusinessLine: (line: BusinessLine) => void;
  isCarWash: boolean;
  isBarbershop: boolean;
  carWashVisible: boolean;
  barbershopVisible: boolean;
  updateVisibilities: (carWash: boolean, barbershop: boolean) => Promise<void>;
}

const BusinessLineContext = createContext<BusinessLineContextValue | null>(null);

const parseVisibility = (emailStr: string | null) => {
  const result = { carWash: true, barbershop: true };
  if (!emailStr || !emailStr.startsWith("modules:")) return result;
  const parts = emailStr.replace("modules:", "").split(",");
  parts.forEach(part => {
    const [key, val] = part.split("=");
    if (key === "car_wash") result.carWash = val === "true";
    if (key === "barbershop") result.barbershop = val === "true";
  });
  return result;
};

export function BusinessLineProvider({ children }: { children: ReactNode }) {
  const [carWashVisible, setCarWashVisibleState] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    return localStorage.getItem("car_wash_visible") !== "false";
  });

  const [barbershopVisible, setBarbershopVisibleState] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    return localStorage.getItem("barbershop_visible") !== "false";
  });

  const [businessLine, setBusinessLineState] = useState<BusinessLine>(() => {
    if (typeof window === "undefined") return "car_wash";
    const initial = parseBusinessLine(localStorage.getItem(BUSINESS_LINE_STORAGE_KEY));
    const isCarWashVis = localStorage.getItem("car_wash_visible") !== "false";
    const isBarberVis = localStorage.getItem("barbershop_visible") !== "false";
    if (!isCarWashVis && isBarberVis) return "barbershop";
    if (!isBarberVis && isCarWashVis) return "car_wash";
    return initial;
  });

  const setBusinessLine = (line: BusinessLine) => {
    setBusinessLineState(line);
    localStorage.setItem(BUSINESS_LINE_STORAGE_KEY, line);
  };

  useEffect(() => {
    localStorage.setItem(BUSINESS_LINE_STORAGE_KEY, businessLine);
  }, [businessLine]);

  // Load from DB on mount
  useEffect(() => {
    let active = true;
    async function loadVisibilities() {
      try {
        const { data, error } = await supabase
          .from("business_settings")
          .select("email")
          .eq("business_line", "car_wash")
          .maybeSingle();

        if (error) {
          console.error("Error loading visibilities from DB:", error);
          return;
        }

        if (data?.email && data.email.startsWith("modules:")) {
          const parsed = parseVisibility(data.email);
          if (active) {
            setCarWashVisibleState(parsed.carWash);
            setBarbershopVisibleState(parsed.barbershop);
            localStorage.setItem("car_wash_visible", String(parsed.carWash));
            localStorage.setItem("barbershop_visible", String(parsed.barbershop));
            
            // Adjust current business line if needed
            if (!parsed.carWash && parsed.barbershop) {
              setBusinessLineState("barbershop");
            } else if (!parsed.barbershop && parsed.carWash) {
              setBusinessLineState("car_wash");
            }
          }
        }
      } catch (err) {
        console.error("Failed to load visibilities:", err);
      }
    }
    loadVisibilities();
    return () => {
      active = false;
    };
  }, []);

  const updateVisibilities = async (carWash: boolean, barbershop: boolean) => {
    setCarWashVisibleState(carWash);
    setBarbershopVisibleState(barbershop);
    localStorage.setItem("car_wash_visible", String(carWash));
    localStorage.setItem("barbershop_visible", String(barbershop));

    // Force business line change if one is disabled
    if (!carWash && barbershop) {
      setBusinessLineState("barbershop");
      localStorage.setItem(BUSINESS_LINE_STORAGE_KEY, "barbershop");
    } else if (!barbershop && carWash) {
      setBusinessLineState("car_wash");
      localStorage.setItem(BUSINESS_LINE_STORAGE_KEY, "car_wash");
    }

    try {
      const emailVal = `modules:car_wash=${carWash},barbershop=${barbershop}`;
      const { error } = await supabase
        .from("business_settings")
        .update({ email: emailVal })
        .eq("business_line", "car_wash");
      if (error) {
        console.error("Error saving visibilities to DB:", error);
      }
    } catch (err) {
      console.error("Failed to save visibilities to DB:", err);
    }
  };

  return (
    <BusinessLineContext.Provider
      value={{
        businessLine,
        setBusinessLine,
        isCarWash: businessLine === "car_wash",
        isBarbershop: businessLine === "barbershop",
        carWashVisible,
        barbershopVisible,
        updateVisibilities,
      }}
    >
      {children}
    </BusinessLineContext.Provider>
  );
}

export function useBusinessLine() {
  const ctx = useContext(BusinessLineContext);
  if (!ctx) {
    throw new Error("useBusinessLine must be used within BusinessLineProvider");
  }
  return ctx;
}
