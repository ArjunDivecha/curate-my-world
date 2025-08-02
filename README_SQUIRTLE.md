# 🐢 Squirtle - AI-Powered Personalized Event Curation System

> **Advanced event discovery powered by conversation analysis and Claude Sonnet 4**

Squirtle is an intelligent event curation platform that analyzes your conversation history to understand your interests and delivers highly personalized event recommendations. Built with React, Node.js, and integrated with multiple event data sources.

## 🎯 Key Features

### 🧠 **AI-Powered Personalization**
- **Conversation Analysis**: Processes conversation history using Claude Sonnet 4
- **Interest Extraction**: Identifies categories, preferences, and personality traits
- **Dynamic Prompts**: Generates personalized AI instructions for event curation
- **Learning System**: Continuously improves recommendations based on user feedback

### 🔍 **Multi-Source Event Discovery**
- **Perplexity API**: AI-curated events with intelligent filtering
- **Apyflux**: Comprehensive venue and event database
- **PredictHQ**: Attendance predictions and local event rankings
- **Portfolio Scraping**: Direct venue website integration
- **Event Deduplication**: Smart merging across all sources

### 🎨 **Modern React Frontend**
- **Personalized Dashboard**: Categories and preferences based on conversation analysis
- **Real-time Updates**: Live event fetching and filtering
- **Interactive Calendar**: Weekly view with event scheduling
- **Responsive Design**: Beautiful UI with Tailwind CSS and Shadcn/ui

### ⚡ **High-Performance Backend**
- **Node.js API**: RESTful endpoints with comprehensive event processing
- **Parallel Processing**: Simultaneous multi-source data collection
- **Caching Layer**: Optimized performance with intelligent caching
- **Health Monitoring**: Real-time API status and performance metrics

## 🏗️ Architecture

```
User Conversations → Claude Sonnet 4 Analysis → Personalized Preferences → 
Frontend UI → Event Curation API → Multi-Source Collection → 
Personalized Scoring → Tailored Results
```

### Core Components

1. **LLM Conversation Processor** (`llm_user_processor.py`)
   - Analyzes conversation history with Claude Sonnet 4
   - Extracts interests, preferences, and behavioral patterns
   - Generates structured personalization prompts

2. **React Frontend** (`src/`)
   - Personalized dashboard with AI-derived categories
   - Interactive event browsing and filtering
   - Real-time event fetching and display

3. **Node.js Backend** (`curate-events-api/`)
   - Multi-source event collection and processing
   - Personalization scoring algorithms
   - RESTful API with comprehensive endpoints

4. **Event Sources Integration**
   - Perplexity, Apyflux, PredictHQ APIs
   - Portfolio venue scraping
   - Event deduplication and quality filtering

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ and npm
- Python 3.8+ with pip
- API keys for: Anthropic Claude, Perplexity, Apyflux, PredictHQ

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/ArjunDivecha/Squirtle.git
   cd Squirtle
   ```

2. **Install dependencies**
   ```bash
   # Frontend dependencies
   npm install
   
   # Backend dependencies
   cd curate-events-api && npm install && cd ..
   
   # Python dependencies
   pip install -r requirements.txt
   ```

3. **Configure environment variables**
   ```bash
   # Copy and edit environment files
   cp .env.example .env
   cp curate-events-api/.env.example curate-events-api/.env
   
   # Add your API keys to both .env files
   ```

4. **Start the application**
   ```bash
   # One-command startup
   ./start-everything.sh
   
   # Or start services individually
   npm run dev                    # Frontend (port 8766)
   cd curate-events-api && npm start  # Backend (port 8765)
   ```

5. **Access the application**
   - Frontend: http://localhost:8766
   - API: http://localhost:8765
   - Health Check: http://localhost:8765/api/health

## 📊 Personalization Process

### 1. Conversation Analysis
```bash
python llm_user_processor.py
```
- Processes conversation history files
- Uses Claude Sonnet 4 for deep analysis
- Generates personalized event preferences

### 2. Frontend Integration
- Personalized categories automatically loaded
- AI-generated keywords and preferences active
- Custom event filtering based on analysis

### 3. Event Curation
- Multi-source event collection
- Personalization scoring (60% category, 20% time, 20% price)
- Quality filtering and diversity algorithms

## 🔧 API Endpoints

### Core Endpoints
- `GET /api/health` - System health and API status
- `GET /api/events/:category` - Category-specific events
- `GET /api/events/:category/all-sources` - Multi-source events
- `POST /api/personalization/curate` - Personalized event curation
- `POST /api/personalization/feedback` - User feedback integration

### Event Sources
- `GET /api/events/:category/perplexity` - Perplexity AI events
- `GET /api/events/:category/apyflux` - Apyflux venue events
- `GET /api/events/:category/predicthq` - PredictHQ events

## 📁 Project Structure

```
Squirtle/
├── src/                          # React frontend
│   ├── components/               # UI components
│   │   ├── Dashboard.tsx         # Main personalized dashboard
│   │   ├── EventCard.tsx         # Event display component
│   │   └── FetchEventsButton.tsx # Event fetching controls
│   └── pages/                    # Application pages
├── curate-events-api/            # Node.js backend
│   ├── src/
│   │   ├── clients/              # API client implementations
│   │   ├── routes/               # Express route handlers
│   │   └── utils/                # Utility functions
│   └── server.js                 # Main server file
├── llm_user_processor.py         # Claude Sonnet 4 conversation analysis
├── user_input_processor.py       # Interactive preference collection
├── outputs/                      # Generated personalization files
├── demo_outputs/                 # Example outputs and demos
└── scripts/                      # Utility and test scripts
```

## 🧪 Testing

### Integration Tests
```bash
# Test personalization pipeline
node test_personalization_integration.js

# Test multi-provider event fetching
python multi-provider-tester.py

# Test API health and performance
node performance-test-providers.js
```

### Manual Testing
```bash
# Test conversation analysis
python llm_user_processor.py

# Test user input processing
python user_input_processor.py

# Test specific event sources
python test-new-providers.py
```

## 📈 Performance Metrics

- **Conversation Analysis**: Processes 1,500+ conversations in ~30 seconds
- **Event Collection**: 3 sources processed in parallel (~55 seconds total)
- **API Response Times**: 
  - PredictHQ: ~450ms
  - Apyflux: ~5-7s
  - Perplexity: ~30-55s
- **Personalization Scoring**: Real-time processing with quality filtering

## 🔐 Security & Privacy

- **API Key Management**: Secure environment variable storage
- **Local Processing**: Conversation analysis performed locally
- **User Consent**: Explicit permission for data processing
- **No Data Storage**: Personal conversations not stored on servers

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- **Anthropic** for Claude Sonnet 4 API
- **Perplexity** for AI-powered event discovery
- **Apyflux** and **PredictHQ** for comprehensive event data
- **React** and **Node.js** communities for excellent frameworks

---

**Built with ❤️ for personalized event discovery**

For questions, issues, or feature requests, please open an issue on GitHub.
