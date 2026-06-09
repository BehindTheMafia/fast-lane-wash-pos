import { useBusinessLine } from "@/contexts/BusinessLineContext";
import CarWashPOS from "@/components/pos/CarWashPOS";
import BarbershopPOS from "@/components/pos/BarbershopPOS";

export default function POS() {
  const { isBarbershop } = useBusinessLine();
  return isBarbershop ? <BarbershopPOS /> : <CarWashPOS />;
}
