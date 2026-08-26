# Roadmap — Sistema de Recompensas con Opciones

> **Proyecto:** Fast Lane Wash POS
> **Fecha:** 2026-08-25
> **Estado:** Plan de implementación
> **Versión:** 1.0

---

## 1. Resumen de la implementación

El sistema actual V3 de lealtad genera recompensas fijas (una por milestone). La nueva lógica requiere que las recompensas de 5 lavadas sean **elección** (2 opciones, cliente selecciona 1 y la otra queda invalidada), y las de 9 lavadas sean **fijas** (1 sola opción).

**Los 3 módulos afectados:**

- **Reports** — Actualmente NO muestra datos de lealtad. Debe agregar: métricas de canjes, indicador de tickets de canje, distinción visual.
- **Loyalty** — Debe mostrar "Elige tu recompensa" para milestones de tipo choice, modal de selección, y estados visuales actualizados.
- **POS** — Debe manejar recompensas de 40% descuento además de 100%, selector actualizado, bloqueo adaptado.

**Esfuerzo estimado:** 3-4 días
**Riesgo general:** Medio

---

## 2. Arquitectura actual detectada

| Capa | Tecnología | Detalles |
|------|-----------|----------|
| Frontend | React 18 + Vite + TypeScript | TailwindCSS, shadcn/ui, Lucide, FontAwesome |
| State | TanStack React Query v5 | Mutations + query invalidation |
| Backend | Supabase (PostgreSQL) | RPCs (PL/pgSQL SECURITY DEFINER) |
| Routing | React Router v6 | SPA con pages/ |

**Sistema de lealtad (3 generaciones):**

| Versión | Mecanismo | Estado |
|---------|-----------|--------|
| V1/V2 | `customers.loyalty_visits` cada 8 servicios → pasteado gratis | Legacy desactivado |
| **V3 (Activo)** | `loyalty_programs` + `loyalty_progress` + `loyalty_rewards` | **Activo — base de esta implementación** |

**Archivos clave del sistema V3:**

| Archivo | Función |
|---------|---------|
| `supabase/migrations/20260707000000_loyalty_v3_programs.sql` | Tablas, RPCs `record_loyalty_v3_wash`, `redeem_loyalty_reward`, seed |
| `supabase/migrations/20260707010000_loyalty_v3_redemption_flow.sql` | Columnas en tickets, RPC `validate_loyalty_redemption`, vista reportes |
| `src/hooks/useLoyaltyV3.tsx` | Types, hooks, `REWARD_SERVICE_MAP`, `REWARD_BLOCK_MAP` |
| `src/pages/Loyalty.tsx` | Página principal de lealtad |
| `src/pages/Reports.tsx` | Reportes — **actualmente SIN datos de lealtad** |
| `src/components/loyalty/LoyaltyProgramCard.tsx` | Tarjeta de progreso por programa |
| `src/components/loyalty/LoyaltySelector.tsx` | Selector de recompensa en POS |
| `src/components/loyalty/LoyaltyRedemptionModal.tsx` | Modal de confirmación de canje |
| `src/components/loyalty/RewardBlockModal.tsx` | Bloqueo cuando servicio coincide con recompensa |
| `src/components/loyalty/LoyaltyHistory.tsx` | Historial de lavadas y canjes |
| `src/components/loyalty/loyaltyTheme.ts` | Temas visuales por programa |
| `src/components/pos/CarWashPOS.tsx` | POS principal, integración completa con loyalty v3 |
| `src/components/pos/LoyaltySelector.tsx` | Selector de recompensa en POS (área del ticket) |
| `src/components/pos/TicketPrint.tsx` | Impresión de tickets |
| `src/lib/reportsChartData.ts` | Datos para gráficos de reportes |

**Estado actual de cada módulo:**

| Módulo | ¿Muestra datos de lealtad? | Estado |
|--------|---------------------------|--------|
| **Reports** | NO — Solo muestra ventas, membresías, y pagos | Sin cambios necesarios en estructura, solo agregar métricas |
| **Loyalty** | SÍ — Progreso, historial, canjes | Modificar para mostrar opciones de selección |
| **POS** | SÍ — Selector de recompensa, bloqueo, integración | Modificar para soportar 40% y nueva lógica |

---

## 3. Arquitectura propuesta

