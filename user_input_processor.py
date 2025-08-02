#!/usr/bin/env python3
"""
INPUT FILES:
- Optional: User chat history file (JSON, TXT, or structured format)
- Terminal input from user for preferences and location

OUTPUT FILES:
- curation_prompt.json: Structured prompt for AI curation system
- user_preferences.json: Processed user preferences for backend
- processing_log.txt: Log of user input processing and data quality

CURATE MY WORLD - USER INPUT PROCESSOR
=====================================

This standalone program captures user input from terminal and creates structured prompts
for the backend event curation system. It processes user preferences, location data,
and optional chat history to generate comprehensive instructions for AI-powered event discovery.

Author: Arjun Divecha
Version: 1.0
Last Updated: 2025-08-01

Features:
- Interactive terminal interface for user preference collection
- Chat history processing for RAG-based personalization
- Structured prompt generation for AI curation system
- Data validation and quality checks
- Privacy-conscious data handling with user consent
"""

import json
import os
import sys
import re
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any
import argparse
from pathlib import Path
from dotenv import load_dotenv
from anthropic import Anthropic

class UserInputProcessor:
    """
    Processes user input and generates structured prompts for the event curation system.
    
    This class handles:
    - Interactive user preference collection
    - Chat history analysis for personalization
    - Location and time preference processing
    - Structured prompt generation for AI systems
    """
    
    def __init__(self):
        self.user_preferences = {}
        self.chat_history_data = None
        self.llm_analysis = None
        self.processing_log = []
        self.output_dir = Path("outputs")
        self.output_dir.mkdir(exist_ok=True)
        
        # Load environment variables and initialize LLM client
        load_dotenv()
        self.anthropic_client = None
        self._init_llm_client()
        
    def _init_llm_client(self):
        """Initialize Anthropic client with API key from environment"""
        try:
            api_key = os.getenv('ANTHROPIC_API_KEY')
            if api_key and api_key != 'your_anthropic_api_key_here':
                self.anthropic_client = Anthropic(api_key=api_key)
                self.log_action("✅ Anthropic Claude client initialized")
            else:
                self.log_action("⚠️ No valid Anthropic API key found")
        except Exception as e:
            self.log_action(f"❌ Anthropic client initialization failed: {e}")
    
    def log_action(self, message: str):
        """Log processing actions with timestamp"""
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        log_entry = f"[{timestamp}] {message}"
        self.processing_log.append(log_entry)
        print(f"📝 {message}")
    
    def display_welcome(self):
        """Display welcome message and system overview"""
        print("\n" + "="*60)
        print("🌟 CURATE MY WORLD - EVENT PERSONALIZATION SYSTEM")
        print("="*60)
        print("This system will help create personalized event recommendations")
        print("by understanding your preferences and interests.")
        print("\nWe'll collect information about:")
        print("• Your location and preferred travel distance")
        print("• Event categories and interests")
        print("• Time preferences (weekdays/weekends, morning/evening)")
        print("• Optional: Your chat history for deeper personalization")
        print("="*60 + "\n")
    
    def get_location_preferences(self) -> Dict[str, Any]:
        """Collect user location and travel preferences"""
        print("📍 LOCATION PREFERENCES")
        print("-" * 25)
        
        # Primary location
        location = input("Enter your primary location (city, state/country): ").strip()
        if not location:
            location = "San Francisco, CA"  # Default from UI screenshot
            print(f"Using default location: {location}")
        
        # Travel radius
        print("\nHow far are you willing to travel for events?")
        print("1. Walking distance (0-2 miles)")
        print("2. Local area (2-10 miles)")
        print("3. Metro area (10-25 miles)")
        print("4. Regional (25-50 miles)")
        print("5. Custom distance")
        
        radius_choice = input("Select option (1-5): ").strip()
        radius_map = {
            "1": 2, "2": 10, "3": 25, "4": 50
        }
        
        if radius_choice in radius_map:
            radius_miles = radius_map[radius_choice]
        elif radius_choice == "5":
            try:
                radius_miles = int(input("Enter custom radius in miles: "))
            except ValueError:
                radius_miles = 10
                print("Invalid input, using 10 miles")
        else:
            radius_miles = 10
            print("Invalid selection, using 10 miles")
        
        self.log_action(f"Location set to {location} with {radius_miles} mile radius")
        
        return {
            "primary_location": location,
            "radius_miles": radius_miles,
            "coordinates": None  # To be geocoded by backend
        }
    
    def get_category_preferences(self) -> Dict[str, float]:
        """Collect user interest categories with weighting"""
        print("\n🎯 INTEREST CATEGORIES")
        print("-" * 22)
        
        # Categories from the UI screenshot
        categories = [
            "Music", "Theatre", "Art", "Food", "Tech", 
            "Education", "Movies", "Sports", "Nightlife",
            "Outdoor", "Literature", "Health", "Business"
        ]
        
        print("Rate your interest in each category (0-5 scale):")
        print("0 = Not interested, 3 = Moderate interest, 5 = Very interested")
        print("Press Enter to skip a category\n")
        
        preferences = {}
        for category in categories:
            while True:
                try:
                    response = input(f"{category}: ").strip()
                    if not response:
                        break
                    
                    rating = float(response)
                    if 0 <= rating <= 5:
                        preferences[category.lower()] = rating
                        break
                    else:
                        print("Please enter a number between 0 and 5")
                except ValueError:
                    print("Please enter a valid number")
        
        self.log_action(f"Collected preferences for {len(preferences)} categories")
        return preferences
    
    def get_time_preferences(self) -> Dict[str, Any]:
        """Collect user time and schedule preferences"""
        print("\n⏰ TIME PREFERENCES")
        print("-" * 19)
        
        # Day preferences
        print("Which days do you prefer for events? (select multiple)")
        print("1. Weekdays (Mon-Fri)")
        print("2. Weekends (Sat-Sun)")
        print("3. Both weekdays and weekends")
        
        day_choice = input("Select option (1-3): ").strip()
        day_map = {
            "1": ["weekdays"],
            "2": ["weekends"], 
            "3": ["weekdays", "weekends"]
        }
        preferred_days = day_map.get(day_choice, ["weekdays", "weekends"])
        
        # Time of day preferences
        print("\nWhat times of day do you prefer? (select multiple)")
        print("1. Morning (6am-12pm)")
        print("2. Afternoon (12pm-5pm)")
        print("3. Evening (5pm-9pm)")
        print("4. Night (9pm+)")
        
        time_input = input("Enter numbers separated by commas (e.g., 2,3): ").strip()
        time_map = {
            "1": "morning", "2": "afternoon", "3": "evening", "4": "night"
        }
        
        preferred_times = []
        if time_input:
            for num in time_input.split(","):
                num = num.strip()
                if num in time_map:
                    preferred_times.append(time_map[num])
        
        if not preferred_times:
            preferred_times = ["evening"]  # Default
        
        # Advance notice preference
        print("\nHow far in advance do you like to plan events?")
        print("1. Same day")
        print("2. 1-3 days")
        print("3. 1 week")
        print("4. 2+ weeks")
        
        notice_choice = input("Select option (1-4): ").strip()
        notice_map = {
            "1": 0, "2": 3, "3": 7, "4": 14
        }
        advance_notice_days = notice_map.get(notice_choice, 7)
        
        self.log_action(f"Time preferences: {preferred_days} days, {preferred_times} times")
        
        return {
            "preferred_days": preferred_days,
            "preferred_times": preferred_times,
            "advance_notice_days": advance_notice_days
        }
    
    def get_additional_preferences(self) -> Dict[str, Any]:
        """Collect additional user preferences and constraints"""
        print("\n🎛️  ADDITIONAL PREFERENCES")
        print("-" * 26)
        
        # Price preferences
        print("What's your preferred price range for events?")
        print("1. Free events only")
        print("2. Under $25")
        print("3. Under $50")
        print("4. Under $100")
        print("5. No price limit")
        
        price_choice = input("Select option (1-5): ").strip()
        price_map = {
            "1": {"max": 0, "preference": "free"},
            "2": {"max": 25, "preference": "budget"},
            "3": {"max": 50, "preference": "moderate"},
            "4": {"max": 100, "preference": "premium"},
            "5": {"max": None, "preference": "unlimited"}
        }
        price_pref = price_map.get(price_choice, price_map["3"])
        
        # Group size preference
        print("\nWhat type of events do you prefer?")
        print("1. Intimate/small groups (under 50 people)")
        print("2. Medium events (50-200 people)")
        print("3. Large events (200+ people)")
        print("4. No preference")
        
        size_choice = input("Select option (1-4): ").strip()
        size_map = {
            "1": "intimate", "2": "medium", "3": "large", "4": "any"
        }
        group_size_pref = size_map.get(size_choice, "any")
        
        # Special requirements
        accessibility_needed = input("\nDo you need wheelchair accessibility? (y/n): ").lower().startswith('y')
        parking_needed = input("Do you need parking availability? (y/n): ").lower().startswith('y')
        
        self.log_action("Collected additional preferences")
        
        return {
            "price_preference": price_pref,
            "group_size_preference": group_size_pref,
            "accessibility_required": accessibility_needed,
            "parking_required": parking_needed
        }
    
    # Advance notice preference
    print("\nHow far in advance do you like to plan events?")
    print("1. Same day")
    print("2. 1-3 days")
    print("3. 1 week")
    print("4. 2+ weeks")
    
    notice_choice = input("Select option (1-4): ").strip()
    notice_map = {
        "1": 0, "2": 3, "3": 7, "4": 14
    }
    advance_notice_days = notice_map.get(notice_choice, 7)
    
    self.log_action(f"Time preferences: {preferred_days} days, {preferred_times} times")
    
    return {
        "preferred_days": preferred_days,
        "preferred_times": preferred_times,
        "advance_notice_days": advance_notice_days
    }

