export const mockEvents = [
  {
    id: "1",
    title: "Indie Electronic Showcase at The Underground",
    description: "Local indie artists performing experimental electronic music in an intimate venue. Features live synthesizer performances and ambient soundscapes.",
    startDate: "2025-01-29T20:00:00",
    endDate: "2025-01-29T23:00:00",
    venue: {
      name: "The Underground",
      address: "123 Music Row, Downtown",
      website: "https://theundergroundmusic.com",
      mapUrl: "https://maps.google.com/?q=123+Music+Row+Downtown"
    },
    categories: ["Music", "Electronic", "Indie"],
    personalRelevanceScore: 9,
    price: {
      type: "paid" as const,
      amount: "$15"
    },
    ticketUrl: "https://theundergroundmusic.com/tickets/indie-electronic-showcase",
    eventUrl: "https://facebook.com/events/indie-electronic-showcase",
    aiReasoning: "Matches your interest in experimental music and smaller venues. The intimate setting and indie focus align perfectly with your preferences for discovering new artists."
  },
  {
    id: "2",
    title: "Contemporary Art Gallery Opening: Digital Minimalism",
    description: "Opening reception for a new exhibition exploring digital minimalism through interactive installations and projection mapping.",
    startDate: "2025-01-30T18:00:00",
    endDate: "2025-01-30T21:00:00",
    venue: {
      name: "Meridian Gallery",
      address: "456 Arts District, Midtown",
      website: "https://meridiangallery.com",
      mapUrl: "https://maps.google.com/?q=456+Arts+District+Midtown"
    },
    categories: ["Art", "Technology", "Interactive"],
    personalRelevanceScore: 8,
    price: {
      type: "free" as const
    },
    eventUrl: "https://meridiangallery.com/exhibitions/digital-minimalism",
    aiReasoning: "Combines your love for art galleries with technology themes. The interactive nature and focus on minimalism suggests a thoughtful, experimental approach you'd appreciate."
  },
  {
    id: "3",
    title: "Coffee Cupping & Local Roaster Meet-up",
    description: "Learn about coffee tasting with local roasters. Small group setting with hands-on cupping experience and networking opportunities.",
    startDate: "2025-02-01T10:00:00",
    endDate: "2025-02-01T12:00:00",
    venue: {
      name: "Artisan Coffee Collective",
      address: "789 Bean Street, Central District",
      website: "https://artisancoffeecollective.com",
      mapUrl: "https://maps.google.com/?q=789+Bean+Street+Central+District"
    },
    categories: ["Food & Drink", "Education", "Networking"],
    personalRelevanceScore: 7,
    price: {
      type: "paid" as const,
      amount: "$25"
    },
    ticketUrl: "https://eventbrite.com/coffee-cupping-meetup",
    eventUrl: "https://meetup.com/coffee-enthusiasts/events/cupping-session",
    aiReasoning: "Perfect for your interest in coffee culture and networking. The educational component and small group format match your preference for intimate, learning-focused events."
  },
  {
    id: "4",
    title: "Experimental Film Screening: Local Directors",
    description: "Showcase of short experimental films by local directors, followed by Q&A session. Intimate theater setting with discussion afterwards.",
    startDate: "2025-02-01T19:30:00",
    endDate: "2025-02-01T22:00:00",
    venue: {
      name: "Cinema Paradiso",
      address: "321 Film Row, Arts Quarter",
      website: "https://cinemaparadiso.com",
      mapUrl: "https://maps.google.com/?q=321+Film+Row+Arts+Quarter"
    },
    categories: ["Film", "Art", "Discussion"],
    personalRelevanceScore: 8,
    price: {
      type: "paid" as const,
      amount: "$12"
    },
    ticketUrl: "https://cinemaparadiso.com/tickets/experimental-showcase",
    eventUrl: "https://facebook.com/events/experimental-film-screening",
    aiReasoning: "Aligns with your appreciation for experimental art and local creative community. The discussion format provides networking opportunities with fellow film enthusiasts."
  },
  {
    id: "5",
    title: "Vintage Vinyl Record Fair & Listening Party",
    description: "Browse rare vinyl records from local collectors, with listening stations and DJ sets featuring vintage tracks from multiple decades.",
    startDate: "2025-02-02T14:00:00",
    endDate: "2025-02-02T18:00:00",
    venue: {
      name: "Retro Records Warehouse",
      address: "555 Vintage Way, Old Town",
      website: "https://retrorecordswarehouse.com",
      mapUrl: "https://maps.google.com/?q=555+Vintage+Way+Old+Town"
    },
    categories: ["Music", "Shopping", "Community"],
    personalRelevanceScore: 6,
    price: {
      type: "free" as const
    },
    eventUrl: "https://instagram.com/retrorecordswarehouse",
    aiReasoning: "Appeals to your music interests and love for discovering unique items. The community atmosphere and focus on music history align with your cultural interests."
  },
  {
    id: "6",
    title: "Plant-Based Cooking Workshop",
    description: "Hands-on cooking class focusing on seasonal, plant-based cuisine. Small class size with take-home recipes and ingredients.",
    startDate: "2025-02-03T18:30:00",
    endDate: "2025-02-03T21:00:00",
    venue: {
      name: "Green Kitchen Studio",
      address: "888 Wellness Ave, Northside",
      website: "https://greenkitchenstudio.com",
      mapUrl: "https://maps.google.com/?q=888+Wellness+Ave+Northside"
    },
    categories: ["Food & Drink", "Health & Wellness", "Education"],
    personalRelevanceScore: 7,
    price: {
      type: "paid" as const,
      amount: "$45"
    },
    ticketUrl: "https://greenkitchenstudio.com/workshops/plant-based-cooking",
    eventUrl: "https://eventbrite.com/plant-based-cooking-workshop",
    aiReasoning: "Matches your interest in healthy living and hands-on learning experiences. The small class format provides personal attention and practical skills you can use."
  },
  {
    id: "7",
    title: "Tech Startup Pitch Night & Networking",
    description: "Local startups present their innovations to an intimate audience. Networking session with founders, investors, and tech professionals.",
    startDate: "2025-02-04T18:00:00",
    endDate: "2025-02-04T21:00:00",
    venue: {
      name: "Innovation Hub",
      address: "999 Tech Plaza, Silicon Quarter",
      website: "https://innovationhub.tech",
      mapUrl: "https://maps.google.com/?q=999+Tech+Plaza+Silicon+Quarter"
    },
    categories: ["Technology", "Business", "Networking"],
    personalRelevanceScore: 8,
    price: {
      type: "free" as const
    },
    eventUrl: "https://meetup.com/startup-pitch-night",
    aiReasoning: "Perfect for your technology interests and networking goals. The startup focus provides insight into cutting-edge innovations and connects you with like-minded professionals."
  },
  {
    id: "8",
    title: "Meditation & Sound Bath Experience",
    description: "Guided meditation session with live sound bath featuring crystal bowls, gongs, and ambient music in a peaceful setting.",
    startDate: "2025-02-05T19:00:00",
    endDate: "2025-02-05T20:30:00",
    venue: {
      name: "Serenity Wellness Center",
      address: "111 Peaceful Way, Zen District",
      website: "https://serenitywellnesscenter.com",
      mapUrl: "https://maps.google.com/?q=111+Peaceful+Way+Zen+District"
    },
    categories: ["Health & Wellness", "Music", "Mindfulness"],
    personalRelevanceScore: 6,
    price: {
      type: "paid" as const,
      amount: "$20"
    },
    ticketUrl: "https://serenitywellnesscenter.com/book/sound-bath",
    eventUrl: "https://facebook.com/events/meditation-sound-bath",
    aiReasoning: "Complements your wellness interests and provides a unique musical experience. The intimate setting and focus on mindfulness align with your personal growth goals."
  }
];