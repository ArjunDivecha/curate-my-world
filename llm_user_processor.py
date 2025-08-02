#!/usr/bin/env python3
"""
INPUT FILES:
- conversations_llm_format.txt: User conversation history in structured format
- .env: API keys for LLM analysis

OUTPUT FILES:
- curation_prompt_[timestamp].json: Enhanced prompt with LLM insights
- user_preferences_[timestamp].json: User preferences with AI analysis
- processing_log_[timestamp].txt: Processing log

CURATE MY WORLD - LLM-ENHANCED USER PROCESSOR
============================================

This program reads conversation history, uses Claude Sonnet 4 to analyze it,
and generates personalized event curation prompts.

Author: Arjun Divecha
Version: 2.0 - LLM Enhanced
Last Updated: 2025-08-01
"""

import json
import os
import sys
import re
from datetime import datetime
from typing import Dict, List, Optional, Any
from pathlib import Path
from dotenv import load_dotenv
from anthropic import Anthropic

class LLMUserProcessor:
    """Enhanced user processor with Claude Sonnet 4 conversation analysis"""
    
    def __init__(self):
        self.user_preferences = {}
        self.llm_analysis = None
        self.processing_log = []
        self.output_dir = Path("outputs")
        self.output_dir.mkdir(exist_ok=True)
        
        # Load environment and initialize Claude
        load_dotenv()
        self.anthropic_client = None
        self._init_claude()
    
    def _init_claude(self):
        """Initialize Claude Sonnet 4 client"""
        try:
            api_key = os.getenv('ANTHROPIC_API_KEY')
            if api_key and api_key != 'your_anthropic_api_key_here':
                self.anthropic_client = Anthropic(api_key=api_key)
                self.log("✅ Claude Sonnet 4 client initialized")
            else:
                self.log("⚠️ No valid Anthropic API key found in .env file")
        except Exception as e:
            self.log(f"❌ Claude initialization failed: {e}")
    
    def log(self, message: str):
        """Log with timestamp"""
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        log_entry = f"[{timestamp}] {message}"
        self.processing_log.append(log_entry)
        print(f"📝 {message}")
    
    def parse_conversations(self, file_path: str) -> List[Dict[str, Any]]:
        """Parse conversation file format"""
        conversations = []
        
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                content = f.read()
            
            # Split by conversation markers
            blocks = re.split(r'## CONVERSATION \d+', content)
            
            for block in blocks[1:]:  # Skip header
                if not block.strip():
                    continue
                
                # Extract ID
                id_match = re.search(r'\(ID: ([^)]+)\)', block)
                conv_id = id_match.group(1) if id_match else "unknown"
                
                # Extract messages
                human_msgs = re.findall(r'### HUMAN \(([^)]+)\)\n([^#]+?)(?=### ASSISTANT|---|$)', block, re.DOTALL)
                assistant_msgs = re.findall(r'### ASSISTANT \(([^)]+)\)\n([^#]+?)(?=### HUMAN|---|$)', block, re.DOTALL)
                
                messages = []
                for timestamp, content in human_msgs:
                    messages.append({
                        'role': 'human',
                        'timestamp': timestamp,
                        'content': content.strip()
                    })
                
                for timestamp, content in assistant_msgs:
                    messages.append({
                        'role': 'assistant',
                        'timestamp': timestamp,
                        'content': content.strip()
                    })
                
                messages.sort(key=lambda x: x['timestamp'])
                
                if messages:
                    conversations.append({
                        'id': conv_id,
                        'messages': messages
                    })
            
            self.log(f"Parsed {len(conversations)} conversations")
            return conversations
            
        except Exception as e:
            self.log(f"Error parsing conversations: {e}")
            return []
    
    def analyze_with_claude(self, conversations: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Use Claude Sonnet 4 to analyze conversations for event preferences"""
        if not conversations or not self.anthropic_client:
            return self._basic_analysis(conversations)
        
        # Sample conversations to avoid token limits
        sample_size = min(30, len(conversations))
        sampled = conversations[:sample_size]
        
        # Prepare text for analysis
        conversation_text = ""
        for conv in sampled:
            conversation_text += f"\n\nConversation {conv['id']}:\n"
            for msg in conv['messages']:
                role = msg['role'].upper()
                content = msg['content'][:600]  # Limit length
                conversation_text += f"{role}: {content}...\n"
        
        # Limit total length
        if len(conversation_text) > 18000:
            conversation_text = conversation_text[:18000] + "\n\n[TRUNCATED]"
        
        prompt = f"""
Analyze this conversation history to understand the user's preferences for events and activities.

Extract insights about:
1. Interest categories (technology, finance, automotive, etc.)
2. Preferred event types (workshops, conferences, social events, etc.)
3. Learning style and engagement preferences
4. Lifestyle factors that affect event attendance
5. Social preferences (group size, networking style)

Conversation History:
{conversation_text}

Provide a JSON response with:
{{
  "interest_categories": [
    {{"category": "technology", "confidence": 0.9, "evidence": "frequent programming questions"}},
    {{"category": "finance", "confidence": 0.8, "evidence": "stock market analysis requests"}}
  ],
  "preferred_event_types": ["tech workshops", "data analysis meetups", "investment seminars"],
  "personality_traits": ["analytical", "detail-oriented", "problem-solver"],
  "lifestyle_factors": ["busy schedule", "prefers evening events", "values practical learning"],
  "social_preferences": {{"group_size": "small to medium", "networking_style": "professional"}},
  "learning_style": "hands-on with practical applications",
  "recommendation_strategy": "Focus on technical workshops and data-driven events",
  "key_insights": ["Strong technical background", "Interest in financial markets", "Prefers actionable learning"]
}}

Be specific and actionable for event curation.
"""
        
        try:
            self.log("🤖 Analyzing conversations with Claude Sonnet 4...")
            
            response = self.anthropic_client.messages.create(
                model="claude-3-5-sonnet-20241022",
                max_tokens=2500,
                temperature=0.3,
                messages=[{"role": "user", "content": prompt}]
            )
            
            analysis_text = response.content[0].text
            self.log("✅ Claude analysis completed")
            
            # Parse JSON response
            try:
                json_match = re.search(r'\{.*\}', analysis_text, re.DOTALL)
                if json_match:
                    analysis = json.loads(json_match.group())
                    self.log("✅ Successfully parsed structured analysis")
                    return analysis
                else:
                    self.log("⚠️ Could not parse JSON, using text fallback")
                    return {
                        "raw_analysis": analysis_text,
                        "analysis_method": "claude_text_only"
                    }
            except json.JSONDecodeError:
                self.log("⚠️ JSON parsing failed")
                return {
                    "raw_analysis": analysis_text,
                    "analysis_method": "claude_text_only"
                }
                
        except Exception as e:
            self.log(f"❌ Claude analysis failed: {e}")
            return self._basic_analysis(conversations)
    
    def _basic_analysis(self, conversations: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Fallback keyword-based analysis"""
        all_text = ""
        for conv in conversations:
            for msg in conv['messages']:
                if msg['role'] == 'human':
                    all_text += " " + msg['content'].lower()
        
        # Keyword matching
        keywords = {
            "technology": ["python", "code", "programming", "tech", "software", "ai"],
            "finance": ["stock", "trading", "investment", "market", "spy", "etf"],
            "automotive": ["tesla", "car", "vehicle", "charging"],
            "data_analysis": ["plot", "data", "analysis", "correlation"],
            "education": ["learn", "course", "tutorial", "study"]
        }
        
        detected = []
        for category, words in keywords.items():
            if any(word in all_text for word in words):
                detected.append({
                    "category": category,
                    "confidence": 0.6
                })
        
        return {
            "interest_categories": detected,
            "analysis_method": "basic_keyword_matching",
            "total_conversations": len(conversations)
        }
    
    def get_basic_preferences(self) -> Dict[str, Any]:
        """Get basic user preferences interactively"""
        print("\n🌟 CURATE MY WORLD - LLM ENHANCED PROCESSOR")
        print("=" * 50)
        
        # Location
        location = input("Enter your location (default: San Francisco, CA): ").strip()
        if not location:
            location = "San Francisco, CA"
        
        # Travel radius
        print("\nTravel radius:")
        print("1. Local (2-10 miles)")
        print("2. Metro area (10-25 miles)")
        print("3. Regional (25+ miles)")
        
        radius_choice = input("Select (1-3): ").strip()
        radius_map = {"1": 10, "2": 25, "3": 50}
        radius = radius_map.get(radius_choice, 10)
        
        # Event preferences
        print("\nEvent preferences:")
        print("1. Free events only")
        print("2. Under $50")
        print("3. No price limit")
        
        price_choice = input("Select (1-3): ").strip()
        price_map = {
            "1": {"max": 0, "preference": "free"},
            "2": {"max": 50, "preference": "budget"},
            "3": {"max": None, "preference": "unlimited"}
        }
        price_pref = price_map.get(price_choice, price_map["2"])
        
        self.log("Collected basic preferences")
        
        return {
            "location": {
                "primary_location": location,
                "radius_miles": radius
            },
            "price_preference": price_pref,
            "collected_at": datetime.now().isoformat()
        }
    
    def generate_enhanced_prompt(self) -> Dict[str, Any]:
        """Generate enhanced curation prompt with LLM insights"""
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        
        prompt_data = {
            "metadata": {
                "timestamp": timestamp,
                "system_version": "2.0_llm_enhanced",
                "llm_analysis_available": self.llm_analysis is not None
            },
            "user_preferences": self.user_preferences,
            "llm_analysis": self.llm_analysis,
            "curation_instructions": {
                "location": self.user_preferences.get("location", {}),
                "price_constraints": self.user_preferences.get("price_preference", {}),
                "ai_insights": self.llm_analysis
            }
        }
        
        # Add enhanced instructions if LLM analysis available
        if self.llm_analysis:
            interests = self.llm_analysis.get('interest_categories', [])
            if interests:
                top_interests = [
                    item.get('category', str(item)) if isinstance(item, dict) else str(item)
                    for item in interests[:3]
                ]
                
                enhanced_instructions = f"""
🎯 LLM-ENHANCED PERSONALIZATION:

Primary Interests: {', '.join(top_interests)}
Event Types: {', '.join(self.llm_analysis.get('preferred_event_types', [])[:3])}
Learning Style: {self.llm_analysis.get('learning_style', 'Not specified')}
Strategy: {self.llm_analysis.get('recommendation_strategy', 'Standard curation')}

Use these AI insights to curate highly personalized events.
"""
                prompt_data["curation_instructions"]["llm_enhanced_instructions"] = enhanced_instructions
        
        return prompt_data
    
    def save_outputs(self) -> Dict[str, str]:
        """Save all outputs to files"""
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        
        # Generate prompt
        prompt = self.generate_enhanced_prompt()
        
        # Save files
        prompt_file = self.output_dir / f"curation_prompt_{timestamp}.json"
        prefs_file = self.output_dir / f"user_preferences_{timestamp}.json"
        log_file = self.output_dir / f"processing_log_{timestamp}.txt"
        
        with open(prompt_file, 'w', encoding='utf-8') as f:
            json.dump(prompt, f, indent=2, ensure_ascii=False)
        
        with open(prefs_file, 'w', encoding='utf-8') as f:
            json.dump({
                "user_preferences": self.user_preferences,
                "llm_analysis": self.llm_analysis
            }, f, indent=2, ensure_ascii=False)
        
        with open(log_file, 'w', encoding='utf-8') as f:
            f.write("LLM-ENHANCED PROCESSING LOG\n")
            f.write("=" * 30 + "\n\n")
            for entry in self.processing_log:
                f.write(entry + "\n")
        
        print(f"\n✅ FILES CREATED:")
        print(f"📄 Curation Prompt: {prompt_file}")
        print(f"📄 User Preferences: {prefs_file}")
        print(f"📄 Processing Log: {log_file}")
        
        return {
            "curation_prompt": str(prompt_file),
            "user_preferences": str(prefs_file),
            "processing_log": str(log_file)
        }
    
    def process_conversation_file(self, file_path: str):
        """Main processing function"""
        print(f"\n🔍 Processing conversation file: {file_path}")
        
        # Parse conversations
        conversations = self.parse_conversations(file_path)
        if not conversations:
            print("❌ No conversations found")
            return
        
        # Analyze with Claude
        self.llm_analysis = self.analyze_with_claude(conversations)
        
        # Get basic preferences
        self.user_preferences = self.get_basic_preferences()
        
        # Save outputs
        output_files = self.save_outputs()
        
        print(f"\n🎉 Processing complete!")
        print(f"📊 Analyzed {len(conversations)} conversations")
        
        if self.llm_analysis and 'key_insights' in self.llm_analysis:
            print(f"💡 Key Insights: {', '.join(self.llm_analysis['key_insights'][:2])}")
        
        return output_files

def main():
    """Main entry point"""
    if len(sys.argv) > 1:
        file_path = sys.argv[1]
    else:
        file_path = input("Enter path to conversation file: ").strip()
    
    if not os.path.exists(file_path):
        print(f"❌ File not found: {file_path}")
        return
    
    processor = LLMUserProcessor()
    processor.process_conversation_file(file_path)

if __name__ == "__main__":
    main()