```
┌──────────────────────────────────────────────────────────────┐
│                        REPORTS                                │
│                                                               │
│  Reports.tsx                                                  │
│  ├── Summary cards: +1 card "Canjes Lealtad"                 │
│  │   ├── Total canjeado (monto original de tickets loyalty)  │
│  │   └── Cantidad de canjes                                  │
│  ├── Ticket table: +columna "Tipo" con badge "Canje"         │
│  │   └── Badge verde para is_loyalty_redemption = true       │
│  └── Detalle: mostrar discount_reason en ticket_items        │
│                                                               │
│  Datos fuente: tickets.is_loyalty_redemption,                 │
│  tickets.loyalty_original_amount,                             │
│  ticket_items.discount_reason                                 │
├──────────────────────────────────────────────────────────────┤
│                        LOYALTY                                │
│                                                               │
│  LoyaltyProgramCard.tsx                                       │
│  ├── Para milestones de tipo "choice" (5 lavadas):           │
│  │   └── Mostrar "🎁 5 lavadas → Elige tu recompensa"       │
│  │       con botón "Elegir" → abre RewardOptionModal         │
│  ├── Para milestones de tipo "fixed" (9 lavadas):            │
│  │   └── Mostrar recompensa fija (comportamiento actual)     │
│  └── Leyenda actualizada con opciones                        │
│                                                               │
│  RewardOptionModal.tsx (NUEVO)                                │
│  ├── Muestra 2 opciones del grupo                             │
│  ├── Selección + confirmación                                │
│  └── Llama select_reward_option RPC                          │
│                                                               │
│  LoyaltyHistory.tsx                                           │
│  └── Columna "Premio" muestra selected_option si aplica      │
├──────────────────────────────────────────────────────────────┤
│                         POS                                   │
│                                                               │
│  LoyaltySelector.tsx                                          │
│  ├── Para rewards con selected_option = "discount_40pct":    │
│  │   └── Aplicar discountPercent: 40 en vez de 100           │
│  ├── Para rewards con selected_option = "free_wash":         │
│  │   └── Comportamiento actual (100%)                        │
│  └── Label "40% Descuento" vs "GRATIS"                      │
│                                                               │
│  CarWashPOS.tsx                                               │
│  ├── handlePaymentComplete: soporte para discountPercent=40  │
│  ├── ticket_items con discount_reason = 'loyalty_redemption' │
│  └── tickets con is_loyalty_redemption = true                │
│                                                               │
│  RewardBlockModal.tsx                                         │
│  └── Mostrar tipo de recompensa (gratis vs 40% descuento)    │
├──────────────────────────────────────────────────────────────┤
│                    SUPABASE (Backend)                          │
│                                                               │
│  loyalty_programs.rewards ← JSONB expandido con type/options │
│  loyalty_rewards ← +option_group, +option_slug,              │
│                    +selected_option, +selected_at             │
│  RPC select_reward_option ← NUEVO                            │
│  RPC record_loyalty_v3_wash ← Actualizado (genera 2 rewards) │
│  RPC validate_loyalty_redemption ← Actualizado (acepta 40%)  │
│  RPC redeem_loyalty_reward ← Sin cambios                     │
└──────────────────────────────────────────────────────────────┘
```

---

## 4. Fases de implementación

### FASE 1 — Modelo de Datos (Migración SQL)

#### Objetivo
Expandir la estructura V3 existente para soportar recompensas con opción múltiple y descuentos parciales.

#### Tareas
1. Crear migración `20260825000000_loyalty_reward_choices.sql`
2. Agregar columnas a `loyalty_rewards`:
   - `option_group` (TEXT, nullable) — identifica grupo de opciones del mismo milestone
   - `option_slug` (TEXT, nullable) — slug de la opción específica
   - `selected_option` (TEXT, nullable) — opción seleccionada por el cliente
   - `selected_at` (TIMESTAMPTZ, nullable) — fecha de selección
3. Actualizar `loyalty_programs.rewards` JSONB:
   - Premium: `type:"choice"` para at=5, `type:"fixed"` para at=9
   - Nítido: `type:"choice"` para at=5, `type:"fixed"` para at=9
4. Crear RPC `select_reward_option(p_reward_id, p_option_slug, p_customer_id)`
5. Agregar índices en `option_group`

#### Archivos afectados
- `supabase/migrations/20260825000000_loyalty_reward_choices.sql` (**NUEVO**)

#### Dependencias
- Ninguna

