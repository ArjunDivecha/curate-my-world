#!/usr/bin/env python3
"""
Direct Perplexity API Test - Theatre Events

Based on the user's successful Python code that returned 40 theatre events.
This will help us understand what response format we should expect.
"""

import requests
import os
import json
from datetime import datetime

def test_perplexity_theatre():
    """Test Perplexity API directly for theatre events"""
    
    # Get API key from environment or use the one from the user's working tests
    api_key = os.getenv('PERPLEXITY_API_KEY') or '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'
    
    if not api_key:
        print("❌ Error: No API key available")
        return
    
    print(f"🔑 Using API key: {api_key[:10]}...{api_key[-4:]}")
    
    # Use the exact query that worked in the user's test
    query = "get me a list of all the theatre events playing in the bay area over the next 30 days"
    
    print("🎭 Testing Perplexity API for Theatre Events")
    print("=" * 60)
    print(f"Query: {query}")
    print(f"Model: sonar-reasoning")
    print("=" * 60)
    
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json"
    }
    
    payload = {
        "model": "sonar-reasoning",
        "messages": [
            {
                "role": "user",
                "content": query
            }
        ],
        "max_tokens": 8000,
        "temperature": 0.1
    }
    
    try:
        print("📡 Making API call...")
        response = requests.post(
            "https://api.perplexity.ai/chat/completions",
            headers=headers,
            json=payload,
            timeout=60
        )
        
        print(f"📊 Response Status: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            content = data.get('choices', [{}])[0].get('message', {}).get('content', '')
            
            print(f"✅ Success! Content length: {len(content)} characters")
            print("\n" + "="*80)
            print("RAW RESPONSE:")
            print("="*80)
            print(content)
            print("="*80)
            
            # Analyze the response structure
            lines = content.split('\n')
            event_patterns = []
            
            for i, line in enumerate(lines):
                stripped = line.strip()
                if stripped:
                    # Look for event title patterns
                    if (stripped.startswith('**') and stripped.endswith('**')) or \
                       (stripped.startswith('- **') and '**' in stripped) or \
                       stripped.startswith('•') or \
                       stripped.startswith('-'):
                        event_patterns.append(f"Line {i+1}: {stripped}")
            
            print(f"\n🎭 ANALYSIS:")
            print(f"📝 Total lines: {len(lines)}")
            print(f"🎪 Potential event patterns found: {len(event_patterns)}")
            
            if event_patterns:
                print(f"\n📋 First 10 event patterns:")
                for pattern in event_patterns[:10]:
                    print(f"  {pattern}")
            
            # Check if it contains JSON
            if '```json' in content or content.strip().startswith('['):
                print("\n🔍 Response appears to contain JSON format")
            else:
                print("\n🔍 Response appears to be in narrative format")
            
            if data.get('usage'):
                print(f"\n💰 Usage: {data['usage']}")
                
        else:
            print(f"❌ Error: {response.status_code}")
            print(f"Response: {response.text}")
            
    except Exception as e:
        print(f"💥 Error: {str(e)}")

if __name__ == "__main__":
    test_perplexity_theatre()