-- Asignar el servicio Premium (id=16) al programa de lealtad Premium
UPDATE public.services SET loyalty_program = 'premium'
WHERE id = 16 AND business_line = 'car_wash';
