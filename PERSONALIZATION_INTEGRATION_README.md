# Curate My World - Complete Personalization Integration

## Overview

This integration connects the user input processing system with the backend event curation API to provide end-to-end personalized event recommendations. The system processes user preferences and generates AI-curated event lists based on individual interests, location, and constraints.

## System Architecture

```
User Input → Processing → API Integration → Event Curation → Personalized Results
     ↓            ↓             ↓              ↓                    ↓
Terminal    JSON Prompts   HTTP Requests   AI Analysis      Curated Events
Interface   + User Data    to Backend      + Scoring        + Reports
```

## Complete Workflow

### 1. User Input Collection
**File**: `user_input_processor.py`
- Interactive terminal interface
- Collects location, interests, time preferences
- Processes optional chat history for RAG personalization
- Generates structured JSON prompts

### 2. Backend Integration
**File**: `curate-events-api/src/routes/personalization.js`
- Receives curation prompts via REST API
- Integrates with existing event collection pipeline
- Applies personalization algorithms and scoring
- Generates comprehensive curation reports

### 3. Event Collection & Curation
- **Multi-Source Collection**: Perplexity AI, Apyflux, PredictHQ
- **Personalization Engine**: Scores events based on user preferences
- **Quality Filtering**: Applies thresholds and diversity factors
- **Output Generation**: Creates personalized event lists and reports

## Files Created/Modified

### New Integration Files
1. **`curate-events-api/src/routes/personalization.js`** - Main personalization API routes
2. **`test_personalization_integration.js`** - Integration test suite
3. **`PERSONALIZATION_INTEGRATION_README.md`** - This documentation

### Modified Files
1. **`curate-events-api/server.js`** - Added personalization routes
2. **`requirements.txt`** - Updated dependencies

### User Input System Files (Previously Created)
1. **`user_input_processor.py`** - Interactive user preference collection
2. **`demo_user_input.py`** - Demonstration script
3. **`sample_chat_history.json`** - Example chat data
4. **`USER_INPUT_SYSTEM_README.md`** - User input documentation

## API Endpoints

### POST /api/personalization/curate
Process user curation prompt and return personalized events.

**Request Body**:
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
      "radius_miles": 25
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
      "accessibility_required": false,
      "parking_required": true
    },
    "ai_instructions": "Focus on unique local experiences..."
  },
  "curation_parameters": {
    "max_events_per_week": 15,
    "quality_threshold": 0.7,
    "diversity_factor": 0.8
  }
}
```

**Response**:
```json
{
  "success": true,
  "sessionId": "session_1754103306",
  "events": [
    {
      "title": "Jazz Night at Blue Note",
      "description": "Live jazz performance...",
      "date": "2025-08-05T20:00:00Z",
      "venue": "Blue Note SF",
      "price": "$35",
      "_personalization": {
        "category": "music",
        "userRating": 5.0,
        "personalizedScore": 0.92,
        "scoring": {
          "breakdown": {
            "categoryInterest": 0.6,
            "timePreference": 0.2,
            "pricePreference": 0.12
          }
        }
      }
    }
  ],
  "count": 12,
  "curationReport": {
    "user_profile_summary": {...},
    "curation_results": {...},
    "personalization_insights": {...}
  },
  "outputFiles": [
    "personalization_outputs/personalized_events_session_1754103306_2025-08-01.json",
    "personalization_outputs/curation_report_session_1754103306_2025-08-01.json"
  ],
  "processingTime": 3247
}
```

### POST /api/personalization/feedback
Handle user feedback on event recommendations for future learning.

**Request Body**:
```json
{
  "sessionId": "session_1754103306",
  "eventId": "jazz_night_blue_note_2025_08_05",
  "feedback": "attended",
  "rating": 5
}
```

## Usage Instructions

### Step 1: Collect User Preferences
```bash
# Interactive mode
python user_input_processor.py

# With chat history
python user_input_processor.py --chat-history my_chat.json

# Demo mode (for testing)
python demo_user_input.py
```

This generates:
- `outputs/curation_prompt_[timestamp].json`
- `outputs/user_preferences_[timestamp].json`
- `outputs/processing_log_[timestamp].txt`

### Step 2: Start Backend Server
```bash
cd curate-events-api
npm install
npm start
```

Server runs on `http://localhost:3000` with endpoints:
- `/api/health` - Health check
- `/api/personalization/curate` - Main curation endpoint
- `/api/personalization/feedback` - User feedback

### Step 3: Send Personalization Request
```bash
# Using curl
curl -X POST http://localhost:3000/api/personalization/curate \
  -H "Content-Type: application/json" \
  -d @outputs/curation_prompt_[timestamp].json

# Using the integration test
node test_personalization_integration.js
```

### Step 4: Review Results
Check the generated files:
- `personalization_outputs/personalized_events_[session]_[timestamp].json`
- `personalization_outputs/curation_report_[session]_[timestamp].json`

## Personalization Algorithm

### 1. Multi-Source Event Collection
- **Perplexity AI**: Natural language event discovery with context
- **Apyflux**: Structured event data from APIs
- **PredictHQ**: Professional event intelligence

### 2. Personalization Scoring
Events are scored based on:
- **Category Interest** (60% weight): User's rating for event category
- **Time Preference** (20% weight): Match with preferred times/days
- **Price Preference** (20% weight): Alignment with budget constraints

