require('dotenv').config();
const ModalClient = require('./src/providers/modalClient');

async function test() {
  console.log('Testing Modal API with GLM-5...');
  console.log('API Key 2 length:', process.env.MODAL_API_KEY_2?.length);
  
  const client = new ModalClient({
    model: 'zai-org/GLM-5-FP8',
    temperature: 0.2,
    maxTokens: 50,
    apiKey: process.env.MODAL_API_KEY_2
  });

  try {
    console.log('\nSending request...');
    const response = await client.generate(
      'You are a helpful assistant.',
      'Say "test successful" and nothing else.'
    );
    console.log('✓ Response:', response);
  } catch (error) {
    console.error('✗ Error:', error.message);
    console.error('Stack:', error.stack);
  }
}

test();
