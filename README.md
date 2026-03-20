# TrustGate AI – Healthcare Decision Validator

TrustGate AI is a Gemini-powered system that converts unstructured medical input into structured, validated, and safe decision outputs.

## Live Demo
https://trustgate-ai-330590562274.us-west1.run.app

## Problem
Healthcare inputs are often incomplete and ambiguous, leading to unsafe or unreliable AI responses.

## Solution
TrustGate AI validates input before generating decisions by analyzing:
- Data completeness  
- Context relevance  
- Consistency  
- Risk level  

It then computes a confidence score and returns a safe decision.

## How It Works
Input → Gemini Processing → Validation Layer → Confidence Score → Decision (APPROVE / WARNING / BLOCK)

## Example
Input:  
Patient has high leukocytes count and mild fever  

Output:
```json
{
  "confidence_score": 0.71,
  "risk_level": "medium",
  "final_decision": "WARNING"
}
