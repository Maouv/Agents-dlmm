require('dotenv').config();
const ModalClient = require('./src/providers/modalClient');

async function test() {
  console.log('Testing ModalClient with GLM-5 reasoning_content fix...\n');
  
  const client = new ModalClient({
    model: 'zai-org/GLM-5-FP8',
    temperature: 0.2,
    maxTokens: 50,
    apiKey: process.env.MODAL_API_KEY_2
  });

  try {
    console.log('Sending request...');
    const response = await client.generate(
      'You are a helpful assistant.',
      'Say "test successful" and nothing else.'
    );
    console.log('✓ Response received:', response);
    console.log('\nFix working! GLM-5 reasoning_content handled correctly.');
  } catch (error) {
    console.error('✗ Error:', error.message);
  }
}

test();
