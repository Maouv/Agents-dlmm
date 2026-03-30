require('dotenv').config();
const assert = require('assert');
const ModalClient = require('../../../src/providers/modalClient');

async function testModalClient() {
  console.log('Testing ModalClient with GLM-5...');

  const client = new ModalClient({
    model: 'zai-org/GLM-5-FP8',
    temperature: 0.2,
    maxTokens: 500
  });

  // Test 1: Basic generation
  const response = await client.generate(
    'You are a helpful assistant.',
    'Say "test successful" and nothing else.'
  );

  assert(response, 'Response should exist');
  assert(typeof response === 'string', 'Response should be string');
  console.log('✓ Basic generation works');

  // Test 2: JSON generation
  const json = await client.generateJSON(
    'You are a data extractor.',
    'Extract: name=Test, value=42. Return JSON with fields: name, value.'
  );

  assert(json.name === 'Test', 'Name should be Test');
  assert(json.value === 42, 'Value should be 42');
  console.log('✓ JSON generation works');

  console.log('All ModalClient tests passed!');
}

testModalClient().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
