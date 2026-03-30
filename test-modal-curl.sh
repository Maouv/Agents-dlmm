#!/bin/bash

# Test Modal API dengan curl
# Ganti <your-token> dengan API key yang valid

echo "Testing Modal API dengan curl..."
echo "Note: GLM-5 butuh waktu 60-90 detik"
echo ""

# Contoh command (jangan jalankan kalau tidak punya API key)
cat << 'EXAMPLE'
curl -X POST "https://api.us-west-2.modal.direct/v1/chat/completions" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_MODAL_API_KEY_2" \
  -d '{
    "model": "zai-org/GLM-5-FP8",
    "messages": [
      {"role": "user", "content": "Say test successful"}
    ],
    "temperature": 0.2,
    "max_tokens": 50
  }'
EXAMPLE

echo ""
echo "Jika curl berhasil tapi Node.js fetch gagal, masalahnya di:"
echo "1. Timeout (sekarang sudah di-fix: 180s)"
echo "2. Header/format request"
echo "3. Connection handling"
