"use client";

import React, { useState, useEffect } from "react";
import { Sidebar } from "@/components/Sidebar";
import { ChatInterface } from "@/components/ChatInterface";
import { InputPanel } from "@/components/InputPanel";
import { Header, StatusIndicator } from "@/components/Header";
import { AdvancedControls } from "@/components/AdvancedControls";
import { AnalyticsDashboard } from "@/components/AnalyticsDashboard";
import { SettingsModal } from "@/components/SettingsModal";
import { AuthModal } from "@/components/AuthModal";
import ParticleBackground from "@/components/ParticleBackground";
import { motion, AnimatePresence } from "framer-motion";
import { auth, db } from "@/lib/firebase";
import { onAuthStateChanged, User } from "firebase/auth";
import {
  collection,
  addDoc,
  query,
  where,
  getDocs,
  orderBy,
  serverTimestamp,
  setDoc,
  doc
} from "firebase/firestore";

export default function Home() {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isControlsOpen, setIsControlsOpen] = useState(false);
  const [isAnalyticsOpen, setIsAnalyticsOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [user, setUser] = useState<User | null>(null);

  // Monitor Auth State
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (!currentUser) setChatHistoryList([]);
    });
    return () => unsubscribe();
  }, []);

  // Sync Chat History from Firestore
  useEffect(() => {
    const syncHistory = async () => {
      if (!user) return;
      try {
        const q = query(collection(db, "users", user.uid, "chats"), orderBy("updatedAt", "desc"));
        const snapshot = await getDocs(q);
        const history = snapshot.docs.map(doc => ({ id: doc.id, title: doc.data().title }));
        setChatHistoryList(history);
      } catch (e) {
        console.error("History Sync Failed:", e);
      }
    };
    syncHistory();
  }, [user]);

  // Chat Logic
  const [messages, setMessages] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId, setSessionId] = useState(() => 'session-' + Math.random().toString(36).slice(2, 9));
  const [chatHistoryList, setChatHistoryList] = useState<{ id: string; title: string }[]>([]);

  const handleSelectChat = async (id: string, title: string) => {
    if (!user) return;
    setSessionId(id);
    setMessages([]);
    try {
      const q = query(collection(db, "users", user.uid, "chats", id, "messages"), orderBy("timestamp", "asc"));
      const snapshot = await getDocs(q);
      const msgs = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          ...data,
          id: doc.id,
          // Ensure timestamp is a string/formatted for UI
          timestamp: data.timestamp?.toDate ? data.timestamp.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : data.timestamp
        };
      });
      setMessages(msgs);
    } catch (e) {
      console.error("Load Chat Failed:", e);
    }
  };

  const handleNewChat = () => {
    setMessages([]);
    setSessionId('home-' + Math.random().toString(36).slice(2, 9));
    setIsLoading(false);
  };

  const handleSendMessage = async (content: string) => {
    if (!content.trim() || isLoading) return;

    const timestampStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const userMsg = { id: Date.now().toString(), role: 'user', content, timestamp: timestampStr };

    // 1. Update UI IMMEDIATELY
    setMessages(prev => [...prev, userMsg]);
    setIsLoading(true);

    const aiMsg = { id: (Date.now() + 1).toString(), role: 'assistant', content: '', timestamp: timestampStr };
    setMessages(prev => [...prev, aiMsg]);

    // 2. Handle Firestore in background (non-blocking)
    if (user) {
      // First message in session? Auto-initialize chat doc
      if (messages.length === 0) {
        setDoc(doc(db, "users", user.uid, "chats", sessionId), {
          title: content.slice(0, 40) + (content.length > 40 ? "..." : ""),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        }, { merge: true }).then(() => {
          setChatHistoryList(prev => {
            if (prev.some(c => c.id === sessionId)) return prev;
            return [{ id: sessionId, title: content.slice(0, 40) + "..." }, ...prev];
          });
        }).catch(e => console.error("Firestore init error:", e));
      }

      // Save user message
      addDoc(collection(db, "users", user.uid, "chats", sessionId, "messages"), {
        ...userMsg,
        timestamp: serverTimestamp()
      }).catch(e => console.error("Firestore user msg error:", e));
    }

    try {
      // Prepare history for API (exclude the optimistic messages we just added)
      const apiHistory = messages.slice(-8).map(m => ({ role: m.role, content: m.content }));

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: content,
          sessionId,
          history: messages.slice(-10).map(m => ({ role: m.role, content: m.content })),
        }),
      });

      if (!res.ok) throw new Error('API request failed');

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let accumulated = '';
      let fullAIResponse = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        accumulated += decoder.decode(value, { stream: true });
        const lines = accumulated.split('\n');
        accumulated = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim() || !line.startsWith('data:')) continue;
          const data = line.replace('data: ', '').trim();
          if (data === '[DONE]') continue;

          try {
            const parsed = JSON.parse(data);
            if (parsed.content) {
              fullAIResponse += parsed.content;
              setMessages(prev => {
                const updated = [...prev];
                const last = updated[updated.length - 1];
                if (last && last.role === 'assistant') {
                  updated[updated.length - 1] = { ...last, content: fullAIResponse };
                }
                return updated;
              });
            }
          } catch (e) {
            console.error('Error parsing streaming data', e);
          }
        }
      }

      // Save Assistant response to Firestore
      if (user) {
        addDoc(collection(db, "users", user.uid, "chats", sessionId, "messages"), {
          role: 'assistant',
          content: fullAIResponse,
          timestamp: serverTimestamp()
        }).catch(e => console.error("Firestore error saving AI response:", e));

        // Update last updated time for history sorting
        setDoc(doc(db, "users", user.uid, "chats", sessionId), {
          updatedAt: serverTimestamp()
        }, { merge: true }).catch(e => console.error("Firestore error updating chat timestamp:", e));
      }

    } catch (error) {
      console.error('Chat error:', error);
      setMessages(prev => {
        const updated = [...prev];
        updated[updated.length - 1] = { ...updated[updated.length - 1], content: 'Error: Failed to get response.' };
        return updated;
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="flex h-screen w-full overflow-hidden bg-background text-foreground relative">
      <ParticleBackground />

      {/* Animated Deep Space Gradient Overlay */}
      <div className="fixed inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(15,23,42,0.5),rgba(2,6,23,1))] pointer-events-none z-0" />

      {/* Sidebar */}
      <Sidebar
        isCollapsed={isSidebarCollapsed}
        setIsCollapsed={setIsSidebarCollapsed}
        openSettings={() => setIsSettingsOpen(true)}
        openAuth={() => setIsAuthOpen(true)}
        onNewChat={handleNewChat}
        onSelectChat={handleSelectChat}
        chats={chatHistoryList}
        user={user}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col relative z-10 overflow-hidden">
        <div className="flex-1 flex flex-col relative overflow-hidden">
          <ChatInterface messages={messages} isThinking={isLoading} />

          <div className="mt-auto">
            <InputPanel
              onSend={handleSendMessage}
              isLoading={isLoading}
              openControls={() => setIsControlsOpen(true)}
            />
          </div>
        </div>

      </div>


      {/* Overlays / Modals */}
      <AdvancedControls
        isOpen={isControlsOpen}
        onClose={() => setIsControlsOpen(false)}
      />

      <AnalyticsDashboard
        isOpen={isAnalyticsOpen}
        onClose={() => setIsAnalyticsOpen(false)}
      />

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />

      <AuthModal
        isOpen={isAuthOpen}
        onClose={() => setIsAuthOpen(false)}
      />
    </main>
  );
}