#### Riesgo: BAJO
- Solo agrega columnas nullable y un RPC nuevo
- No modifica datos existentes

#### Criterios de aceptación
- [ ] Migración ejecuta sin errores
- [ ] `loyalty_rewards` tiene nuevas columnas (nullable)
- [ ] Registros existentes mantienen `option_group = NULL` (compatibilidad)
- [ ] `select_reward_option` funciona correctamente
- [ ] Alternativas se marcan `expired` automáticamente
- [ ] `loyalty_programs.rewards` tiene estructura actualizada

---

### FASE 2 — Backend: Actualizar `record_loyalty_v3_wash`

#### Objetivo
Modificar el RPC para que, al alcanzar un milestone de tipo `choice`, genere 2 recompensas con el mismo `option_group`.

#### Tareas
1. Modificar `record_loyalty_v3_wash()`:
   - Leer campo `type` del reward entry
   - Si `type = "choice"`: iterar `options[]`, crear 2 registros con mismo `option_group`
   - Si `type = "fixed"`: comportamiento actual (1 registro)
   - Asignar `option_slug` a cada recompensa

#### Archivos afectados
- `supabase/migrations/20260825000000_loyalty_reward_choices.sql` (agregar función actualizada)

#### Dependencias
- FASE 1

#### Riesgo: MEDIO
- Modifica RPC core ejecutado en cada venta
- Mitigar con testing exhaustivo

#### Criterios de aceptación
- [ ] Al alcanzar lavada 5: 2 recompensas con mismo `option_group`
- [ ] Al alcanzar lavada 9: 1 recompensa fija
- [ ] `option_slug` coincide con JSONB
- [ ] Duplicación existente sigue funcionando
- [ ] Ciclo se reinicia correctamente

---

### FASE 3 — Backend: Crear `select_reward_option` RPC

#### Objetivo
RPC que permite seleccionar una opción de recompensa de 5 lavadas e invalidar la alternativa.

#### Tareas
1. Crear PL/pgSQL con:
   - Validación: recompensa existe, pertenece al cliente, `status='available'`
   - Validación: tiene `option_group`
   - Marcar `selected_option = p_option_slug`, `selected_at = now()`
   - Buscar otras recompensas del mismo grupo → `status = 'expired'`
   - Retornar `{success, selected_option, reward_name, group_id}`
2. Protección race conditions con `FOR UPDATE`

#### Archivos afectados
- `supabase/migrations/20260825000000_loyalty_reward_choices.sql`

#### Dependencias
- FASE 1

#### Riesgo: MEDIO
- Race condition si 2 cajeros canjean simultáneamente
- Mitigar con `FOR UPDATE` + transacción

#### Criterios de aceptación
- [ ] Selección retorna éxito
- [ ] Alternativa queda `expired`
- [ ] No se puede re-seleccionar
- [ ] Dos solicitudes simultáneas: solo una tiene éxito
- [ ] Recompensa seleccionada puede canjearse después

---

### FASE 4 — Backend: Soporte para descuento 40%

#### Objetivo
Permitir recompensas con `discount_percent = 40` además de las de 100%.

#### Tareas
1. Actualizar `validate_loyalty_redemption()`:
   - Aceptar `discount_percent < 100`
   - Validar servicio contra `target_service_slug`
2. Crear función `apply_loyalty_discount()`:
   - Retorna `{valid, discount_percent, service_name, original_price, discounted_price}`

#### Archivos afectados
- `supabase/migrations/20260825000000_loyalty_reward_choices.sql`

#### Dependencias
- FASE 1

#### Riesgo: BAJO
- Solo agrega validaciones al RPC existente

#### Criterios de aceptación
- [ ] `validate_loyalty_redemption` acepta 40%
- [ ] Descuento se calcula correctamente
- [ ] Solo aplica a servicio definido en `target_service_slug`
- [ ] Cálculo validado en backend

---

### FASE 5 — Frontend: Tipos y Hooks

#### Objetivo
Actualizar tipos TypeScript y hooks para soportar la nueva lógica.

#### Tareas
1. Actualizar `LoyaltyReward` en `useLoyaltyV3.tsx`:
   - Agregar `option_group?: string | null`
   - Agregar `option_slug?: string | null`
   - Agregar `selected_option?: string | null`
   - Agregar `selected_at?: string | null`
