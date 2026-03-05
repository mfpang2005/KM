const http = require('http');

http.get('http://localhost:3000', (res) => {
    console.log(`STATUS: ${res.statusCode}`);
    let rawData = '';
    res.on('data', (chunk) => { rawData += chunk; });
    res.on('end', () => {
        console.log(`Response length: ${rawData.length} bytes`);
    });
}).on('error', (e) => {
    console.error(`Got error: ${e.message}`);
});
