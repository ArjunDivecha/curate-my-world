// Shared sample data for calendar previews v2 (no modules; works over file://).
// Access as: window.CalendarPreviewDataV2

(function () {
  const CAT = {
    music: { name: "Music", rail: "#7c3aed", tint: "rgba(124,58,237,.12)" },
    comedy: { name: "Comedy", rail: "#10b981", tint: "rgba(16,185,129,.12)" },
    theatre: { name: "Theatre", rail: "#f43f5e", tint: "rgba(244,63,94,.12)" },
    art: { name: "Art", rail: "#f59e0b", tint: "rgba(245,158,11,.14)" },
    tech: { name: "Tech", rail: "#3b82f6", tint: "rgba(59,130,246,.12)" },
    kids: { name: "Kids", rail: "#ec4899", tint: "rgba(236,72,153,.12)" },
  };

  const WEEK = [
    { k: "Sun", d: 8 },
    { k: "Mon", d: 9 },
    { k: "Tue", d: 10 },
    { k: "Wed", d: 11 },
    { k: "Thu", d: 12 },
    { k: "Fri", d: 13 },
    { k: "Sat", d: 14 },
  ];

  const events = [
    // Tue 10
    { id: "e1", day: "Tue", start: "10:00", dur: 60, cat: "art", title: "Luminous Landscapes", venue: "Children's Creativity Museum", score: 8.2 },
    { id: "e2", day: "Tue", start: "11:00", dur: 45, cat: "music", title: "Woods Davy: Clouds from the…", venue: "Bay Area Music Project", score: 7.8 },
    { id: "e3", day: "Tue", start: "12:00", dur: 90, cat: "theatre", title: "Unearthed, Unbound: 2026…", venue: "Memorial Hall", score: 8.0 },
    { id: "e4", day: "Tue", start: "14:00", dur: 60, cat: "comedy", title: "Special, Unique and Rare…", venue: "Punch Line", score: 8.0 },
    { id: "e5", day: "Tue", start: "18:30", dur: 120, cat: "tech", title: "AI Builders Meetup", venue: "SoMa", score: 7.1 },
    { id: "e6", day: "Tue", start: "19:00", dur: 90, cat: "kids", title: "Night at the Exploratorium", venue: "Exploratorium", score: 6.9 },

    // Wed 11
    { id: "e7", day: "Wed", start: "18:00", dur: 90, cat: "music", title: "February Look Club", venue: "Sonoma Valley…", score: 8.0 },
    { id: "e8", day: "Wed", start: "19:00", dur: 75, cat: "theatre", title: "Archive Room: Ester Hernandez…", venue: "Memorial…", score: 8.0 },
    { id: "e9", day: "Wed", start: "20:00", dur: 60, cat: "comedy", title: "Cunning Folk: Witchcraft, Magi…", venue: "Memorial…", score: 8.0 },
    { id: "e10", day: "Wed", start: "13:00", dur: 120, cat: "art", title: "Romance pop-up, Bowes Art &…", venue: "Bowes", score: 7.6 },
    { id: "e11", day: "Wed", start: "16:00", dur: 60, cat: "tech", title: "Founders Office Hours", venue: "Downtown", score: 6.4 },

    // Thu 12
    { id: "e12", day: "Thu", start: "16:00", dur: 90, cat: "art", title: "Artist in the House", venue: "Sonoma Valley…", score: 8.0 },
    { id: "e13", day: "Thu", start: "16:00", dur: 60, cat: "theatre", title: "Valentine's Celebration at…", venue: "SFMOMA", score: 8.0 },
    { id: "e14", day: "Thu", start: "18:00", dur: 75, cat: "music", title: "Photobook Speed Date with Josh…", venue: "SFMOMA", score: 8.0 },
    { id: "e15", day: "Thu", start: "19:30", dur: 90, cat: "comedy", title: "Hearts for Art (After Dark)", venue: "SFMOMA", score: 7.8 },
    { id: "e16", day: "Thu", start: "17:00", dur: 60, cat: "tech", title: "LLM Infra Roundtable", venue: "Mission", score: 7.0 },

    // Fri 13
    { id: "e17", day: "Fri", start: "12:00", dur: 60, cat: "art", title: "February Mending Circle", venue: "Oakland", score: 8.0 },
    { id: "e18", day: "Fri", start: "19:00", dur: 120, cat: "music", title: "Hanami Stroll at Sonoma Botanic…", venue: "Sonoma", score: 8.0 },
    { id: "e19", day: "Fri", start: "16:00", dur: 90, cat: "kids", title: "Artists Live Here: Community…", venue: "What's On", score: 8.0 },
    { id: "e20", day: "Fri", start: "18:00", dur: 90, cat: "theatre", title: "History Mystery Overnight…", venue: "USS Hornet", score: 7.7 },
    { id: "e21", day: "Fri", start: "11:30", dur: 60, cat: "comedy", title: "Public Tour | Auguste Rodin", venue: "Legion of Honor", score: 6.6 },

    // Sat 14
    { id: "e22", day: "Sat", start: "19:00", dur: 90, cat: "theatre", title: "Carry-On by Justin Wong", venue: "Chinese Culture…", score: 8.0 },
    { id: "e23", day: "Sat", start: "11:00", dur: 60, cat: "art", title: "Thrive@MoAD Sponsored by…", venue: "MoAD", score: 8.0 },
    { id: "e24", day: "Sat", start: "19:00", dur: 120, cat: "music", title: "Free Admission for Members to…", venue: "SFMOMA", score: 8.0 },
    { id: "e25", day: "Sat", start: "13:30", dur: 60, cat: "kids", title: "Weaving Demonstrations:…", venue: "Chabot", score: 7.2 },
    { id: "e26", day: "Sat", start: "17:00", dur: 90, cat: "tech", title: "Startup Showcase Night", venue: "SOMA", score: 6.8 },
  ];

  function byDay(dayKey) {
    return events
      .filter((e) => e.day === dayKey)
      .slice()
      .sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));
  }

  function hhmmToMinutes(hhmm) {
    const p = hhmm.split(":");
    return parseInt(p[0], 10) * 60 + parseInt(p[1], 10);
  }

  window.CalendarPreviewDataV2 = { CAT, WEEK, events, byDay, hhmmToMinutes };
})();

