"use client";

import { useState } from "react";
import Link from "next/link";
import { requestPasswordReset } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const { error: err } = await requestPasswordReset({
      email,
      redirectTo: "/reset-password",
    });
    if (err) {
      setError(err.message ?? "Something went wrong.");
      setLoading(false);
    } else {
      setSubmitted(true);
    }
  }

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-full max-w-sm space-y-6 p-8 border rounded-lg shadow-sm">
          <div className="space-y-1">
            <h1 className="text-2xl font-bold tracking-tight">Check the terminal</h1>
            <p className="text-sm text-muted-foreground">
              A reset link has been logged to the server console where{" "}
              <code className="text-xs bg-muted px-1 py-0.5 rounded">npm run dev</code> is running.
              Open it to set a new password.
            </p>
          </div>
          <Link href="/login" className="text-sm underline underline-offset-4 hover:text-primary">
            Back to sign in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-full max-w-sm space-y-6 p-8 border rounded-lg shadow-sm">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight">Reset password</h1>
          <p className="text-sm text-muted-foreground">
            Enter your email and a reset link will be printed to the server console.
          </p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Sending…" : "Send reset link"}
          </Button>
        </form>
        <p className="text-sm text-center text-muted-foreground">
          <Link href="/login" className="underline underline-offset-4 hover:text-primary">
            Back to sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