2. Actualizar `LoyaltyProgram.rewards` type para soportar `type: "choice" | "fixed"` y `options[]`
3. Crear hook `useSelectRewardOption()`:
   - Mutation que llama a `select_reward_option` RPC
   - Invalida queries de rewards al completar
4. Agregar `REWARD_DISCOUNT_MAP` para mapear reward_slug → discount_percent
5. Actualizar `useAvailableRewards()` para filtrar correctamente

#### Archivos afectados
- `src/hooks/useLoyaltyV3.tsx`

#### Dependencias
- FASE 1, 3

#### Riesgo: BAJO

#### Criterios de aceptación
- [ ] Tipos reflejan nueva estructura
- [ ] `useSelectRewardOption` funciona
- [ ] TypeScript compila sin errores
- [ ] Componentes existentes no se rompen

---

### FASE 6 — Frontend: Modal de Selección de Opción (LOYALTY)

#### Objetivo
Crear componente `RewardOptionModal` para elegir entre 2 opciones.

#### Tareas
1. Crear `src/components/loyalty/RewardOptionModal.tsx`:
   - Muestra las 2 opciones del grupo
   - Opción 1: "🫧 Lavado Nítido GRATIS" / "🫧 Lavado Breve GRATIS"
   - Opción 2: "⭐ 40% de descuento en Lavado Premium" / "⭐ 40% de descuento en Lavado Nítido"
   - Confirmación antes de seleccionar
   - Toast de éxito/error
2. Integrar en `LoyaltyProgramCard.tsx`:
   - Cuando recompensa con `option_group` está disponible y sin `selected_option`
   - Mostrar botón "Elige tu recompensa"

#### Archivos afectados
- `src/components/loyalty/RewardOptionModal.tsx` (**NUEVO**)
- `src/components/loyalty/LoyaltyProgramCard.tsx`

#### Dependencias
- FASE 5

#### Riesgo: BAJO

#### Criterios de aceptación
- [ ] Modal muestra ambas opciones
- [ ] Confirmación antes de ejecutar
- [ ] Alternativa se invalida al seleccionar
- [ ] Toast de éxito
- [ ] Responsive (mobile + desktop)

---

### FASE 7 — Frontend: Actualizar Loyalty (Dashboard + Historial)

#### Objetivo
Actualizar la página de Lealtad y sus componentes para reflejar la nueva lógica.

#### Tareas
1. **`LoyaltyProgramCard.tsx`**:
   - Para milestones de tipo `choice` sin `selected_option`:
     - Mostrar "🎁 5 lavadas → Elige tu recompensa" con botón animado
   - Para milestones de tipo `choice` con `selected_option`:
     - Mostrar la opción seleccionada con badge "Seleccionado"
   - Para milestones de tipo `fixed`:
     - Mantener comportamiento actual
   - Actualizar leyenda de recompensas del programa
2. **`LoyaltyHistory.tsx`**:
   - Tabla de canjes: mostrar `selected_option` en columna de premio
   - Para recompensas de 40%: mostrar "40% Descuento en [Servicio]"
3. **`Loyalty.tsx`**:
   - Banner de "Premios disponibles" mostrar ambos tipos
   - Contar correctamente recompensas disponibles (excluyendo las `expired`)

#### Archivos afectados
- `src/components/loyalty/LoyaltyProgramCard.tsx`
- `src/components/loyalty/LoyaltyHistory.tsx`
- `src/pages/Loyalty.tsx`

#### Dependencias
- FASE 5, 6

#### Riesgo: BAJO

#### Criterios de aceptación
- [ ] "Elige tu recompensa" se muestra para milestones choice sin seleccionar
- [ ] Opción seleccionada se muestra con badge distintivo
- [ ] Recompensas de 9 lavadas se muestran como antes
- [ ] Historial muestra `selected_option`
- [ ] Colores consistentes con la marca

---

### FASE 8 — Frontend: Integración POS (LoyaltySelector + CarWashPOS)

#### Objetivo
Adaptar el POS para manejar recompensas de descuento 40%.

#### Tareas
1. **`LoyaltySelector.tsx`**:
   - Para rewards con descuento:
     - Mostrar "40% Descuento en [Servicio]"
     - Aplicar `discountPercent: 40` en vez de 100
   - Para rewards gratis:
     - Comportamiento actual (100%)
   - Actualizar label del servicio: "GRATIS" vs "40% Descuento"