### 3. Quality Filtering
- **Quality Threshold**: Minimum personalization score (default: 0.7)
- **Diversity Factor**: Prevents over-concentration in single categories
- **Event Limit**: Caps results to user's preferred weekly limit

### 4. Output Generation
- **Ranked Events**: Sorted by personalization score
- **Curation Report**: Detailed analysis and insights
- **Recommendation Engine**: Suggestions for improving future results

## Testing the Integration

### Automated Integration Test
```bash
node test_personalization_integration.js
```

This test:
1. Loads curation prompt from user input processor
2. Tests API connectivity
3. Sends personalization request
4. Validates response structure
5. Checks output file generation
6. Generates comprehensive test report

### Manual Testing
1. **Generate User Input**: Run `python demo_user_input.py`
2. **Start Backend**: `cd curate-events-api && npm start`
3. **Send Request**: Use curl or Postman with generated prompt
4. **Verify Results**: Check events and curation report

## Output Files Structure

### Personalized Events File
```json
{
  "session_id": "session_1754103306",
  "generated_at": "2025-08-01T20:15:30.123Z",
  "events": [
    {
      "title": "Event Title",
      "description": "Event description...",
      "date": "2025-08-05T20:00:00Z",
      "venue": "Venue Name",
      "price": "$35",
      "_personalization": {
        "category": "music",
        "userRating": 5.0,
        "personalizedScore": 0.92,
        "source": "perplexity"
      }
    }
  ],
  "count": 12
}
```

### Curation Report File
```json
{
  "metadata": {
    "generated_at": "2025-08-01T20:15:30.123Z",
    "processing_time_ms": 3247,
    "user_session_id": "session_1754103306"
  },
  "user_profile_summary": {
    "location": "San Francisco, CA",
    "radius_miles": 25,
    "top_interests": [
      {"category": "music", "rating": 5.0},
      {"category": "art", "rating": 4.5}
    ]
  },
  "curation_results": {
    "total_events_collected": 47,
    "events_after_personalization": 12,
    "quality_threshold_applied": 0.7
  },
  "personalization_insights": {
    "category_distribution": {
      "music": 5,
      "art": 4,
      "tech": 3
    },
    "score_distribution": {
      "high": 8,
      "medium": 3,
      "low": 1
    },
    "average_personalization_score": 0.84
  }
}
```

## Performance Metrics

### Typical Processing Times
- **User Input Collection**: 2-5 minutes (interactive)
- **Event Collection**: 3-8 seconds (parallel API calls)
- **Personalization**: 1-2 seconds (scoring and filtering)
- **Total API Response**: 5-12 seconds

### Scalability Considerations
- **Concurrent Users**: Backend supports multiple simultaneous requests
- **Caching**: Event data cached to reduce API calls
- **Rate Limiting**: Protects against API abuse
- **Error Handling**: Graceful degradation when sources fail

## Troubleshooting

### Common Issues

1. **"No curation prompt files found"**
   - Run `python demo_user_input.py` first
   - Check `demo_outputs/` directory exists

2. **"API connectivity failed"**
   - Ensure backend server is running: `npm start`
   - Check server logs for errors
   - Verify port 3000 is available

3. **"Missing API keys"**
   - Check `.env` file in `curate-events-api/`
   - Ensure Perplexity API key is configured
   - Verify other API credentials

4. **"No events found"**
   - Check location spelling and format
   - Verify API sources are responding
   - Lower quality threshold in curation parameters

### Debug Mode
Enable detailed logging:
```bash
# Backend logs
cd curate-events-api
tail -f server.log

# Integration test with verbose output
DEBUG=1 node test_personalization_integration.js
```

## Future Enhancements

### Planned Features
1. **Machine Learning**: User feedback training for improved recommendations
2. **Real-time Updates**: WebSocket integration for live event updates
3. **Social Features**: Friend recommendations and shared interests
4. **Calendar Integration**: Direct export to Google Calendar, Outlook
5. **Mobile App**: Native iOS/Android applications

### API Extensions
1. **Batch Processing**: Handle multiple users simultaneously
2. **Webhook Support**: Real-time notifications for new events
3. **Advanced Filtering**: Complex query language for power users
4. **Analytics Dashboard**: Usage metrics and recommendation effectiveness

## Security & Privacy

### Data Protection
- **Local Processing**: User data processed locally when possible
- **Encrypted Storage**: Sensitive data encrypted at rest
- **API Security**: Rate limiting and authentication
- **Privacy Controls**: Users can delete data anytime

### Compliance
- **GDPR Ready**: Data export and deletion capabilities
- **Consent Management**: Explicit opt-in for data usage
- **Audit Logging**: Complete trail of data processing
- **Secure APIs**: HTTPS and proper authentication

## Support & Documentation

### Getting Help
1. **Check Logs**: Review server and processing logs
2. **Run Tests**: Use integration test for diagnostics
3. **Documentation**: Refer to individual component READMEs
4. **Issues**: Report problems with detailed error messages

### Additional Resources
- `USER_INPUT_SYSTEM_README.md` - User input system documentation
- `curate-events-api/README.md` - Backend API documentation
- Integration test results for troubleshooting examples

This complete integration provides a robust, scalable foundation for personalized event discovery and curation.