def get_additional_preferences(self) -> Dict[str, Any]:
    """Collect additional user preferences and constraints"""
    print("\n🎛️  ADDITIONAL PREFERENCES")
    print("-" * 26)
    
    # Price preferences
    print("What's your preferred price range for events?")
    print("1. Free events only")
    print("2. Under $25")
    print("3. Under $50")
    print("4. Under $100")
    print("5. No price limit")
    
    price_choice = input("Select option (1-5): ").strip()
    price_map = {
        "1": {"max": 0, "preference": "free"},
        "2": {"max": 25, "preference": "budget"},
        "3": {"max": 50, "preference": "moderate"},
        "4": {"max": 100, "preference": "premium"},
        "5": {"max": None, "preference": "unlimited"}
    }
    price_pref = price_map.get(price_choice, price_map["3"])
    
    # Group size preference
    print("\nWhat type of events do you prefer?")
    print("1. Intimate/small groups (under 50 people)")
    print("2. Medium events (50-200 people)")
    print("3. Large events (200+ people)")
    print("4. No preference")
    
    size_choice = input("Select option (1-4): ").strip()
    size_map = {
        "1": "intimate", "2": "medium", "3": "large", "4": "any"
    }
    group_size_pref = size_map.get(size_choice, "any")
    
    # Special requirements
    accessibility_needed = input("\nDo you need wheelchair accessibility? (y/n): ").lower().startswith('y')
    parking_needed = input("Do you need parking availability? (y/n): ").lower().startswith('y')
    
    self.log_action("Collected additional preferences")
    
    return {
        "price_preference": price_pref,
        "group_size_preference": group_size_pref,
        "accessibility_required": accessibility_needed,
        "parking_required": parking_needed
    }