2. **`CarWashPOS.tsx`**:
   - `handlePaymentComplete()`: manejar `discountPercent = 40`
   - Calcular monto correcto en ticket
   - `ticket_items.discount_reason = 'loyalty_redemption'`
   - `tickets.is_loyalty_redemption = true`
   - `tickets.loyalty_original_amount = price` (monto antes del 40%)
3. **`RewardBlockModal.tsx`**:
   - Mostrar tipo de recompensa (gratis vs descuento)

#### Archivos afectados
- `src/components/pos/LoyaltySelector.tsx`
- `src/components/pos/CarWashPOS.tsx`
- `src/components/loyalty/RewardBlockModal.tsx`

#### Dependencias
- FASE 4, 5

#### Riesgo: MEDIO
- Modifica flujo de cobro
- Error puede causar tickets con monto incorrecto
- Mitigar con validación server-side

#### Criterios de aceptación
- [ ] Recompensa de 40% se muestra correctamente
- [ ] Ticket aplica 40% sobre precio correcto
- [ ] Total refleja descuento
- [ ] `ticket_items.discount_reason = 'loyalty_redemption'`
- [ ] `tickets.is_loyalty_redemption = true`
- [ ] Cobro se procesa con monto descontado
- [ ] Bloqueo funciona para descuentos

---

### FASE 9 — Frontend: Reports (Reportes)

#### Objetivo
Integrar métricas de lealtad en la página de Reportes, que actualmente NO muestra datos de lealtad.

#### Tareas
1. **Summary cards** — Agregar nueva card "Canjes Lealtad":
   - Total canjeado: suma de `loyalty_original_amount` de tickets donde `is_loyalty_redemption = true`
   - Cantidad de canjes: count de tickets donde `is_loyalty_redemption = true`
   - Estilo: icono `fa-star`, color accent del tema de lealtad
2. **Ticket table** — Agregar badge de tipo en columna "#":
   - Para tickets con `is_loyalty_redemption = true`: badge verde "Canje" junto al número de ticket
   - Similar al badge existente de "Memb." y "Uso"
3. **Detalle de tickets** — Mostrar en la fila:
   - Si `is_loyalty_redemption = true`: indicador visual en la columna de total
   - Mostrar monto original antes del descuento (tooltip o subtexto)
4. **Filtros** — No se necesitan filtros adicionales, los tickets de canje ya se incluyen en el rango de fechas
5. **Gráficos** — Los tickets de canje ya se incluyen en los gráficos de ventas (aparecen con total C$0 o con descuento, lo cual es correcto para reportes)

#### Archivos afectados
- `src/pages/Reports.tsx`

#### Dependencias
- Ninguna (puede implementarse en paralelo)

#### Riesgo: BAJO
- Solo agrega visualización de datos existentes
- No modifica lógica de negocio

#### Criterios de aceptación
- [ ] Card "Canjes Lealtad" muestra total y cantidad
- [ ] Tickets de canje tienen badge "Canje" en la tabla
- [ ] El badge es consistente con los badges de membresía
- [ ] Los totales del reporte incluyen correctamente los tickets de canje (con su monto real, no C$0)
- [ ] La card de "Ventas Regulares" excluye tickets de canje (o los incluye correctamente)
- [ ] No se rompen los totales existentes
- [ ] El filtro por nombre funciona con clientes que tienen canjes

#### Nota técnica sobre Reports
Los tickets de canje de lealtad ya existen en la tabla `tickets` con `total` reflejando el monto real pagado (C$0 para gratis, o el monto con 40% de descuento). La columna `is_loyalty_redemption` ya existe en la BD. Solo es necesario:
- Leer `is_loyalty_redemption` y `loyalty_original_amount` al cargar tickets
- Mostrar badges y métricas correspondientes
- Los tickets de canje ya se incluyen en los cálculos de `totalNIO`, `byService`, `byVehicle`, etc.

---

### FASE 10 — Frontend: TicketPrint (Impresión)

#### Objetivo
Asegurar que los tickets impresos muestren correctamente las recompensas de lealtad.

#### Tareas
1. **`TicketPrint.tsx`**:
   - Para items con `discount_reason = 'loyalty_redemption'`:
     - Mostrar línea "🎁 Recompensa Lealtad: [nombre]"
     - Mostrar descuento aplicado (100% o 40%)
   - En WhatsApp: incluir información de lealtad en el mensaje
   - Para recompensas de 40%: mostrar "Descuento Lealtad 40%: -C$[monto]"

