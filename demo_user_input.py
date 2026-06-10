#!/usr/bin/env python3
"""
=============================================================================
SCRIPT NAME: demo_user_input.py
=============================================================================

INPUT FILES:
- sample_chat_history.json (optional): Pre-configured sample chat history for
  demonstration. Expected in the current working directory.
- user_input_processor.py: Imported main processor module (sibling file in the
  same curate-my-world project directory).

OUTPUT FILES:
- demo_outputs/curation_prompt_YYYYMMDD_HHMMSS.json: Generated curation prompt.
- demo_outputs/user_preferences_YYYYMMDD_HHMMSS.json: Processed user preferences.
- demo_outputs/processing_log_YYYYMMDD_HHMMSS.txt: Processing log.
  All output files written to demo_outputs/ relative to current working directory.

VERSION: 1.0
LAST UPDATED: 2026-06-05
AUTHOR: Arjun Divecha

DESCRIPTION:
Demonstration script for the Curate My World user input processor. Loads
pre-configured sample user preferences, optionally processes a sample chat
history file, and generates structured curation prompts to demonstrate how the
system captures preferences and produces backend-ready output.

DEPENDENCIES:
- user_input_processor.py (sibling file in module directory)

USAGE:
  python demo_user_input.py

NOTES:
- Primarily a demo/example script; does not prompt for live user input.
- Output directory (demo_outputs/) is created automatically if it does not exist.
=============================================================================
"""

import json
import sys
from pathlib import Path
from datetime import datetime

# Import our main processor
from user_input_processor import UserInputProcessor

def create_demo_preferences():
    """Create sample user preferences for demonstration"""
    return {
        "location": {
            "primary_location": "San Francisco, CA",
            "radius_miles": 25,
            "coordinates": None
        },
        "categories": {
            "music": 5.0,
            "art": 4.5,
            "tech": 4.0,
            "food": 3.5,
            "education": 3.0,
            "theatre": 2.5
        },
        "time_preferences": {
            "preferred_days": ["weekends", "weekdays"],
            "preferred_times": ["evening", "afternoon"],
            "advance_notice_days": 7
        },
        "additional_preferences": {
            "price_preference": {
                "max": 50,
                "preference": "moderate"
            },
            "group_size_preference": "medium",
            "accessibility_required": False,
            "parking_required": True
        },
        "ai_instructions": "Focus on unique local experiences and cultural events. I prefer smaller venues with authentic atmosphere over large commercial events."
    }

def run_demo():
    """Run a demonstration of the user input processor"""
    print("🎬 CURATE MY WORLD - DEMO MODE")
    print("=" * 40)
    print("This demo shows how the system processes user preferences")
    print("and generates structured prompts for AI event curation.\n")
    
    # Create processor instance
    processor = UserInputProcessor()
    processor.output_dir = Path("demo_outputs")
    processor.output_dir.mkdir(exist_ok=True)
    
    # Set demo preferences
    processor.user_preferences = create_demo_preferences()
    processor.log_action("Loaded demo user preferences")
    
    # Process sample chat history
    chat_file = "sample_chat_history.json"
    if Path(chat_file).exists():
        processor.chat_history_data = processor.process_chat_history(chat_file)
        print(f"✅ Processed chat history from {chat_file}")
    else:
        print(f"⚠️  Sample chat history not found at {chat_file}")
    
    # Display processed preferences
    print("\n📋 PROCESSED PREFERENCES:")
    print("-" * 30)
    
    location = processor.user_preferences["location"]
    print(f"📍 Location: {location['primary_location']} ({location['radius_miles']} miles)")
    
    categories = processor.user_preferences["categories"]
    top_interests = sorted(categories.items(), key=lambda x: x[1], reverse=True)[:3]
    print(f"🎯 Top Interests: {', '.join([f'{k.title()} ({v})' for k, v in top_interests])}")
    
    time_prefs = processor.user_preferences["time_preferences"]
    print(f"⏰ Time Preferences: {', '.join(time_prefs['preferred_times']).title()}")
    print(f"📅 Day Preferences: {', '.join(time_prefs['preferred_days']).title()}")
    
    price_pref = processor.user_preferences["additional_preferences"]["price_preference"]
    print(f"💰 Price Range: Up to ${price_pref['max']} ({price_pref['preference']})")
    
    # Generate and display curation prompt
    print("\n🤖 GENERATED AI CURATION PROMPT:")
    print("-" * 35)
    
    curation_prompt = processor.generate_curation_prompt()
    
    # Display key sections of the prompt
    print(f"📊 Max Events per Week: {curation_prompt['curation_parameters']['max_events_per_week']}")
    print(f"🎯 Quality Threshold: {curation_prompt['curation_parameters']['quality_threshold']}")
    print(f"🔄 Personalization Weight: {curation_prompt['curation_parameters']['personalization_weight']}")
    
    # Show data sources
    sources = curation_prompt['data_sources']
    enabled_sources = [k for k, v in sources.items() if v is True]
    print(f"📡 Data Sources: {len(enabled_sources)} enabled")
    
    # Save outputs
    print("\n💾 SAVING DEMO OUTPUTS:")
    print("-" * 25)
    
    output_files = processor.save_outputs()
    
    # Display sample of the generated prompt
    print(f"\n📄 SAMPLE CURATION PROMPT STRUCTURE:")
    print("-" * 38)
    print(json.dumps({
        "user_profile": {
            "location": curation_prompt["user_profile"]["location"],
            "top_interests": dict(list(curation_prompt["user_profile"]["interests"].items())[:3]),
            "ai_instructions": curation_prompt["user_profile"]["ai_instructions"][:100] + "..."
        },
        "curation_parameters": curation_prompt["curation_parameters"]
    }, indent=2))
    
    print(f"\n✅ DEMO COMPLETE!")
    print(f"📁 Output files saved to: {processor.output_dir}")
    print(f"🚀 These files can now be used by the backend event curation system.")
    
    return output_files

if __name__ == "__main__":
    try:
        run_demo()
    except Exception as e:
        print(f"❌ Demo failed: {e}")
        sys.exit(1)
