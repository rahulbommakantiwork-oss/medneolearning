/* Live server-backed data shell. Mutable content and all account/activity records belong in Supabase. */
const DB = {
  users: [], modules: [], slideDecks: {}, articles: {}, quizzes: {}, logs: [], events: [], quizAttempts: [],
  stateCities: {
    "Maharashtra": ["Mumbai", "Pune", "Nagpur", "Nashik"], "Delhi": ["New Delhi", "Dwarka", "Rohini"],
    "Karnataka": ["Bangalore", "Mysore", "Mangalore"], "Gujarat": ["Ahmedabad", "Surat", "Vadodara"],
    "Tamil Nadu": ["Chennai", "Coimbatore", "Madurai"], "Kerala": ["Kochi", "Thiruvananthapuram", "Kozhikode"],
    "Rajasthan": ["Jaipur", "Jodhpur", "Udaipur"], "Punjab": ["Chandigarh", "Ludhiana", "Amritsar"],
    "West Bengal": ["Kolkata", "Howrah", "Durgapur"]
  }
};
const EMPTY_ANALYTICS = {
  dailyLabels: [], registrations: [], dau: [], deviceDist: [], completionFunnel: [], navPaths: [], topContent: [],
  totals: { registeredDoctors: 0, activeDoctors: 0, activeDoctorsToday: 0, events: 0, totalMinutes: 0, averageMinutesPerAttempt: 0, articleOpens: 0, articleCompletions: 0, contentClicks: 0, adClicks: 0, externalLinkClicks: 0, quizAttempts: 0, averageQuizScore: 0, loginsToday: 0 }
};
let ANALYTICS = structuredClone(EMPTY_ANALYTICS);
window.ANALYTICS = ANALYTICS;