def parse_conversation_file(self, file_path: str) -> List[Dict[str, Any]]:
    """Parse the specific conversation format from the text file"""
    conversations = []
    
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
        
        # Split by conversation markers
        conversation_blocks = re.split(r'## CONVERSATION \d+', content)
        
        for block in conversation_blocks[1:]:  # Skip header
            if not block.strip():
                continue
                
            # Extract conversation ID
            id_match = re.search(r'\(ID: ([^)]+)\)', block)
            conv_id = id_match.group(1) if id_match else "unknown"
            
            # Extract messages
            messages = []
            
            # Find all HUMAN messages
            human_messages = re.findall(r'### HUMAN \(([^)]+)\)\n([^#]+?)(?=### ASSISTANT|---|

|$)', block, re.DOTALL)
            
            # Find all ASSISTANT messages  
            assistant_messages = re.findall(r'### ASSISTANT \(([^)]+)\)\n([^#]+?)(?=### HUMAN|---|

|$)', block, re.DOTALL)
            
            # Combine and sort by timestamp
            all_messages = []
            for timestamp, content in human_messages:
                all_messages.append({
                    'role': 'human',
                    'timestamp': timestamp,
                    'content': content.strip()
                })
            
            for timestamp, content in assistant_messages:
                all_messages.append({
                    'role': 'assistant', 
                    'timestamp': timestamp,
                    'content': content.strip()
                })
            
            # Sort by timestamp
            all_messages.sort(key=lambda x: x['timestamp'])
            
            if all_messages:
                conversations.append({
                    'id': conv_id,
                    'messages': all_messages
                })
        
        self.log_action(f"Parsed {len(conversations)} conversations from file")
        return conversations
        
    except Exception as e:
        self.log_action(f"Error parsing conversation file: {e}")
        return []

