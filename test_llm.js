
const { createVertex } = require('@ai-sdk/google-vertex');
const { generateText } = require('ai');
const dotenv = require('dotenv');
dotenv.config({ path: '.env.local' });

async function testLLM() {
  const credentialsJson = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
  const project = process.env.GOOGLE_CLOUD_PROJECT_ID;
  const location = process.env.VERTEX_AI_LOCATION || 'us-central1';

  console.log(`Testing Gemini 1.5 Flash in project: ${project}, location: ${location}`);

  const googleAuthOptions = {
    credentials: JSON.parse(credentialsJson),
  };

  try {
    const vertex = createVertex({
      project,
      location,
      googleAuthOptions,
    });

    const model = vertex('gemini-pro');

    const result = await generateText({
      model,
      prompt: 'Hello, respond with exactly "Working!"',
    });
    console.log('Gemini says:', result.text);
  } catch (err) {
    console.error('LLM FAILED:', err.message);
  }
}

testLLM();
