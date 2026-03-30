#!/bin/bash

echo "========================================="
echo "Phase 4 Manual Test Instructions"
echo "========================================="
echo ""
echo "Pastikan .env file sudah ada dengan:"
echo "- MODAL_API_KEY_2 (untuk RiskAgent)"
echo "- MODAL_API_KEY_3 (untuk StrategyAgent)"
echo ""

echo "1. Test ModalClient Provider:"
echo "   timeout 60 node tests/unit/providers/test-modalClient.js"
echo ""

echo "2. Test RiskAgent:"
echo "   timeout 120 node tests/unit/agents/test-riskAgent.js"
echo ""

echo "3. Test StrategyAgent:"
echo "   timeout 120 node tests/unit/agents/test-strategyAgent.js"
echo ""

echo "4. Test DecisionOrchestrator (full pipeline):"
echo "   timeout 180 node tests/unit/agents/test-decisionOrchestrator.js"
echo ""

echo "5. Test Full Phase 4 (with Memory Agent):"
echo "   timeout 180 node test-phase4.js"
echo ""

echo "========================================="
echo "Note: GLM-5 response time sekitar 60-90 detik"
echo "========================================="
