/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { GoogleGenAI } from "@google/genai";
import { 
  Plane, 
  Search, 
  Calendar, 
  MapPin, 
  Plus, 
  Trash2, 
  Loader2, 
  ExternalLink,
  Info,
  ChevronRight,
  TrendingUp,
  Clock,
  DollarSign,
  MessageSquare,
  X,
  Send,
  User,
  Bot,
  Sparkles
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import ReactMarkdown from 'react-markdown';
import { format, addDays } from 'date-fns';
import { cn } from './lib/utils';

// --- Types ---

interface Destination {
  id: string;
  from: string;
  to: string;
  date: string;
}

interface FlightOffer {
  title: string;
  url: string;
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

// --- App Component ---

export default function App() {
  const [searchType, setSearchType] = useState<'round-trip' | 'one-way' | 'multi-city'>('round-trip');
  const [origin, setOrigin] = useState('');
  const [destination, setDestination] = useState('');
  const [date, setDate] = useState(format(addDays(new Date(), 7), 'yyyy-MM-dd'));
  const [returnDate, setReturnDate] = useState(format(addDays(new Date(), 14), 'yyyy-MM-dd'));
  const [multiDestinations, setMultiDestinations] = useState<Destination[]>([
    { id: '1', from: '', to: '', date: format(addDays(new Date(), 7), 'yyyy-MM-dd') },
    { id: '2', from: '', to: '', date: format(addDays(new Date(), 10), 'yyyy-MM-dd') }
  ]);
  
  const [isSearching, setIsSearching] = useState(false);
  const [results, setResults] = useState<string | null>(null);
  const [offers, setOffers] = useState<FlightOffer[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Chat State
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([
    { id: 'welcome', role: 'assistant', content: "Hi! I'm your SkyScout AI assistant. How can I help you plan your next trip today?" }
  ]);
  const [isTyping, setIsTyping] = useState(false);
  const chatEndRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  const addDestination = () => {
    const lastDest = multiDestinations[multiDestinations.length - 1];
    setMultiDestinations([
      ...multiDestinations,
      { 
        id: Math.random().toString(36).substr(2, 9), 
        from: lastDest?.to || '', 
        to: '', 
        date: format(addDays(new Date(lastDest?.date || new Date()), 3), 'yyyy-MM-dd') 
      }
    ]);
  };

  const removeDestination = (id: string) => {
    if (multiDestinations.length > 2) {
      setMultiDestinations(multiDestinations.filter(d => d.id !== id));
    }
  };

  const updateMultiDest = (id: string, field: keyof Destination, value: string) => {
    setMultiDestinations(multiDestinations.map(d => d.id === id ? { ...d, [field]: value } : d));
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSearching(true);
    setResults(null);
    setOffers([]);
    setError(null);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      
      let prompt = "";
      if (searchType === 'multi-city') {
        const route = multiDestinations.map(d => `${d.from} to ${d.to} on ${d.date}`).join(', ');
        prompt = `Find the best flight options for this multi-city trip: ${route}. 
        Provide specific flight numbers, airlines, departure/arrival times, and current prices if available. 
        I need real offers with valid booking links. 
        Format the response clearly with sections for each leg of the journey.`;
      } else if (searchType === 'round-trip') {
        prompt = `Find the best round-trip flight options from ${origin} to ${destination}. 
        Departure: ${date}, Return: ${returnDate}. 
        Provide specific flight numbers, airlines, departure/arrival times, and current prices. 
        I need real offers with valid booking links.`;
      } else {
        prompt = `Find the best one-way flight options from ${origin} to ${destination} on ${date}. 
        Provide specific flight numbers, airlines, departure/arrival times, and current prices. 
        I need real offers with valid booking links.`;
      }

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
        config: {
          tools: [{ googleSearch: {} }],
        },
      });

      setResults(response.text || "No results found.");
      
      // Extract links from grounding metadata
      const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
      if (chunks) {
        const extractedOffers = chunks
          .filter(chunk => chunk.web)
          .map(chunk => ({
            title: chunk.web?.title || "Flight Offer",
            url: chunk.web?.uri || "",
          }))
          .filter(offer => offer.url !== "");
        setOffers(extractedOffers);
      }
    } catch (err) {
      console.error(err);
      setError("Failed to fetch flight information. Please try again.");
    } finally {
      setIsSearching(false);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || isTyping) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: chatInput
    };

    setMessages(prev => [...prev, userMessage]);
    setChatInput('');
    setIsTyping(true);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      
      // Include context if available
      let context = "";
      if (origin && destination) {
        context = `The user is currently looking for flights from ${origin} to ${destination} on ${date}.`;
      } else if (searchType === 'multi-city') {
        const route = multiDestinations.map(d => `${d.from} to ${d.to} on ${d.date}`).join(', ');
        context = `The user is currently looking for a multi-city trip: ${route}.`;
      }

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [
          { role: 'user', parts: [{ text: `${context}\n\nUser Question: ${chatInput}` }] }
        ],
        config: {
          systemInstruction: "You are SkyScout AI, a helpful travel assistant. Help users find flights, plan itineraries, and provide travel tips. Be concise, friendly, and professional. If they ask about specific flights, use your knowledge to provide general advice or suggest they use the search tool for real-time data.",
          tools: [{ googleSearch: {} }]
        }
      });

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: response.text || "I'm sorry, I couldn't process that request."
      };

      setMessages(prev => [...prev, assistantMessage]);
    } catch (err) {
      console.error(err);
      setMessages(prev => [...prev, { 
        id: (Date.now() + 1).toString(), 
        role: 'assistant', 
        content: "Sorry, I'm having trouble connecting right now. Please try again later." 
      }]);
    } finally {
      setIsTyping(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-900 font-sans selection:bg-blue-100">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-blue-200">
              <Plane className="w-6 h-6" />
            </div>
            <h1 className="text-xl font-bold tracking-tight text-slate-800">SkyScout</h1>
          </div>
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-500">
            <a href="#" className="text-blue-600">Flights</a>
            <a href="#" className="hover:text-slate-800 transition-colors">Hotels</a>
            <a href="#" className="hover:text-slate-800 transition-colors">Car Rental</a>
            <a href="#" className="hover:text-slate-800 transition-colors">Explore</a>
          </nav>
          <button className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2 rounded-lg text-sm font-semibold transition-all">
            Sign In
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8">
        {/* Hero Section */}
        <div className="mb-12 text-center md:text-left">
          <h2 className="text-4xl md:text-5xl font-extrabold text-slate-900 mb-4 tracking-tight leading-tight">
            Where to <span className="text-blue-600">next?</span>
          </h2>
          <p className="text-slate-500 text-lg max-w-2xl">
            Real-time flight search with live grounding. Get actual offers, valid links, and the best routes for your next adventure.
          </p>
        </div>

        {/* Search Card */}
        <div className="bg-white rounded-3xl shadow-xl shadow-slate-200/60 border border-slate-100 overflow-hidden mb-12">
          <div className="p-1 bg-slate-50 border-b border-slate-100 flex gap-1">
            {(['round-trip', 'one-way', 'multi-city'] as const).map((type) => (
              <button
                key={type}
                onClick={() => setSearchType(type)}
                className={cn(
                  "px-6 py-3 rounded-2xl text-sm font-bold transition-all capitalize",
                  searchType === type 
                    ? "bg-white text-blue-600 shadow-sm" 
                    : "text-slate-500 hover:text-slate-700 hover:bg-slate-100/50"
                )}
              >
                {type.replace('-', ' ')}
              </button>
            ))}
          </div>

          <form onSubmit={handleSearch} className="p-6 md:p-8">
            {searchType === 'multi-city' ? (
              <div className="space-y-4">
                <AnimatePresence mode="popLayout">
                  {multiDestinations.map((dest) => (
                    <motion.div 
                      key={dest.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end bg-slate-50/50 p-4 rounded-2xl border border-slate-100"
                    >
                      <div className="md:col-span-4 space-y-1.5">
                        <label className="text-xs font-bold text-slate-400 uppercase tracking-wider px-1">From</label>
                        <div className="relative">
                          <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                          <input
                            type="text"
                            placeholder="Origin City"
                            value={dest.from}
                            onChange={(e) => updateMultiDest(dest.id, 'from', e.target.value)}
                            className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all text-sm font-medium"
                            required
                          />
                        </div>
                      </div>
                      <div className="md:col-span-4 space-y-1.5">
                        <label className="text-xs font-bold text-slate-400 uppercase tracking-wider px-1">To</label>
                        <div className="relative">
                          <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                          <input
                            type="text"
                            placeholder="Destination City"
                            value={dest.to}
                            onChange={(e) => updateMultiDest(dest.id, 'to', e.target.value)}
                            className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all text-sm font-medium"
                            required
                          />
                        </div>
                      </div>
                      <div className="md:col-span-3 space-y-1.5">
                        <label className="text-xs font-bold text-slate-400 uppercase tracking-wider px-1">Date</label>
                        <div className="relative">
                          <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                          <input
                            type="date"
                            value={dest.date}
                            onChange={(e) => updateMultiDest(dest.id, 'date', e.target.value)}
                            className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all text-sm font-medium"
                            required
                          />
                        </div>
                      </div>
                      <div className="md:col-span-1 flex justify-center pb-1">
                        <button
                          type="button"
                          onClick={() => removeDestination(dest.id)}
                          disabled={multiDestinations.length <= 2}
                          className="p-3 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all disabled:opacity-30 disabled:hover:bg-transparent"
                        >
                          <Trash2 className="w-5 h-5" />
                        </button>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
                <button
                  type="button"
                  onClick={addDestination}
                  className="w-full py-4 border-2 border-dashed border-slate-200 rounded-2xl text-slate-500 hover:text-blue-600 hover:border-blue-200 hover:bg-blue-50/30 transition-all flex items-center justify-center gap-2 font-bold text-sm"
                >
                  <Plus className="w-5 h-5" />
                  Add Destination
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
                <div className="md:col-span-4 space-y-1.5">
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-wider px-1">From</label>
                  <div className="relative">
                    <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Origin City"
                      value={origin}
                      onChange={(e) => setOrigin(e.target.value)}
                      className="w-full pl-12 pr-4 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all font-medium"
                      required
                    />
                  </div>
                </div>
                <div className="md:col-span-4 space-y-1.5">
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-wider px-1">To</label>
                  <div className="relative">
                    <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Destination City"
                      value={destination}
                      onChange={(e) => setDestination(e.target.value)}
                      className="w-full pl-12 pr-4 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all font-medium"
                      required
                    />
                  </div>
                </div>
                <div className={cn("space-y-1.5", searchType === 'round-trip' ? "md:col-span-2" : "md:col-span-4")}>
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-wider px-1">Departure</label>
                  <div className="relative">
                    <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                    <input
                      type="date"
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                      className="w-full pl-12 pr-4 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all font-medium"
                      required
                    />
                  </div>
                </div>
                {searchType === 'round-trip' && (
                  <div className="md:col-span-2 space-y-1.5">
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider px-1">Return</label>
                    <div className="relative">
                      <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                      <input
                        type="date"
                        value={returnDate}
                        onChange={(e) => setReturnDate(e.target.value)}
                        className="w-full pl-12 pr-4 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all font-medium"
                        required
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="mt-8 flex flex-col md:flex-row items-center justify-between gap-6">
              <div className="flex items-center gap-4 text-sm text-slate-500 font-medium">
                <div className="flex items-center gap-1.5">
                  <TrendingUp className="w-4 h-4 text-green-500" />
                  <span>Best Price Guarantee</span>
                </div>
                <div className="w-1 h-1 bg-slate-300 rounded-full" />
                <div className="flex items-center gap-1.5">
                  <Clock className="w-4 h-4 text-blue-500" />
                  <span>Real-time Updates</span>
                </div>
              </div>
              <button
                type="submit"
                disabled={isSearching}
                className="w-full md:w-auto bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white px-10 py-4 rounded-2xl font-bold shadow-lg shadow-blue-200 transition-all flex items-center justify-center gap-3 group"
              >
                {isSearching ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Searching...
                  </>
                ) : (
                  <>
                    <Search className="w-5 h-5 group-hover:scale-110 transition-transform" />
                    Find Flights
                  </>
                )}
              </button>
            </div>
          </form>
        </div>

        {/* Results Area */}
        <div className="space-y-8">
          {error && (
            <div className="bg-red-50 border border-red-100 text-red-700 p-4 rounded-2xl flex items-center gap-3">
              <Info className="w-5 h-5 flex-shrink-0" />
              <p className="font-medium">{error}</p>
            </div>
          )}

          {isSearching && (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="relative mb-6">
                <div className="w-20 h-20 border-4 border-blue-100 border-t-blue-600 rounded-full animate-spin" />
                <Plane className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 text-blue-600" />
              </div>
              <h3 className="text-xl font-bold text-slate-800 mb-2">Scanning the skies...</h3>
              <p className="text-slate-500">We're searching real-time data for the best offers and routes.</p>
            </div>
          )}

          {!isSearching && results && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
              {/* Main Results */}
              <div className="lg:col-span-2 space-y-6">
                <div className="bg-white rounded-3xl p-6 md:p-8 shadow-xl shadow-slate-200/50 border border-slate-100">
                  <div className="flex items-center justify-between mb-6">
                    <h3 className="text-2xl font-bold text-slate-800">Flight Recommendations</h3>
                    <div className="bg-blue-50 text-blue-600 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider">
                      Live Grounding
                    </div>
                  </div>
                  <div className="prose prose-slate max-w-none prose-headings:text-slate-800 prose-p:text-slate-600 prose-strong:text-slate-900 prose-ul:list-disc prose-li:text-slate-600">
                    <ReactMarkdown>{results}</ReactMarkdown>
                  </div>
                </div>
              </div>

              {/* Sidebar Offers */}
              <div className="space-y-6">
                <div className="bg-slate-900 rounded-3xl p-6 text-white shadow-xl shadow-slate-900/20">
                  <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                    <DollarSign className="w-5 h-5 text-green-400" />
                    Direct Booking Links
                  </h3>
                  <p className="text-slate-400 text-sm mb-6">
                    Found {offers.length} verified booking sources for your trip.
                  </p>
                  <div className="space-y-3">
                    {offers.length > 0 ? (
                      offers.map((offer, idx) => (
                        <a
                          key={idx}
                          href={offer.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="group flex items-center justify-between p-4 bg-white/10 hover:bg-white/20 border border-white/10 rounded-2xl transition-all"
                        >
                          <div className="flex flex-col gap-0.5">
                            <span className="text-sm font-bold truncate max-w-[180px]">{offer.title}</span>
                            <span className="text-[10px] text-slate-400 uppercase tracking-widest font-bold">Verified Link</span>
                          </div>
                          <ExternalLink className="w-4 h-4 text-slate-400 group-hover:text-white transition-colors" />
                        </a>
                      ))
                    ) : (
                      <div className="text-center py-8 border-2 border-dashed border-white/10 rounded-2xl">
                        <p className="text-slate-500 text-sm">No direct links found in this search.</p>
                      </div>
                    )}
                  </div>
                </div>

                <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm">
                  <h4 className="font-bold text-slate-800 mb-3">Travel Tips</h4>
                  <ul className="space-y-3">
                    {[
                      "Book at least 3 weeks in advance for best prices.",
                      "Mid-week flights (Tue/Wed) are usually cheaper.",
                      "Consider nearby airports for potential savings.",
                      "Check baggage policies before booking."
                    ].map((tip, i) => (
                      <li key={i} className="flex gap-3 text-sm text-slate-600">
                        <ChevronRight className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
                        {tip}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}

          {!isSearching && !results && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {[
                { 
                  title: "Smart Stopovers", 
                  desc: "Easily plan multi-city trips with custom stopover durations.",
                  icon: Clock,
                  color: "bg-amber-50 text-amber-600"
                },
                { 
                  title: "Real Offers", 
                  desc: "No more stale prices. We use live search to find current deals.",
                  icon: TrendingUp,
                  color: "bg-green-50 text-green-600"
                },
                { 
                  title: "Direct Links", 
                  desc: "Get valid booking links directly to airlines and travel agencies.",
                  icon: ExternalLink,
                  color: "bg-blue-50 text-blue-600"
                }
              ].map((feature, i) => (
                <div key={i} className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm hover:shadow-md transition-shadow">
                  <div className={cn("w-12 h-12 rounded-2xl flex items-center justify-center mb-4", feature.color)}>
                    <feature.icon className="w-6 h-6" />
                  </div>
                  <h3 className="font-bold text-slate-800 mb-2">{feature.title}</h3>
                  <p className="text-slate-500 text-sm leading-relaxed">{feature.desc}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      <footer className="bg-white border-t border-slate-200 py-12 mt-20">
        <div className="max-w-6xl mx-auto px-4 flex flex-col md:flex-row justify-between items-center gap-8">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-slate-800 rounded-lg flex items-center justify-center text-white">
              <Plane className="w-5 h-5" />
            </div>
            <span className="font-bold text-slate-800">SkyScout</span>
          </div>
          <p className="text-slate-400 text-sm">
            © 2026 SkyScout. Powered by Gemini Real-Time Search.
          </p>
          <div className="flex gap-6 text-slate-400">
            <a href="#" className="hover:text-slate-600 transition-colors">Privacy</a>
            <a href="#" className="hover:text-slate-600 transition-colors">Terms</a>
            <a href="#" className="hover:text-slate-600 transition-colors">Support</a>
          </div>
        </div>
      </footer>

      {/* AI Chatbox */}
      <div className="fixed bottom-6 right-6 z-[100] flex flex-col items-end gap-4">
        <AnimatePresence>
          {isChatOpen && (
            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.95 }}
              className="w-[350px] md:w-[400px] h-[500px] bg-white rounded-3xl shadow-2xl shadow-blue-900/20 border border-slate-100 flex flex-col overflow-hidden"
            >
              {/* Chat Header */}
              <div className="bg-blue-600 p-4 text-white flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                    <Bot className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="font-bold text-sm">SkyScout AI</h3>
                    <div className="flex items-center gap-1.5">
                      <div className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
                      <span className="text-[10px] font-medium text-blue-100 uppercase tracking-wider">Online</span>
                    </div>
                  </div>
                </div>
                <button 
                  onClick={() => setIsChatOpen(false)}
                  className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Messages Area */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin scrollbar-thumb-slate-200">
                {messages.map((msg) => (
                  <div 
                    key={msg.id} 
                    className={cn(
                      "flex gap-3 max-w-[85%]",
                      msg.role === 'user' ? "ml-auto flex-row-reverse" : "mr-auto"
                    )}
                  >
                    <div className={cn(
                      "w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0",
                      msg.role === 'user' ? "bg-blue-100 text-blue-600" : "bg-slate-100 text-slate-600"
                    )}>
                      {msg.role === 'user' ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                    </div>
                    <div className={cn(
                      "p-3 rounded-2xl text-sm leading-relaxed prose prose-sm prose-invert max-w-none",
                      msg.role === 'user' 
                        ? "bg-blue-600 text-white rounded-tr-none shadow-md shadow-blue-200" 
                        : "bg-slate-50 text-slate-700 border border-slate-100 rounded-tl-none"
                    )}>
                      <ReactMarkdown>
                        {msg.content}
                      </ReactMarkdown>
                    </div>
                  </div>
                ))}
                {isTyping && (
                  <div className="flex gap-3 mr-auto max-w-[85%]">
                    <div className="w-8 h-8 bg-slate-100 text-slate-600 rounded-lg flex items-center justify-center">
                      <Bot className="w-4 h-4" />
                    </div>
                    <div className="bg-slate-50 border border-slate-100 p-3 rounded-2xl rounded-tl-none flex gap-1">
                      <div className="w-1.5 h-1.5 bg-slate-300 rounded-full animate-bounce" />
                      <div className="w-1.5 h-1.5 bg-slate-300 rounded-full animate-bounce [animation-delay:0.2s]" />
                      <div className="w-1.5 h-1.5 bg-slate-300 rounded-full animate-bounce [animation-delay:0.4s]" />
                    </div>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>

              {/* Chat Input */}
              <form onSubmit={handleSendMessage} className="p-4 border-t border-slate-100 bg-slate-50/50">
                <div className="relative">
                  <input
                    type="text"
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    placeholder="Ask about flights, destinations..."
                    className="w-full pl-4 pr-12 py-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all text-sm font-medium"
                  />
                  <button
                    type="submit"
                    disabled={!chatInput.trim() || isTyping}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-slate-300 transition-all shadow-sm"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </div>
                <div className="mt-2 flex items-center justify-center gap-1.5">
                  <Sparkles className="w-3 h-3 text-blue-500" />
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Enhanced by Gemini</span>
                </div>
              </form>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Toggle Button */}
        <button
          onClick={() => setIsChatOpen(!isChatOpen)}
          className={cn(
            "w-16 h-16 rounded-full flex items-center justify-center shadow-2xl transition-all duration-300 group relative",
            isChatOpen 
              ? "bg-slate-800 text-white rotate-90" 
              : "bg-blue-600 text-white hover:scale-110 shadow-blue-200"
          )}
        >
          {isChatOpen ? (
            <X className="w-7 h-7" />
          ) : (
            <>
              <MessageSquare className="w-7 h-7" />
              <div className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 border-2 border-white rounded-full flex items-center justify-center text-[10px] font-bold">
                1
              </div>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