#### Archivos afectados
- `src/components/pos/TicketPrint.tsx`

#### Dependencias
- FASE 8

#### Riesgo: BAJO

#### Criterios de aceptación
- [ ] Ticket impreso muestra recompensa de lealtad
- [ ] Descuento 40% se refleja correctamente
- [ ] WhatsApp incluye info de lealtad
- [ ] El ticket de canje es claramente distinguishible

---

## 5. Modelo de datos propuesto

### `loyalty_programs.rewards` (JSONB) — Estructura actualizada

**Premium:**

```json
[
  {
    "at": 5,
    "type": "choice",
    "options": [
      {
        "reward": "Lavado Nítido GRATIS",
        "reward_slug": "nitido_gratis",
        "service_name_like": "Nítido",
        "discount_percent": 100,
        "target_service_slug": null
      },
      {
        "reward": "40% Descuento en Lavado Premium",
        "reward_slug": "nitido_40pct_premium",
        "discount_percent": 40,
        "target_service_slug": "premium",
        "service_name_like": "Premium"
      }
    ]
  },
  {
    "at": 9,
    "type": "fixed",
    "options": [
      {
        "reward": "Tratamiento Cerámico GRATIS",
        "reward_slug": "ceramic_wax_gratis",
        "service_name_like": "Tratamiento Cerámico",
        "discount_percent": 100,
        "target_service_slug": null
      }
    ]
  }
]
```

**Nítido:**

```json
[
  {
    "at": 5,
    "type": "choice",
    "options": [
      {
        "reward": "Lavado Breve GRATIS",
        "reward_slug": "breve_gratis",
        "service_name_like": "Breve",
        "discount_percent": 100,
        "target_service_slug": null
      },
      {
        "reward": "40% Descuento en Lavado Nítido",
        "reward_slug": "breve_40pct_nitido",
        "discount_percent": 40,
        "target_service_slug": "nitido",
        "service_name_like": "Nítido"
      }
    ]
  },
  {
    "at": 9,
    "type": "fixed",
    "options": [
      {
        "reward": "Pasteado Meguiar GRATIS",
        "reward_slug": "pasteado_gratis",
        "service_name_like": "Pasteado Meguiar",
        "discount_percent": 100,
        "target_service_slug": null
      }
    ]
  }
]
```

### `loyalty_rewards` — Columnas nuevas

| Columna | Tipo | Nullable | Descripción |
|---------|------|----------|-------------|
| `option_group` | TEXT | Sí | ID del grupo de opciones (ej: `premium_5w`) |
| `option_slug` | TEXT | Sí | Slug de esta opción específica |
| `selected_option` | TEXT | Sí | Opción seleccionada (null = sin seleccionar) |
| `selected_at` | TIMESTAMPTZ | Sí | Fecha de selección |

**Regla:** Cuando `selected_option` se establece, las otras recompensas del mismo `option_group` cambian a `status = 'expired'`.

---

## 6. Flujo completo de una recompensa de 5 lavadas (Premium)

```
1. Cliente acumula 5 lavadas en programa Premium
         │
         ▼
2. record_loyalty_v3_wash() detecta milestone at=5, type="choice"
         │
         ▼
3. Se crean 2 registros en loyalty_rewards:
   ├── option_group='premium_5w', option_slug='nitido_gratis', status='available'
   └── option_group='premium_5w', option_slug='nitido_40pct_premium', status='available'
         │
         ▼
4. EN LOYALTY (LoyaltyProgramCard):
   "🎁 5 lavadas → Elige tu recompensa" con botón "Elegir"
         │
         ▼
5. Cliente/Cajano hace clic → RewardOptionModal:
   Opción 1: 🫧 Lavado Nítido GRATIS
   Opción 2: ⭐ 40% de descuento en Lavado Premium
         │
         ▼
6. Selección → select_reward_option(reward_id, 'nitido_gratis')
         │
         ▼
7. RPC marca:
   ├── 'nitido_gratis': selected_option='nitido_gratis', selected_at=now()
   └── 'nitido_40pct_premium': status='expired'
         │
         ▼
8. EN POS (LoyaltySelector):
   Si 'nitido_gratis' → servicio Nítido, discountPercent=100
   Si 'nitido_40pct_premium' → servicio Premium, discountPercent=40
         │
         ▼
9. Al cobrar → validate_loyalty_redemption() → ticket C$0 o C$[con 40%]
   → redeem_loyalty_reward() → status='redeemed'
         │
         ▼
10. EN REPORTS (Reports.tsx):
    - Ticket aparece con badge "Canje" en la tabla
    - Se suma a "Canjes Lealtad" en summary cards
    - is_loyalty_redemption = true, loyalty_original_amount = precio original
```

