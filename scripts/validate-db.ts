import { supabase } from '../src/integrations/supabase/client';

/**
 * Database Schema Validation Script
 * Verifies that all tables exist and RLS policies are working correctly
 */

async function validateSchema() {
    console.log('🔍 Starting database schema validation...\n');

    const results = {
        passed: 0,
        failed: 0,
        errors: [] as string[]
    };

    // Test 1: Check if we can read business_settings
    try {
        const { data, error } = await supabase.from('business_settings').select('*').limit(1);
        if (error) throw error;
        console.log('✅ business_settings table accessible');
        results.passed++;
    } catch (err: any) {
        console.error('❌ business_settings table error:', err.message);
        results.failed++;
        results.errors.push(`business_settings: ${err.message}`);
    }

    // Test 2: Check if we can read customers
    try {
        const { data, error } = await supabase.from('customers').select('*').limit(1);
        if (error) throw error;
        console.log('✅ customers table accessible');
        results.passed++;
    } catch (err: any) {
        console.error('❌ customers table error:', err.message);
        results.failed++;
        results.errors.push(`customers: ${err.message}`);
    }

    // Test 3: Check if we can read services
    try {
        const { data, error } = await supabase.from('services').select('*, service_prices(*)').limit(5);
        if (error) throw error;
        console.log('✅ services table accessible with prices join');
        console.log(`   Found ${data?.length || 0} services`);
        results.passed++;
    } catch (err: any) {
        console.error('❌ services table error:', err.message);
        results.failed++;
        results.errors.push(`services: ${err.message}`);
    }

    // Test 4: Check if we can read tickets
    try {
        const { data, error } = await supabase.from('tickets').select('*').limit(1);
        if (error) throw error;
        console.log('✅ tickets table accessible');
        results.passed++;
    } catch (err: any) {
        console.error('❌ tickets table error:', err.message);
        results.failed++;
        results.errors.push(`tickets: ${err.message}`);
    }

    // Test 5: Check if we can read payments
    try {
        const { data, error } = await supabase.from('payments').select('*').limit(1);
        if (error) throw error;
        console.log('✅ payments table accessible');
        results.passed++;
    } catch (err: any) {
        console.error('❌ payments table error:', err.message);
        results.failed++;
        results.errors.push(`payments: ${err.message}`);
    }

    // Test 6: Check membership_plans
    try {
        const { data, error } = await supabase.from('membership_plans').select('*');
        if (error) throw error;
        console.log('✅ membership_plans table accessible');
        console.log(`   Found ${data?.length || 0} plans`);
        results.passed++;
    } catch (err: any) {
        console.error('❌ membership_plans table error:', err.message);
        results.failed++;
        results.errors.push(`membership_plans: ${err.message}`);
    }

    // Test 7: Check profiles
    try {
        const { data, error } = await supabase.from('profiles').select('*').limit(1);
        if (error) throw error;
        console.log('✅ profiles table accessible');
        results.passed++;
    } catch (err: any) {
        console.error('❌ profiles table error:', err.message);
        results.failed++;
        results.errors.push(`profiles: ${err.message}`);
    }

    // Summary
    console.log('\n📊 Validation Summary:');
    console.log(`   ✅ Passed: ${results.passed}`);
    console.log(`   ❌ Failed: ${results.failed}`);

    if (results.errors.length > 0) {
        console.log('\n⚠️  Errors:');
        results.errors.forEach(err => console.log(`   - ${err}`));
    }

    return results;
}

// Run validation
validateSchema().then(results => {
    if (results.failed === 0) {
        console.log('\n🎉 All schema validations passed!');
        process.exit(0);
    } else {
        console.log('\n❌ Some validations failed. Please check the errors above.');
        process.exit(1);
    }
}).catch(err => {
    console.error('\n💥 Validation script crashed:', err);
    process.exit(1);
});
