import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = "https://wryhvvakeysdbktvemzo.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndyeWh2dmFrZXlzZGJrdHZlbXpvIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTYzNjY0MCwiZXhwIjoyMDg3MjEyNjQwfQ.jSX6PhPX1do1QOJl3bQVJ2tYrS5xDrL0TDF6EsAuUbc";

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function checkSchema() {
    try {
        console.log('Checking orders table...');
        const { data: orders, error: ordersError } = await supabase.from('orders').select('*').limit(1);
        if (ordersError) {
            console.error('Error selecting from orders:', ordersError);
        } else {
            console.log('Orders table exists. Row count:', orders.length);
            if (orders.length > 0) {
                console.log('Sample order columns:', Object.keys(orders[0]));
            } else {
                console.log('Orders table is empty.');
            }
        }

        console.log('\nChecking order_items table...');
        const { data: items, error: itemsError } = await supabase.from('order_items').select('*').limit(1);
        if (itemsError) {
            console.error('Error selecting from order_items:', itemsError);
        } else {
            console.log('Order_items table exists. Row count:', items.length);
            if (items.length > 0) {
                console.log('Sample order_item columns:', Object.keys(items[0]));
            } else {
                console.log('Order_items table is empty.');
            }
        }

        console.log('\nChecking products table...');
        const { data: products, error: productsError } = await supabase.from('products').select('*').limit(1);
        if (productsError) {
            console.error('Error selecting from products:', productsError);
        } else {
            console.log('Products table exists. Row count:', products.length);
            if (products.length > 0) {
                console.log('Sample product columns:', Object.keys(products[0]));
            }
        }

    } catch (e) {
        console.error('Unexpected error:', e);
    }
}

checkSchema();
