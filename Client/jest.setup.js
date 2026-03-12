// Load the API module by evaluating the source
const fs = require('fs');
const path = require('path');

const apiSource = fs.readFileSync(path.join(__dirname, 'js', 'api.js'), 'utf8');
eval(apiSource);