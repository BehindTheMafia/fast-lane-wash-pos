import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import {
  BusinessLine,
  BUSINESS_LINE_STORAGE_KEY,
  parseBusinessLine,
} from "@/lib/businessLine";

interface BusinessLineContextValue {
  businessLine: BusinessLine;
  setBusinessLine: (line: BusinessLine) => void;
  isCarWash: boolean;
  isBarbershop: boolean;
}

const BusinessLineContext = createContext<BusinessLineContextValue | null>(null);

export function BusinessLineProvider({ children }: { children: ReactNode }) {
  const [businessLine, setBusinessLineState] = useState<BusinessLine>(() => {
    if (typeof window === "undefined") return "car_wash";
    return parseBusinessLine(localStorage.getItem(BUSINESS_LINE_STORAGE_KEY));
  });

  const setBusinessLine = (line: BusinessLine) => {
    setBusinessLineState(line);
    localStorage.setItem(BUSINESS_LINE_STORAGE_KEY, line);
  };

  useEffect(() => {
    localStorage.setItem(BUSINESS_LINE_STORAGE_KEY, businessLine);
  }, [businessLine]);

  return (
    <BusinessLineContext.Provider
      value={{
        businessLine,
        setBusinessLine,
        isCarWash: businessLine === "car_wash",
        isBarbershop: businessLine === "barbershop",
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
