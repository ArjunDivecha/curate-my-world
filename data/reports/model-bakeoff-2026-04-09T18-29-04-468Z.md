# Venue Extractor Bakeoff

Generated: 2026-04-09T18:29:04.468Z
Venues tested: 6

## Models

### Claude Haiku 4.5
- Model: `claude-haiku-4-5-20251001`
- Total cost: $0.1083
- Total input tokens: 65982
- Total output tokens: 8471
- Total events extracted: 29
- Valid runs: 6/6
- Avg events per venue: 4.83
- Avg title coverage: 33.3%
- Avg startDate coverage: 33.3%
- Avg direct URL coverage: 33.3%
- Avg city coverage: 33.3%

### GPT-4o mini
- Model: `openai/gpt-4o-mini`
- Total cost: $0.0120
- Total input tokens: 56464
- Total output tokens: 5899
- Total events extracted: 48
- Valid runs: 6/6
- Avg events per venue: 8.00
- Avg title coverage: 66.7%
- Avg startDate coverage: 66.7%
- Avg direct URL coverage: 66.7%
- Avg city coverage: 66.7%

### Gemini 2.5 Flash Lite
- Model: `google/gemini-2.5-flash-lite`
- Total cost: $0.0047
- Total input tokens: 20980
- Total output tokens: 6537
- Total events extracted: 40
- Valid runs: 5/6
- Avg events per venue: 8.00
- Avg title coverage: 60.0%
- Avg startDate coverage: 60.0%
- Avg direct URL coverage: 60.0%
- Avg city coverage: 60.0%

## Venue Results

### SFJAZZ.org (`sfjazz.org`)
- Calendar: https://sfjazz.org/events
- Markdown chars: 8875
- Claude Haiku 4.5: events=0, cost=$0.0038, title=0%, dates=0%, urls=0%, city=0%
- GPT-4o mini: events=0, cost=$0.0005, title=0%, dates=0%, urls=0%, city=0%
- Gemini 2.5 Flash Lite: events=0, cost=$0.0003, title=0%, dates=0%, urls=0%, city=0%

### de Young Museum (`deyoung.famsf.org`)
- Calendar: https://deyoung.famsf.org/calendar
- Markdown chars: 15021
- Claude Haiku 4.5: events=0, cost=$0.0070, title=0%, dates=0%, urls=0%, city=0%
- GPT-4o mini: events=11, cost=$0.0016, title=100%, dates=100%, urls=100%, city=100%
- Gemini 2.5 Flash Lite: events=11, cost=$0.0015, title=100%, dates=100%, urls=100%, city=100%

### SFMOMA (`sfmoma.org`)
- Calendar: https://www.sfmoma.org/events
- Markdown chars: 4431
- Claude Haiku 4.5: events=14, cost=$0.0122, title=100%, dates=100%, urls=100%, city=100%
- GPT-4o mini: events=13, cost=$0.0012, title=100%, dates=100%, urls=100%, city=100%
- Gemini 2.5 Flash Lite: events=14, cost=$0.0011, title=100%, dates=100%, urls=100%, city=100%

### The Midway SF (`themidwaysf.com`)
- Calendar: https://themidwaysf.com/events/
- Markdown chars: 15021
- Claude Haiku 4.5: events=15, cost=$0.0180, title=100%, dates=100%, urls=100%, city=100%
- GPT-4o mini: events=15, cost=$0.0019, title=100%, dates=100%, urls=100%, city=100%
- Gemini 2.5 Flash Lite: events=15, cost=$0.0017, title=100%, dates=100%, urls=100%, city=100%

### City Arts & Lectures (`cityboxoffice.com`)
- Calendar: https://cityboxoffice.com/events
- Markdown chars: 2951
- Claude Haiku 4.5: events=0, cost=$0.0015, title=0%, dates=0%, urls=0%, city=0%
- GPT-4o mini: events=0, cost=$0.0002, title=0%, dates=0%, urls=0%, city=0%
- Gemini 2.5 Flash Lite: events=0, cost=$0.0001, title=0%, dates=0%, urls=0%, city=0%

### BAMPFA (Berkeley Art Museum and Pacific Film Archive) (`bampfa.org`)
- Calendar: https://bampfa.org/visit/calendar
- Markdown chars: 120021
- Claude Haiku 4.5: events=0, cost=$0.0658, title=0%, dates=0%, urls=0%, city=0%
- GPT-4o mini: events=9, cost=$0.0066, title=100%, dates=100%, urls=100%, city=100%
- Gemini 2.5 Flash Lite: events=0, cost=$0.0000, title=0%, dates=0%, urls=0%, city=0%, error=terminated
