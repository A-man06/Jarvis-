"use client";

import React, { useState } from "react";
import { motion } from "framer-motion";
import {
  Mail,
  Lock,
  User,
  ArrowRight,
  AlertCircle
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { auth } from "@/lib/firebase";

export default function SignupPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }

    setIsLoading(true);

    try {
      await createUserWithEmailAndPassword(auth, email, password);
      router.push("/");
    } catch (err: any) {
      console.error("Signup Error:", err);
      if (err.code === "auth/email-already-in-use") {
        setError("Email already in use. Please log in.");
      } else if (err.code === "auth/invalid-email") {
        setError("Invalid email format.");
      } else {
        setError("Failed to create account. Please try again.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-[#09090b] text-white">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-md p-8"
      >
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold tracking-tight mb-2">Create an Account</h1>
          <p className="text-white/40 text-sm">Enter your details to get started</p>
        </div>

        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6 p-4 rounded-xl bg-red-400/10 border border-red-400/20 flex items-center gap-3 text-red-400 text-sm"
          >
            <AlertCircle className="w-5 h-5" />
            {error}
          </motion.div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-white/60 ml-1">Full Name</label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20" />
              <Input
                placeholder="Name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="pl-10 bg-white/5 border-white/10 focus:border-white/20 h-12"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-white/60 ml-1">Email</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20" />
              <Input
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="pl-10 bg-white/5 border-white/10 focus:border-white/20 h-12"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-white/60 ml-1">Password</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20" />
              <Input
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="pl-10 bg-white/5 border-white/10 focus:border-white/20 h-12"
              />
            </div>
          </div>

          <Button
            disabled={isLoading}
            className="w-full h-12 bg-white text-black hover:bg-white/90 font-bold rounded-xl mt-4"
          >
            {isLoading ? "Creating account..." : "Sign Up"}
          </Button>
        </form>

        <p className="text-center mt-6 text-sm text-white/40">
          Already have an account?{" "}
          <Link href="/login" className="text-white hover:underline transition-colors font-medium">
            Log in
          </Link>
        </p>
      </motion.div>
    </div>
  );
}