---

## 7. Flujo completo de una recompensa de 9 lavadas (Nítido)

```
1. Cliente acumula 9 lavadas en programa Nítido
         │
         ▼
2. record_loyalty_v3_wash() detecta milestone at=9, type="fixed"
         │
         ▼
3. Se crea 1 registro en loyalty_rewards:
   └── option_group=null, option_slug='pasteado_gratis', status='available'
         │
         ▼
4. EN LOYALTY: badge "Premio disponible" (sin opción de elegir)
         │
         ▼
5. EN POS: Recompensa disponible → Pasteado Meguiar GRATIS
         │
         ▼
6. Al cobrar → canje completado
         │
         ▼
7. EN REPORTS: Badge "Canje", métrica actualizada
```

---

## 8. Reglas de negocio

| # | Regla | Implementación |
|---|-------|----------------|
| 1 | Recompensas de 5 lavadas: 2 opciones | `type:"choice"`, 2 registros con mismo `option_group` |
| 2 | Recompensas de 9 lavadas: 1 opción | `type:"fixed"`, 1 registro |
| 3 | Seleccionar una invalida la otra | `select_reward_option()` cambia alternativa a `expired` |
| 4 | No se pueden usar ambas de 5 lavadas | `option_group` único, constraint en RPC |
| 5 | 40% se calcula sobre servicio correspondiente | `target_service_slug` en JSONB |
| 6 | Cálculo del 40% validado en backend | RPC `validate_loyalty_redemption()` |
| 7 | Recompensas de 5 y 9 independientes | Cada una con su `option_group` o `fixed` |
| 8 | No hay opción alternativa para 9 lavadas | `type:"fixed"` — solo 1 opción |
| 9 | Sistema registra opción seleccionada | `selected_option` + `selected_at` |
| 10 | Se evita doble canje | `redeem_loyalty_reward()` verifica `status='available'` |
| 11 | Protección contra solicitudes simultáneas | `FOR UPDATE` en transacciones |
| 12 | No se rompe acumulación de lavadas | `record_loyalty_v3_wash()` sin cambios en incremento |

---

## 9. Casos de prueba

### Reports

| # | Caso | Resultado esperado |
|---|------|--------------------|
| R1 | Ticket de canje gratis (C$0) en reporte | Badge "Canje", incluido en métricas |
| R2 | Ticket de canje 40% en reporte | Badge "Canje", total = precio con descuento |
| R3 | Card "Canjes Lealtad" muestra totales correctos | Suma de `loyalty_original_amount` |
| R4 | Ticket de canje aparece en "Por servicio" | Servicio correcto, monto correcto |
| R5 | Filtrar por nombre de cliente con canjes | Resultado incluye sus canjes |
| R6 | Reimprimir ticket de canje | Info de lealtad visible |
| R7 | Eliminar ticket de canje | Rollback correcto |

### Loyalty

| # | Caso | Resultado esperado |
|---|------|--------------------|
| L1 | 5 lavadas Premium → seleccionar Nítido GRATIS | Recompensa canjeada, alternativa expirada |
| L2 | 5 lavadas Premium → seleccionar 40% Premium | Recompensa canjeada, alternativa expirada |
| L3 | 9 lavadas Premium → Tratamiento Cerámico | Recompensa fija canjeada |
| L4 | 5 lavadas Nítido → seleccionar Breve GRATIS | Recompensa canjeada |
| L5 | 5 lavadas Nítido → seleccionar 40% Nítido | Recompensa canjeada |
| L6 | 9 lavadas Nítido → Pasteado Meguiar | Recompensa fija canjeada |
| L7 | Intentar ambas opciones de 5 lavadas | Error |
| L8 | Reutilizar recompensa canjeada | Error |
| L9 | Dos solicitudes simultáneas | Solo una éxito |
| L10 | Modal muestra opciones correctas por programa | Premium/Nítido distintos |

### POS

