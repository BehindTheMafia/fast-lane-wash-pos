# Changelog — 2026-08-25

## Commit: `ba3cbb2`

**feat(loyalty): sistema de puntos y recompensas v3 con opciones de canje**

---

## Resumen

Implementación completa del sistema de recompensas con opciones de selección para el programa de lealtad V3. Los clientes ahora pueden elegir entre 2 opciones de recompensa al alcanzar hitos específicos (5 lavadas), mientras que las recompensas de 9 lavadas permanecen fijas.

---

## Archivos modificados

| Archivo | Cambios | Descripción |
|---------|---------|-------------|
| `src/hooks/useLoyaltyV3.tsx` | +95 | Types actualizados, nueva función `useSelectRewardOption`, soporte para `option_group` |
| `src/components/loyalty/RewardOptionModal.tsx` | +193 | **Nuevo** — Modal de selección de opciones de recompensa |
| `src/components/loyalty/LoyaltyProgramCard.tsx` | +202 | Mostrar opciones de selección para milestones tipo `choice` |
| `src/components/loyalty/LoyaltyHistory.tsx` | +5 | Integración con opciones seleccionadas |
| `src/components/loyalty/RewardBlockModal.tsx` | +9 | Lógica de bloqueo actualizada |
| `src/components/pos/LoyaltySelector.tsx` | +534 | Selector de recompensas con soporte para descuentos parciales (40%) |
| `src/components/pos/CarWashPOS.tsx` | +52 | Integración del sistema de selección en POS |
| `src/components/pos/TicketPrint.tsx` | +30 | Información de puntos y recompensas en tickets |
| `src/pages/Loyalty.tsx` | +1 | Import de componentes actualizados |
| `src/pages/Reports.tsx` | +23 | Métricas de canje y distinción visual |
| `src/utils/bluetoothPrinter.ts` | +28 | Soporte para impresión de tickets de puntos |
| `ROADMAP.md` | +827 | **Nuevo** — Documentación del plan de implementación |

---

## Archivos nuevos

### `src/components/loyalty/RewardOptionModal.tsx`
Modal que permite al cliente seleccionar entre 2 opciones de recompensa:
- Muestra las opciones disponibles con tema del programa
- Validación de selección antes de confirmar
- Manejo de errores y estados de carga
- Integración con `useSelectRewardOption` mutation

### `supabase/migrations/20260825000000_loyalty_reward_choices.sql`
Migración completa del sistema de opciones:

**Fase 1: Estructura de datos**
- Nuevas columnas en `loyalty_rewards`: `option_group`, `option_slug`, `selected_option`, `selected_at`
- Índice para búsqueda por `option_group`
- Actualización de `loyalty_programs.rewards` con estructura de milestones

**Fase 2: RPC `record_loyalty_v3_wash`**
- Genera 2 recompensas para milestones tipo `choice`
- Maneja ciclos y reinicio automático
- Retorna información completa del progreso

**Fase 3: RPC `select_reward_option`**
- Valida propiedad y estado de la recompensa
- Marca opción seleccionada
- Expira alternativas del mismo grupo

**Fase 4: RPC `validate_loyalty_redemption`**
- Soporte para `discount_percent` < 100
- Validación de servicio contra `service_name_like`
- Compatible con estructura legacy

### `ROADMAP.md`
Documentación completa del plan de implementación:
- Arquitectura actual del sistema
- Especificación de cambios por módulo
- Flujo de datos y diagramas
- Estrategia de testing
- Cronograma de implementación

---

## Cambios técnicos principales

### 1. Estructura de datos

**Antes:**
```json
{
  "at": 5,
  "type": "fixed",
  "reward": "Lavado Nitido GRATIS",
  "reward_slug": "nitido_gratis",
  "service_name_like": "Nitido"
}
```

**Ahora:**
```json
{
  "at": 5,
  "type": "choice",
  "options": [
    {
      "reward": "Lavado Nitido GRATIS",
      "reward_slug": "nitido_gratis",
      "service_name_like": "Nitido",
      "discount_percent": 100,
      "target_service_slug": null
    },
    {
      "reward": "40% Descuento en Lavado Premium",
      "reward_slug": "nitido_40pct_premium",
      "service_name_like": "Premium",
      "discount_percent": 40,
      "target_service_slug": "premium"
    }
  ]
}
```

### 2. Flujo de selección

```
Cliente alcanza 5 lavadas
    ↓
Sistema genera 2 recompensas (mismo option_group)
    ↓
Cliente abre modal de selección
    ↓
Selecciona 1 opción
    ↓
RPC select_reward_option:
  - Marca opción seleccionada
  - Expira alternativa
    ↓
Recompensa lista para canje
```

### 3. Soporte para descuentos parciales

- **100% descuento**: Lavado gratis (antes era la única opción)
- **40% descuento**: Descuento parcial en servicio premium
- Validación dinámica según `discount_percent` en la definición

---

## Configuración de programas

### Programa Premium (slug: `premium`)
- **5 lavadas**: Choice entre:
  - Lavado Nitido GRATIS (100%)
  - 40% Descuento en Lavado Premium
- **9 lavadas**: Fixed - Tratamiento Ceramico GRATIS (100%)

### Programa Nitido (slug: `nitido`)
- **5 lavadas**: Choice entre:
  - Lavado Breve GRATIS (100%)
  - 40% Descuento en Lavado Nitido
- **9 lavadas**: Fixed - Pasteado Meguiar GRATIS (100%)

---

## Funcionalidades adicionales

### Integración en POS
- Selector actualizado que muestra opciones de descuento
- Validación de servicio según recompensa seleccionada
- Soporte para混合pagos con descuentos parciales

### Tickets
- Información de puntos acumulados
- Detalle de recompensa canjeada
- Descuento aplicado visible

### Reportes
- Métricas de canje por tipo (choice/fixed)
- Distinción visual entre recompensas
- Tasa de conversión de selección

---

## Notas técnicas

- **Compatibilidad hacia atrás**: La migración preserva estructura legacy
- **Transacciones**: Todas las operaciones de selección son atómicas
- **Permisos**: RPCs requieren rol `authenticated`
- **Índices**: Optimización para búsquedas por `option_group`

---

## Próximos pasos

1. Testing completo del flujo de selección
2. Verificación de impresión en bluetooth
3. Validación de reportes con datos reales
4. Monitoreo de rendimiento de RPCs

---

**Autor:** JosueTercero95i  
**Fecha:** 2026-08-25  
**Rama:** main  
**Estado:** Completado