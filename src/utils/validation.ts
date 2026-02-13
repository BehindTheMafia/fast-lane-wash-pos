/**
 * Validation utilities for customer data
 */

/**
 * Validates that a plate contains only alphanumeric characters
 */
export function validatePlate(plate: string): { isValid: boolean; error?: string } {
    if (!plate.trim()) {
        return { isValid: true }; // Empty plate is valid (optional field)
    }

    const alphanumericRegex = /^[A-Za-z0-9]+$/;

    if (!alphanumericRegex.test(plate)) {
        return {
            isValid: false,
            error: "La placa solo puede contener letras y números"
        };
    }

    return { isValid: true };
}

/**
 * Sanitizes plate input by removing non-alphanumeric characters
 */
export function sanitizePlate(plate: string): string {
    return plate.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
}

/**
 * Validates email format
 */
export function validateEmail(email: string): { isValid: boolean; error?: string } {
    if (!email.trim()) {
        return { isValid: true }; // Empty email is valid (optional field)
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailRegex.test(email)) {
        return {
            isValid: false,
            error: "El correo electrónico no es válido"
        };
    }

    return { isValid: true };
}