| # | Caso | Resultado esperado |
|---|------|--------------------|
| P1 | Recompensa 100% → ticket C$0 | Total C$0, `discount_reason='loyalty_redemption'` |
| P2 | Recompensa 40% → ticket con descuento | Total = precio × 0.6, `discount_reason='loyalty_redemption'` |
| P3 | Bloqueo de servicio con recompensa 40% | Modal muestra "40% Descuento" |
| P4 | Calcular 40% de C$250 = C$100 descuento | Total C$150, `loyalty_original_amount = 250` |
| P5 | Validación backend rechaza servicio incorrecto | Error antes de crear ticket |
| P6 | Ticket impreso muestra info de lealtad | Correcto |

### Generales

| # | Caso | Resultado esperado |
|---|------|--------------------|
| G1 | Cliente existente con recompensa available pre-migración | Se mantiene available (sin option_group) |
| G2 | Completar ciclo → reiniciar | washes_in_cycle = 0, total sigue |
| G3 | Error de API durante selección | Toast error, recompensa sigue available |
| G4 | Legacy loyalty desactivado | No interfiere con V3 |

---

## 10. Migración de datos

### Clientes existentes
- **No se requiere migración.** Las tablas existentes mantienen todos los registros.

### Recompensas ya desbloqueadas
- Recompensas `status='available'` sin `option_group` → se tratan como **fijas** (comportamiento actual)
- No se rompe nada: las recompensas existentes siguen funcionando igual

### Datos históricos
- `status='redeemed'` o `'expired'` → intactos
- `loyalty_redemptions` → intactos
- `loyalty_wash_log` → intactos

---

## 11. Riesgos

| Riesgo | Probabilidad | Impacto | Mitigación |
|--------|-------------|---------|------------|
| Error en `record_loyalty_v3_wash` al generar 2 rewards | Media | Alto | Testing exhaustivo, función actual como fallback |
| Race condition en `select_reward_option` | Baja | Medio | `FOR UPDATE` + transacción |
| Descuento 40% calculado incorrectamente | Baja | Alto | Cálculo en backend, RPC validation |
| Reports muestra totales incorrectos con canjes | Baja | Medio | Tickets ya tienen `total` correcto |
| Frontend muestra opciones incorrectas | Media | Medio | Validar `option_group` antes de mostrar |
| POS no aplica descuento correctamente | Media | Alto | Testing manual del flujo completo |

---

## 12. Orden recomendado de implementación

```
FASE 1 (Modelo de Datos)
    │
    ├── FASE 2 (Backend: record_loyalty_v3_wash)
    │       │
    │       └── FASE 3 (Backend: select_reward_option)
    │               │
    │               └── FASE 4 (Backend: soporte 40%)
    │                       │
    │                       └── FASE 5 (Frontend: tipos y hooks)
    │                               │
    │                               ├── FASE 6 (Modal selección)
    │                               │       │
    │                               │       └── FASE 7 (Loyalty dashboard)
    │                               │
    │                               ├── FASE 8 (POS integration)
    │                               │       │
    │                               │       └── FASE 10 (TicketPrint)
    │                               │
    │                               └── FASE 9 (Reports) ← puede ir en paralelo
    │
    └── Testing completo
            │
            └── Despliegue
```

---

## 13. Checklist final

### Antes de implementar
- [ ] Revisar roadmap con el equipo
- [ ] Confirmar estructura JSONB de `loyalty_programs.rewards`
- [ ] Confirmar naming de `option_group` (ej: `premium_5w`, `nitido_5w`)
- [ ] Verificar servicios Premium, Nítido, Breve, Pasteado Meguiar, Tratamiento Cerámico existen
- [ ] Confirmar que Reports NO necesita migración de BD (solo frontend)

### Durante la implementación
- [ ] Migración SQL ejecuta sin errores
- [ ] `record_loyalty_v3_wash` genera 2 rewards para choice, 1 para fixed
- [ ] `select_reward_option` funciona correctamente
- [ ] `validate_loyalty_redemption` acepta 40%
- [ ] Modal de selección funciona en Loyalty
- [ ] POS aplica 100% y 40% correctamente
- [ ] Reports muestra badge "Canje" y card de métricas
- [ ] TicketPrint muestra info de lealtad
- [ ] TypeScript compila sin errores
- [ ] Linting pasa

### Después del despliegue
- [ ] Verificar clientes existentes no afectados
- [ ] Probar flujo completo con cliente de prueba
- [ ] Verificar legacy loyalty desactivado
- [ ] Verificar reportes muestran canjes correctamente
- [ ] Monitorear errores 24h