def analyze_conversations_with_llm(self, conversations: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Use LLM to analyze conversations and extract event preferences"""
    if not conversations:
        return {}
    
    # Sample conversations for analysis (to avoid token limits)
    sample_size = min(50, len(conversations))
    sampled_convs = conversations[:sample_size]
    
    # Prepare conversation text for analysis
    conversation_text = ""
    for conv in sampled_convs:
        conversation_text += f"\n\nConversation {conv['id']}:\n"
        for msg in conv['messages']:
            role = msg['role'].upper()
            conversation_text += f"{role}: {msg['content'][:500]}...\n"  # Limit message length
    
    # Limit total text length
    if len(conversation_text) > 15000:
        conversation_text = conversation_text[:15000] + "\n\n[TRUNCATED]"
    
    analysis_prompt = f"""
Analyze the following conversation history and extract insights about the user's preferences for events and activities. Focus on:

1. **Interest Categories**: What topics, activities, or domains does the user seem interested in?
2. **Event Types**: What kinds of events, activities, or experiences might they enjoy?
3. **Learning Style**: How do they prefer to learn or engage with new information?
4. **Problem-Solving Approach**: What does their approach to problems tell us about their preferences?
5. **Lifestyle Indicators**: Any clues about their lifestyle, schedule, or constraints?

Conversation History:
{conversation_text}

Please provide a structured analysis in JSON format with the following keys:
- "interest_categories": List of interest areas with confidence scores (0-1)
- "preferred_event_types": List of event types they might enjoy
- "personality_traits": Key traits that influence event preferences
- "lifestyle_factors": Factors that might affect event attendance
- "recommendation_strategy": How to best recommend events to this user

Be specific and actionable in your analysis.
"""
    
    try:
        # Try OpenAI first, then Anthropic
        if self.openai_client:
            self.log_action("Analyzing conversations with OpenAI...")
            response = self.openai_client.chat.completions.create(
                model="gpt-4",
                messages=[
                    {"role": "system", "content": "You are an expert at analyzing conversation patterns to understand user preferences for events and activities. Provide detailed, actionable insights."},
                    {"role": "user", "content": analysis_prompt}
                ],
                temperature=0.3
            )
            analysis_text = response.choices[0].message.content
            
        elif self.anthropic_client:
            self.log_action("Analyzing conversations with Anthropic...")
            response = self.anthropic_client.messages.create(
                model="claude-3-sonnet-20240229",
                max_tokens=2000,
                messages=[
                    {"role": "user", "content": analysis_prompt}
                ]
            )
            analysis_text = response.content[0].text
        else:
            self.log_action("No LLM clients available - using basic analysis")
            return self._basic_conversation_analysis(conversations)
        
        # Try to parse JSON from the response
        try:
            # Extract JSON from the response
            json_match = re.search(r'\{.*\}', analysis_text, re.DOTALL)
            if json_match:
                analysis_json = json.loads(json_match.group())
            else:
                # Fallback: create structured response from text
                analysis_json = {
                    "interest_categories": [],
                    "preferred_event_types": [],
                    "personality_traits": [],
                    "lifestyle_factors": [],
                    "recommendation_strategy": analysis_text[:500],
                    "raw_analysis": analysis_text
                }
            
            self.log_action("LLM analysis completed successfully")
            return analysis_json
            
        except json.JSONDecodeError:
            self.log_action("Could not parse JSON from LLM response, using raw text")
            return {
                "raw_analysis": analysis_text,
                "analysis_method": "llm_text_only"
            }
            
    except Exception as e:
        self.log_action(f"LLM analysis failed: {e}")
        return self._basic_conversation_analysis(conversations)

def _basic_conversation_analysis(self, conversations: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Basic keyword-based analysis as fallback"""
    all_text = ""
    for conv in conversations:
        for msg in conv['messages']:
            if msg['role'] == 'human':
                all_text += " " + msg['content'].lower()
    
    # Simple keyword matching for interests
    interest_keywords = {
        "technology": ["python", "code", "programming", "tech", "software", "ai", "machine learning"],
        "finance": ["stock", "trading", "investment", "market", "spy", "etf", "portfolio"],
        "automotive": ["tesla", "car", "vehicle", "charging", "electric"],
        "data_analysis": ["plot", "data", "analysis", "correlation", "chart", "graph"],
        "diy_repair": ["fix", "repair", "maintenance", "troubleshoot"]
    }
    
    detected_interests = []
    for category, keywords in interest_keywords.items():
        if any(keyword in all_text for keyword in keywords):
            detected_interests.append(category)
    
    return {
        "interest_categories": detected_interests,
        "analysis_method": "basic_keyword_matching",
        "total_conversations": len(conversations)
    }

def process_chat_history(self, file_path: Optional[str] = None):
    """Process user chat history for RAG-based personalization"""
    if not file_path:
        use_history = input("\nDo you have chat history to analyze for personalization? (y/n): ").strip().lower()
        if use_history != 'y':
            self.log_action("User opted out of chat history analysis")
            return None
        
        file_path = input("Enter path to chat history file: ").strip()
    
    if not file_path or not os.path.exists(file_path):
        self.log_action(f"Chat history file not found: {file_path}")
        return None
    
    try:
        self.log_action(f"Processing chat history from: {file_path}")
        
        # Check if it's the conversation format
        if "conversations_llm_format" in file_path or file_path.endswith(".txt"):
            # Parse the conversation format
            conversations = self.parse_conversation_file(file_path)
            if conversations:
                # Use LLM to analyze conversations
                self.llm_analysis = self.analyze_conversations_with_llm(conversations)
                self.log_action(f"LLM analysis completed for {len(conversations)} conversations")
                return {
                    "conversations": conversations,
                    "llm_analysis": self.llm_analysis,
                    "format": "conversation_history"
                }
        else:
            # Try to read as JSON first
            with open(file_path, 'r', encoding='utf-8') as f:
                if file_path.endswith('.json'):
                    chat_data = json.load(f)
                else:
                    # Assume text format, read as string
                    content = f.read()
                    chat_data = {"raw_content": content, "format": "text"}
            
            # Analyze the chat content
            analysis = self.analyze_chat_content(chat_data)
            
            self.log_action(f"Chat history analysis completed: {len(str(chat_data))} characters processed")
            return analysis
        
    except Exception as e:
        self.log_action(f"Error processing chat history: {e}")
        return None

def get_ai_instructions(self) -> str:
    """Get custom AI instructions from user"""
    print("\n🤖 AI INSTRUCTIONS")
    print("-" * 17)
    print("Provide any specific instructions for the AI curation system.")
    print("For example: 'Focus on unique local experiences' or 'Avoid crowded venues'")
    print("Press Enter to skip or type 'default' for standard curation.")
    
    instructions = input("Your instructions: ").strip()
    
    if not instructions or instructions.lower() == 'default':
        instructions = "Show me all events in the area regardless of category, type, or style. I want to discover everything that's happening."
            "data_sources": {
                "scraping_enabled": True,
                "social_media_monitoring": True,
                "rss_feeds": True,
                "api_sources": ["ticketmaster", "eventbrite", "meetup"],
                "local_sources": True
            },
            "output_requirements": {
                "format": "structured_json",
                "include_reasoning": True,
                "include_alternatives": True,
                "max_description_length": 200
            }
        }
        
        # Add chat history analysis if available
        if self.chat_history_data:
            prompt_data["personalization_data"] = self.chat_history_data
        
        return prompt_data
    
    def save_outputs(self):
        """Save all processed data to output files"""
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        
        # Save curation prompt
        prompt_data = self.generate_curation_prompt()
        prompt_file = self.output_dir / f"curation_prompt_{timestamp}.json"
        with open(prompt_file, 'w', encoding='utf-8') as f:
            json.dump(prompt_data, f, indent=2, ensure_ascii=False)
        
        # Save user preferences
        prefs_file = self.output_dir / f"user_preferences_{timestamp}.json"
        with open(prefs_file, 'w', encoding='utf-8') as f:
            json.dump(self.user_preferences, f, indent=2, ensure_ascii=False)
        
        # Save processing log
        log_file = self.output_dir / f"processing_log_{timestamp}.txt"
        with open(log_file, 'w', encoding='utf-8') as f:
            f.write("CURATE MY WORLD - USER INPUT PROCESSING LOG\n")
            f.write("=" * 45 + "\n\n")
            for log_entry in self.processing_log:
                f.write(log_entry + "\n")
        
        print(f"\n✅ OUTPUT FILES GENERATED:")
        print(f"📄 Curation Prompt: {prompt_file}")
        print(f"📄 User Preferences: {prefs_file}")
        print(f"📄 Processing Log: {log_file}")
        
        return {
            "curation_prompt": str(prompt_file),
            "user_preferences": str(prefs_file),
            "processing_log": str(log_file)
        }
    
    def run_interactive_session(self, chat_history_file: Optional[str] = None):
        """Run the complete interactive user input session"""
        self.display_welcome()
        
        # Collect all user preferences
        self.user_preferences["location"] = self.get_location_preferences()
        self.user_preferences["categories"] = self.get_category_preferences()
        self.user_preferences["time_preferences"] = self.get_time_preferences()
        self.user_preferences["additional_preferences"] = self.get_additional_preferences()
        self.user_preferences["ai_instructions"] = self.get_ai_instructions()
        
        # Process chat history if provided
        self.chat_history_data = self.process_chat_history(chat_history_file)
        
        # Generate summary
        print("\n" + "="*60)
        print("📋 PREFERENCE SUMMARY")
        print("="*60)
        
        location = self.user_preferences["location"]
        print(f"📍 Location: {location['primary_location']} ({location['radius_miles']} mile radius)")
        
        categories = self.user_preferences["categories"]
        if categories:
            print(f"🎯 Top Interests: {', '.join([k.title() for k, v in sorted(categories.items(), key=lambda x: x[1], reverse=True)[:3]])}")
        
        time_prefs = self.user_preferences["time_preferences"]
        print(f"⏰ Preferred Times: {', '.join(time_prefs['preferred_times']).title()}")
        print(f"📅 Preferred Days: {', '.join(time_prefs['preferred_days']).title()}")
        
        if self.chat_history_data:
            print("💬 Chat History: Processed for personalization")
        
        print("="*60)
        
        # Save all outputs
        output_files = self.save_outputs()
        
        print(f"\n🎉 Setup complete! Your personalized event curation system is ready.")
        print(f"The backend can now use these files to fetch and curate events for you.")
        
        return output_files

