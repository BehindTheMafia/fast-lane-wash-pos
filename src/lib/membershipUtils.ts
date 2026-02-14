// Membership utility functions

// Service IDs for eligible services (Lavado Rápido – Breve and Lavado Rápido – Nítido)
export const ELIGIBLE_SERVICE_IDS = {
    LAVADO_BREVE: 1,
    LAVADO_NITIDO: 2,
};

/**
 * Calculate price with membership discount
 * @param basePrice - Original price
 * @param discountPercent - Discount percentage (default 36%)
 * @returns Discounted price
 */
export const calculateMembershipPrice = (
    basePrice: number,
    discountPercent: number = 36
): number => {
    return basePrice * (1 - discountPercent / 100);
};

/**
 * Check if a service is eligible for membership discount
 * @param serviceId - Service ID (string or number)
 * @returns true if service is eligible
 */
export const isServiceEligible = (serviceId: string | number): boolean => {
    const numericId = typeof serviceId === 'string' ? parseInt(serviceId) : serviceId;
    return Object.values(ELIGIBLE_SERVICE_IDS).includes(numericId);
};

/**
 * Check if membership is expiring soon (within 7 days)
 * @param expiresAt - Expiration date string
 * @returns true if expiring within 7 days
 */
export const isExpiringSoon = (expiresAt: string): boolean => {
    const daysRemaining = getDaysRemaining(expiresAt);
    return daysRemaining > 0 && daysRemaining <= 7;
};

/**
 * Calculate days remaining until expiration
 * @param expiresAt - Expiration date string
 * @returns Number of days remaining (0 if expired)
 */
export const getDaysRemaining = (expiresAt: string): number => {
    const now = new Date();
    const expiry = new Date(expiresAt);
    const diffTime = expiry.getTime() - now.getTime();
    const days = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return Math.max(0, days);
};

/**
 * Check if membership is expired
 * @param expiresAt - Expiration date string
 * @returns true if expired
 */
export const isMembershipExpired = (expiresAt: string): boolean => {
    const now = new Date();
    const expiry = new Date(expiresAt);
    return expiry < now;
};

/**
 * Get status badge color based on membership status
 * @param status - Membership status
 * @returns Tailwind CSS classes for badge
 */
export const getStatusBadgeClass = (
    status: 'active' | 'expired' | 'expiring_soon'
): string => {
    switch (status) {
        case 'active':
            return 'bg-green-500/20 text-green-600';
        case 'expiring_soon':
            return 'bg-yellow-500/20 text-yellow-600';
        case 'expired':
            return 'bg-red-500/20 text-red-600';
        default:
            return 'bg-gray-500/20 text-gray-600';
    }
};

/**
 * Get status label in Spanish
 * @param status - Membership status
 * @returns Localized status label
 */
export const getStatusLabel = (
    status: 'active' | 'expired' | 'expiring_soon'
): string => {
    switch (status) {
        case 'active':
            return 'Activa';
        case 'expiring_soon':
            return 'Por vencer';
        case 'expired':
            return 'Expirada';
        default:
            return 'Desconocido';
    }
};

/**
 * Format expiration date for display
 * @param expiresAt - Expiration date string
 * @returns Formatted date string
 */
export const formatExpirationDate = (expiresAt: string): string => {
    const date = new Date(expiresAt);
    return date.toLocaleDateString('es-NI', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
    });
};

/**
 * Calculate total price for 8 washes with discount
 * @param pricePerWash - Price per wash
 * @param washCount - Number of washes (default 8)
 * @param discountPercent - Discount percentage (default 36%)
 * @returns Total discounted price
 */
export const calculateMembershipTotalPrice = (
    pricePerWash: number,
    washCount: number = 8,
    discountPercent: number = 36
): number => {
    const subtotal = pricePerWash * washCount;
    return calculateMembershipPrice(subtotal, discountPercent);
};

/**
 * Check if customer is eligible for bonus wash (9th wash free)
 * @param washesUsed - Number of washes used
 * @param totalWashesAllowed - Total washes in membership
 * @returns true if eligible for bonus
 */
export const isEligibleForBonus = (
    washesUsed: number,
    totalWashesAllowed: number
): boolean => {
    return washesUsed >= totalWashesAllowed;
};
