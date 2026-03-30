// Test Modal API dengan berbagai cara
const https = require('https');

// Test 1: Native fetch (seperti di modalClient.js)
async function testWithFetch() {
  console.log('Test 1: Native fetch...');
  
  const apiKey = process.env.MODAL_API_KEY_2;
  const url = 'https://api.us-west-2.modal.direct/v1/chat/completions';
  
  const body = {
    model: 'zai-org/GLM-5-FP8',
    messages: [
      { role: 'system', content: 'You are a helpful assistant.' },
      { role: 'user', content: 'Say "test" and nothing else.' }
    ],
    temperature: 0.2,
    max_tokens: 50
  };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    console.log('Status:', response.status);
    const data = await response.json();
    console.log('Response:', JSON.stringify(data, null, 2));
    return true;
  } catch (error) {
    console.error('Error:', error.message);
    return false;
  }
}

// Test 2: Curl equivalent
async function testWithCurl() {
  console.log('\nTest 2: Curl command...');
  
  const apiKey = process.env.MODAL_API_KEY_2;
  const curlCmd = `curl -X POST https://api.us-west-2.modal.direct/v1/chat/completions \
    -H "Authorization: Bearer ${apiKey}" \
    -H "Content-Type: application/json" \
    -d '{
      "model": "zai-org/GLM-5-FP8",
      "messages": [
        {"role": "system", "content": "You are a helpful assistant."},
        {"role": "user", "content": "Say test"}
      ],
      "temperature": 0.2,
      "max_tokens": 50
    }'`;
  
  console.log('Curl command:', curlCmd);
}

// Run tests
(async () => {
  await testWithFetch();
  await testWithCurl();
})();
