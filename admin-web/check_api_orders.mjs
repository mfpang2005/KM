import axios from 'axios';

const API_URL = 'http://localhost:8000'; 

async function checkOrders() {
    try {
        console.log('Testing connectivity to:', API_URL);
        const response = await axios.get(`${API_URL}/orders`);
        console.log('Success! Status:', response.status);
        console.log('Total Orders returned:', response.data.length);
        
        if (response.data.length > 0) {
            const first = response.data[0];
            console.log('Sample Order Details:');
            console.log('- ID:', first.id);
            console.log('- Status:', first.status);
            console.log('- DueTime:', first.dueTime);
            console.log('- Created At:', first.created_at);
        } else {
            console.log('No orders found in the database.');
        }
    } catch (error) {
        if (error.response) {
            console.error('API Error:', error.response.status, error.response.data);
        } else {
            console.error('Connection Error:', error.message);
        }
    }
}

checkOrders();
