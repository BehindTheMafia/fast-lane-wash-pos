import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface ValidationResult {
    table: string;
    status: 'success' | 'error';
    message: string;
    count?: number;
}

export default function DBValidation() {
    const [results, setResults] = useState<ValidationResult[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        validateDatabase();
    }, []);

    const validateDatabase = async () => {
        const validationResults: ValidationResult[] = [];

        // Test 1: business_settings
        try {
            const { data, error } = await supabase.from('business_settings').select('*').limit(1);
            if (error) throw error;
            validationResults.push({
                table: 'business_settings',
                status: 'success',
                message: 'Table accessible',
                count: data?.length || 0
            });
        } catch (err: any) {
            validationResults.push({
                table: 'business_settings',
                status: 'error',
                message: err.message
            });
        }

        // Test 2: customers
        try {
            const { data, error } = await supabase.from('customers').select('*').limit(1);
            if (error) throw error;
            validationResults.push({
                table: 'customers',
                status: 'success',
                message: 'Table accessible',
                count: data?.length || 0
            });
        } catch (err: any) {
            validationResults.push({
                table: 'customers',
                status: 'error',
                message: err.message
            });
        }

        // Test 3: services with prices
        try {
            const { data, error } = await supabase
                .from('services')
                .select('*, service_prices(*)')
                .limit(5);
            if (error) throw error;
            validationResults.push({
                table: 'services (with prices)',
                status: 'success',
                message: 'Table accessible with join',
                count: data?.length || 0
            });
        } catch (err: any) {
            validationResults.push({
                table: 'services',
                status: 'error',
                message: err.message
            });
        }

        // Test 4: tickets
        try {
            const { data, error } = await supabase.from('tickets').select('*').limit(1);
            if (error) throw error;
            validationResults.push({
                table: 'tickets',
                status: 'success',
                message: 'Table accessible',
                count: data?.length || 0
            });
        } catch (err: any) {
            validationResults.push({
                table: 'tickets',
                status: 'error',
                message: err.message
            });
        }

        // Test 5: payments
        try {
            const { data, error } = await supabase.from('payments').select('*').limit(1);
            if (error) throw error;
            validationResults.push({
                table: 'payments',
                status: 'success',
                message: 'Table accessible',
                count: data?.length || 0
            });
        } catch (err: any) {
            validationResults.push({
                table: 'payments',
                status: 'error',
                message: err.message
            });
        }

        // Test 6: membership_plans
        try {
            const { data, error } = await supabase.from('membership_plans').select('*');
            if (error) throw error;
            validationResults.push({
                table: 'membership_plans',
                status: 'success',
                message: 'Table accessible',
                count: data?.length || 0
            });
        } catch (err: any) {
            validationResults.push({
                table: 'membership_plans',
                status: 'error',
                message: err.message
            });
        }

        // Test 7: profiles
        try {
            const { data, error } = await supabase.from('profiles').select('*').limit(1);
            if (error) throw error;
            validationResults.push({
                table: 'profiles',
                status: 'success',
                message: 'Table accessible',
                count: data?.length || 0
            });
        } catch (err: any) {
            validationResults.push({
                table: 'profiles',
                status: 'error',
                message: err.message
            });
        }

        // Test 8: cash_closures
        try {
            const { data, error } = await supabase.from('cash_closures').select('*').limit(1);
            if (error) throw error;
            validationResults.push({
                table: 'cash_closures',
                status: 'success',
                message: 'Table accessible',
                count: data?.length || 0
            });
        } catch (err: any) {
            validationResults.push({
                table: 'cash_closures',
                status: 'error',
                message: err.message
            });
        }

        setResults(validationResults);
        setLoading(false);
    };

    const passedCount = results.filter(r => r.status === 'success').length;
    const failedCount = results.filter(r => r.status === 'error').length;

    return (
        <div className="min-h-screen bg-background p-8">
            <div className="max-w-4xl mx-auto">
                <div className="mb-8">
                    <h1 className="text-3xl font-bold text-foreground mb-2">
                        <i className="fa-solid fa-database mr-3 text-secondary" />
                        Database Schema Validation
                    </h1>
                    <p className="text-muted-foreground">
                        Verifying Supabase connection and table access
                    </p>
                </div>

                {loading ? (
                    <div className="flex items-center justify-center py-12">
                        <i className="fa-solid fa-spinner fa-spin text-4xl text-accent" />
                    </div>
                ) : (
                    <>
                        {/* Summary */}
                        <div className="grid grid-cols-3 gap-4 mb-8">
                            <div className="bg-card border border-border rounded-xl p-6">
                                <div className="text-3xl font-bold text-foreground">{results.length}</div>
                                <div className="text-sm text-muted-foreground">Total Tests</div>
                            </div>
                            <div className="bg-card border border-border rounded-xl p-6">
                                <div className="text-3xl font-bold text-green-500">{passedCount}</div>
                                <div className="text-sm text-muted-foreground">Passed</div>
                            </div>
                            <div className="bg-card border border-border rounded-xl p-6">
                                <div className="text-3xl font-bold text-red-500">{failedCount}</div>
                                <div className="text-sm text-muted-foreground">Failed</div>
                            </div>
                        </div>

                        {/* Results */}
                        <div className="space-y-3">
                            {results.map((result, idx) => (
                                <div
                                    key={idx}
                                    className={`bg-card border rounded-xl p-4 ${result.status === 'success'
                                        ? 'border-green-500/30 bg-green-500/5'
                                        : 'border-red-500/30 bg-red-500/5'
                                        }`}
                                >
                                    <div className="flex items-start justify-between">
                                        <div className="flex-1">
                                            <div className="flex items-center gap-3 mb-1">
                                                <i
                                                    className={`fa-solid ${result.status === 'success' ? 'fa-circle-check text-green-500' : 'fa-circle-xmark text-red-500'
                                                        } text-xl`}
                                                />
                                                <h3 className="font-semibold text-foreground">{result.table}</h3>
                                            </div>
                                            <p className={`text-sm ml-8 ${result.status === 'success' ? 'text-green-600' : 'text-red-600'}`}>
                                                {result.message}
                                            </p>
                                            {result.count !== undefined && (
                                                <p className="text-xs text-muted-foreground ml-8 mt-1">
                                                    Found {result.count} record(s)
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Overall Status */}
                        <div className="mt-8 p-6 bg-card border border-border rounded-xl">
                            {failedCount === 0 ? (
                                <div className="flex items-center gap-3 text-green-500">
                                    <i className="fa-solid fa-circle-check text-2xl" />
                                    <div>
                                        <h3 className="font-bold text-lg">All validations passed!</h3>
                                        <p className="text-sm text-muted-foreground">Database schema is correctly configured.</p>
                                    </div>
                                </div>
                            ) : (
                                <div className="flex items-center gap-3 text-red-500">
                                    <i className="fa-solid fa-triangle-exclamation text-2xl" />
                                    <div>
                                        <h3 className="font-bold text-lg">Some validations failed</h3>
                                        <p className="text-sm text-muted-foreground">
                                            Please check the errors above and ensure migrations are applied.
                                        </p>
                                    </div>
                                </div>
                            )}
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
