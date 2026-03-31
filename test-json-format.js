require('dotenv').config();
const ModalClient = require('./src/providers/modalClient');

async function testJSONFormat() {
  console.log('Testing GLM-5 with response_format: json_object...\n');
  
  const client = new ModalClient({
    model: 'zai-org/GLM-5-FP8',
    temperature: 0.1,
    maxTokens: 300,
    apiKey: process.env.MODAL_API_KEY_2
  });

  try {
    const response = await client.generate(
      'You are a JSON API. Return ONLY valid JSON.',
      'Return JSON with fields: status, value. Example: {"status":"ok","value":42}'
    );

    console.log('Raw response:', response);
    console.log('\nAttempting to parse JSON...');
    
    const parsed = JSON.parse(response);
    console.log('✓ JSON parsed successfully!');
    console.log('Parsed object:', parsed);
    
    if (parsed.status && parsed.value !== undefined) {
      console.log('\n🎉 SUCCESS! GLM-5 returns valid JSON with response_format!');
    }
  } catch (error) {
    console.error('✗ Test failed:', error.message);
    console.log('\nNote: If this fails, Modal/GLM-5 might not support response_format');
    console.log('We can try alternative approach or accept reasoning_content fallback');
  }
}

testJSONFormat();
