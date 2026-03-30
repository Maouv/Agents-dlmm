require('dotenv').config();
const test = require('node:test');
const assert = require('node:assert');
const ZaiClient = require('../../../src/providers/zaiClient');

test('ZaiClient should initialize with config', () => {
  const client = new ZaiClient({
    model: 'glm-4.7-flash',
    temperature: 0.5
  });

  assert.strictEqual(client.model, 'glm-4.7-flash');
  assert.strictEqual(client.temperature, 0.5);
});

test('ZaiClient should generate completion', async (t) => {
  if (!process.env.ZAI_API_KEY) {
    t.skip('ZAI_API_KEY not set');
    return;
  }

  const client = new ZaiClient({ model: 'glm-4.7-flash' });

  const response = await client.generate(
    'You are a helpful assistant.',
    'Say "test successful"'
  );

  assert.ok(response);
  assert.strictEqual(typeof response, 'string');
  assert.ok(response.length > 0);
});

test('ZaiClient should generate JSON output', async (t) => {
  if (!process.env.ZAI_API_KEY) {
    t.skip('ZAI_API_KEY not set');
    return;
  }

  const client = new ZaiClient({ model: 'glm-4.7-flash' });

  const json = await client.generateJSON(
    'Return only valid JSON.',
    'Return: {"status": "ok", "number": 42}'
  );

  assert.deepStrictEqual(json, { status: 'ok', number: 42 });
});
