// clingoConf.js
// Function to send the collected parameters to the backend
function sendClingoConfig() {
    
    fetch('http://localhost/neo4j/runPythonScript', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(clingoConfig),
    })
    .then(response => response.json())
    .then(data => {
        console.log('CLINGO Configuration sent successfully:', data);
    })
    .catch((error) => {
        console.error('Error:', error);
    });
}
