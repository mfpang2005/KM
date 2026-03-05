import axios from 'axios';

async function testProducts() {
    try {
        console.log('Testing http://localhost:8000/products (Direct backend)...');
        const response = await axios.get('http://localhost:8000/products');
        console.log('Status:', response.status);
        console.log('Data type:', typeof response.data);
        console.log('Is array:', Array.isArray(response.data));

        if (Array.isArray(response.data)) {
            console.log('Count:', response.data.length);
            if (response.data.length > 0) {
                console.log('First item:', JSON.stringify(response.data[0], null, 2));
            } else {
                console.log('WARNING: Products table is empty!');
            }
        } else {
            console.log('ERROR: Response is not an array!', response.data);
        }
    } catch (error) {
        console.error('Error fetching products:', error.message);
        if (error.response) {
            console.error('Response data:', error.response.data);
        }
    }
}

testProducts();
