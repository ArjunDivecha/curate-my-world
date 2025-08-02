# Curate My World - User Input Processing System

## Overview

This standalone terminal program captures user preferences and generates structured prompts for the AI-powered event curation backend. It processes user input about location, interests, time preferences, and optional chat history to create comprehensive instructions for the event discovery system.

## Files Created

### Core System Files
- **`user_input_processor.py`** - Main interactive terminal program
- **`demo_user_input.py`** - Demonstration script with sample data
- **`sample_chat_history.json`** - Example chat history file for testing

### Input Files (User Provided)
- **Chat History File** (optional) - JSON or TXT format containing user conversations
- **Terminal Input** - Interactive responses to preference questions

### Output Files (Generated)
- **`curation_prompt_[timestamp].json`** - Structured prompt for AI curation system
- **`user_preferences_[timestamp].json`** - Processed user preferences for backend
- **`processing_log_[timestamp].txt`** - Log of processing actions and data quality

## How It Works

### 1. User Preference Collection
The system collects comprehensive user preferences through an interactive terminal interface:

#### Location Preferences
- Primary location (city, state/country)
- Travel radius (2-50+ miles)
- Coordinates (geocoded by backend)

#### Interest Categories
Users rate their interest (0-5 scale) in categories:
- Music, Theatre, Art, Food, Tech
- Education, Movies, Sports, Nightlife
- Outdoor, Literature, Health, Business

#### Time Preferences
- Preferred days (weekdays/weekends)
- Preferred times (morning/afternoon/evening/night)
- Advance notice requirements (same day to 2+ weeks)

#### Additional Preferences
- Price range (free to unlimited)
- Event size preference (intimate/medium/large)
- Accessibility requirements
- Parking needs

### 2. Chat History Processing (Optional)
If provided, the system analyzes chat history to extract additional personalization data:
- Keyword extraction for interests
- Frequency analysis of mentioned activities
- Preference weighting based on conversation patterns

### 3. AI Instruction Generation
Users can provide custom instructions for the AI curation system, such as:
- "Focus on unique local experiences"
- "Avoid crowded venues"
- "Show me everything happening in the area"

### 4. Structured Prompt Generation
The system generates a comprehensive JSON prompt containing:
- User profile with all preferences
- Curation parameters (quality thresholds, personalization weights)
- Data source configuration
- Output requirements and formatting

## Usage

### Interactive Mode (Recommended)
```bash
python user_input_processor.py
```
This launches the full interactive session where you'll be guided through all preference collection steps.

### With Chat History
```bash
python user_input_processor.py --chat-history path/to/chat.json
```
Include a chat history file for enhanced personalization.

### Custom Output Directory
```bash
python user_input_processor.py --output-dir custom_outputs
```
Specify where to save the generated files.

### Demo Mode
```bash
python demo_user_input.py
```
Run a demonstration with pre-configured sample data to see how the system works.

## Output File Structure

### Curation Prompt JSON
```json
{
  "metadata": {
    "generated_at": "2025-08-01T19:55:06.680008",
    "system_version": "1.0",
    "user_session_id": "session_1754103306"
  },
  "user_profile": {
    "location": {
      "primary_location": "San Francisco, CA",
      "radius_miles": 25,
      "coordinates": null
    },
    "interests": {
      "music": 5.0,
      "art": 4.5,
      "tech": 4.0
    },
    "time_preferences": {
      "preferred_days": ["weekends", "weekdays"],
      "preferred_times": ["evening", "afternoon"],
      "advance_notice_days": 7
    },
    "additional_preferences": {
      "price_preference": {"max": 50, "preference": "moderate"},
      "group_size_preference": "medium",
      "accessibility_required": false,
      "parking_required": true
    },
    "ai_instructions": "Focus on unique local experiences..."
  },
  "curation_parameters": {
    "max_events_per_week": 15,
    "quality_threshold": 0.7,
    "diversity_factor": 0.8,
    "recency_weight": 0.6,
    "personalization_weight": 0.9
  },
  "data_sources": {
    "scraping_enabled": true,
    "social_media_monitoring": true,
    "rss_feeds": true,
    "api_sources": ["ticketmaster", "eventbrite", "meetup"],
    "local_sources": true
  },
  "output_requirements": {
    "format": "structured_json",
    "include_reasoning": true,
    "include_alternatives": true,
    "max_description_length": 200
  }
}
```

## Integration with Backend System

The generated files are designed to integrate with your existing event curation backend:

### 1. Curation Prompt Usage
The `curation_prompt_[timestamp].json` file contains all necessary parameters for:
- **AI Systems** (Perplexity, OpenAI) - Use the user_profile and ai_instructions
- **Data Collection** - Configure scraping based on data_sources settings
- **Filtering Logic** - Apply curation_parameters for quality and relevance
- **Output Formatting** - Follow output_requirements specifications

### 2. Preference Storage
The `user_preferences_[timestamp].json` can be:
- Stored in your user database for future sessions
- Used to update existing user profiles
- Referenced for preference evolution tracking

### 3. Processing Logs
The `processing_log_[timestamp].txt` provides:
- Data quality indicators
- Processing timestamps
- Error tracking and debugging information

## Chat History Format

### JSON Format (Recommended)
```json
{
  "messages": [
    {
      "timestamp": "2025-07-15T10:30:00Z",
      "content": "I love going to art galleries and museums on weekends."
    }
  ],
  "metadata": {
    "source": "chat_export",
    "total_messages": 8
  }
}
```

### Text Format
Plain text files are also supported - the system will extract keywords and interests from the raw text content.

## Privacy and Security

### Data Handling
- All processing is done locally
- No data is sent to external services during input collection
- Chat history processing uses simple keyword extraction (no external APIs)
- Users must explicitly consent to chat history usage

### File Security
- Output files contain only processed preferences, not raw chat data
- Timestamps prevent file conflicts
- Processing logs track all data transformations

## Customization

### Adding New Categories
Modify the `categories` list in `get_category_preferences()` to add new interest categories.

### Adjusting Curation Parameters
Update the `curation_parameters` in `generate_curation_prompt()` to modify:
- Maximum events per week
- Quality thresholds
- Personalization weights
- Diversity factors

### Custom Analysis
Extend the `analyze_chat_content()` method to implement more sophisticated NLP analysis of chat history.

## Troubleshooting

### Common Issues
1. **Permission Errors** - Ensure write permissions for output directory
2. **Chat History Not Found** - Check file path and format
3. **Invalid Input** - The system validates input and provides defaults for invalid entries

### Debug Mode
Check the processing log file for detailed information about:
- Input validation results
- Chat history processing status
- File generation success/failure

## Next Steps

After running this system:

1. **Use Generated Files** - Pass the curation prompt to your AI event discovery system
2. **Configure Backend** - Update your backend to consume the structured preference data
3. **Test Integration** - Verify that the backend correctly interprets the generated prompts
4. **Monitor Results** - Use the processing logs to track system performance

## Example Workflow

```bash
# 1. Run interactive session
python user_input_processor.py --chat-history my_chat.json

# 2. Generated files appear in outputs/
ls outputs/
# curation_prompt_20250801_195506.json
# user_preferences_20250801_195506.json
# processing_log_20250801_195506.txt

# 3. Use curation prompt with your backend
curl -X POST http://localhost:3000/api/curate-events \
  -H "Content-Type: application/json" \
  -d @outputs/curation_prompt_20250801_195506.json

# 4. Backend processes preferences and returns curated events
```

This system provides the foundation for personalized, AI-powered event discovery by capturing rich user preferences and generating structured prompts for your backend curation system.
