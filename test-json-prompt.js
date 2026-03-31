require('dotenv').config();
const ModalClient = require('./src/providers/modalClient');

async function testJSON() {
  const client = new ModalClient({
    model: 'zai-org/GLM-5-FP8',
    temperature: 0.1, // Lower temperature for more deterministic output
    maxTokens: 300,
    apiKey: process.env.MODAL_API_KEY_2
  });

  const testPrompt = `You are a JSON API. Return ONLY JSON. NO explanation. Start with { end with }

Example: {"status":"ok","value":42}

Return JSON for: test=123`;

  console.log('Testing ultra-aggressive JSON prompt...\n');
  
  const response = await client.generate('You are a JSON API.', testPrompt);
  console.log('Response:', response);
  
  try {
    const parsed = JSON.parse(response);
    console.log('\n✓ JSON parsed successfully!');
    console.log('Parsed:', parsed);
  } catch (error) {
    console.error('\n✗ Still not valid JSON');
    console.error('Error:', error.message);
  }
}

testJSON();