def main():
    """Main entry point for the user input processor"""
    parser = argparse.ArgumentParser(
        description="Curate My World - User Input Processor",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python user_input_processor.py                    # Interactive mode
  python user_input_processor.py --chat-history chat.json  # With chat history
  python user_input_processor.py --help            # Show this help
        """
    )
    
    parser.add_argument(
        '--chat-history', 
        type=str, 
        help='Path to chat history file (JSON or TXT format)'
    )
    
    parser.add_argument(
        '--output-dir',
        type=str,
        default='outputs',
        help='Directory to save output files (default: outputs)'
    )
    
    args = parser.parse_args()
    
    try:
        processor = UserInputProcessor()
        
        # Set custom output directory if specified
        if args.output_dir:
            processor.output_dir = Path(args.output_dir)
            processor.output_dir.mkdir(exist_ok=True)
        
        # Run interactive session
        output_files = processor.run_interactive_session(args.chat_history)
        
        print(f"\n🚀 Next Steps:")
        print(f"1. Use {output_files['curation_prompt']} to configure your AI curation system")
        print(f"2. The backend will process these preferences to fetch relevant events")
        print(f"3. Check the processing log for any data quality issues")
        
    except KeyboardInterrupt:
        print(f"\n\n👋 Session cancelled by user. No files were saved.")
        sys.exit(0)
    except Exception as e:
        print(f"\n❌ Error: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
