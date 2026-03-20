const { VertexAI } = require('@google-cloud/vertexai');
const v = new VertexAI({project: 'foo', location: 'us-central1'});
console.log('Preview keys:', Object.keys(v.preview));
