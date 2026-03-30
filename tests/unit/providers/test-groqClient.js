require('dotenv').config();
const test = require('node:test');
const assert = require('node:assert');
const GroqClient = require('../../../src/providers/groqClient');

test('GroqClient should initialize with config', () => {
  const client = new GroqClient({
    model: 'moonshotai/kimi-k2-instruct',
    temperature: 0.5
  });

  assert.strictEqual(client.model, 'moonshotai/kimi-k2-instruct');
  assert.strictEqual(client.temperature, 0.5);
});

test('GroqClient should generate completion', async (t) => {
  if (!process.env.GROQ_API_KEY) {
    t.skip('GROQ_API_KEY not set');
    return;
  }

  const client = new GroqClient({ model: 'moonshotai/kimi-k2-instruct' });

  const response = await client.generate(
    'You are a helpful assistant.',
    'Say "test successful"'
  );

  assert.ok(response);
  assert.strictEqual(typeof response, 'string');
  assert.ok(response.length > 0);
});

test('GroqClient should generate JSON output', async (t) => {
  if (!process.env.GROQ_API_KEY) {
    t.skip('GROQ_API_KEY not set');
    return;
  }

  const client = new GroqClient({ model: 'moonshotai/kimi-k2-instruct' });

  const json = await client.generateJSON(
    'Return only valid JSON.',
    'Return: {"status": "ok", "number": 42}'
  );

  assert.deepStrictEqual(json, { status: 'ok', number: 42 });
});
